import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FileTreeItem from '../../../renderer/src/components/FileTreeItem'
import type { FileTreeNode } from '../../../shared/types'

const makeFileNode = (overrides: Partial<FileTreeNode> = {}): FileTreeNode => ({
  name: 'index.ts',
  path: '/project/index.ts',
  type: 'file',
  gitStatus: null,
  ...overrides
})

const makeDirNode = (overrides: Partial<FileTreeNode> = {}): FileTreeNode => ({
  name: 'src',
  path: '/project/src',
  type: 'directory',
  children: [],
  ...overrides
})

const defaultProps = {
  depth: 0,
  isExpanded: false,
  isFocused: false,
  onToggle: vi.fn(),
  onClick: vi.fn(),
  onContextMenu: vi.fn()
}

describe('FileTreeItem', () => {
  describe('file rendering', () => {
    it('renders file name', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} />)
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    it('renders TypeScript icon for .ts files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'app.ts' })} />)
      expect(screen.getByText('⬡')).toBeInTheDocument()
    })

    it('renders TypeScript icon for .tsx files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'App.tsx' })} />)
      expect(screen.getByText('⬡')).toBeInTheDocument()
    })

    it('renders JavaScript icon for .js files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'app.js' })} />)
      expect(screen.getByText('◇')).toBeInTheDocument()
    })

    it('renders JSON icon for .json files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'package.json' })} />)
      expect(screen.getByText('{ }')).toBeInTheDocument()
    })

    it('renders markdown icon for .md files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'README.md' })} />)
      expect(screen.getByText('◈')).toBeInTheDocument()
    })

    it('renders CSS icon for .css files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'styles.css' })} />)
      expect(screen.getByText('◆')).toBeInTheDocument()
    })

    it('renders gear icon for .yml files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'config.yml' })} />)
      expect(screen.getByText('⚙')).toBeInTheDocument()
    })

    it('renders default icon for unknown extensions', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ name: 'data.xyz' })} />)
      expect(screen.getByText('○')).toBeInTheDocument()
    })

    it('calls onClick when a file is clicked', () => {
      const onClick = vi.fn()
      const node = makeFileNode()
      render(<FileTreeItem {...defaultProps} node={node} onClick={onClick} />)

      fireEvent.click(screen.getByTestId('file-tree-item'))
      expect(onClick).toHaveBeenCalledWith(node)
    })

    it('does not call onToggle for file clicks', () => {
      const onToggle = vi.fn()
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} onToggle={onToggle} />)

      fireEvent.click(screen.getByTestId('file-tree-item'))
      expect(onToggle).not.toHaveBeenCalled()
    })
  })

  describe('directory rendering', () => {
    it('renders directory name', () => {
      render(<FileTreeItem {...defaultProps} node={makeDirNode()} />)
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    it('shows collapsed arrow when not expanded', () => {
      render(<FileTreeItem {...defaultProps} node={makeDirNode()} isExpanded={false} />)
      expect(screen.getByText('▸')).toBeInTheDocument()
    })

    it('shows expanded arrow when expanded', () => {
      render(<FileTreeItem {...defaultProps} node={makeDirNode()} isExpanded={true} />)
      expect(screen.getByText('▾')).toBeInTheDocument()
    })

    it('calls onToggle when a directory is clicked', () => {
      const onToggle = vi.fn()
      render(<FileTreeItem {...defaultProps} node={makeDirNode()} onToggle={onToggle} />)

      fireEvent.click(screen.getByTestId('file-tree-item'))
      expect(onToggle).toHaveBeenCalledWith('/project/src')
    })

    it('sets aria-expanded for directories', () => {
      render(<FileTreeItem {...defaultProps} node={makeDirNode()} isExpanded={true} />)
      expect(screen.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'true')
    })

    it('does not set aria-expanded for files', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} />)
      expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded')
    })
  })

  describe('git status badges', () => {
    it('shows M badge for modified files', () => {
      render(
        <FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: 'modified' })} />
      )
      const badge = screen.getByTestId('git-status')
      expect(badge).toHaveTextContent('M')
      expect(badge).toHaveClass('git-status-modified')
    })

    it('shows A badge for added files', () => {
      render(
        <FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: 'added' })} />
      )
      const badge = screen.getByTestId('git-status')
      expect(badge).toHaveTextContent('A')
      expect(badge).toHaveClass('git-status-added')
    })

    it('shows D badge for deleted files', () => {
      render(
        <FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: 'deleted' })} />
      )
      const badge = screen.getByTestId('git-status')
      expect(badge).toHaveTextContent('D')
      expect(badge).toHaveClass('git-status-deleted')
    })

    it('shows ? badge for untracked files', () => {
      render(
        <FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: 'untracked' })} />
      )
      const badge = screen.getByTestId('git-status')
      expect(badge).toHaveTextContent('?')
      expect(badge).toHaveClass('git-status-untracked')
    })

    it('shows R badge for renamed files', () => {
      render(
        <FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: 'renamed' })} />
      )
      const badge = screen.getByTestId('git-status')
      expect(badge).toHaveTextContent('R')
      expect(badge).toHaveClass('git-status-modified')
    })

    it('does not show badge for null git status', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode({ gitStatus: null })} />)
      expect(screen.queryByTestId('git-status')).not.toBeInTheDocument()
    })

    it('does not show badge when gitStatus is undefined', () => {
      const node = { name: 'file.ts', path: '/file.ts', type: 'file' as const }
      render(<FileTreeItem {...defaultProps} node={node} />)
      expect(screen.queryByTestId('git-status')).not.toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('applies padding based on depth', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} depth={2} />)
      const item = screen.getByTestId('file-tree-item')
      expect(item.style.paddingLeft).toBe('36px') // 2 * 16 + 4
    })

    it('applies focused class when isFocused is true', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} isFocused={true} />)
      expect(screen.getByTestId('file-tree-item')).toHaveClass('focused')
    })

    it('does not apply focused class when isFocused is false', () => {
      render(<FileTreeItem {...defaultProps} node={makeFileNode()} isFocused={false} />)
      expect(screen.getByTestId('file-tree-item')).not.toHaveClass('focused')
    })
  })

  describe('context menu', () => {
    it('calls onContextMenu on right-click', () => {
      const onContextMenu = vi.fn()
      const node = makeFileNode()
      render(<FileTreeItem {...defaultProps} node={node} onContextMenu={onContextMenu} />)

      fireEvent.contextMenu(screen.getByTestId('file-tree-item'))
      expect(onContextMenu).toHaveBeenCalledWith(expect.any(Object), node)
    })
  })
})
