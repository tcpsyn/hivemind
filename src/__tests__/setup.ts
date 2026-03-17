import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver
}

// Polyfill queryCommandSupported for Monaco in jsdom
if (typeof document.queryCommandSupported === 'undefined') {
  document.queryCommandSupported = () => false
}

// Mock monaco-editor globally for jsdom tests
vi.mock('monaco-editor', () => {
  const mockEditor = {
    setValue: vi.fn(),
    getValue: vi.fn(() => ''),
    dispose: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    updateOptions: vi.fn(),
    setModel: vi.fn(),
    getModel: vi.fn(() => null),
    layout: vi.fn()
  }

  return {
    editor: {
      create: vi.fn(() => mockEditor),
      createDiffEditor: vi.fn(() => ({
        ...mockEditor,
        setModel: vi.fn()
      })),
      createModel: vi.fn(() => ({})),
      setTheme: vi.fn()
    },
    Uri: {
      parse: vi.fn()
    },
    languages: {
      register: vi.fn(),
      setMonarchTokensProvider: vi.fn()
    }
  }
})
