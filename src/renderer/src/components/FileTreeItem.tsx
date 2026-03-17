import { memo } from 'react'
import type { FileTreeNode, GitFileStatus } from '../../../shared/types'

interface FileTreeItemProps {
  node: FileTreeNode
  depth: number
  isExpanded: boolean
  isFocused: boolean
  onToggle: (path: string) => void
  onClick: (node: FileTreeNode) => void
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void
}

const GIT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  modified: { label: 'M', className: 'git-status-modified' },
  added: { label: 'A', className: 'git-status-added' },
  deleted: { label: 'D', className: 'git-status-deleted' },
  untracked: { label: '?', className: 'git-status-untracked' },
  renamed: { label: 'R', className: 'git-status-modified' }
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '⬡'
    case 'js':
    case 'jsx':
      return '◇'
    case 'json':
      return '{ }'
    case 'md':
      return '◈'
    case 'yml':
    case 'yaml':
      return '⚙'
    case 'css':
      return '◆'
    case 'html':
      return '◇'
    default:
      return '○'
  }
}

function GitStatusBadge({ status }: { status: GitFileStatus }) {
  if (!status) return null
  const info = GIT_STATUS_MAP[status]
  if (!info) return null
  return (
    <span className={`git-status ${info.className}`} data-testid="git-status">
      {info.label}
    </span>
  )
}

function FileTreeItem({
  node,
  depth,
  isExpanded,
  isFocused,
  onToggle,
  onClick,
  onContextMenu
}: FileTreeItemProps) {
  const isDir = node.type === 'directory'
  const paddingLeft = depth * 16 + 4

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path)
    } else {
      onClick(node)
    }
  }

  return (
    <div
      className={`file-tree-item${isFocused ? ' focused' : ''}`}
      data-testid="file-tree-item"
      data-path={node.path}
      style={{ paddingLeft }}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, node)}
      role="treeitem"
      aria-expanded={isDir ? isExpanded : undefined}
    >
      <span className="file-tree-item-icon">
        {isDir ? (isExpanded ? '▾' : '▸') : getFileIcon(node.name)}
      </span>
      <span className="file-tree-item-name">{node.name}</span>
      <GitStatusBadge status={node.gitStatus ?? null} />
    </div>
  )
}

export default memo(FileTreeItem)
