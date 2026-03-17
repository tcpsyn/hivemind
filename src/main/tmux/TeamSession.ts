import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'
import { PtyManager } from '../pty/PtyManager'
import { TmuxProxyServer, type ProxyPaneInfo } from './TmuxProxyServer'
import type { AgentState } from '../../shared/types'

const execFileAsync = promisify(execFile)

const REAL_TMUX_PATHS = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']

export class TeamSession extends EventEmitter {
  private sessionName: string
  private projectPath: string
  private socketPath: string
  private tmuxSocketName: string
  private proxyServer: TmuxProxyServer | null = null
  private ptyManager: PtyManager
  private leadAgent: AgentState | null = null
  private teammates = new Map<string, AgentState>()
  private paneIdToAgentId = new Map<string, string>()
  private running = false
  private signalHandlers: { event: string; handler: () => void }[] = []
  private realTmuxPath: string
  private idCounter = 0

  constructor(sessionName: string, projectPath: string, ptyManager?: PtyManager) {
    super()
    this.sessionName = sessionName
    this.projectPath = projectPath
    this.socketPath = join(tmpdir(), `cc-frontend-${sessionName}-${Date.now()}.sock`)
    this.tmuxSocketName = `cc-frontend-${sessionName}-${Date.now()}`
    this.ptyManager = ptyManager ?? new PtyManager()
    this.realTmuxPath = TeamSession.findRealTmux()
  }

  static findRealTmux(): string {
    for (const p of REAL_TMUX_PATHS) {
      if (existsSync(p)) return p
    }
    throw new Error('Cannot find real tmux binary')
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
    // Create a dedicated tmux server and session so Claude Code
    // detects tmux and spawns agents as tmux panes (not subprocesses)
    await execFileAsync(this.realTmuxPath, [
      '-L',
      this.tmuxSocketName,
      'new-session',
      '-d',
      '-s',
      this.sessionName,
      '-x',
      '200',
      '-y',
      '50'
    ])

    // Get the TMUX env var value (socket_path,server_pid,session_idx)
    const { stdout: tmuxEnvValue } = await execFileAsync(this.realTmuxPath, [
      '-L',
      this.tmuxSocketName,
      'display-message',
      '-p',
      '-t',
      this.sessionName,
      '#{socket_path},#{pid},0'
    ])

    this.proxyServer = new TmuxProxyServer(this.socketPath, this.realTmuxPath, {
      pollIntervalMs: 2000,
      tmuxSocketName: this.tmuxSocketName,
      leadSessionName: this.sessionName
    })
    await this.proxyServer.start()

    this.wireServerEvents()

    const leadEnv = this.getLeadEnv(tmuxEnvValue.trim())
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
    this.running = true
    this.installSignalHandlers()
    return leadAgent
  }

  async stop(): Promise<void> {
    if (!this.running && !this.proxyServer) return

    this.removeSignalHandlers()

    this.teammates.clear()
    this.paneIdToAgentId.clear()

    // Destroy lead PTY
    if (this.leadAgent) {
      this.ptyManager.destroyPty(this.leadAgent.id)
      this.leadAgent = null
    }

    // Close proxy server (cleans up socket file)
    if (this.proxyServer) {
      await this.proxyServer.stop()
      this.proxyServer = null
    }

    // Kill the dedicated tmux server
    try {
      await execFileAsync(this.realTmuxPath, ['-L', this.tmuxSocketName, 'kill-server'])
    } catch {
      // Server may already be dead
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

  getServer(): TmuxProxyServer | null {
    return this.proxyServer
  }

  getLeadEnv(tmuxEnvValue?: string): Record<string, string> {
    const binDir = join(process.cwd(), 'bin')
    const currentPath = process.env.PATH || ''
    const env: Record<string, string> = {
      PATH: `${binDir}:${currentPath}`,
      CC_FRONTEND_SOCKET: this.socketPath,
      CC_TMUX_SOCKET: this.tmuxSocketName,
      REAL_TMUX: this.realTmuxPath,
      CLAUDECODE: '1',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
    }
    // Set TMUX so Claude Code detects it's "inside" tmux
    // and spawns agents as tmux panes instead of subprocesses
    if (tmuxEnvValue) {
      env.TMUX = tmuxEnvValue
      env.TMUX_PANE = '%0'
    }
    return env
  }

  async sendTeammateInput(paneId: string, data: string): Promise<void> {
    if (!this.proxyServer) {
      throw new Error('TeamSession not running')
    }
    await this.proxyServer.sendInput(paneId, data)
  }

  private wireServerEvents(): void {
    if (!this.proxyServer) return

    this.proxyServer.on('teammate-detected', (paneInfo: ProxyPaneInfo) => {
      const agentId = `tmux-${paneInfo.paneId}`
      const agent: AgentState = {
        id: agentId,
        name: paneInfo.windowName || 'teammate',
        role: 'teammate',
        avatar: '',
        color: '',
        status: 'running',
        needsInput: false,
        lastActivity: Date.now(),
        pid: paneInfo.pid,
        paneId: paneInfo.paneId,
        sessionName: paneInfo.sessionName,
        isTeammate: true
      }

      this.teammates.set(agentId, agent)
      this.paneIdToAgentId.set(paneInfo.paneId, agentId)
      this.emit('teammate-spawned', agentId, agent, paneInfo.paneId, paneInfo.sessionName)
    })

    this.proxyServer.on('teammate-output', ({ paneId, data }: { paneId: string; data: Buffer }) => {
      this.emit('teammate-output', paneId, data.toString())
    })

    this.proxyServer.on('teammate-renamed', ({ paneId, name }: { paneId: string; name: string }) => {
      const agentId = this.paneIdToAgentId.get(paneId)
      if (agentId) {
        const agent = this.teammates.get(agentId)
        if (agent) {
          agent.name = name
          this.emit('teammate-renamed', agentId, name, paneId)
        }
      }
    })

    this.proxyServer.on('teammate-exited', ({ paneId }: { paneId: string }) => {
      const agentId = this.paneIdToAgentId.get(paneId)
      if (agentId) {
        const agent = this.teammates.get(agentId)
        this.teammates.delete(agentId)
        this.paneIdToAgentId.delete(paneId)
        this.emit('teammate-exited', agentId, paneId, agent?.sessionName || '', 0)
      }
    })

    this.proxyServer.on('error', (err: Error) => {
      this.emit('error', err)
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
      if (this.proxyServer) {
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
}
