import { Notification, app, BrowserWindow } from 'electron'
import type { PtyManager } from '../pty/PtyManager'

const DEBOUNCE_MS = 10_000

export interface TrackedNotification {
  id: string
  agentId: string
  agentName: string
  timestamp: number
  _native: Notification
}

export class NotificationService {
  private notifications: TrackedNotification[] = []
  private lastNotificationTime = new Map<string, number>()
  private handleInputNeeded: (agentId: string) => void

  constructor(private ptyManager: PtyManager) {
    this.handleInputNeeded = (agentId: string) => this.onInputNeeded(agentId)
    this.ptyManager.on('input-needed', this.handleInputNeeded)
  }

  private onInputNeeded(agentId: string): void {
    const agents = this.ptyManager.getAll()
    const agent = agents.get(agentId)
    if (!agent) return

    // Debounce: skip if last notification for this agent was < 10s ago
    const lastTime = this.lastNotificationTime.get(agentId)
    const now = Date.now()
    if (lastTime !== undefined && now - lastTime < DEBOUNCE_MS) {
      return
    }
    this.lastNotificationTime.set(agentId, now)

    const native = new Notification({
      title: `${agent.name} needs input`,
      body: `Agent "${agent.name}" is waiting for your response.`
    })

    native.on('click', () => this.focusWindowAndAgent(agentId))
    native.show()

    const tracked: TrackedNotification = {
      id: `notif-${agentId}-${now}`,
      agentId,
      agentName: agent.name,
      timestamp: now,
      _native: native
    }

    this.notifications.push(tracked)
    this.updateDockBadge()
  }

  private focusWindowAndAgent(agentId: string): void {
    const windows = BrowserWindow.getAllWindows()
    const win = windows[0]
    if (!win) return

    if (win.isMinimized()) {
      win.restore()
    }
    win.show()
    win.focus()
    win.webContents.send('notification:focus-agent', agentId)
  }

  private updateDockBadge(): void {
    const count = this.notifications.length
    app.dock.setBadge(count > 0 ? String(count) : '')
  }

  getActiveNotifications(): TrackedNotification[] {
    return [...this.notifications]
  }

  getNotificationsByAgent(): Map<string, TrackedNotification[]> {
    const grouped = new Map<string, TrackedNotification[]>()
    for (const notif of this.notifications) {
      const list = grouped.get(notif.agentId) ?? []
      list.push(notif)
      grouped.set(notif.agentId, list)
    }
    return grouped
  }

  clearForAgent(agentId: string): void {
    this.notifications = this.notifications.filter((n) => n.agentId !== agentId)
    this.lastNotificationTime.delete(agentId)
    this.updateDockBadge()
  }

  clearAll(): void {
    this.notifications = []
    this.lastNotificationTime.clear()
    this.updateDockBadge()
  }

  dispose(): void {
    this.ptyManager.removeListener('input-needed', this.handleInputNeeded)
    this.clearAll()
  }
}
