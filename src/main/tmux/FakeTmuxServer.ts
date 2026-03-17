import * as net from 'net'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import type { TmuxRequest, TmuxResponse } from '../../shared/tmux-types'
import { formatTmuxString, type TmuxVars } from './TmuxResponseFormatter'

interface PaneState {
  paneId: string
  sessionName: string
  windowName: string
  pid: number
  cols: number
  rows: number
  isActive: boolean
  agentId?: string
  outputBuffer: string[]
}

interface SessionState {
  name: string
  panes: Map<string, PaneState>
  windowCount: number
}

export class FakeTmuxServer extends EventEmitter {
  private server: net.Server | null = null
  private sessions = new Map<string, SessionState>()
  private paneIndex = 0
  private socketPath: string

  constructor(socketPath: string) {
    super()
    this.socketPath = socketPath
  }

  async start(): Promise<void> {
    // Clean up stale socket
    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // ignore
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((conn) => this.handleConnection(conn))

      this.server.on('error', reject)

      this.server.listen(this.socketPath, () => {
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
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
          const request: TmuxRequest = JSON.parse(line)
          const response = this.handleRequest(request)
          conn.write(JSON.stringify(response) + '\n')
        } catch {
          // ignore parse errors
        }
      }
    })
  }

  private handleRequest(request: TmuxRequest): TmuxResponse {
    switch (request.command) {
      case 'new-session':
        return this.handleNewSession(request)
      case 'has-session':
        return this.handleHasSession(request)
      case 'new-window':
        return this.handleNewWindow(request)
      case 'split-window':
        return this.handleSplitWindow(request)
      case 'send-keys':
        return this.handleSendKeys(request)
      case 'list-panes':
        return this.handleListPanes(request)
      case 'list-sessions':
        return this.handleListSessions(request)
      case 'capture-pane':
        return this.handleCapturePane(request)
      case 'display-message':
        return this.handleDisplayMessage(request)
      case 'kill-session':
        return this.handleKillSession(request)
      case 'kill-pane':
        return this.handleKillPane(request)
      case 'select-pane':
        return this.handleSelectPane(request)
      case 'resize-pane':
        return this.handleResizePane(request)
      default:
        return this.ok(request.id)
    }
  }

  private handleNewSession(request: TmuxRequest): TmuxResponse {
    const name = String(request.args.s || 'default')

    if (this.sessions.has(name)) {
      return this.error(request.id, 'duplicate session: ' + name)
    }

    const paneId = this.allocatePaneId()
    const pane: PaneState = {
      paneId,
      sessionName: name,
      windowName: name,
      pid: process.pid,
      cols: 80,
      rows: 24,
      isActive: true,
      outputBuffer: []
    }

    const session: SessionState = {
      name,
      panes: new Map([[paneId, pane]]),
      windowCount: 1
    }

    this.sessions.set(name, session)
    this.emit('session-created', name, paneId)

    return this.ok(request.id, paneId + '\n')
  }

  private handleHasSession(request: TmuxRequest): TmuxResponse {
    const name = String(request.args.t || '')
    if (this.sessions.has(name)) {
      return this.ok(request.id)
    }
    return this.error(request.id, `session not found: ${name}`)
  }

  private handleNewWindow(request: TmuxRequest): TmuxResponse {
    const sessionName = String(request.args.t || '')
    const windowName = String(request.args.n || '')
    const session = this.sessions.get(sessionName)

    if (!session) {
      return this.error(request.id, 'session not found: ' + sessionName)
    }

    const paneId = this.allocatePaneId()
    const pane: PaneState = {
      paneId,
      sessionName,
      windowName,
      pid: 0,
      cols: 80,
      rows: 24,
      isActive: false,
      outputBuffer: []
    }

    session.panes.set(paneId, pane)
    session.windowCount++
    this.emit('pane-created', paneId, sessionName, windowName)

    return this.ok(request.id, paneId + '\n')
  }

  private handleSplitWindow(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    // Find session by name or by pane target
    const session = this.sessions.get(target) || this.findSessionByPane(target)

    if (!session) {
      return this.error(request.id, 'session not found: ' + target)
    }

    const paneId = this.allocatePaneId()
    const pane: PaneState = {
      paneId,
      sessionName: session.name,
      windowName: '',
      pid: 0,
      cols: 80,
      rows: 24,
      isActive: false,
      outputBuffer: []
    }

    session.panes.set(paneId, pane)
    this.emit('pane-created', paneId, session.name, '')

    return this.ok(request.id, paneId + '\n')
  }

  private handleSendKeys(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    const pane = this.findPane(target)

    if (!pane) {
      return this.error(request.id, 'pane not found: ' + target)
    }

    const keys = request.rawArgs.filter((k) => k !== 'Enter')
    const command = keys.join(' ')
    const hasEnter = request.rawArgs.includes('Enter')

    this.emit('send-keys', pane.paneId, pane.sessionName, command, hasEnter)

    return this.ok(request.id)
  }

  private handleListPanes(request: TmuxRequest): TmuxResponse {
    const sessionName = String(request.args.t || '')
    const format = String(request.args.F || '#{pane_id}')
    const session = this.sessions.get(sessionName)

    if (!session) {
      return this.error(request.id, 'session not found: ' + sessionName)
    }

    const lines: string[] = []
    let index = 0
    for (const pane of session.panes.values()) {
      const vars: TmuxVars = {
        pane_id: pane.paneId,
        pane_pid: String(pane.pid),
        pane_tty: '',
        pane_width: String(pane.cols),
        pane_height: String(pane.rows),
        pane_index: String(index),
        pane_active: pane.isActive ? '1' : '0',
        pane_title: pane.windowName,
        window_id: `@${index}`,
        window_index: String(index),
        window_name: pane.windowName,
        window_active: pane.isActive ? '1' : '0',
        session_id: '$0',
        session_name: pane.sessionName,
        session_windows: String(session.windowCount),
        session_attached: '1'
      }
      lines.push(formatTmuxString(format, vars))
      index++
    }

    return this.ok(request.id, lines.join('\n') + '\n')
  }

  private handleListSessions(request: TmuxRequest): TmuxResponse {
    if (this.sessions.size === 0) {
      return this.ok(request.id)
    }

    const lines: string[] = []
    for (const session of this.sessions.values()) {
      lines.push(`${session.name}: ${session.windowCount} windows (attached)`)
    }

    return this.ok(request.id, lines.join('\n') + '\n')
  }

  private handleCapturePane(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    const pane = this.findPane(target)

    if (!pane) {
      return this.error(request.id, 'pane not found: ' + target)
    }

    const output = pane.outputBuffer.join('\n')
    this.emit('capture-pane', pane.paneId, pane.sessionName)

    return this.ok(request.id, output ? output + '\n' : '')
  }

  private handleDisplayMessage(request: TmuxRequest): TmuxResponse {
    // Extract format string from rawArgs (last non-flag argument)
    const rawArgs = request.rawArgs
    let format = ''
    for (let i = rawArgs.length - 1; i >= 0; i--) {
      if (!rawArgs[i].startsWith('-') && rawArgs[i] !== 'display-message') {
        // Skip values that are flag arguments
        if (i > 0 && rawArgs[i - 1].startsWith('-') && rawArgs[i - 1] !== '-p') {
          continue
        }
        format = rawArgs[i]
        break
      }
    }

    const sessionName = String(request.args.t || '')
    const session = this.sessions.get(sessionName)
    const firstPane = session ? session.panes.values().next().value : null

    const vars: TmuxVars = {
      pane_id: firstPane?.paneId ?? '%0',
      pane_pid: String(firstPane?.pid ?? process.pid),
      pane_tty: '',
      pane_width: String(firstPane?.cols ?? 80),
      pane_height: String(firstPane?.rows ?? 24),
      pane_index: '0',
      pane_active: '1',
      pane_title: firstPane?.windowName ?? '',
      window_id: '@0',
      window_index: '0',
      window_name: firstPane?.windowName ?? '',
      window_active: '1',
      session_id: '$0',
      session_name: sessionName || 'default',
      session_windows: String(session?.windowCount ?? 0),
      session_attached: '1'
    }

    const result = formatTmuxString(format, vars)
    return this.ok(request.id, result + '\n')
  }

  private handleKillSession(request: TmuxRequest): TmuxResponse {
    const name = String(request.args.t || '')
    const session = this.sessions.get(name)

    if (!session) {
      return this.error(request.id, 'session not found: ' + name)
    }

    const paneIds = [...session.panes.keys()]
    this.sessions.delete(name)
    this.emit('session-killed', name, paneIds)

    return this.ok(request.id)
  }

  private handleKillPane(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    const pane = this.findPane(target)

    if (!pane) {
      return this.error(request.id, 'pane not found: ' + target)
    }

    const session = this.sessions.get(pane.sessionName)
    if (session) {
      session.panes.delete(pane.paneId)
    }

    this.emit('pane-killed', pane.paneId, pane.sessionName)

    return this.ok(request.id)
  }

  private handleSelectPane(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    const pane = this.findPane(target)

    if (!pane) {
      return this.error(request.id, 'pane not found: ' + target)
    }

    this.emit('pane-selected', pane.paneId, pane.sessionName)

    return this.ok(request.id)
  }

  private handleResizePane(request: TmuxRequest): TmuxResponse {
    const target = String(request.args.t || '')
    const pane = this.findPane(target)

    if (!pane) {
      return this.error(request.id, 'pane not found: ' + target)
    }

    if (request.args.x) {
      pane.cols = parseInt(String(request.args.x), 10)
    }
    if (request.args.y) {
      pane.rows = parseInt(String(request.args.y), 10)
    }

    this.emit('pane-resized', pane.paneId, pane.cols, pane.rows)

    return this.ok(request.id)
  }

  private findPane(target: string): PaneState | null {
    for (const session of this.sessions.values()) {
      const pane = session.panes.get(target)
      if (pane) return pane
    }
    return null
  }

  private findSessionByPane(paneId: string): SessionState | null {
    for (const session of this.sessions.values()) {
      if (session.panes.has(paneId)) return session
    }
    return null
  }

  private allocatePaneId(): string {
    return `%${this.paneIndex++}`
  }

  private ok(id: string, stdout = ''): TmuxResponse {
    return { id, exitCode: 0, stdout, stderr: '' }
  }

  private error(id: string, message: string): TmuxResponse {
    return { id, exitCode: 1, stdout: '', stderr: message + '\n' }
  }

  getSession(name: string): SessionState | undefined {
    return this.sessions.get(name)
  }

  getPane(paneId: string): PaneState | null {
    return this.findPane(paneId)
  }
}
