import { useState, useEffect, useCallback, useRef } from 'react'
import { useActiveTab } from '../state/AppContext'
import type { FileTreeNode } from '../../../shared/types'

export function useFileTree() {
  const tab = useActiveTab()
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const loadTree = useCallback(async () => {
    if (!window.api?.fileTreeRequest) {
      setLoading(false)
      return
    }
    try {
      const result = await window.api.fileTreeRequest({
        tabId: tab.id,
        rootPath: tab.projectPath || '.'
      })
      if (mountedRef.current) {
        setTree(result)
        setLoading(false)
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [tab.id, tab.projectPath])

  useEffect(() => {
    mountedRef.current = true
    loadTree()

    let unsubscribe: (() => void) | undefined
    if (window.api?.onFileChanged) {
      unsubscribe = window.api.onFileChanged(() => {
        loadTree()
      })
    }

    return () => {
      mountedRef.current = false
      unsubscribe?.()
    }
  }, [loadTree])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const isExpanded = useCallback((path: string) => expandedDirs.has(path), [expandedDirs])

  return { tree, loading, toggleDir, isExpanded }
}
