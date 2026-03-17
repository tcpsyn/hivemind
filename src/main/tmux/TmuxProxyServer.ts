import * as net from 'net'
import * as fs from 'fs'
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
  args: string
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

export class TmuxProxyServer extends EventEmitter {
  private server: net.Server | null = null
  private socketPath: string
  private realTmuxPath: string
  private tmuxSocketName: string | null
  private knownPanes = new Map<string, ProxyPaneInfo>()
  private paneCaptureIntervals = new Map<string, ReturnType<typeof setInterval>>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private leadPaneId: string
  private leadSessionName: string | null = null
  private execCommand: ExecCommand
  private pollIntervalMs: number

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

    for (const [, interval] of this.paneCaptureIntervals) {
      clearInterval(interval)
    }
    this.paneCaptureIntervals.clear()
    this.knownPanes.clear()

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

    // Capture session name from new-session commands
    if (notification.command === 'new-session' && Array.isArray(notification.args)) {
      const sIdx = notification.args.indexOf('-s')
      if (sIdx !== -1 && sIdx + 1 < notification.args.length) {
        this.leadSessionName = notification.args[sIdx + 1]
      }
    }

    if (PANE_MUTATING_COMMANDS.includes(notification.command)) {
      this.discoverPanes().catch((err) => {
        this.emit('error', err)
      })
    }
  }

  async discoverPanes(): Promise<void> {
    // If we don't know the session yet, skip discovery (wait for new-session notification)
    if (!this.leadSessionName) return

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
    } catch (err) {
      this.emit('error', err)
      return
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
        // Try to get a better name from the process command line
        const agentName = await this.getAgentName(parseInt(pidStr, 10), windowName)

        const paneInfo: ProxyPaneInfo = {
          paneId,
          pid: parseInt(pidStr, 10),
          windowName: agentName,
          tty,
          sessionName
        }
        this.knownPanes.set(paneId, paneInfo)
        this.emit('teammate-detected', paneInfo)

        this.startPaneStreaming(paneId, tty).catch(() => {})
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

  async startPaneStreaming(paneId: string, _ttyPath: string): Promise<void> {
    // Resize the tmux pane to a reasonable width for the companion panel
    // (prevents hard line wraps at column 200)
    try {
      await this.execCommand(this.realTmuxPath, this.tmuxArgs([
        'resize-pane', '-t', paneId, '-x', '80', '-y', '24'
      ]))
    } catch {
      // resize may fail for various reasons
    }

    // Use capture-pane polling instead of TTY streaming.
    const captureIntervalMs = 500
    const lastCapture = { content: '' }

    const interval = setInterval(async () => {
      try {
        const { stdout } = await this.execCommand(
          this.realTmuxPath,
          this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-S', '-', '-J'])
        )
        if (stdout !== lastCapture.content) {
          this.emit('teammate-output', { paneId, data: Buffer.from(stdout) })
          lastCapture.content = stdout
        }
      } catch {
        // Pane may have been destroyed
      }
    }, captureIntervalMs)

    this.paneCaptureIntervals.set(paneId, interval)
  }

  private async getAgentName(pid: number, fallback: string): Promise<string> {
    try {
      // Look at child processes for the claude agent command
      const { stdout } = await this.execCommand('ps', [
        '-o', 'args=', '-p', String(pid)
      ])
      // Also check children in case the shell spawned claude
      const { stdout: childOut } = await this.execCommand('pgrep', [
        '-P', String(pid), '-a'
      ]).catch(() => ({ stdout: '' }))

      const combined = stdout + '\n' + childOut
      const nameMatch = combined.match(/--agent-name\s+(\S+)/)
      if (nameMatch) return nameMatch[1]
    } catch {
      // Fall through to fallback
    }
    return fallback
  }

  private stopPaneStreaming(paneId: string): void {
    const interval = this.paneCaptureIntervals.get(paneId)
    if (interval) {
      clearInterval(interval)
      this.paneCaptureIntervals.delete(paneId)
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
