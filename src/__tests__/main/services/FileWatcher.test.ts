import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { FileWatcher } from '../../../main/services/FileWatcher'

// Create a mock watcher instance that we can control
class MockWatcher extends EventEmitter {
  close = vi.fn().mockResolvedValue(undefined)
}

let mockWatcherInstance: MockWatcher

vi.mock('chokidar', () => ({
  watch: vi.fn(() => {
    mockWatcherInstance = new MockWatcher()
    return mockWatcherInstance
  })
}))

// Mock fs for getFileTree (FileWatcher delegates to FileService internally, but we test the watcher behavior)
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises')
  return { ...actual }
})

describe('FileWatcher', () => {
  let watcher: FileWatcher

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    watcher = new FileWatcher()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await watcher.stop()
  })

  describe('start', () => {
    it('initializes chokidar with the given root path', async () => {
      const chokidar = await import('chokidar')
      watcher.start('/tmp/project')

      expect(chokidar.watch).toHaveBeenCalledWith(
        '/tmp/project',
        expect.objectContaining({
          ignoreInitial: true,
          ignored: expect.any(Array)
        })
      )
    })

    it('ignores node_modules, .git, dist, out directories', async () => {
      const chokidar = await import('chokidar')
      watcher.start('/tmp/project')

      const callArgs = vi.mocked(chokidar.watch).mock.calls[0][1]
      const ignored = callArgs?.ignored as string[]
      expect(ignored).toContain('**/node_modules/**')
      expect(ignored).toContain('**/.git/**')
      expect(ignored).toContain('**/dist/**')
      expect(ignored).toContain('**/out/**')
    })

    it('throws if already watching', () => {
      watcher.start('/tmp/project')
      expect(() => watcher.start('/tmp/other')).toThrow()
    })
  })

  describe('stop', () => {
    it('closes the chokidar watcher', async () => {
      watcher.start('/tmp/project')
      await watcher.stop()
      expect(mockWatcherInstance.close).toHaveBeenCalled()
    })

    it('does not throw if not started', async () => {
      await expect(watcher.stop()).resolves.not.toThrow()
    })

    it('allows restarting after stop', async () => {
      watcher.start('/tmp/project')
      await watcher.stop()
      expect(() => watcher.start('/tmp/other')).not.toThrow()
    })
  })

  describe('file change events', () => {
    it('emits file-changed on add', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('add', '/tmp/project/new-file.ts')
      vi.advanceTimersByTime(150)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'add',
          path: '/tmp/project/new-file.ts'
        })
      )
    })

    it('emits file-changed on change', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('change', '/tmp/project/file.ts')
      vi.advanceTimersByTime(150)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change',
          path: '/tmp/project/file.ts'
        })
      )
    })

    it('emits file-changed on unlink', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('unlink', '/tmp/project/deleted.ts')
      vi.advanceTimersByTime(150)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unlink',
          path: '/tmp/project/deleted.ts'
        })
      )
    })

    it('emits file-changed on addDir', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('addDir', '/tmp/project/new-dir')
      vi.advanceTimersByTime(150)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'addDir',
          path: '/tmp/project/new-dir'
        })
      )
    })

    it('emits file-changed on unlinkDir', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('unlinkDir', '/tmp/project/removed-dir')
      vi.advanceTimersByTime(150)

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unlinkDir',
          path: '/tmp/project/removed-dir'
        })
      )
    })
  })

  describe('debouncing', () => {
    it('debounces rapid changes to the same file', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      // Rapid-fire changes to same file
      mockWatcherInstance.emit('change', '/tmp/project/file.ts')
      mockWatcherInstance.emit('change', '/tmp/project/file.ts')
      mockWatcherInstance.emit('change', '/tmp/project/file.ts')

      // Before debounce timeout
      vi.advanceTimersByTime(50)
      expect(handler).not.toHaveBeenCalled()

      // After debounce timeout
      vi.advanceTimersByTime(100)
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('does not debounce changes to different files', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('change', '/tmp/project/a.ts')
      mockWatcherInstance.emit('change', '/tmp/project/b.ts')

      vi.advanceTimersByTime(150)
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('uses latest event type after debounce', () => {
      const handler = vi.fn()
      watcher.on('file-changed', handler)
      watcher.start('/tmp/project')

      mockWatcherInstance.emit('add', '/tmp/project/file.ts')
      mockWatcherInstance.emit('change', '/tmp/project/file.ts')

      vi.advanceTimersByTime(150)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'change' })
      )
    })
  })

  describe('isWatching', () => {
    it('returns false before start', () => {
      expect(watcher.isWatching()).toBe(false)
    })

    it('returns true after start', () => {
      watcher.start('/tmp/project')
      expect(watcher.isWatching()).toBe(true)
    })

    it('returns false after stop', async () => {
      watcher.start('/tmp/project')
      await watcher.stop()
      expect(watcher.isWatching()).toBe(false)
    })
  })
})
