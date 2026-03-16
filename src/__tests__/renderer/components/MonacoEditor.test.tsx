import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MonacoEditor from '../../../renderer/src/components/MonacoEditor'

const { mockDispose, mockUpdateOptions, mockCreate, mockSetTheme } = vi.hoisted(() => {
  const mockDispose = vi.fn()
  const mockUpdateOptions = vi.fn()

  const mockCreate = vi.fn(() => ({
    dispose: mockDispose,
    setValue: vi.fn(),
    getValue: vi.fn(() => 'file content'),
    updateOptions: mockUpdateOptions,
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    getModel: vi.fn(() => ({ dispose: vi.fn() })),
    layout: vi.fn()
  }))

  const mockSetTheme = vi.fn()

  return { mockDispose, mockUpdateOptions, mockCreate, mockSetTheme }
})

vi.mock('monaco-editor', () => ({
  editor: {
    create: mockCreate,
    setTheme: mockSetTheme,
    createModel: vi.fn(() => ({}))
  },
  Uri: {
    file: vi.fn((path: string) => ({ path }))
  }
}))

const mockFileRead = vi.fn()
const mockFileWrite = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    fileRead: mockFileRead,
    fileWrite: mockFileWrite
  },
  writable: true,
  configurable: true
})

describe('MonacoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFileRead.mockResolvedValue({ content: 'const x = 1;', filePath: '/src/index.ts' })
    mockFileWrite.mockResolvedValue(undefined)
  })

  it('renders the editor container', () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('monaco-editor-container')).toBeInTheDocument()
  })

  it('creates a Monaco editor instance on mount', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
  })

  it('sets vs-dark theme', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith('vs-dark')
    })
  })

  it('respects read-only mode', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ readOnly: true })
      )
    })
  })

  it('respects editable mode', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={false}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ readOnly: false })
      )
    })
  })

  it('loads file content on mount', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockFileRead).toHaveBeenCalledWith({ filePath: '/src/index.ts' })
    })
  })

  it('updates read-only when prop changes', async () => {
    const { rerender } = render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })

    rerender(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={false}
        onContentChange={vi.fn()}
      />
    )

    expect(mockUpdateOptions).toHaveBeenCalledWith({ readOnly: false })
  })

  it('disposes editor on unmount', async () => {
    const { unmount } = render(
      <MonacoEditor
        filePath="/src/index.ts"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })

    unmount()
    expect(mockDispose).toHaveBeenCalled()
  })
})
