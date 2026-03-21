import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'
import { PtyManager } from '../pty/PtyManager'
import { TmuxProxyServer, type ProxyPaneInfo } from './TmuxProxyServer'
import { ClaudeConfigService } from '../services/ClaudeConfigService'
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
  private configService: ClaudeConfigService | null = null
  private leadPaneId: string = '%0'

  getLeadPaneId(): string {
    return this.leadPaneId
  }

  constructor(sessionName: string, projectPath: string, ptyManager?: PtyManager) {
    super()
    this.sessionName = sessionName
    this.projectPath = projectPath
    this.socketPath = join(tmpdir(), `hivemind-${sessionName}-${Date.now()}.sock`)
    this.tmuxSocketName = `hivemind-${sessionName}-${Date.now()}`
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
        if (file.startsWith('hivemind-') && file.endsWith('.sock')) {
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

    // Disable tmux status bar — we show agent info in the app UI instead
    await execFileAsync(this.realTmuxPath, [
      '-L',
      this.tmuxSocketName,
      'set-option',
      '-g',
      'status',
      'off'
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

    // Query the actual lead pane ID instead of assuming %0
    const { stdout: leadPaneOut } = await execFileAsync(this.realTmuxPath, [
      '-L',
      this.tmuxSocketName,
      'list-panes',
      '-t',
      this.sessionName,
      '-F',
      '#{pane_id}'
    ])
    this.leadPaneId = leadPaneOut.trim().split('\n')[0] || '%0'

    this.proxyServer = new TmuxProxyServer(this.socketPath, this.realTmuxPath, {
      pollIntervalMs: 2000,
      tmuxSocketName: this.tmuxSocketName,
      leadSessionName: this.sessionName,
      leadPaneId: this.leadPaneId
    })
    await this.proxyServer.start()

    this.wireServerEvents()

    // Write Claude Code settings + MCP config for the lead agent
    this.configService = new ClaudeConfigService({
      projectDir: this.projectPath,
      binDir: TeamSession.getBinDir(),
      tmuxSocket: this.tmuxSocketName,
      realTmuxPath: this.realTmuxPath,
      sessionName: this.sessionName,
      leadPaneId: this.leadPaneId
    })
    await this.configService.writeConfigs()

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

    // Destroy teammate PTYs before clearing the maps
    for (const [agentId] of this.teammates) {
      this.ptyManager.destroyPty(agentId)
    }
    this.teammates.clear()
    this.paneIdToAgentId.clear()

    // Destroy lead PTY
    if (this.leadAgent) {
      this.ptyManager.destroyPty(this.leadAgent.id)
      this.leadAgent = null
    }

    // Clean up Claude Code settings + MCP config files
    if (this.configService) {
      try {
        await this.configService.cleanup()
      } catch {
        // Cleanup failure must not prevent tmux server shutdown
      }
      this.configService = null
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

  static getBinDir(): string {
    // In production, bin/ is in extraResources; in dev, it's in project root
    if (process.resourcesPath) {
      const prodBin = join(process.resourcesPath, 'bin')
      if (existsSync(join(prodBin, 'tmux'))) return prodBin
    }
    // Fallback: relative to main process file, or cwd
    const devBin = resolve(__dirname, '../../bin')
    if (existsSync(join(devBin, 'tmux'))) return devBin
    return join(process.cwd(), 'bin')
  }

  getLeadEnv(tmuxEnvValue?: string): Record<string, string> {
    const binDir = TeamSession.getBinDir()
    const currentPath = process.env.PATH || ''
    const env: Record<string, string> = {
      PATH: `${binDir}:${currentPath}`,
      CC_FRONTEND_SOCKET: this.socketPath,
      CC_TMUX_SOCKET: this.tmuxSocketName,
      CC_TMUX_SESSION: this.sessionName,
      REAL_TMUX: this.realTmuxPath,
      CLAUDECODE: '1',
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1'
    }
    // Set TMUX so Claude Code detects it's "inside" tmux
    // and spawns agents as tmux panes instead of subprocesses
    if (tmuxEnvValue) {
      env.TMUX = tmuxEnvValue
      env.TMUX_PANE = this.leadPaneId
    }
    return env
  }

  async sendTeammateInput(paneId: string, data: string, useKeys?: boolean): Promise<void> {
    if (!this.proxyServer) {
      throw new Error('TeamSession not running')
    }
    if (useKeys) {
      await this.proxyServer.sendKeys(paneId, data)
    } else {
      await this.proxyServer.sendInput(paneId, data)
    }
  }

  private wireServerEvents(): void {
    if (!this.proxyServer) return

    this.proxyServer.on('teammate-detected', (paneInfo: ProxyPaneInfo) => {
      const agentId = `tmux-${paneInfo.paneId}`
      const teammateIndex = this.teammates.size
      const colors = [
        '#4ECDC4',
        '#FF6B6B',
        '#45B7D1',
        '#96CEB4',
        '#FFEAA7',
        '#DDA0DD',
        '#F7DC6F',
        '#BB8FCE'
      ]
      const avatars = [
        'robot-1',
        'robot-2',
        'robot-3',
        'circuit',
        'diamond',
        'hexagon',
        'star',
        'shield'
      ]
      const agent: AgentState = {
        id: agentId,
        name: paneInfo.windowName || 'teammate',
        role: 'teammate',
        avatar: avatars[teammateIndex % avatars.length],
        color: colors[teammateIndex % colors.length],
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

    this.proxyServer.on(
      'teammate-status-update',
      (info: {
        paneId: string
        model?: string
        contextPercent?: string
        branch?: string
        project?: string
      }) => {
        const agentId = this.paneIdToAgentId.get(info.paneId)
        if (agentId) {
          this.emit('teammate-status-update', agentId, info)
        }
      }
    )

    this.proxyServer.on(
      'teammate-renamed',
      ({ paneId, name }: { paneId: string; name: string }) => {
        const agentId = this.paneIdToAgentId.get(paneId)
        if (agentId) {
          const agent = this.teammates.get(agentId)
          if (agent) {
            agent.name = name
            this.emit('teammate-renamed', agentId, name, paneId)
          }
        }
      }
    )

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

    this.proxyServer.on('server-error', (info: { failures: number; message: string }) => {
      this.emit('server-error', info)
    })

    this.proxyServer.on('server-recovered', () => {
      this.emit('server-recovered')
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
