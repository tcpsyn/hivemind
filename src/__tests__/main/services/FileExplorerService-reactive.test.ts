import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { FileExplorerService } from '../../../main/services/FileExplorerService'

// Track mock instances for assertions
let mockFileWatcherInstance: EventEmitter & {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

vi.mock('../../../main/services/FileService', () => ({
  FileService: class {
    readFile = vi.fn().mockResolvedValue('file content')
    writeFile = vi.fn().mockResolvedValue(undefined)
    getFileTree = vi.fn().mockResolvedValue([
      { name: 'src', path: '/project/src', type: 'directory', children: [] },
      { name: 'index.ts', path: '/project/index.ts', type: 'file' }
    ])
  }
}))

vi.mock('../../../main/services/FileWatcher', () => ({
  FileWatcher: class extends EventEmitter {
    start = vi.fn()
    stop = vi.fn().mockResolvedValue(undefined)
    constructor() {
      super()
      mockFileWatcherInstance = this as any
    }
  }
}))

vi.mock('../../../main/services/GitService', () => ({
  GitService: class {
    getStatus = vi.fn().mockResolvedValue({
      branch: 'main',
      ahead: 0,
      behind: 0,
      files: [{ path: '/project/index.ts', status: 'modified' }]
    })
    getDiff = vi.fn().mockResolvedValue('diff content')
  }
}))

const mockSendFileChanged = vi.fn()
const mockSendFileTreeUpdate = vi.fn()
const mockSendGitStatusUpdate = vi.fn()

vi.mock('../../../main/ipc/handlers', () => ({
  sendFileChanged: (...args: unknown[]) => mockSendFileChanged(...args),
  sendFileTreeUpdate: (...args: unknown[]) => mockSendFileTreeUpdate(...args),
  sendGitStatusUpdate: (...args: unknown[]) => mockSendGitStatusUpdate(...args)
}))

const mockWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: { send: vi.fn() }
} as unknown as Electron.BrowserWindow

describe('FileExplorerService — reactive pipeline', () => {
  let service: FileExplorerService

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    service = new FileExplorerService()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await service.stop()
  })

  describe('handleFileChange', () => {
    it('sends file changed event to renderer on file watcher event', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/index.ts' })

      expect(mockSendFileChanged).toHaveBeenCalledWith(mockWindow, {
        tabId: 'tab-1',
        event: { type: 'change', path: '/project/index.ts' }
      })
    })

    it('filters self-triggered file changes within 500ms of writeFile', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      await service.writeFile('/project/test.ts', 'new content')

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/test.ts' })

      expect(mockSendFileChanged).not.toHaveBeenCalled()
    })

    it('does not filter events after self-write window expires', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      await service.writeFile('/project/test.ts', 'new content')

      // Advance past 500ms self-write ignore window
      vi.advanceTimersByTime(600)

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/test.ts' })

      expect(mockSendFileChanged).toHaveBeenCalled()
    })

    it('does not send events after stop()', async () => {
      await service.start('/project', mockWindow, 'tab-1')
      await service.stop()

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/index.ts' })

      expect(mockSendFileChanged).not.toHaveBeenCalled()
    })
  })

  describe('debounced tree refresh', () => {
    it('refreshes tree and git status after 500ms debounce', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/index.ts' })

      // Tree update not sent yet (debounced)
      expect(mockSendFileTreeUpdate).not.toHaveBeenCalled()
      expect(mockSendGitStatusUpdate).not.toHaveBeenCalled()

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(600)

      expect(mockSendFileTreeUpdate).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({ tabId: 'tab-1', tree: expect.any(Array) })
      )
      expect(mockSendGitStatusUpdate).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({ tabId: 'tab-1' })
      )
    })

    it('coalesces rapid file changes into a single refresh', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/a.ts' })
      vi.advanceTimersByTime(200)
      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/b.ts' })
      vi.advanceTimersByTime(200)
      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/c.ts' })

      // Advance past debounce from last event
      await vi.advanceTimersByTimeAsync(600)

      // Only one tree update despite three file changes
      expect(mockSendFileTreeUpdate).toHaveBeenCalledTimes(1)
      expect(mockSendGitStatusUpdate).toHaveBeenCalledTimes(1)
    })
  })

  describe('mergeGitStatus', () => {
    it('merges git status into file tree nodes', async () => {
      await service.start('/project', mockWindow, 'tab-1')
      const tree = await service.getFileTree()

      const indexFile = tree.find((n) => n.name === 'index.ts')
      expect(indexFile?.gitStatus).toBe('modified')
    })

    it('preserves tree structure when git status unavailable', async () => {
      // Create service without git (before start — gitService is null)
      const tree = await service.getFileTree()
      expect(tree).toBeDefined()
      expect(tree.length).toBeGreaterThan(0)
    })
  })

  describe('stop cleanup', () => {
    it('clears pending refresh timer on stop', async () => {
      await service.start('/project', mockWindow, 'tab-1')

      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/a.ts' })

      // Stop before debounce fires
      await service.stop()

      await vi.advanceTimersByTimeAsync(600)

      // No tree update after stop
      expect(mockSendFileTreeUpdate).not.toHaveBeenCalled()
    })

    it('clears recent writes map on stop', async () => {
      await service.start('/project', mockWindow, 'tab-1')
      await service.writeFile('/project/test.ts', 'content')
      await service.stop()

      // Restart and check that old writes don't interfere
      await service.start('/project', mockWindow, 'tab-2')
      mockFileWatcherInstance.emit('file-changed', { type: 'change', path: '/project/test.ts' })
      expect(mockSendFileChanged).toHaveBeenCalled()
    })
  })
})
