import * as net from 'net'
import * as fs from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface ProxyPaneInfo {
  paneId: string
  pid: number
  windowName: string
  tty: string
  sessionName: string
}

export interface TmuxProxyNotification {
  event: string
  command: string
  args: string[] | string
  exitCode: number
}

export type ExecCommand = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>

const defaultExecCommand: ExecCommand = (command, args) => execFileAsync(command, args)

const PANE_MUTATING_COMMANDS = [
  'new-window',
  'split-window',
  'new-session',
  'kill-pane',
  'kill-session',
  'kill-window'
]

interface PaneStreamState {
  interval: ReturnType<typeof setInterval>
  outFile: string
  bytesRead: number
}

export class TmuxProxyServer extends EventEmitter {
  private server: net.Server | null = null
  private socketPath: string
  private realTmuxPath: string
  private tmuxSocketName: string | null
  private knownPanes = new Map<string, ProxyPaneInfo>()
  private paneStreams = new Map<string, PaneStreamState>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private leadPaneId: string
  private leadSessionName: string | null = null
  private execCommand: ExecCommand
  private pollIntervalMs: number
  private pendingNameLookups = new Map<string, ReturnType<typeof setTimeout>>()
  private paneCaptureIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private consecutiveDiscoverFailures = 0
  private static readonly MAX_DISCOVER_FAILURES = 3
  private serverHealthy = true
  private discovering = false
  private pendingSendKeys: Array<{ args: string[] }> = []

  constructor(
    socketPath: string,
    realTmuxPath: string,
    options?: {
      leadPaneId?: string
      leadSessionName?: string
      execCommand?: ExecCommand
      pollIntervalMs?: number
      tmuxSocketName?: string
    }
  ) {
    super()
    this.socketPath = socketPath
    this.realTmuxPath = realTmuxPath
    this.tmuxSocketName = options?.tmuxSocketName ?? null
    this.leadPaneId = options?.leadPaneId ?? '%0'
    this.leadSessionName = options?.leadSessionName ?? null
    this.execCommand = options?.execCommand ?? defaultExecCommand
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000
  }

  private tmuxArgs(args: string[]): string[] {
    if (this.tmuxSocketName) {
      return ['-L', this.tmuxSocketName, ...args]
    }
    return args
  }

