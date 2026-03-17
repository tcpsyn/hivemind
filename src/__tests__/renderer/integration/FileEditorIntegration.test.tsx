import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import FileTree from '../../../renderer/src/components/FileTree'
import EditorView from '../../../renderer/src/components/EditorView'
import type { FileTreeNode } from '../../../shared/types'

// Mock monaco-editor
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(() => ({
      dispose: vi.fn(),
      onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
      setValue: vi.fn(),
      getValue: vi.fn(() => 'file content'),
      updateOptions: vi.fn()
    })),
    createDiffEditor: vi.fn(() => ({
      dispose: vi.fn(),
      setModel: vi.fn()
    })),
    createModel: vi.fn(() => ({})),
    setTheme: vi.fn()
  }
}))

const mockTree: FileTreeNode[] = [
  {
    name: 'App.tsx',
    path: '/project/src/App.tsx',
    type: 'file',
    gitStatus: 'modified'
  },
  {
    name: 'utils.ts',
    path: '/project/src/utils.ts',
    type: 'file',
    gitStatus: null
  }
]

const mockFileTreeRequest = vi.fn<() => Promise<FileTreeNode[]>>()
const mockOnFileChanged = vi.fn<(cb: (payload: unknown) => void) => () => void>()
const mockFileRead = vi.fn()
const mockFileWrite = vi.fn()
const mockGitDiff = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockFileTreeRequest.mockResolvedValue(mockTree)
  mockOnFileChanged.mockReturnValue(vi.fn())
  mockFileRead.mockResolvedValue({ content: 'const x = 1;', filePath: '' })
  mockFileWrite.mockResolvedValue(undefined)
  mockGitDiff.mockResolvedValue({ original: '', filePath: '' })

  Object.defineProperty(window, 'api', {
    value: {
      fileTreeRequest: mockFileTreeRequest,
      onFileChanged: mockOnFileChanged,
      fileRead: mockFileRead,
      fileWrite: mockFileWrite,
      gitDiff: mockGitDiff,
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn(),
      agentRestart: vi.fn(),
      agentResize: vi.fn(),
      gitStatus: vi.fn(),
      teamStart: vi.fn(),
      teamStop: vi.fn(),
      onAgentOutput: vi.fn(() => vi.fn()),
      onAgentStatusChange: vi.fn(() => vi.fn()),
      onAgentInputNeeded: vi.fn(() => vi.fn()),
      onFileTreeUpdate: vi.fn(() => vi.fn()),
      onGitStatusUpdate: vi.fn(() => vi.fn())
    },
    writable: true,
    configurable: true
  })
})

function renderIntegration() {
  return render(
    <AppProvider>
      <FileTree />
      <EditorView />
    </AppProvider>
  )
}

describe('File Explorer ↔ Editor Integration', () => {
  it('clicking file in tree opens editor tab', async () => {
    const user = userEvent.setup()
    renderIntegration()

    await user.click(await screen.findByText('App.tsx'))

    expect(await screen.findByTestId('editor-tab-/project/src/App.tsx')).toBeInTheDocument()
  })

  it('clicking file loads content via fileRead IPC', async () => {
    const user = userEvent.setup()
    renderIntegration()

    await user.click(await screen.findByText('App.tsx'))

    expect(mockFileRead).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/project/src/App.tsx' })
    )
  })

  it('clicking second file adds another tab', async () => {
    const user = userEvent.setup()
    renderIntegration()

    await user.click(await screen.findByText('App.tsx'))
    await user.click(await screen.findByText('utils.ts'))

    expect(screen.getByTestId('editor-tab-/project/src/App.tsx')).toBeInTheDocument()
    expect(screen.getByTestId('editor-tab-/project/src/utils.ts')).toBeInTheDocument()
  })

  it('shows empty state when no file is selected', async () => {
    mockFileTreeRequest.mockResolvedValue([])
    renderIntegration()

    expect(await screen.findByTestId('editor-empty-state')).toBeInTheDocument()
  })

  it('git status is displayed in file tree', async () => {
    renderIntegration()

    const appItem = (await screen.findByText('App.tsx')).closest('[data-testid="file-tree-item"]')!
    expect(appItem.querySelector('.git-status-modified')).toBeInTheDocument()
  })

  it('file change event triggers tree refresh', async () => {
    let changeCallback: ((payload: unknown) => void) | null = null
    mockOnFileChanged.mockImplementation((cb) => {
      changeCallback = cb
      return vi.fn()
    })

    renderIntegration()
    await screen.findByText('App.tsx')

    expect(mockFileTreeRequest).toHaveBeenCalledTimes(1)

    const updatedTree: FileTreeNode[] = [
      ...mockTree,
      { name: 'new.ts', path: '/project/src/new.ts', type: 'file', gitStatus: 'added' }
    ]
    mockFileTreeRequest.mockResolvedValue(updatedTree)

    await act(async () => {
      changeCallback?.({ event: { type: 'add', path: '/project/src/new.ts' } })
    })

    expect(await screen.findByText('new.ts')).toBeInTheDocument()
  })
})
