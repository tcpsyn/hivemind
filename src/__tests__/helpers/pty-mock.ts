import { vi } from 'vitest'
import { EventEmitter } from 'events'

export interface MockPty extends EventEmitter {
  pid: number
  cols: number
  rows: number
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
}

export function createMockPty(pid = 1234): MockPty {
  const emitter = new EventEmitter() as MockPty

  emitter.pid = pid
  emitter.cols = 80
  emitter.rows = 24
  emitter.write = vi.fn()
  emitter.resize = vi.fn()
  emitter.kill = vi.fn()

  const dataListeners: ((data: string) => void)[] = []
  const exitListeners: ((exitCode: number, signal: number) => void)[] = []

  emitter.onData = vi.fn((callback: (data: string) => void) => {
    dataListeners.push(callback)
    return { dispose: () => dataListeners.splice(dataListeners.indexOf(callback), 1) }
  })

  emitter.onExit = vi.fn((callback: (exitCode: number, signal: number) => void) => {
    exitListeners.push(callback)
    return { dispose: () => exitListeners.splice(exitListeners.indexOf(callback), 1) }
  })

  // Helper to simulate output
  emitter.emit = ((event: string, ...args: unknown[]) => {
    if (event === 'data') {
      dataListeners.forEach((cb) => cb(args[0] as string))
    }
    if (event === 'exit') {
      exitListeners.forEach((cb) => cb(args[0] as number, args[1] as number))
    }
    return EventEmitter.prototype.emit.call(emitter, event, ...args)
  }) as typeof emitter.emit

  return emitter
}
