import { useEffect, useCallback, useRef, useState } from 'react'
import { useAppDispatch } from '../state/AppContext'
import type { TeamConfig } from '../../../shared/types'

export function useAgentManager() {
  const dispatch = useAppDispatch()
  const [isTeamRunning, setIsTeamRunning] = useState(false)
  const agentIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!window.api?.onAgentOutput) return

    const unsubOutput = window.api.onAgentOutput(() => {
      // Output is handled directly by useTerminal hook per-pane
    })

    const unsubStatus = window.api.onAgentStatusChange((payload) => {
      if (!agentIdsRef.current.has(payload.agentId)) {
        agentIdsRef.current.add(payload.agentId)
        dispatch({ type: 'ADD_AGENT', payload: payload.agent })
      } else {
        dispatch({
          type: 'UPDATE_AGENT',
          payload: { id: payload.agentId, status: payload.agent.status }
        })
      }
    })

    const unsubInput = window.api.onAgentInputNeeded((payload) => {
      dispatch({
        type: 'UPDATE_AGENT',
        payload: { id: payload.agentId, needsInput: true }
      })

      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `notif-${payload.agentId}-${Date.now()}`,
          agentId: payload.agentId,
          agentName: payload.agentName,
          message: `${payload.agentName} needs input`,
          timestamp: Date.now(),
          read: false
        }
      })
    })

    return () => {
      unsubOutput()
      unsubStatus()
      unsubInput()
    }
  }, [dispatch])

  const startTeam = useCallback(
    async (config: TeamConfig) => {
      dispatch({ type: 'SET_PROJECT', payload: { name: config.name, path: config.project } })

      const result = await window.api.teamStart({ config })

      for (const agent of result.agents) {
        agentIdsRef.current.add(agent.id)
        dispatch({ type: 'ADD_AGENT', payload: agent })
      }

      setIsTeamRunning(true)
    },
    [dispatch]
  )

  const stopTeam = useCallback(async () => {
    await window.api.teamStop()

    for (const id of agentIdsRef.current) {
      dispatch({ type: 'REMOVE_AGENT', payload: id })
    }
    agentIdsRef.current.clear()
    setIsTeamRunning(false)
  }, [dispatch])

  const stopAgent = useCallback(async (agentId: string) => {
    await window.api.agentStop({ agentId })
  }, [])

  const restartAgent = useCallback(async (agentId: string) => {
    await window.api.agentRestart({ agentId })
  }, [])

  return {
    startTeam,
    stopTeam,
    stopAgent,
    restartAgent,
    isTeamRunning
  }
}
