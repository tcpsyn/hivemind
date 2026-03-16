import { vi } from 'vitest'

export interface MockIpcRenderer {
  send: ReturnType<typeof vi.fn>
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
}

export interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeHandler: ReturnType<typeof vi.fn>
}

export function createMockIpcRenderer(): MockIpcRenderer {
  return {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  }
}

export function createMockIpcMain(): MockIpcMain {
  return {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  }
}

export function createMockWindowApi(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...overrides
  }
}
