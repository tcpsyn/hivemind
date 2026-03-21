import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MonacoEditor from '../../../renderer/src/components/MonacoEditor'

const { mockDispose, mockUpdateOptions, mockCreate, mockSetTheme } = vi.hoisted(() => {
  const mockDispose = vi.fn()
  const mockUpdateOptions = vi.fn()
  const mockSetValue = vi.fn()

  const mockCreate = vi.fn(() => ({
    dispose: mockDispose,
    setValue: mockSetValue,
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

describe('MonacoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the editor container', () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        content="const x = 1;"
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
        content="const x = 1;"
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
        content="const x = 1;"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenCalledWith('vs-dark')
    })
  })

  it('creates editor with initial content from props', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        content="const x = 1;"
        language="typescript"
        isReadOnly={true}
        onContentChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ value: 'const x = 1;' })
      )
    })
  })

  it('respects read-only mode', async () => {
    render(
      <MonacoEditor
        filePath="/src/index.ts"
        content="const x = 1;"
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
        content="const x = 1;"
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

  it('updates read-only when prop changes', async () => {
    const { rerender } = render(
      <MonacoEditor
        filePath="/src/index.ts"
        content="const x = 1;"
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
        content="const x = 1;"
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
        content="const x = 1;"
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
