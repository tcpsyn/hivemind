import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import DiffView from '../../../renderer/src/components/DiffView'

const { mockDiffDispose, mockCreateDiffEditor, mockModelDispose, mockCreateModel } = vi.hoisted(
  () => {
    const mockDiffDispose = vi.fn()
    const mockModelDispose = vi.fn()

    const mockCreateDiffEditor = vi.fn(() => ({
      dispose: mockDiffDispose,
      layout: vi.fn(),
      setModel: vi.fn()
    }))

    const mockCreateModel = vi.fn(() => ({ dispose: mockModelDispose }))

    return { mockDiffDispose, mockCreateDiffEditor, mockModelDispose, mockCreateModel }
  }
)

vi.mock('monaco-editor', () => ({
  editor: {
    createDiffEditor: mockCreateDiffEditor,
    createModel: mockCreateModel,
    setTheme: vi.fn()
  }
}))

const mockGitDiff = vi.fn()
const mockFileRead = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    gitDiff: mockGitDiff,
    fileRead: mockFileRead
  },
  writable: true,
  configurable: true
})

describe('DiffView — dispose and cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitDiff.mockResolvedValue({
      diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
      filePath: '/file.ts',
      original: 'old content'
    })
    mockFileRead.mockResolvedValue({ content: 'current content', filePath: '/file.ts' })
  })

  it('disposes diff editor on unmount', async () => {
    const { unmount } = render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalled()
    })

    unmount()
    expect(mockDiffDispose).toHaveBeenCalled()
  })

  it('disposes text models on unmount', async () => {
    const { unmount } = render(<DiffView filePath="/file.ts" language="typescript" />)

    // Wait for models to be created (happens in Promise.all callback)
    await waitFor(() => {
      expect(mockCreateModel).toHaveBeenCalled()
    })

    unmount()

    // Each model dispose should be called (original + modified)
    expect(mockModelDispose).toHaveBeenCalled()
  })

  it('disposes old editor when filePath changes', async () => {
    const { rerender } = render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalledTimes(1)
    })

    rerender(<DiffView filePath="/other.ts" language="typescript" />)

    // Old editor should be disposed
    expect(mockDiffDispose).toHaveBeenCalled()

    await waitFor(() => {
      // New editor should be created
      expect(mockCreateDiffEditor).toHaveBeenCalledTimes(2)
    })
  })

  it('disposes old editor when language changes', async () => {
    const { rerender } = render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalledTimes(1)
    })

    rerender(<DiffView filePath="/file.ts" language="javascript" />)

    expect(mockDiffDispose).toHaveBeenCalled()
  })

  it('still disposes editor when API resolves after unmount', async () => {
    // Delay the API responses
    let resolveGitDiff: (v: any) => void
    mockGitDiff.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGitDiff = resolve
        })
    )

    const { unmount } = render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalled()
    })

    // Unmount before API resolves
    unmount()
    expect(mockDiffDispose).toHaveBeenCalled()

    // Resolve after unmount — models should not be set since editorRef.current is null
    resolveGitDiff!({
      diff: '',
      filePath: '/file.ts',
      original: 'old'
    })
  })
})
