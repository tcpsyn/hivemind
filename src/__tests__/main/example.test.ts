import { describe, it, expect, vi } from 'vitest'
import { createMockIpcMain, createMockPty } from '../helpers'

describe('Main process test environment', () => {
  it('runs in node environment', () => {
    expect(typeof process.versions.node).toBe('string')
  })

  it('can create IPC mocks', () => {
    const ipc = createMockIpcMain()
    ipc.handle('test-channel', vi.fn())
    expect(ipc.handle).toHaveBeenCalledWith('test-channel', expect.any(Function))
  })

  it('can create PTY mocks', () => {
    const pty = createMockPty(5678)
    expect(pty.pid).toBe(5678)
    expect(pty.cols).toBe(80)
    expect(pty.rows).toBe(24)

    pty.write('hello')
    expect(pty.write).toHaveBeenCalledWith('hello')

    pty.resize(120, 40)
    expect(pty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('PTY mock emits data events', () => {
    const pty = createMockPty()
    const handler = vi.fn()
    pty.onData(handler)

    pty.emit('data', 'test output')
    expect(handler).toHaveBeenCalledWith('test output')
  })

  it('PTY mock emits exit events', () => {
    const pty = createMockPty()
    const handler = vi.fn()
    pty.onExit(handler)

    pty.emit('exit', 0, 0)
    expect(handler).toHaveBeenCalledWith(0, 0)
  })
})
