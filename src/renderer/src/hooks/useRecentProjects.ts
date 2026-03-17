import { useEffect, useRef } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'

const STORAGE_KEY = 'hivemind:recentProjects'

export function useRecentProjects() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const isInitialized = useRef(false)

  // Restore from localStorage on mount
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const paths: string[] = JSON.parse(raw)
        if (Array.isArray(paths)) {
          // Add in reverse so most recent ends up first after all dispatches
          for (let i = paths.length - 1; i >= 0; i--) {
            if (typeof paths[i] === 'string') {
              dispatch({ type: 'ADD_RECENT_PROJECT', payload: paths[i] })
            }
          }
        }
      }
    } catch {
      // Corrupt data, ignore
    }
  }, [dispatch])

  // Persist to localStorage when recentProjects changes
  useEffect(() => {
    if (!isInitialized.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recentProjects))
    } catch {
      // Storage full or unavailable
    }
  }, [state.recentProjects])

  return state.recentProjects
}
