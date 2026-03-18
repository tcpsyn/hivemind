import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { FileExplorerService } from '../../../main/services/FileExplorerService'

// Mock FileService as a class
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

// Mock FileWatcher as a class extending EventEmitter
vi.mock('../../../main/services/FileWatcher', () => ({
  FileWatcher: class extends EventEmitter {
    start = vi.fn()
    stop = vi.fn().mockResolvedValue(undefined)
    isWatching = vi.fn().mockReturnValue(false)
  }
}))

// Mock GitService as a class
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

vi.mock('../../../main/ipc/handlers', () => ({
  sendFileChanged: vi.fn(),
  sendFileTreeUpdate: vi.fn(),
  sendGitStatusUpdate: vi.fn()
}))

const mockWindow = {
  isDestroyed: vi.fn().mockReturnValue(false),
  webContents: { send: vi.fn() }
} as unknown as Electron.BrowserWindow

describe('FileExplorerService', () => {
  let service: FileExplorerService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new FileExplorerService()
  })

  it('starts file watcher and git service', async () => {
    await service.start('/project', mockWindow)
    await service.stop()
  })

  it('getFileTree merges git status into tree nodes', async () => {
    await service.start('/project', mockWindow)
    const tree = await service.getFileTree()

    const indexFile = tree.find((n) => n.name === 'index.ts')
    expect(indexFile?.gitStatus).toBe('modified')

    await service.stop()
  })

  it('readFile returns content and size', async () => {
    await service.start('/project', mockWindow)
    const result = await service.readFile('/project/index.ts')
    expect(result.content).toBe('file content')
    expect(result.size).toBeGreaterThan(0)
    await service.stop()
  })

  it('writeFile tracks path for self-event filtering', async () => {
    await service.start('/project', mockWindow)
    await service.writeFile('/project/test.ts', 'new content')
    await service.stop()
  })

  it('isLargeFile returns true for files >= 1MB', () => {
    expect(service.isLargeFile(999_999)).toBe(false)
    expect(service.isLargeFile(1_000_000)).toBe(true)
    expect(service.isLargeFile(5_000_000)).toBe(true)
  })

  it('getFileSizeThreshold returns 1MB', () => {
    expect(service.getFileSizeThreshold()).toBe(1_000_000)
  })

  it('stop cleans up watcher', async () => {
    await service.start('/project', mockWindow)
    await service.stop()
  })
})
