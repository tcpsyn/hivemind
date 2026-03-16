import { EventEmitter } from 'events'
import * as pty from 'node-pty'
import type { AgentConfig, AgentState } from '../../shared/types'
import { INPUT_PROMPT_PATTERNS } from '../../shared/constants'

interface PtyEntry {
  pty: pty.IPty
  agent: AgentState
  config: AgentConfig
  cwd: string
}

export class PtyManager extends EventEmitter {
  private entries = new Map<string, PtyEntry>()
  private idCounter = 0

  async createPty(config: AgentConfig, cwd: string): Promise<AgentState> {
    const id = `agent-${++this.idCounter}-${Date.now()}`
    const [command, ...args] = config.command.split(/\s+/)

    const term = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>
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

    term.onData((data: string) => {
      agent.lastActivity = Date.now()
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

    const needsInput = INPUT_PROMPT_PATTERNS.some((pattern) => data.includes(pattern))
    if (needsInput) {
      entry.agent.needsInput = true
      this.emit('input-needed', agentId)
    }
  }
}
