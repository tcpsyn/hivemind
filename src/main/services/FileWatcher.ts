import { EventEmitter } from 'events'
import { watch } from 'chokidar'
import type { FSWatcher } from 'chokidar'
import type { FileChangeEvent } from '../../shared/types'

const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.claude/,
  /dist/,
  /out/
]
const DEBOUNCE_MS = 100

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingEvents = new Map<string, FileChangeEvent>()

  start(rootPath: string): void {
    if (this.watcher) {
      throw new Error('FileWatcher is already watching. Call stop() first.')
    }

    this.watcher = watch(rootPath, {
      ignoreInitial: true,
      ignored: IGNORED_PATTERNS,
      persistent: true,
      depth: 5,
      usePolling: false
    })

    // Swallow EMFILE errors instead of letting them become unhandled rejections
    this.watcher.on('error', (err: Error) => {
      if ((err as NodeJS.ErrnoException).code === 'EMFILE') return
      console.error('[FileWatcher] error:', err.message)
    })

    const eventTypes: FileChangeEvent['type'][] = ['add', 'change', 'unlink', 'addDir', 'unlinkDir']
    for (const type of eventTypes) {
      this.watcher.on(type, (filePath: string) => {
        this.handleEvent({ type, path: filePath })
      })
    }
  }

  async stop(): Promise<void> {
    if (!this.watcher) return

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.pendingEvents.clear()

    await this.watcher.close()
    this.watcher = null
  }

  isWatching(): boolean {
    return this.watcher !== null
  }

  private handleEvent(event: FileChangeEvent): void {
    const { path: filePath } = event

    // Store the latest event for this path
    this.pendingEvents.set(filePath, event)

    // Clear existing timer for this path
    const existing = this.debounceTimers.get(filePath)
    if (existing) {
      clearTimeout(existing)
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      const pending = this.pendingEvents.get(filePath)
      if (pending) {
        this.emit('file-changed', pending)
        this.pendingEvents.delete(filePath)
      }
      this.debounceTimers.delete(filePath)
    }, DEBOUNCE_MS)

    this.debounceTimers.set(filePath, timer)
  }
}
