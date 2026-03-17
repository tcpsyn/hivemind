import { join } from 'path'
import { tmpdir } from 'os'
import { readdirSync, unlinkSync } from 'fs'
import { EventEmitter } from 'events'
import { PtyManager } from '../pty/PtyManager'
import { FakeTmuxServer } from './FakeTmuxServer'
import type { AgentState } from '../../shared/types'

export class TeamSession extends EventEmitter {
  private sessionName: string
  private projectPath: string
  private socketPath: string
  private server: FakeTmuxServer | null = null
  private ptyManager: PtyManager
  private leadAgent: AgentState | null = null
  private teammates = new Map<string, AgentState>()
  private running = false
  private signalHandlers: { event: string; handler: () => void }[] = []

  constructor(sessionName: string, projectPath: string, ptyManager?: PtyManager) {
    super()
    this.sessionName = sessionName
    this.projectPath = projectPath
    this.socketPath = join(tmpdir(), `cc-frontend-${sessionName}-${Date.now()}.sock`)
    this.ptyManager = ptyManager ?? new PtyManager()
  }

  static cleanupStaleSockets(): void {
    try {
      const tmp = tmpdir()
      const files = readdirSync(tmp)
      for (const file of files) {
        if (file.startsWith('cc-frontend-') && file.endsWith('.sock')) {
          try {
            unlinkSync(join(tmp, file))
          } catch {
            // ignore — file may be in use
          }
        }
      }
    } catch {
      // ignore — tmpdir read failure is non-fatal
    }
  }

  async start(leadCommand?: string): Promise<AgentState> {
    this.server = new FakeTmuxServer(this.socketPath)
    await this.server.start()

    this.wireServerEvents()

    const leadEnv = this.getLeadEnv()
    const leadAgent = await this.ptyManager.createPty(
      {
        name: 'team-lead',
        role: 'lead',
        command: leadCommand || 'claude'
      },
      this.projectPath,
      leadEnv
    )

    this.leadAgent = leadAgent

    // Register lead as pane %0 in PtyManager and in the FakeTmuxServer
    if (leadAgent.id) {
      this.ptyManager.registerPane('%0', leadAgent.id)
      this.server.registerDefaultSession(this.sessionName, '%0', leadAgent.pid ?? process.pid)
    }

    this.running = true
    this.installSignalHandlers()
    return leadAgent
  }

  async stop(): Promise<void> {
    if (!this.running && !this.server) return

    this.removeSignalHandlers()

    // Destroy all teammate PTYs
    for (const [agentId] of this.teammates) {
      this.ptyManager.destroyPty(agentId)
    }
    this.teammates.clear()

    // Destroy lead PTY
    if (this.leadAgent) {
      this.ptyManager.destroyPty(this.leadAgent.id)
      this.leadAgent = null
    }

    // Close server (cleans up socket file)
    if (this.server) {
      await this.server.stop()
      this.server = null
    }

    this.running = false
  }

  getLeadAgent(): AgentState | null {
    return this.leadAgent
  }

  getTeammates(): AgentState[] {
    return [...this.teammates.values()]
  }

  isRunning(): boolean {
    return this.running
  }

  getSocketPath(): string {
    return this.socketPath
  }

  getServer(): FakeTmuxServer | null {
    return this.server
  }

  getLeadEnv(): Record<string, string> {
    // Prepend our bin/ directory to PATH so Claude finds our fake tmux binary first
    const fakeBinDir = join(process.cwd(), 'bin')
    const currentPath = process.env.PATH || ''
    return {
      PATH: `${fakeBinDir}:${currentPath}`,
      TMUX: `${this.socketPath},${process.pid},0`,
      TMUX_PANE: '%0',
      TMUX_PROGRAM: join(fakeBinDir, 'tmux'),
      TERM_PROGRAM: 'tmux',
      TERM: 'tmux-256color',
      CC_FRONTEND_SOCKET: this.socketPath
    }
  }

  private wireServerEvents(): void {
    if (!this.server) return

    this.server.on('send-keys', (paneId: string, sessionName: string, command: string, hasEnter: boolean) => {
      this.handleSendKeys(paneId, sessionName, command, hasEnter)
    })

    this.server.on('session-killed', (name: string, paneIds: string[]) => {
      for (const paneId of paneIds) {
        const agent = this.ptyManager.getAgentByPaneId(paneId)
        if (agent) {
          this.ptyManager.destroyPty(agent.id)
          this.teammates.delete(agent.id)
        }
      }
    })

    this.server.on('pane-killed', (paneId: string) => {
      const agent = this.ptyManager.getAgentByPaneId(paneId)
      if (agent) {
        this.ptyManager.destroyPty(agent.id)
        this.teammates.delete(agent.id)
      }
    })

    this.server.on('pane-selected', (paneId: string) => {
      this.emit('focus-pane', paneId)
    })

    this.server.on('pane-resized', (paneId: string, cols: number, rows: number) => {
      const agent = this.ptyManager.getAgentByPaneId(paneId)
      if (agent) {
        this.ptyManager.resize(agent.id, cols, rows)
      }
    })

    // Forward PtyManager agent-spawned events
    this.ptyManager.on('agent-spawned', (agentId: string, agent: AgentState, paneId: string, sessionName: string) => {
      this.teammates.set(agentId, agent)
      this.emit('teammate-spawned', agentId, agent, paneId, sessionName)
    })

    this.ptyManager.on('exit', (agentId: string, exitCode: number) => {
      const agent = this.teammates.get(agentId)
      if (agent) {
        this.teammates.delete(agentId)
        this.emit('teammate-exited', agentId, agent.paneId, agent.sessionName, exitCode)
      }
    })
  }

  private installSignalHandlers(): void {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      const handler = () => {
        this.stop().catch(() => {})
      }
      this.signalHandlers.push({ event: signal, handler })
      process.on(signal, handler)
    }

    const exitHandler = () => {
      // Synchronous cleanup — best effort socket removal
      if (this.server) {
        try {
          unlinkSync(this.socketPath)
        } catch {
          // ignore
        }
      }
    }
    this.signalHandlers.push({ event: 'exit', handler: exitHandler })
    process.on('exit', exitHandler)
  }

  private removeSignalHandlers(): void {
    for (const { event, handler } of this.signalHandlers) {
      process.removeListener(event, handler)
    }
    this.signalHandlers = []
  }

  private async handleSendKeys(paneId: string, sessionName: string, command: string, hasEnter: boolean): Promise<void> {
    // Check if this pane already has a PTY
    const existingAgent = this.ptyManager.getAgentByPaneId(paneId)

    if (existingAgent) {
      // Send input to existing PTY
      const input = hasEnter ? command + '\r' : command
      this.ptyManager.sendInput(existingAgent.id, input)
    } else {
      // Spawn new teammate PTY
      const env = {
        ...this.getLeadEnv(),
        TMUX_PANE: paneId
      }

      try {
        await this.ptyManager.createTeammatePty(
          command,
          this.projectPath,
          env,
          sessionName,
          paneId
        )
      } catch (err) {
        console.error(`Failed to spawn teammate for pane ${paneId}:`, err)
      }
    }
  }
}
