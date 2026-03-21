import * as net from 'net'
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { StringDecoder } from 'string_decoder'

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

// Max output file size before truncation (10 MB)
const MAX_OUTPUT_FILE_BYTES = 10 * 1024 * 1024
// Max bytes to read in a single poll cycle (256 KB)
const MAX_READ_CHUNK_BYTES = 256 * 1024

interface PaneStreamState {
  interval: ReturnType<typeof setInterval>
  outFile: string
  bytesRead: number
  reading?: boolean
  fileHandle?: fsPromises.FileHandle
  decoder?: StringDecoder
  watcher?: fs.FSWatcher
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
  private pendingSendKeys: Array<{ args: string[]; timestamp: number }> = []
  private static readonly MAX_PENDING_SEND_KEYS = 100
  private static readonly PENDING_SEND_KEYS_TTL_MS = 30_000
  private outputBuffers = new Map<string, Buffer[]>()
  private readyPanes = new Set<string>()

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
      if (state.watcher) {
        state.watcher.close()
      }
      if (state.fileHandle) {
        state.fileHandle.close().catch(() => {})
      }
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
    this.outputBuffers.clear()
    this.readyPanes.clear()
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
      this.discoverPanes().catch(() => {
        // Ignore — tmux server may not be ready yet
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
      const now = Date.now()
      // Evict stale entries
      this.pendingSendKeys = this.pendingSendKeys.filter(
        (p) => now - p.timestamp < TmuxProxyServer.PENDING_SEND_KEYS_TTL_MS
      )
      // Enforce max size
      if (this.pendingSendKeys.length >= TmuxProxyServer.MAX_PENDING_SEND_KEYS) {
        this.pendingSendKeys.shift()
      }
      this.pendingSendKeys.push({ args: [...args], timestamp: now })
    }
  }