  async start(): Promise<void> {
    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // ignore
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((conn) => this.handleConnection(conn))
      this.server.on('error', reject)
      this.server.listen(this.socketPath, () => {
        this.startPolling()
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    for (const [, state] of this.paneStreams) {
      clearInterval(state.interval)
      try {
        fs.unlinkSync(state.outFile)
      } catch {
        // ignore
      }
    }
    this.paneStreams.clear()

    for (const [, timeout] of this.pendingNameLookups) {
      clearTimeout(timeout)
    }
    this.pendingNameLookups.clear()

    for (const [, interval] of this.paneCaptureIntervals) {
      clearInterval(interval)
    }
    this.paneCaptureIntervals.clear()

    this.knownPanes.clear()
    this.pendingSendKeys = []
    this.consecutiveDiscoverFailures = 0
    this.serverHealthy = true
    this.discovering = false

    return new Promise((resolve) => {
      if (!this.server) {
        resolve()
        return
      }
      this.server.close(() => {
        try {
          fs.unlinkSync(this.socketPath)
        } catch {
          // ignore
        }
        this.server = null
        resolve()
      })
    })
  }

  private handleConnection(conn: net.Socket): void {
    let buffer = ''
    conn.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const notification: TmuxProxyNotification = JSON.parse(line)
          this.handleNotification(notification)
        } catch {
          // ignore parse errors
        }
      }
    })
  }

  private handleNotification(notification: TmuxProxyNotification): void {
    if (notification.event !== 'tmux-command') return
    if (notification.exitCode !== 0) return

    const args = Array.isArray(notification.args) ? notification.args : []

    // Capture session name from new-session commands
    if (notification.command === 'new-session') {
      const sIdx = args.indexOf('-s')
      if (sIdx !== -1 && sIdx + 1 < args.length) {
        this.leadSessionName = args[sIdx + 1]
      }
    }

    // Extract agent name from send-keys commands and update pane info
    if (notification.command === 'send-keys') {
      this.handleSendKeysNotification(args)
    }

    if (PANE_MUTATING_COMMANDS.includes(notification.command)) {
      this.discoverPanes().catch((err) => {
        this.emit('error', err)
      })
    }
  }

  private handleSendKeysNotification(args: string[]): void {
    // Parse: send-keys -t <target> <command-string> Enter
    const tIdx = args.indexOf('-t')
    if (tIdx === -1 || tIdx + 1 >= args.length) return

    const fullArgs = args.join(' ')
    const nameMatch = fullArgs.match(/--agent-name\s+(\S+)/)
    if (!nameMatch) return

    const agentName = nameMatch[1]
    const target = args[tIdx + 1]

    // Try to match against known panes
    let matched = false
    for (const [paneId, paneInfo] of this.knownPanes) {
      if (target === paneId || target.includes(paneInfo.sessionName)) {
        paneInfo.windowName = agentName
        this.emit('teammate-renamed', { paneId, name: agentName })
        matched = true
        break
      }
    }

    // Buffer unmatched notifications — pane may not be discovered yet
    if (!matched) {
      this.pendingSendKeys.push({ args: [...args] })
    }
  }

  private replayPendingSendKeys(paneId: string, paneInfo: ProxyPaneInfo): void {
    const remaining: Array<{ args: string[] }> = []

    for (const pending of this.pendingSendKeys) {
      const tIdx = pending.args.indexOf('-t')
      if (tIdx === -1 || tIdx + 1 >= pending.args.length) continue

      const target = pending.args[tIdx + 1]
      const fullArgs = pending.args.join(' ')
      const nameMatch = fullArgs.match(/--agent-name\s+(\S+)/)

      if (nameMatch && (target === paneId || target.includes(paneInfo.sessionName))) {
        paneInfo.windowName = nameMatch[1]
        this.emit('teammate-renamed', { paneId, name: nameMatch[1] })
      } else {
        remaining.push(pending)
      }
    }

    this.pendingSendKeys = remaining
  }

  async discoverPanes(): Promise<void> {
    // If we don't know the session yet, skip discovery (wait for new-session notification)
    if (!this.leadSessionName) return

    // Guard against concurrent execution
    if (this.discovering) return
    this.discovering = true

    // List panes only from the team's session
    let stdout: string
    try {
      const result = await this.execCommand(this.realTmuxPath, this.tmuxArgs([
        'list-panes',
        '-t',
        this.leadSessionName,
        '-a',
        '-F',
        '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}'
      ]))
      stdout = result.stdout
      this.consecutiveDiscoverFailures = 0
      if (!this.serverHealthy) {
        this.serverHealthy = true
        this.emit('server-recovered')
      }
    } catch (err) {
      this.consecutiveDiscoverFailures++
      this.emit('error', err)
      if (
        this.consecutiveDiscoverFailures >= TmuxProxyServer.MAX_DISCOVER_FAILURES &&
        this.serverHealthy
      ) {
        this.serverHealthy = false
        this.emit('server-error', {
          failures: this.consecutiveDiscoverFailures,
          message: `Tmux server unreachable after ${this.consecutiveDiscoverFailures} consecutive failures`
        })
      }
      this.discovering = false
      return
    } finally {
      this.discovering = false
    }

    const currentPaneIds = new Set<string>()

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('|')
      if (parts.length < 5) continue

      const [paneId, pidStr, windowName, tty, sessionName] = parts

      // Skip lead pane and panes from other sessions
      if (paneId === this.leadPaneId) continue
      if (this.leadSessionName && sessionName !== this.leadSessionName) continue

      currentPaneIds.add(paneId)

      if (!this.knownPanes.has(paneId)) {
        const paneInfo: ProxyPaneInfo = {
          paneId,
          pid: parseInt(pidStr, 10),
          windowName,
          tty,
          sessionName
        }
        this.knownPanes.set(paneId, paneInfo)
        this.emit('teammate-detected', paneInfo)

        // Replay any buffered send-keys that arrived before this pane was discovered
        this.replayPendingSendKeys(paneId, paneInfo)

        this.startPaneStreaming(paneId).catch(() => {})
        this.startStatusPolling(paneId)

        // Schedule delayed name lookup (agent process needs time to start)
        this.scheduleNameLookup(paneId, parseInt(pidStr, 10))
      }
    }

    // Detect exited panes
    for (const [paneId] of this.knownPanes) {
      if (!currentPaneIds.has(paneId)) {
        this.knownPanes.delete(paneId)
        this.stopPaneStreaming(paneId)
        this.emit('teammate-exited', { paneId })
      }
    }
  }

  isHealthy(): boolean {
    return this.serverHealthy
  }

  private startStatusPolling(paneId: string): void {
    // Poll the last few lines of the pane to extract Claude Code status info
    // (model, context %, project name, branch)
    const interval = setInterval(async () => {
      try {
        const { stdout } = await this.execCommand(
          this.realTmuxPath,
          this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-S', '-3'])
        )
        const status = this.parseClaudeStatus(stdout)
        if (status) {
          this.emit('teammate-status-update', { paneId, ...status })
        }
      } catch {
        // pane may be gone
      }
    }, 3000)

    // Store with a prefixed key so it doesn't conflict with streaming intervals
    this.paneCaptureIntervals.set(`status-${paneId}`, interval)
  }

  private parseClaudeStatus(output: string): { model?: string; contextPercent?: string; branch?: string; project?: string } | null {
    // Claude Code status line looks like:
    // cc_frontend  Opus 4.6  [████████████] 11%  ⌞ feature/branch
    // or: cc_frontend  Opus 4.6 (1M context)  [████] 3%  ⌞ feature...
    const lines = output.split('\n').filter(l => l.trim())
    for (const line of lines) {
      // Look for model pattern (Opus/Sonnet/Haiku + version)
      const modelMatch = line.match(/(Opus|Sonnet|Haiku)\s+[\d.]+/)
      if (modelMatch) {
        const model = modelMatch[0]
        const pctMatch = line.match(/(\d+)%/)
        const contextPercent = pctMatch ? pctMatch[1] + '%' : undefined
        // Project name is usually at the start
        const projectMatch = line.match(/^\s*(\S+)\s+(?:Opus|Sonnet|Haiku)/)
        const project = projectMatch ? projectMatch[1] : undefined
        // Branch after ⌞ or /
        const branchMatch = line.match(/[⌞/]\s*(.+?)\s*$/)
        const branch = branchMatch ? branchMatch[1].trim() : undefined

        return { model, contextPercent, project, branch }
      }
    }
    return null
  }

  private scheduleNameLookup(paneId: string, pid: number): void {
    // Try to resolve the agent name after the process has time to start
    const attempts = [2000, 5000, 10000]
    let attemptIdx = 0

    const tryLookup = async () => {
      const pane = this.knownPanes.get(paneId)
      if (!pane) return

      try {
        const { stdout: childOut } = await this.execCommand('pgrep', [
          '-P', String(pid), '-a'
        ]).catch(() => ({ stdout: '' }))

        const nameMatch = childOut.match(/--agent-name\s+(\S+)/)
        if (nameMatch && nameMatch[1] !== pane.windowName) {
          pane.windowName = nameMatch[1]
          this.emit('teammate-renamed', { paneId, name: nameMatch[1] })
          return
        }
      } catch {
        // ignore
      }

      attemptIdx++
      if (attemptIdx < attempts.length) {
        const timeout = setTimeout(tryLookup, attempts[attemptIdx])
        this.pendingNameLookups.set(paneId, timeout)
      }
    }

    const timeout = setTimeout(tryLookup, attempts[0])
    this.pendingNameLookups.set(paneId, timeout)
  }

  async resizePane(paneId: string, cols: number, rows: number): Promise<void> {
    try {
      await this.execCommand(this.realTmuxPath, this.tmuxArgs([
        'resize-pane', '-t', paneId, '-x', String(cols), '-y', String(rows)
      ]))
    } catch {
      // resize may fail if pane no longer exists
    }
  }

  async startPaneStreaming(paneId: string): Promise<void> {
    const safeId = paneId.replace('%', '')
    const outFile = join(tmpdir(), `cc-pane-${safeId}-${Date.now()}.out`)

    // Create the output file
    fs.writeFileSync(outFile, '')

    // Use tmux pipe-pane to stream output to the file
    try {
      await this.execCommand(this.realTmuxPath, this.tmuxArgs([
        'pipe-pane', '-t', paneId, '-o', `cat >> "${outFile}"`
      ]))
    } catch {
      // pipe-pane may fail, fall back to capture-pane polling
      this.startCapturePanePolling(paneId)
      return
    }

    // Poll the file for new content
    const state: PaneStreamState = {
      interval: setInterval(() => this.readNewOutput(paneId, state), 200),
      outFile,
      bytesRead: 0
    }
    this.paneStreams.set(paneId, state)
  }

  private readNewOutput(paneId: string, state: PaneStreamState): void {
    try {
      const stats = fs.statSync(state.outFile)
      if (stats.size > state.bytesRead) {
        const buf = Buffer.alloc(stats.size - state.bytesRead)
        const fd = fs.openSync(state.outFile, 'r')
        fs.readSync(fd, buf, 0, buf.length, state.bytesRead)
        fs.closeSync(fd)
        state.bytesRead = stats.size
        this.emit('teammate-output', { paneId, data: buf })
      }
    } catch {
      // File might not exist yet
    }
  }

  private startCapturePanePolling(paneId: string): void {
    const lastCapture = { content: '' }
    const outFile = ''

    const interval = setInterval(async () => {
      try {
        const { stdout } = await this.execCommand(
          this.realTmuxPath,
          this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-e', '-S', '-'])
        )
        if (stdout !== lastCapture.content) {
          this.emit('teammate-output', { paneId, data: Buffer.from(stdout) })
          lastCapture.content = stdout
        }
      } catch {
        // Pane may have been destroyed
      }
    }, 500)

    this.paneStreams.set(paneId, { interval, outFile, bytesRead: 0 })
  }

  private stopPaneStreaming(paneId: string): void {
    const state = this.paneStreams.get(paneId)
    if (state) {
      clearInterval(state.interval)
      if (state.outFile) {
        try {
          fs.unlinkSync(state.outFile)
        } catch {
          // ignore
        }
      }
      this.paneStreams.delete(paneId)
    }
    // Clean up status polling
    const statusInterval = this.paneCaptureIntervals.get(`status-${paneId}`)
    if (statusInterval) {
      clearInterval(statusInterval)
      this.paneCaptureIntervals.delete(`status-${paneId}`)
    }
    const timeout = this.pendingNameLookups.get(paneId)
    if (timeout) {
      clearTimeout(timeout)
      this.pendingNameLookups.delete(paneId)
    }
  }

  async sendInput(paneId: string, data: string): Promise<void> {
    const pane = this.knownPanes.get(paneId)

    if (pane?.tty) {
      try {
        const fd = fs.openSync(pane.tty, 'w')
        try {
          fs.writeSync(fd, data)
        } finally {
          fs.closeSync(fd)
        }
        return
      } catch {
        // Fall through to tmux send-keys
      }
    }

    const escaped = data.replace(/"/g, '\\"')
    await this.execCommand(this.realTmuxPath, this.tmuxArgs(['send-keys', '-t', paneId, '-l', escaped]))
  }

  private startPolling(): void {
    if (this.pollIntervalMs <= 0) return
    this.pollInterval = setInterval(() => {
      this.discoverPanes().catch((err) => {
        this.emit('error', err)
      })
    }, this.pollIntervalMs)
  }

  getKnownPanes(): Map<string, ProxyPaneInfo> {
    return new Map(this.knownPanes)
  }
}
