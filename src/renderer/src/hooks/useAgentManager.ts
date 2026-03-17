import { useEffect, useCallback, useRef, useState } from 'react'
import { useAppDispatch, useAppState } from '../state/AppContext'
import type { TeamConfig } from '../../../shared/types'

export function useAgentManager() {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const [isTeamRunning, setIsTeamRunning] = useState(false)
  const agentIdsRef = useRef<Set<string>>(new Set())
  const teamLeadSetRef = useRef(false)

  // Listen for menu team start/stop
  useEffect(() => {
    if (!window.api?.onMenuTeamStart) return

    const unsubStart = window.api.onMenuTeamStart((config: unknown) => {
      const teamConfig = config as TeamConfig
      startTeam(teamConfig)
    })

    const unsubStop = window.api.onMenuTeamStop?.(() => {
      stopTeam()
    })

    return () => {
      unsubStart()
      unsubStop?.()
    }
  }, [])

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

  // Listen for teammate spawned/exited events
  useEffect(() => {
    const unsubSpawned = window.api?.onTeammateSpawned?.((payload) => {
      const agent = payload.agent
      if (!agentIdsRef.current.has(agent.id)) {
        agentIdsRef.current.add(agent.id)
        dispatch({ type: 'ADD_AGENT', payload: agent })
      }
      // Auto-select first teammate
      if (!state.layout.selectedTeammateId) {
        dispatch({ type: 'SELECT_TEAMMATE', payload: agent.id })
      }
    })

    const unsubExited = window.api?.onTeammateExited?.((payload) => {
      dispatch({ type: 'REMOVE_AGENT', payload: payload.agentId })
      agentIdsRef.current.delete(payload.agentId)
    })

    const unsubRenamed = window.api?.onTeammateRenamed?.((payload) => {
      dispatch({
        type: 'UPDATE_AGENT',
        payload: { id: payload.agentId, name: payload.name }
      })
    })

    return () => {
      unsubSpawned?.()
      unsubExited?.()
      unsubRenamed?.()
    }
  }, [dispatch, state.layout.selectedTeammateId])

  const startTeam = useCallback(
    async (config: TeamConfig) => {
      dispatch({ type: 'SET_PROJECT', payload: { name: config.name, path: config.project } })

      const result = await window.api.teamStart({ config })

      for (const agent of result.agents) {
        agentIdsRef.current.add(agent.id)
        dispatch({ type: 'ADD_AGENT', payload: agent })

        // First non-teammate agent becomes team lead
        if (!teamLeadSetRef.current && !agent.isTeammate) {
          dispatch({ type: 'SET_TEAM_LEAD', payload: agent.id })
          teamLeadSetRef.current = true
        }
      }

      // If no explicit non-teammate, use the first agent as lead
      if (!teamLeadSetRef.current && result.agents.length > 0) {
        dispatch({ type: 'SET_TEAM_LEAD', payload: result.agents[0].id })
        teamLeadSetRef.current = true
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
    teamLeadSetRef.current = false
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
