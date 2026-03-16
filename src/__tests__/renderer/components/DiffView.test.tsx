import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiffView from '../../../renderer/src/components/DiffView'

const { mockDiffDispose, mockCreateDiffEditor } = vi.hoisted(() => {
  const mockDiffDispose = vi.fn()

  const mockCreateDiffEditor = vi.fn(() => ({
    dispose: mockDiffDispose,
    layout: vi.fn(),
    setModel: vi.fn()
  }))

  return { mockDiffDispose, mockCreateDiffEditor }
})

vi.mock('monaco-editor', () => ({
  editor: {
    createDiffEditor: mockCreateDiffEditor,
    createModel: vi.fn(() => ({})),
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

describe('DiffView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitDiff.mockResolvedValue({
      diff: '--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new',
      filePath: '/file.ts',
      original: 'old content'
    })
    mockFileRead.mockResolvedValue({ content: 'current content', filePath: '/file.ts' })
  })

  it('renders the diff container', () => {
    render(<DiffView filePath="/file.ts" language="typescript" />)
    expect(screen.getByTestId('diff-view-container')).toBeInTheDocument()
  })

  it('creates a diff editor on mount', async () => {
    render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalled()
    })
  })

  it('fetches diff data via gitDiff IPC', async () => {
    render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockGitDiff).toHaveBeenCalledWith({ filePath: '/file.ts' })
    })
  })

  it('shows inline diff mode by default', async () => {
    render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ renderSideBySide: false })
      )
    })
  })

  it('disposes editor on unmount', async () => {
    const { unmount } = render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalled()
    })

    unmount()
    expect(mockDiffDispose).toHaveBeenCalled()
  })

  it('shows toggle button for side-by-side mode', () => {
    render(<DiffView filePath="/file.ts" language="typescript" />)
    expect(screen.getByTestId('diff-toggle-mode')).toBeInTheDocument()
  })

  it('toggles between inline and side-by-side', async () => {
    const user = userEvent.setup()
    render(<DiffView filePath="/file.ts" language="typescript" />)

    await waitFor(() => {
      expect(mockCreateDiffEditor).toHaveBeenCalled()
    })

    const toggle = screen.getByTestId('diff-toggle-mode')
    await user.click(toggle)

    // After toggle, should recreate with side-by-side
    expect(mockDiffDispose).toHaveBeenCalled()
  })
})
