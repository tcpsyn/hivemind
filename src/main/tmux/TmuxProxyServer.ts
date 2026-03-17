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
  private knownPanes = new Map<string, ProxyPaneInfo>()
  private paneStreams = new Map<string, fs.ReadStream>()
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
      execCommand?: ExecCommand
      pollIntervalMs?: number
    }
  ) {
    super()
    this.socketPath = socketPath
    this.realTmuxPath = realTmuxPath
    this.leadPaneId = options?.leadPaneId ?? '%0'
    this.execCommand = options?.execCommand ?? defaultExecCommand
    this.pollIntervalMs = options?.pollIntervalMs ?? 2000
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

    for (const [, stream] of this.paneStreams) {
      stream.destroy()
    }
    this.paneStreams.clear()
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

    if (PANE_MUTATING_COMMANDS.includes(notification.command)) {
      this.discoverPanes().catch((err) => {
        this.emit('error', err)
      })
    }
  }

  async discoverPanes(): Promise<void> {
    // First, find which session the lead pane belongs to
    let sessionFilter = ''
    if (!this.leadSessionName) {
      try {
        const sessionResult = await this.execCommand(this.realTmuxPath, [
          'display-message',
          '-t',
          this.leadPaneId,
          '-p',
          '#{session_name}'
        ])
        this.leadSessionName = sessionResult.stdout.trim()
      } catch {
        // Lead pane might not be in tmux yet, list all and filter
      }
    }
    sessionFilter = this.leadSessionName || ''

    // List panes — only from the lead's session if known, otherwise all
    let stdout: string
    try {
      const listArgs = sessionFilter
        ? ['list-panes', '-t', sessionFilter, '-a', '-F', '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}']
        : ['list-panes', '-a', '-F', '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}']
      const result = await this.execCommand(this.realTmuxPath, listArgs)
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
        const paneInfo: ProxyPaneInfo = {
          paneId,
          pid: parseInt(pidStr, 10),
          windowName,
          tty,
          sessionName
        }
        this.knownPanes.set(paneId, paneInfo)
        this.emit('teammate-detected', paneInfo)

        if (tty) {
          this.startPaneStreaming(paneId, tty).catch(() => {})
        }
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

  async startPaneStreaming(paneId: string, ttyPath: string): Promise<void> {
    try {
      const stream = fs.createReadStream(ttyPath)
      this.paneStreams.set(paneId, stream)

      stream.on('data', (data: Buffer) => {
        this.emit('teammate-output', { paneId, data })
      })

      stream.on('error', () => {
        this.paneStreams.delete(paneId)
        this.startPipePaneFallback(paneId).catch(() => {})
      })
    } catch {
      await this.startPipePaneFallback(paneId)
    }
  }

  private async startPipePaneFallback(paneId: string): Promise<void> {
    const safeId = paneId.replace('%', '')
    const fifoPath = `/tmp/cc-frontend-pane-${safeId}.pipe`

    try {
      await this.execCommand('mkfifo', [fifoPath])
      await this.execCommand(this.realTmuxPath, [
        'pipe-pane',
        '-t',
        paneId,
        '-o',
        `cat >> ${fifoPath}`
      ])

      const stream = fs.createReadStream(fifoPath)
      this.paneStreams.set(paneId, stream)

      stream.on('data', (data: Buffer) => {
        this.emit('teammate-output', { paneId, data })
      })

      stream.on('error', () => {
        this.paneStreams.delete(paneId)
      })
    } catch {
      // Both TTY and pipe-pane failed
    }
  }

  private stopPaneStreaming(paneId: string): void {
    const stream = this.paneStreams.get(paneId)
    if (stream) {
      stream.destroy()
      this.paneStreams.delete(paneId)
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
    await this.execCommand(this.realTmuxPath, ['send-keys', '-t', paneId, '-l', escaped])
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
