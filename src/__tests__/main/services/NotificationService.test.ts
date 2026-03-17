import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// --- Electron mocks (hoisted so vi.mock factory can reference them) ---

const { MockNotification, mockDock, mockBrowserWindow, mockGetAllWindows } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('events') as typeof import('events')

  class MockNotification extends EE {
    static isSupported = vi.fn(() => true)
    title: string
    body: string
    silent: boolean
    show = vi.fn()
    close = vi.fn()

    constructor(opts: { title: string; body: string; silent?: boolean }) {
      super()
      this.title = opts.title
      this.body = opts.body
      this.silent = opts.silent ?? false
    }
  }

  const mockDock = {
    setBadge: vi.fn(),
    bounce: vi.fn(() => 0)
  }

  const mockBrowserWindow = {
    show: vi.fn(),
    focus: vi.fn(),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    webContents: {
      send: vi.fn()
    }
  }

  const mockGetAllWindows = vi.fn(() => [mockBrowserWindow])

  return { MockNotification, mockDock, mockBrowserWindow, mockGetAllWindows }
})

vi.mock('electron', () => ({
  Notification: MockNotification,
  app: {
    dock: mockDock
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows
  }
}))

// --- Import service after mocks ---
import { NotificationService } from '../../../main/services/NotificationService'
import type { PtyManager } from '../../../main/pty/PtyManager'
import type { AgentState } from '../../../shared/types'

function createMockPtyManager(): PtyManager {
  const emitter = new EventEmitter()
  const agents = new Map<string, AgentState>()
  ;(emitter as unknown as { getAll: () => Map<string, AgentState> }).getAll = () => agents
  return emitter as unknown as PtyManager
}

function createAgentState(id: string, name: string): AgentState {
  return {
    id,
    name,
    role: 'tester',
    avatar: '',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now()
  }
}

describe('NotificationService', () => {
  let service: NotificationService
  let ptyManager: PtyManager & EventEmitter
  let agents: Map<string, AgentState>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    ptyManager = createMockPtyManager() as PtyManager & EventEmitter
    agents = (ptyManager as unknown as { getAll: () => Map<string, AgentState> }).getAll()
    agents.set('agent-1', createAgentState('agent-1', 'researcher'))
    agents.set('agent-2', createAgentState('agent-2', 'coder'))

    service = new NotificationService(ptyManager)
  })

  afterEach(() => {
    service.dispose()
    vi.useRealTimers()
  })

  describe('notification creation', () => {
    it('creates a notification when input-needed is emitted', () => {
      ptyManager.emit('input-needed', 'agent-1')

      const notifications = service.getActiveNotifications()
      expect(notifications.length).toBe(1)
      expect(notifications[0]._native.show).toHaveBeenCalledTimes(1)
    })

    it('includes agent name in the notification title', () => {
      ptyManager.emit('input-needed', 'agent-1')

      const notifications = service.getActiveNotifications()
      expect(notifications[0].agentName).toBe('researcher')
    })

    it('does not create a notification for unknown agents', () => {
      ptyManager.emit('input-needed', 'unknown-agent')

      expect(service.getActiveNotifications().length).toBe(0)
    })
  })

  describe('grouping by agent', () => {
    it('tracks notifications per agent', () => {
      ptyManager.emit('input-needed', 'agent-1')
      vi.advanceTimersByTime(11_000)
      ptyManager.emit('input-needed', 'agent-2')

      const notifications = service.getActiveNotifications()
      const agentIds = notifications.map((n) => n.agentId)
      expect(agentIds).toContain('agent-1')
      expect(agentIds).toContain('agent-2')
    })
  })

  describe('clearing notifications', () => {
    it('clearAll removes all notifications', () => {
      ptyManager.emit('input-needed', 'agent-1')
      vi.advanceTimersByTime(11_000)
      ptyManager.emit('input-needed', 'agent-2')

      service.clearAll()
      expect(service.getActiveNotifications().length).toBe(0)
    })
  })

  describe('debouncing', () => {
    it('does not create duplicate notifications for the same agent within 10s', () => {
      ptyManager.emit('input-needed', 'agent-1')
      ptyManager.emit('input-needed', 'agent-1')
      ptyManager.emit('input-needed', 'agent-1')

      expect(service.getActiveNotifications().length).toBe(1)
    })

    it('allows a new notification after 10s debounce expires', () => {
      ptyManager.emit('input-needed', 'agent-1')
      expect(service.getActiveNotifications().length).toBe(1)

      vi.advanceTimersByTime(11_000)

      ptyManager.emit('input-needed', 'agent-1')
      expect(service.getActiveNotifications().length).toBe(2)
    })

    it('debounces per agent independently', () => {
      ptyManager.emit('input-needed', 'agent-1')
      ptyManager.emit('input-needed', 'agent-2')

      expect(service.getActiveNotifications().length).toBe(2)
    })
  })

  describe('dock badge', () => {
    it('sets dock badge count when notification is created', () => {
      ptyManager.emit('input-needed', 'agent-1')
      expect(mockDock.setBadge).toHaveBeenCalledWith('1')
    })

    it('updates badge count as notifications accumulate', () => {
      ptyManager.emit('input-needed', 'agent-1')
      vi.advanceTimersByTime(11_000)
      ptyManager.emit('input-needed', 'agent-2')

      expect(mockDock.setBadge).toHaveBeenLastCalledWith('2')
    })

    it('clears badge when all notifications are cleared', () => {
      ptyManager.emit('input-needed', 'agent-1')
      service.clearAll()

      expect(mockDock.setBadge).toHaveBeenLastCalledWith('')
    })

  })

  describe('click handler — focus window', () => {
    it('focuses the app window when notification is clicked', () => {
      ptyManager.emit('input-needed', 'agent-1')

      const notifications = service.getActiveNotifications()
      const nativeNotification = notifications[0]._native as unknown as InstanceType<
        typeof MockNotification
      >
      nativeNotification.emit('click')

      expect(mockBrowserWindow.show).toHaveBeenCalled()
      expect(mockBrowserWindow.focus).toHaveBeenCalled()
    })

    it('restores window if minimized before focusing', () => {
      mockBrowserWindow.isMinimized.mockReturnValue(true)

      ptyManager.emit('input-needed', 'agent-1')
      const notifications = service.getActiveNotifications()
      const nativeNotification = notifications[0]._native as unknown as InstanceType<
        typeof MockNotification
      >
      nativeNotification.emit('click')

      expect(mockBrowserWindow.restore).toHaveBeenCalled()
      expect(mockBrowserWindow.focus).toHaveBeenCalled()
    })

    it('sends focus-agent IPC to renderer on click', () => {
      ptyManager.emit('input-needed', 'agent-1')
      const notifications = service.getActiveNotifications()
      const nativeNotification = notifications[0]._native as unknown as InstanceType<
        typeof MockNotification
      >
      nativeNotification.emit('click')

      expect(mockBrowserWindow.webContents.send).toHaveBeenCalledWith(
        'notification:focus-agent',
        'agent-1'
      )
    })
  })

  describe('dispose', () => {
    it('removes all listeners from ptyManager', () => {
      const listenerCount = ptyManager.listenerCount('input-needed')
      expect(listenerCount).toBeGreaterThan(0)

      service.dispose()
      expect(ptyManager.listenerCount('input-needed')).toBe(0)
    })

    it('clears all notifications on dispose', () => {
      ptyManager.emit('input-needed', 'agent-1')
      service.dispose()
      expect(service.getActiveNotifications().length).toBe(0)
    })
  })
})
