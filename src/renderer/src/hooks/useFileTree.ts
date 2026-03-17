import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppState } from '../state/AppContext'
import type { FileTreeNode } from '../../../shared/types'

export function useFileTree() {
  const { project } = useAppState()
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const loadTree = useCallback(async () => {
    try {
      const result = await window.api.fileTreeRequest({ rootPath: project.path || '.' })
      if (mountedRef.current) {
        setTree(result)
        setLoading(false)
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [project.path])

  useEffect(() => {
    mountedRef.current = true
    loadTree()

    const unsubscribe = window.api.onFileChanged(() => {
      loadTree()
    })

    return () => {
      mountedRef.current = false
      unsubscribe()
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
