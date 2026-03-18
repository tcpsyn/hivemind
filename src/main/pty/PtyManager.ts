import { EventEmitter } from 'events'
import * as pty from 'node-pty'
import type { AgentConfig, AgentState } from '../../shared/types'
import { INPUT_PROMPT_PATTERNS, INPUT_DETECTION_TIMEOUT_MS } from '../../shared/constants'
import { PtyOutputBuffer } from '../tmux/PtyOutputBuffer'

interface PtyEntry {
  pty: pty.IPty
  agent: AgentState
  config: AgentConfig
  cwd: string
}

export class PtyManager extends EventEmitter {
  private entries = new Map<string, PtyEntry>()
  private idCounter = 0
  private outputBuffers = new Map<string, PtyOutputBuffer>()
  private inputTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

  async createPty(
    config: AgentConfig,
    cwd: string,
    extraEnv?: Record<string, string>
  ): Promise<AgentState> {
    const id = `agent-${++this.idCounter}-${Date.now()}`
    const shell = process.env.SHELL || '/bin/zsh'
    const env = extraEnv
      ? ({ ...process.env, ...extraEnv } as Record<string, string>)
      : (process.env as Record<string, string>)

    // If extraEnv has a custom PATH, prepend it in the command itself
    // so it survives login shell PATH resets from .zshrc
    let command = config.command
    if (extraEnv?.PATH) {
      command = `export PATH="${extraEnv.PATH}" && ${config.command}`
    }

    const term = pty.spawn(shell, ['-l', '-c', command], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env
    })

    const agent: AgentState = {
      id,
      name: config.name,
      role: config.role,
      avatar: config.avatar ?? '',
      color: config.color ?? '',
      status: 'running',
      needsInput: false,
      lastActivity: Date.now(),
      pid: term.pid
    }

    const entry: PtyEntry = { pty: term, agent, config, cwd }
    this.entries.set(id, entry)

    const buffer = new PtyOutputBuffer()
    this.outputBuffers.set(id, buffer)

    term.onData((data: string) => {
      agent.lastActivity = Date.now()
      buffer.append(data)
      this.emit('data', id, data)
      this.checkForInputNeeded(id, data)
    })

    term.onExit((e: { exitCode: number; signal?: number }) => {
      agent.status = 'stopped'
      this.emit('exit', id, e.exitCode)

      if (e.exitCode !== 0) {
        this.emit('error', id, new Error(`Process exited with code ${e.exitCode}`))
      }
    })

    return agent
  }

  sendInput(agentId: string, data: string): void {
    const entry = this.entries.get(agentId)
    if (!entry) {
      throw new Error(`No PTY found for agent ${agentId}`)
    }
    entry.agent.needsInput = false
    entry.agent.lastActivity = Date.now()
    // Clear any pending input timeout since user provided input
    const timeout = this.inputTimeouts.get(agentId)
    if (timeout) {
      clearTimeout(timeout)
      this.inputTimeouts.delete(agentId)
    }
    entry.pty.write(data)
  }

  resize(agentId: string, cols: number, rows: number): void {
    const entry = this.entries.get(agentId)
    if (!entry) {
      throw new Error(`No PTY found for agent ${agentId}`)
    }
    entry.pty.resize(cols, rows)
  }

  destroyPty(agentId: string): void {
    const entry = this.entries.get(agentId)
    if (!entry) return

    this.outputBuffers.delete(agentId)
    const inputTimeout = this.inputTimeouts.get(agentId)
    if (inputTimeout) {
      clearTimeout(inputTimeout)
      this.inputTimeouts.delete(agentId)
    }

    try {
      entry.pty.kill()
    } catch {
      // Process may already be dead
    }
    this.entries.delete(agentId)
  }

  destroyAll(): void {
    for (const id of [...this.entries.keys()]) {
      this.destroyPty(id)
    }
  }

  getAll(): Map<string, AgentState> {
    const result = new Map<string, AgentState>()
    for (const [id, entry] of this.entries) {
      result.set(id, entry.agent)
    }
    return result
  }

  private checkForInputNeeded(agentId: string, data: string): void {
    const entry = this.entries.get(agentId)
    if (!entry) return

    // Only check the last line of the data chunk to avoid false positives
    // from matching patterns in the middle of output
    const lines = data.split('\n')
    const lastLine = lines[lines.length - 1].trim()
    if (!lastLine) return

    const needsInput = INPUT_PROMPT_PATTERNS.some((pattern) => lastLine.endsWith(pattern))
    if (needsInput) {
      entry.agent.needsInput = true
      this.emit('input-needed', agentId)

      // Auto-clear needsInput after timeout if no user input arrives
      const existingTimeout = this.inputTimeouts.get(agentId)
      if (existingTimeout) clearTimeout(existingTimeout)
      this.inputTimeouts.set(
        agentId,
        setTimeout(() => {
          entry.agent.needsInput = false
          this.inputTimeouts.delete(agentId)
        }, INPUT_DETECTION_TIMEOUT_MS)
      )
    }
  }
}
