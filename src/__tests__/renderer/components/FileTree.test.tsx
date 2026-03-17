import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import FileTree from '../../../renderer/src/components/FileTree'
import type { FileTreeNode } from '../../../shared/types'
import type { ReactNode } from 'react'

const mockFileTreeRequest = vi.fn<() => Promise<FileTreeNode[]>>()
const mockOnFileChanged = vi.fn<(cb: (payload: unknown) => void) => () => void>()

beforeEach(() => {
  vi.clearAllMocks()
  mockFileTreeRequest.mockResolvedValue([])
  mockOnFileChanged.mockReturnValue(vi.fn())

  Object.defineProperty(window, 'api', {
    value: {
      fileTreeRequest: mockFileTreeRequest,
      onFileChanged: mockOnFileChanged,
      // stubs for other api methods hook might need
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn(),
      agentRestart: vi.fn(),
      agentResize: vi.fn(),
      fileRead: vi.fn(),
      fileWrite: vi.fn(),
      gitDiff: vi.fn(),
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

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function renderFileTree(props?: {
  onFileClick?: (f: { filePath: string; fileName: string }) => void
}) {
  return render(<FileTree {...props} />, { wrapper })
}

const mockTree: FileTreeNode[] = [
  {
    name: 'src',
    path: '/project/src',
    type: 'directory',
    children: [
      {
        name: 'index.ts',
        path: '/project/src/index.ts',
        type: 'file',
        gitStatus: 'modified'
      },
      {
        name: 'utils.ts',
        path: '/project/src/utils.ts',
        type: 'file',
        gitStatus: 'added'
      },
      {
        name: 'components',
        path: '/project/src/components',
        type: 'directory',
        children: [
          {
            name: 'App.tsx',
            path: '/project/src/components/App.tsx',
            type: 'file',
            gitStatus: null
          }
        ]
      }
    ]
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    type: 'file',
    gitStatus: null
  },
  {
    name: 'README.md',
    path: '/project/README.md',
    type: 'file',
    gitStatus: 'deleted'
  },
  {
    name: '.gitignore',
    path: '/project/.gitignore',
    type: 'file',
    gitStatus: 'untracked'
  }
]

describe('FileTree', () => {
  it('renders file tree container', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    expect(await screen.findByTestId('file-tree')).toBeInTheDocument()
  })

  it('loads tree from IPC on mount', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await screen.findByText('src')
    expect(mockFileTreeRequest).toHaveBeenCalledOnce()
  })

  it('renders top-level files and directories', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    expect(await screen.findByText('src')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('.gitignore')).toBeInTheDocument()
  })

  it('directories are collapsed by default — children not visible', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await screen.findByText('src')
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
  })

  it('expands directory on click to show children', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await user.click(await screen.findByText('src'))
    expect(await screen.findByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('utils.ts')).toBeInTheDocument()
    expect(screen.getByText('components')).toBeInTheDocument()
  })

  it('collapses expanded directory on second click', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await user.click(await screen.findByText('src'))
    await screen.findByText('index.ts')
    await user.click(screen.getByText('src'))
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
  })

  it('shows nested directories when parent expanded', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await user.click(await screen.findByText('src'))
    await user.click(await screen.findByText('components'))
    expect(await screen.findByText('App.tsx')).toBeInTheDocument()
  })

  it('shows git status M indicator for modified files', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await user.click(await screen.findByText('src'))
    const indexItem = (await screen.findByText('index.ts')).closest(
      '[data-testid="file-tree-item"]'
    )!
    const statusBadge = within(indexItem as HTMLElement).getByText('M')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('git-status-modified')
  })

  it('shows git status A indicator for added files', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await user.click(await screen.findByText('src'))
    const utilsItem = (await screen.findByText('utils.ts')).closest(
      '[data-testid="file-tree-item"]'
    )!
    const statusBadge = within(utilsItem as HTMLElement).getByText('A')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('git-status-added')
  })

  it('shows git status D indicator for deleted files', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    const readmeItem = (await screen.findByText('README.md')).closest(
      '[data-testid="file-tree-item"]'
    )!
    const statusBadge = within(readmeItem as HTMLElement).getByText('D')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('git-status-deleted')
  })

  it('shows git status ? indicator for untracked files', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    const gitignoreItem = (await screen.findByText('.gitignore')).closest(
      '[data-testid="file-tree-item"]'
    )!
    const statusBadge = within(gitignoreItem as HTMLElement).getByText('?')
    expect(statusBadge).toBeInTheDocument()
    expect(statusBadge).toHaveClass('git-status-untracked')
  })

  it('does not show git status for files with null status', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    const pkgItem = (await screen.findByText('package.json')).closest(
      '[data-testid="file-tree-item"]'
    )!
    expect(within(pkgItem as HTMLElement).queryByTestId('git-status')).not.toBeInTheDocument()
  })

  it('clicking a file calls onFileClick callback', async () => {
    const user = userEvent.setup()
    mockFileTreeRequest.mockResolvedValue(mockTree)

    const onFileClick = vi.fn()
    renderFileTree({ onFileClick })

    await user.click(await screen.findByText('package.json'))
    expect(onFileClick).toHaveBeenCalledWith({
      filePath: '/project/package.json',
      fileName: 'package.json'
    })
  })

  it('right-click shows context menu', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    const pkgJson = await screen.findByText('package.json')
    fireEvent.contextMenu(pkgJson)
    expect(await screen.findByText('Copy Path')).toBeInTheDocument()
  })

  it('subscribes to file change events on mount', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await screen.findByTestId('file-tree')
    expect(mockOnFileChanged).toHaveBeenCalledOnce()
  })

  it('reloads tree when file change event fires', async () => {
    let changeCallback: ((payload: unknown) => void) | null = null
    mockOnFileChanged.mockImplementation((cb) => {
      changeCallback = cb
      return vi.fn()
    })
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderFileTree()
    await screen.findByText('src')

    const updatedTree: FileTreeNode[] = [
      { name: 'new-file.ts', path: '/project/new-file.ts', type: 'file', gitStatus: 'added' }
    ]
    mockFileTreeRequest.mockResolvedValue(updatedTree)

    await act(async () => {
      changeCallback?.({ event: { type: 'add', path: '/project/new-file.ts' } })
    })

    expect(await screen.findByText('new-file.ts')).toBeInTheDocument()
  })

  it('shows empty state when tree is empty', async () => {
    mockFileTreeRequest.mockResolvedValue([])
    renderFileTree()
    expect(await screen.findByText('No files')).toBeInTheDocument()
  })

  describe('keyboard navigation', () => {
    it('arrow down moves focus to next item', async () => {
      const user = userEvent.setup()
      mockFileTreeRequest.mockResolvedValue(mockTree)
      renderFileTree()
      const tree = await screen.findByTestId('file-tree')
      tree.focus()
      await user.keyboard('{ArrowDown}')
      const firstItem = screen.getByText('src').closest('[data-testid="file-tree-item"]')!
      expect(firstItem).toHaveClass('focused')
    })

    it('enter key expands a focused directory', async () => {
      const user = userEvent.setup()
      mockFileTreeRequest.mockResolvedValue(mockTree)
      renderFileTree()
      const tree = await screen.findByTestId('file-tree')
      tree.focus()
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')
      expect(await screen.findByText('index.ts')).toBeInTheDocument()
    })

    it('arrow right expands directory, arrow left collapses', async () => {
      const user = userEvent.setup()
      mockFileTreeRequest.mockResolvedValue(mockTree)
      renderFileTree()
      const tree = await screen.findByTestId('file-tree')
      tree.focus()
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{ArrowRight}')
      expect(await screen.findByText('index.ts')).toBeInTheDocument()
      await user.keyboard('{ArrowLeft}')
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    })
  })
})
