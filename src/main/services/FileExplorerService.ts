import type { BrowserWindow } from 'electron'
import type { FileTreeNode, GitFileStatus } from '../../shared/types'
import { FileService } from './FileService'
import { FileWatcher } from './FileWatcher'
import { GitService } from './GitService'
import { sendFileChanged, sendFileTreeUpdate, sendGitStatusUpdate } from '../ipc/handlers'
import type { FileChangedPayload } from '../../shared/ipc-channels'

const LARGE_FILE_THRESHOLD = 1_000_000 // 1MB
const SELF_WRITE_IGNORE_MS = 500

export class FileExplorerService {
  private fileService: FileService
  private fileWatcher: FileWatcher
  private gitService: GitService | null = null
  private window: BrowserWindow | null = null
  private rootPath: string = ''
  private recentWrites = new Map<string, number>()

  constructor() {
    this.fileService = new FileService()
    this.fileWatcher = new FileWatcher()
  }

  async start(rootPath: string, window: BrowserWindow): Promise<void> {
    this.rootPath = rootPath
    this.window = window
    this.gitService = new GitService(rootPath)

    this.fileWatcher.on('file-changed', (event) => {
      this.handleFileChange(event)
    })

    this.fileWatcher.start(rootPath)
  }

  async stop(): Promise<void> {
    await this.fileWatcher.stop()
    this.window = null
    this.gitService = null
    this.recentWrites.clear()
  }

  async getFileTree(): Promise<FileTreeNode[]> {
    const tree = await this.fileService.getFileTree(this.rootPath)
    return this.mergeGitStatus(tree)
  }

  async readFile(filePath: string): Promise<{ content: string; size: number }> {
    const content = await this.fileService.readFile(filePath)
    return { content, size: Buffer.byteLength(content, 'utf-8') }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.recentWrites.set(filePath, Date.now())
    await this.fileService.writeFile(filePath, content)
  }

  isLargeFile(size: number): boolean {
    return size >= LARGE_FILE_THRESHOLD
  }

  getFileSizeThreshold(): number {
    return LARGE_FILE_THRESHOLD
  }

  private async handleFileChange(event: FileChangedPayload['event']): Promise<void> {
    if (!this.window) return

    // Filter self-triggered events
    const writeTime = this.recentWrites.get(event.path)
    if (writeTime && Date.now() - writeTime < SELF_WRITE_IGNORE_MS) {
      this.recentWrites.delete(event.path)
      return
    }

    sendFileChanged(this.window, { event })

    // Refresh tree and push to renderer
    try {
      const tree = await this.getFileTree()
      sendFileTreeUpdate(this.window, { tree })
    } catch {
      // tree refresh failure is non-fatal
    }

    // Refresh git status and push
    try {
      if (this.gitService) {
        const status = await this.gitService.getStatus()
        sendGitStatusUpdate(this.window, { status })
      }
    } catch {
      // git status failure is non-fatal
    }
  }

  private async mergeGitStatus(tree: FileTreeNode[]): Promise<FileTreeNode[]> {
    if (!this.gitService) return tree

    try {
      const status = await this.gitService.getStatus()
      const statusMap = new Map<string, GitFileStatus>()
      for (const file of status.files) {
        statusMap.set(file.path, file.status)
      }
      return this.applyGitStatus(tree, statusMap)
    } catch {
      return tree
    }
  }

  private applyGitStatus(
    nodes: FileTreeNode[],
    statusMap: Map<string, GitFileStatus>
  ): FileTreeNode[] {
    return nodes.map((node) => {
      const gitStatus = statusMap.get(node.path) ?? null
      const children = node.children ? this.applyGitStatus(node.children, statusMap) : undefined
      return { ...node, gitStatus: gitStatus ?? node.gitStatus, children }
    })
  }
}
