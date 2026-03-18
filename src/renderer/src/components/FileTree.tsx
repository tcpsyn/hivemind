import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppDispatch, useAppState } from '../state/AppContext'
import { useFileTree } from '../hooks/useFileTree'
import FileTreeItem from './FileTreeItem'
import { detectLanguage } from '../../../shared/languages'
import type { FileTreeNode } from '../../../shared/types'
import './FileTree.css'

interface FileTreeProps {
  onFileClick?: (file: { filePath: string; fileName: string }) => void
}

interface ContextMenuState {
  x: number
  y: number
  node: FileTreeNode
}

function flattenVisible(
  nodes: FileTreeNode[],
  isExpanded: (path: string) => boolean
): FileTreeNode[] {
  const result: FileTreeNode[] = []
  for (const node of nodes) {
    result.push(node)
    if (node.type === 'directory' && isExpanded(node.path) && node.children) {
      result.push(...flattenVisible(node.children, isExpanded))
    }
  }
  return result
}

export default function FileTree({ onFileClick }: FileTreeProps) {
  const { tree, loading, toggleDir, isExpanded } = useFileTree()
  const dispatch = useAppDispatch()
  const { activeTabId } = useAppState()
  const [focusIndex, setFocusIndex] = useState(-1)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const visibleNodes = flattenVisible(tree, isExpanded)

  const handleFileClick = useCallback(
    (node: FileTreeNode) => {
      if (onFileClick) {
        onFileClick({ filePath: node.path, fileName: node.name })
      }
      const tab = {
        id: node.path,
        filePath: node.path,
        fileName: node.name,
        language: detectLanguage(node.name),
        isModified: false,
        isReadOnly: true
      }
      dispatch({ type: 'ADD_EDITOR_TAB', payload: tab, tabId: activeTabId })
      dispatch({ type: 'SET_ACTIVE_EDITOR_TAB', payload: node.path, tabId: activeTabId })
    },
    [dispatch, onFileClick, activeTabId]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const handleCopyPath = useCallback(() => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.node.path).catch(() => {})
      setContextMenu(null)
    }
  }, [contextMenu])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (visibleNodes.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setFocusIndex((prev) => Math.min(prev + 1, visibleNodes.length - 1))
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setFocusIndex((prev) => Math.max(prev - 1, 0))
          break
        }
        case 'Enter': {
          e.preventDefault()
          const node = visibleNodes[focusIndex]
          if (!node) break
          if (node.type === 'directory') {
            toggleDir(node.path)
          } else {
            handleFileClick(node)
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          const node = visibleNodes[focusIndex]
          if (node?.type === 'directory' && !isExpanded(node.path)) {
            toggleDir(node.path)
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const node = visibleNodes[focusIndex]
          if (node?.type === 'directory' && isExpanded(node.path)) {
            toggleDir(node.path)
          }
          break
        }
      }
    },
    [visibleNodes, focusIndex, toggleDir, isExpanded, handleFileClick]
  )

  if (loading) {
    return (
      <div className="file-tree" data-testid="file-tree">
        <span className="file-tree-loading">
          <span className="file-tree-spinner" />
          Loading files...
        </span>
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="file-tree" data-testid="file-tree">
        <span className="file-tree-empty">No files</span>
      </div>
    )
  }

  // Compute depth for each node based on path segments
  const minSegments = tree[0] ? tree[0].path.split('/').length - 1 : 0

  return (
    <div
      className="file-tree"
      data-testid="file-tree"
      tabIndex={0}
      role="tree"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {visibleNodes.map((node, idx) => {
        const depth = node.path.split('/').length - 1 - minSegments
        return (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={depth}
            isExpanded={isExpanded(node.path)}
            isFocused={idx === focusIndex}
            onToggle={toggleDir}
            onClick={handleFileClick}
            onContextMenu={handleContextMenu}
          />
        )
      })}

      {contextMenu && (
        <div
          className="file-tree-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          data-testid="context-menu"
        >
          <button className="context-menu-item" onClick={handleCopyPath}>
            Copy Path
          </button>
        </div>
      )}
    </div>
  )
}
