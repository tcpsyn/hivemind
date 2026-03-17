import { EventEmitter } from 'events'
import * as pty from 'node-pty'
import type { AgentConfig, AgentState, PaneInfo } from '../../shared/types'
import { INPUT_PROMPT_PATTERNS } from '../../shared/constants'
import { PtyOutputBuffer } from '../tmux/PtyOutputBuffer'
import { parseClaudeCommand } from '../tmux/parseClaudeCommand'

interface PtyEntry {
  pty: pty.IPty
  agent: AgentState
  config: AgentConfig
  cwd: string
}

export class PtyManager extends EventEmitter {
  private entries = new Map<string, PtyEntry>()
  private idCounter = 0
  private paneIdToAgentId = new Map<string, string>()
  private agentIdToPaneId = new Map<string, string>()
  private outputBuffers = new Map<string, PtyOutputBuffer>()

  async createPty(config: AgentConfig, cwd: string, extraEnv?: Record<string, string>): Promise<AgentState> {
    const id = `agent-${++this.idCounter}-${Date.now()}`
    const shell = process.env.SHELL || '/bin/zsh'
    const env = extraEnv
      ? { ...process.env, ...extraEnv } as Record<string, string>
      : process.env as Record<string, string>

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

  async createTeammatePty(
    command: string,
    cwd: string,
    env: Record<string, string>,
    sessionName: string,
    paneId: string
  ): Promise<AgentState> {
    const parsed = parseClaudeCommand(command)
    const id = `agent-${++this.idCounter}-${Date.now()}`
    const shell = process.env.SHELL || '/bin/zsh'

    // Prepend custom PATH in command so it survives login shell PATH resets
    let finalCommand = command
    if (env.PATH) {
      finalCommand = `export PATH="${env.PATH}" && ${command}`
    }

    const term = pty.spawn(shell, ['-l', '-c', finalCommand], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env, ...env } as Record<string, string>
    })

    const agent: AgentState = {
      id,
      name: parsed.agentName ?? 'teammate',
      role: parsed.agentType ?? 'teammate',
      avatar: '',
      color: parsed.agentColor ?? '',
      status: 'running',
      needsInput: false,
      lastActivity: Date.now(),
      pid: term.pid,
      paneId,
      sessionName,
      isTeammate: true,
      agentType: parsed.agentType
    }

    const config: AgentConfig = {
      name: agent.name,
      role: agent.role,
      command
    }

    const entry: PtyEntry = { pty: term, agent, config, cwd }
    this.entries.set(id, entry)

    this.paneIdToAgentId.set(paneId, id)
    this.agentIdToPaneId.set(id, paneId)

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

    this.emit('agent-spawned', id, agent, paneId, sessionName)

    return agent
  }

  registerPane(paneId: string, agentId: string): void {
    this.paneIdToAgentId.set(paneId, agentId)
    this.agentIdToPaneId.set(agentId, paneId)
  }

  capturePane(agentId: string): string {
    const buffer = this.outputBuffers.get(agentId)
    return buffer ? buffer.capture() : ''
  }

  getPaneInfo(agentId: string): PaneInfo | null {
    const entry = this.entries.get(agentId)
    if (!entry) return null

    const paneId = this.agentIdToPaneId.get(agentId) ?? entry.agent.paneId
    if (!paneId) return null

    return {
      paneId,
      pid: entry.pty.pid,
      cols: entry.pty.cols,
      rows: entry.pty.rows,
      name: entry.agent.name,
      isActive: entry.agent.status === 'running'
    }
  }

  getAgentByPaneId(paneId: string): AgentState | undefined {
    const agentId = this.paneIdToAgentId.get(paneId)
    if (!agentId) return undefined
    return this.entries.get(agentId)?.agent
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

    const paneId = this.agentIdToPaneId.get(agentId)
    if (paneId) {
      this.paneIdToAgentId.delete(paneId)
      this.agentIdToPaneId.delete(agentId)
    }
    this.outputBuffers.delete(agentId)

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