  private replayPendingSendKeys(paneId: string, paneInfo: ProxyPaneInfo): void {
    const now = Date.now()
    const remaining: Array<{ args: string[]; timestamp: number }> = []

    for (const pending of this.pendingSendKeys) {
      // Skip stale entries
      if (now - pending.timestamp >= TmuxProxyServer.PENDING_SEND_KEYS_TTL_MS) continue
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
      const result = await this.execCommand(
        this.realTmuxPath,
        this.tmuxArgs([
          'list-panes',
          '-t',
          this.leadSessionName,
          '-a',
          '-F',
          '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}'
        ])
      )
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
    // (model, context %, project name, branch) and detect permission prompts
    const interval = setInterval(async () => {
      try {
        const { stdout } = await this.execCommand(
          this.realTmuxPath,
          this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-J'])
        )
        // Parse the last few lines where the status bar lives
        const lastLines = stdout.split('\n').slice(-5).join('\n')
        const status = this.parseClaudeStatus(lastLines)
        if (status) {
          this.emit('teammate-status-update', { paneId, ...status })
        }

        // Detect permission prompts in the last 15 lines
        const recentLines = stdout.split('\n').slice(-15).join('\n')
        const needsInput = this.detectPermissionPrompt(recentLines)
        this.emit('teammate-input-needed', { paneId, needsInput })

        // Detect task completion — look for completion indicators in recent output.
        // Also detect the idle prompt (❯) which means the teammate finished and is waiting.
        const taskComplete =
          recentLines.includes('TASK COMPLETE') ||
          recentLines.includes('Completion reported') ||
          recentLines.includes('Waiting for next instructions') ||
          recentLines.includes('waiting for task assignment') ||
          recentLines.includes('Awaiting next assignment') ||
          (recentLines.includes('Done.') && recentLines.includes('team lead'))
        if (taskComplete) {
          this.emit('teammate-task-complete', { paneId })
        }
      } catch {
        // pane may be gone
      }
    }, 1000)

    // Store with a prefixed key so it doesn't conflict with streaming intervals
    this.paneCaptureIntervals.set(`status-${paneId}`, interval)
  }

  private parseClaudeStatus(
    output: string
  ): { model?: string; contextPercent?: string; branch?: string; project?: string } | null {
    // Claude Code status line looks like:
    // cc_frontend  Opus 4.6  [████████████] 11%  ⌞ feature/branch
    // or: cc_frontend  Opus 4.6 (1M context)  [████] 3%  ⌞ feature...
    const lines = output.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      // Look for context % pattern — most reliable indicator of a status line
      const pctMatch = line.match(/(\d+)%/)
      if (!pctMatch) continue

      // Look for model pattern (Opus/Sonnet/Haiku + optional version)
      const modelMatch = line.match(/(Opus|Sonnet|Haiku)(?:\s+[\d.]+)?/i)
      if (modelMatch) {
        const model = modelMatch[0]
        const contextPercent = pctMatch[1] + '%'
        // Project name is usually at the start
        const projectMatch = line.match(/^\s*(\S+)\s+(?:Opus|Sonnet|Haiku)/i)
        const project = projectMatch ? projectMatch[1] : undefined
        // Branch after ⌞ or ⌟ or /
        const branchMatch = line.match(/[⌞⌟/]\s*(.+?)\s*$/)
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
          '-P',
          String(pid),
          '-a'
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

  /**
   * Called when the renderer signals it's ready to receive output for a pane.
   * Resizes the tmux pane to match the renderer's xterm.js dimensions,
   * then flushes buffered output and sends a capture-pane snapshot.
   *
   * The resize MUST happen before the snapshot — without it, capture-pane
   * returns text wrapped at 80 columns which garbles when rendered at a
   * different width.
   */
  async flushBufferedOutput(paneId: string, cols?: number, rows?: number): Promise<void> {
    if (!this.knownPanes.has(paneId)) return

    // Resize tmux pane to match renderer dimensions before capturing
    if (cols && rows) {
      await this.resizePane(paneId, cols, rows)
    }

    this.markPaneReady(paneId)

    // Now that pane dimensions match the renderer, take a snapshot of
    // whatever is currently on screen. The -e flag preserves ANSI escapes
    // so xterm.js renders colors/styles natively.
    try {
      const { stdout } = await this.execCommand(
        this.realTmuxPath,
        this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-e', '-J'])
      )
      if (stdout.trim()) {
        this.emitTeammateOutput(paneId, Buffer.from('\x1b[2J\x1b[H' + stdout))
      }
    } catch {
      // Pane may not exist yet — non-fatal
    }
  }

  /**
   * Called when the renderer signals it's ready to receive output for a pane.
   * Flushes any buffered output that arrived before the renderer subscribed.
   */
  markPaneReady(paneId: string): void {
    this.readyPanes.add(paneId)
    const buffered = this.outputBuffers.get(paneId)
    if (buffered && buffered.length > 0) {
      const combined = Buffer.concat(buffered)
      this.outputBuffers.delete(paneId)
      this.emit('teammate-output', { paneId, data: combined })
    }
  }

  private emitTeammateOutput(paneId: string, data: Buffer): void {
    if (this.readyPanes.has(paneId)) {
      this.emit('teammate-output', { paneId, data })
    } else {
      let buf = this.outputBuffers.get(paneId)
      if (!buf) {
        buf = []
        this.outputBuffers.set(paneId, buf)
      }
      buf.push(data)
    }
  }

  async resizePane(paneId: string, cols: number, rows: number): Promise<void> {
    console.error(`[TmuxProxyServer] resizePane ${paneId} to ${cols}x${rows}`)
    try {
      await this.execCommand(
        this.realTmuxPath,
        this.tmuxArgs(['resize-window', '-t', paneId, '-x', String(cols), '-y', String(rows)])
      )
    } catch (err) {
      console.error(`[TmuxProxyServer] resize-window failed for ${paneId}:`, err)
    }
    try {
      await this.execCommand(
        this.realTmuxPath,
        this.tmuxArgs(['resize-pane', '-t', paneId, '-x', String(cols), '-y', String(rows)])
      )
    } catch (err) {
      console.error(`[TmuxProxyServer] resize-pane failed for ${paneId}:`, err)
    }
  }

  async startPaneStreaming(paneId: string): Promise<void> {
    const safeId = paneId.replace('%', '')
    const outFile = join(tmpdir(), `cc-pane-${safeId}-${Date.now()}.out`)

    // Create the output file
    await fsPromises.writeFile(outFile, '')

    // Use tmux pipe-pane to stream raw PTY output to the file.
    // pipe-pane captures the actual output stream (with ANSI codes),
    // which xterm.js can render natively — unlike capture-pane which
    // takes screen snapshots that look garbled in a second terminal.
    let pipePaneWorking = false
    try {
      await this.execCommand(
        this.realTmuxPath,
        // tee uses raw write() syscalls (no user-space buffering), unlike cat
        // which block-buffers when stdout is a file. This ensures output reaches
        // the file immediately for low-latency streaming.
        this.tmuxArgs(['pipe-pane', '-t', paneId, '-o', `tee -a "${outFile}" > /dev/null`])
      )
      pipePaneWorking = true
    } catch (err) {
      console.error(`[TmuxProxyServer] pipe-pane failed for ${paneId}:`, err)
    }

    if (!pipePaneWorking) {
      // pipe-pane failed immediately — use capture-pane fallback
      this.startCapturePanePolling(paneId)
      return
    }

    // Open a persistent file handle to avoid open/close churn on every poll.
    // StringDecoder handles partial UTF-8 sequences at chunk boundaries.
    let fileHandle: fsPromises.FileHandle | undefined
    try {
      fileHandle = await fsPromises.open(outFile, 'r')
    } catch {
      this.startCapturePanePolling(paneId)
      return
    }

    let pollCount = 0
    const state: PaneStreamState = {
      interval: setInterval(() => {
        if (!state.reading) {
          state.reading = true
          pollCount++
          this.readNewOutput(paneId, state)
            .then(() => {
              // Watchdog: if pipe-pane produced no data after 60 polls (~12s),
              // it's silently broken — switch to capture-pane fallback.
              // Claude Code often takes 3+ seconds during init, so 15 polls was too aggressive.
              // Use stopPipePaneOnly to avoid killing status polling.
              if (pollCount >= 60 && state.bytesRead === 0) {
                console.error(
                  `[TmuxProxyServer] pipe-pane silent for ${paneId}, switching to capture-pane`
                )
                this.stopPipePaneOnly(paneId)
                this.startCapturePanePolling(paneId)
              }
            })
            .finally(() => {
              state.reading = false
            })
        }
      }, 200),
      outFile,
      bytesRead: 0,
      fileHandle,
      decoder: new StringDecoder('utf8')
    }

    // Use fs.watch for push-based notification when the file changes.
    // This triggers an immediate read instead of waiting for the next 200ms poll,
    // making streaming output feel real-time.
    try {
      state.watcher = fs.watch(outFile, () => {
        if (!state.reading) {
          state.reading = true
          this.readNewOutput(paneId, state).finally(() => {
            state.reading = false
          })
        }
      })
      state.watcher.on('error', () => {
        // Watcher may fail if file is deleted — polling continues as fallback
      })
    } catch {
      // fs.watch not available — 200ms polling continues as fallback
    }

    this.paneStreams.set(paneId, state)
  }

  private async readNewOutput(paneId: string, state: PaneStreamState): Promise<void> {
    try {
      const stats = await fsPromises.stat(state.outFile)
      if (stats.size <= state.bytesRead) return

      // Read in chunks to avoid large allocations on output bursts
      const unread = stats.size - state.bytesRead
      const toRead = Math.min(unread, MAX_READ_CHUNK_BYTES)

      const fh = state.fileHandle
      if (!fh) return

      const buf = Buffer.alloc(toRead)
      await fh.read(buf, 0, toRead, state.bytesRead)
      state.bytesRead += toRead

      // Use StringDecoder to handle partial UTF-8 sequences at chunk boundaries.
      // If a multi-byte character (emoji, CJK) is split across two reads,
      // StringDecoder buffers the incomplete bytes and emits them on the next call.
      const decoded = state.decoder!.write(buf)
      if (decoded.length > 0) {
        this.emitTeammateOutput(paneId, Buffer.from(decoded))
      }

      // Only truncate when we've caught up to prevent data loss.
      // If unread > MAX_READ_CHUNK_BYTES, we haven't read everything yet.
      if (stats.size > MAX_OUTPUT_FILE_BYTES && state.bytesRead >= stats.size) {
        await fsPromises.truncate(state.outFile, 0)
        state.bytesRead = 0
      }
    } catch {
      // File might not exist yet or handle may be stale
    }
  }

  private detectPermissionPrompt(text: string): boolean {
    // Claude Code permission prompts contain these patterns
    return (
      text.includes('Do you want to proceed?') ||
      text.includes('Do you want to make this edit') ||
      text.includes('Do you want to run') ||
      (text.includes('1. Yes') && text.includes('3. No')) ||
      (text.includes('Esc to cancel') && text.includes('Tab to amend'))
    )
  }

  private filterClaudeUILines(text: string): string {
    // Only strip the actual Claude Code status bar line (model + context %).
    // Keep ALL content lines including box-drawing characters (⎿├└│─━═)
    // which Claude Code uses extensively in tool output.
    const lines = text.split('\n')
    const filtered = lines.filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      // Strip the status bar: "project  Model X.Y  [████] NN%  ⌞ branch"
      if (/\b(Opus|Sonnet|Haiku)\b/i.test(trimmed) && /\d+%/.test(trimmed)) return false
      return true
    })
    // Trim leading/trailing empty lines
    while (filtered.length > 0 && !filtered[0].trim()) filtered.shift()
    while (filtered.length > 0 && !filtered[filtered.length - 1].trim()) filtered.pop()
    return filtered.join('\n')
  }

  private startCapturePanePolling(paneId: string): void {
    const lastCapture = { content: '' }
    const outFile = ''
    console.error(`[TmuxProxyServer] Using capture-pane fallback for ${paneId}`)

    const interval = setInterval(async () => {
      try {
        // Use -p for plain text, -J to join wrapped lines
        const { stdout } = await this.execCommand(
          this.realTmuxPath,
          this.tmuxArgs(['capture-pane', '-t', paneId, '-p', '-J'])
        )
        const content = this.filterClaudeUILines(stdout)

        if (content !== lastCapture.content && content.trim()) {
          // Clear and rewrite since capture-pane gives us screen state, not a stream
          this.emitTeammateOutput(paneId, Buffer.from('\x1b[2J\x1b[H' + content))
          lastCapture.content = content
        }
      } catch {
        // Pane may have been destroyed
      }
    }, 500)

    this.paneStreams.set(paneId, { interval, outFile, bytesRead: 0 })
  }

  /**
   * Stops only the pipe-pane file streaming resources (interval, watcher, file handle)
   * and cancels the tmux pipe-pane command. Does NOT kill status polling or name lookups.
   * Used by the watchdog when switching to capture-pane fallback.
   */
  private stopPipePaneOnly(paneId: string): void {
    const state = this.paneStreams.get(paneId)
    if (state) {
      clearInterval(state.interval)
      if (state.watcher) {
        state.watcher.close()
      }
      if (state.fileHandle) {
        state.fileHandle.close().catch(() => {})
      }
      if (state.outFile) {
        fsPromises.unlink(state.outFile).catch(() => {})
      }
      this.paneStreams.delete(paneId)
    }
    // Cancel tmux pipe-pane so the stale tee process doesn't keep running
    this.execCommand(this.realTmuxPath, this.tmuxArgs(['pipe-pane', '-t', paneId])).catch(() => {})
  }

  private stopPaneStreaming(paneId: string): void {
    this.stopPipePaneOnly(paneId)
    this.readyPanes.delete(paneId)
    this.outputBuffers.delete(paneId)
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

    // Try direct TTY write first — it's much faster for interactive typing
    // since it doesn't spawn a subprocess per keystroke.
    if (pane?.tty) {
      try {
        const fh = await fsPromises.open(pane.tty, 'w')
        try {
          await fh.write(data)
        } finally {
          await fh.close()
        }
        return
      } catch {
        // Fall through to tmux send-keys
      }
    }

    // Fallback: tmux send-keys -l (literal mode, no escaping needed)
    await this.execCommand(
      this.realTmuxPath,
      this.tmuxArgs(['send-keys', '-t', paneId, '-l', data])
    )
  }

  /**
   * Send input via tmux send-keys only (no direct TTY write).
   * Used for permission prompt responses where Claude Code's raw-mode
   * input handler needs proper terminal keypress simulation.
   * Does NOT use -l (literal) flag — sends as key events, not text.
   */
  async sendKeys(paneId: string, data: string): Promise<void> {
    console.error(
      `[TmuxProxyServer] sendKeys pane=${paneId} key=${data} socket=${this.tmuxSocketName}`
    )
    try {
      await this.execCommand(this.realTmuxPath, this.tmuxArgs(['send-keys', '-t', paneId, data]))
      console.error(`[TmuxProxyServer] sendKeys success`)
    } catch (err) {
      console.error(`[TmuxProxyServer] sendKeys failed:`, err)
    }
  }

  /**
   * Send literal text to a pane (not key names). Uses -l flag.
   * For text messages that should be typed as-is into the terminal.
   */
  async sendLiteralText(paneId: string, text: string): Promise<void> {
    try {
      await this.execCommand(
        this.realTmuxPath,
        this.tmuxArgs(['send-keys', '-t', paneId, '-l', text])
      )
    } catch (err) {
      console.error(`[TmuxProxyServer] sendLiteralText failed:`, err)
    }
  }

  private startPolling(): void {
    if (this.pollIntervalMs <= 0) return
    this.pollInterval = setInterval(() => {
      this.discoverPanes().catch(() => {
        // Silently ignore polling failures — the tmux server may be shutting down
        // or not fully started yet. Polling will retry on next interval.
      })
    }, this.pollIntervalMs)
  }

  getKnownPanes(): Map<string, ProxyPaneInfo> {
    return new Map(this.knownPanes)
  }
}
