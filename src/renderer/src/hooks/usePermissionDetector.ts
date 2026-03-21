import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppDispatch } from '../state/AppContext'

// Strip ANSI escape sequences so we can match against clean text
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g

// Claude Code permission prompts end with these patterns in the last few lines.
// We check the last 10 lines for any of these to detect a permission prompt.
const PERMISSION_INDICATORS = [
  'Do you want to proceed?',
  'Do you want to make this edit',
  'Do you want to run',
  'Esc to cancel',
  '1. Yes',
  '❯ 1.'
]

export function usePermissionDetector(tabId: string, agentId: string, paneId: string | undefined) {
  const [promptVisible, setPromptVisible] = useState(false)
  const dispatch = useAppDispatch()
  const bufferRef = useRef('')

  useEffect(() => {
    if (!paneId) return

    const unsub = window.api?.onTeammateOutput?.((payload) => {
      if (payload.paneId !== paneId || payload.tabId !== tabId) return

      // Append to rolling buffer, keep last 4KB
      bufferRef.current += payload.data
      if (bufferRef.current.length > 4096) {
        bufferRef.current = bufferRef.current.slice(-2048)
      }

      // Strip ANSI and check the last 10 non-empty lines
      const clean = bufferRef.current.replace(ANSI_RE, '')
      const lines = clean.split('\n')
      const lastLines = lines
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-10)
      const recentText = lastLines.join('\n')

      const detected = PERMISSION_INDICATORS.some((p) => recentText.includes(p))

      if (detected && !promptVisible) {
        setPromptVisible(true)
        dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, needsInput: true }, tabId })
      } else if (!detected && promptVisible) {
        // Prompt was resolved (e.g. user typed in terminal directly)
        setPromptVisible(false)
        dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, needsInput: false }, tabId })
      }
    })

    return () => {
      unsub?.()
    }
  }, [tabId, paneId, agentId, dispatch, promptVisible])

  const approve = useCallback(() => {
    if (!paneId) return
    // Send Enter key — Claude Code's permission prompt defaults to Yes (❯ 1. Yes)
    // tmux send-keys "Enter" sends the Enter keypress
    window.api.sendTeammateInput({ tabId, paneId, data: 'Enter', useKeys: true })
    setPromptVisible(false)
    bufferRef.current = ''
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, needsInput: false }, tabId })
  }, [tabId, paneId, agentId, dispatch])

  const deny = useCallback(() => {
    if (!paneId) return
    // Send Escape key — Claude Code's permission prompt cancels on Escape
    window.api.sendTeammateInput({ tabId, paneId, data: 'Escape', useKeys: true })
    setPromptVisible(false)
    bufferRef.current = ''
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, needsInput: false }, tabId })
  }, [tabId, paneId, agentId, dispatch])

  const approveAll = useCallback(() => {
    if (!paneId) return
    // Select option 2: "Yes, and don't ask again" — Down arrow to move cursor, then Enter
    window.api.sendTeammateInput({ tabId, paneId, data: 'Down', useKeys: true })
    setTimeout(() => {
      window.api.sendTeammateInput({ tabId, paneId, data: 'Enter', useKeys: true })
    }, 100)
    setPromptVisible(false)
    bufferRef.current = ''
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, needsInput: false }, tabId })
  }, [tabId, paneId, agentId, dispatch])

  return { promptVisible, approve, approveAll, deny }
}
