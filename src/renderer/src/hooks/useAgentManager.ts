import { useEffect, useCallback, useRef } from 'react'
import { useAppDispatch, useAppState } from '../state/AppContext'
import type { AgentState, TeamConfig } from '../../../shared/types'

export function useAgentManager() {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const activeTabId = state.activeTabId

  // Per-tab agent tracking: tabId → Set of agentIds
  const tabAgentsRef = useRef<Map<string, Set<string>>>(new Map())
  const teamLeadSetRef = useRef<Map<string, boolean>>(new Map())
  const selectedTeammateIdRef = useRef<string | null>(null)
  const startTeamRef = useRef<(config: TeamConfig) => Promise<void>>()
  const stopTeamRef = useRef<() => Promise<void>>()

  function getAgentIds(tabId: string): Set<string> {
    let set = tabAgentsRef.current.get(tabId)
    if (!set) {
      set = new Set()
      tabAgentsRef.current.set(tabId, set)
    }
    return set
  }

  // Keep refs in sync
  const activeTab = state.tabs.get(activeTabId)
  selectedTeammateIdRef.current = activeTab?.layout.selectedTeammateId ?? null

  // Derive isTeamRunning from active tab state
  const isTeamRunning = activeTab?.teamStatus === 'running'

  // Listen for auto-started team session from main process
  useEffect(() => {
    const unsubAutoStart = window.api?.onTeamAutoStarted?.(
      (data: { tabId: string; projectName: string; projectPath: string; agents: AgentState[] }) => {
        const tabId = data.tabId

        // Create the tab in renderer state if it doesn't exist (auto-start uses dynamic IDs)
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: tabId, projectPath: data.projectPath, projectName: data.projectName }
        })
        // Remove the placeholder default tab if this is the first real tab
        dispatch({ type: 'CLOSE_TAB', payload: 'tab-default' })

        const agentIds = getAgentIds(tabId)

        for (const agent of data.agents) {
          agentIds.add(agent.id)
          dispatch({ type: 'ADD_AGENT', payload: agent, tabId })
          if (!teamLeadSetRef.current.get(tabId) && !agent.isTeammate) {
            dispatch({ type: 'SET_TEAM_LEAD', payload: agent.id, tabId })
            teamLeadSetRef.current.set(tabId, true)
          }
        }
        if (!teamLeadSetRef.current.get(tabId) && data.agents.length > 0) {
          dispatch({ type: 'SET_TEAM_LEAD', payload: data.agents[0].id, tabId })
          teamLeadSetRef.current.set(tabId, true)
        }
        dispatch({ type: 'SET_TEAM_STATUS', payload: 'running', tabId })
      }
    )

    return () => {
      unsubAutoStart?.()
    }
  }, [dispatch])

  // Listen for menu team start/stop — use refs to avoid stale closures
  useEffect(() => {
    if (!window.api?.onMenuTeamStart) return

    const unsubStart = window.api.onMenuTeamStart((config: unknown) => {
      const teamConfig = config as TeamConfig
      startTeamRef.current?.(teamConfig)
    })

    const unsubStop = window.api.onMenuTeamStop?.(() => {
      stopTeamRef.current?.()
    })

    return () => {
      unsubStart()
      unsubStop?.()
    }
  }, [])

  // Listen for agent status changes — route by payload.tabId
  useEffect(() => {
    if (!window.api?.onAgentStatusChange) return

    const unsubStatus = window.api.onAgentStatusChange((payload) => {
      const tabId = payload.tabId
      const agentIds = getAgentIds(tabId)

      if (!agentIds.has(payload.agentId)) {
        agentIds.add(payload.agentId)
        dispatch({ type: 'ADD_AGENT', payload: payload.agent, tabId })
      } else {
        dispatch({
          type: 'UPDATE_AGENT',
          payload: { id: payload.agentId, status: payload.agent.status },
          tabId
        })
      }
    })

    const unsubInput = window.api.onAgentInputNeeded((payload) => {
      const tabId = payload.tabId
      dispatch({
        type: 'UPDATE_AGENT',
        payload: { id: payload.agentId, needsInput: true },
        tabId
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
        },
        tabId
      })
    })

    return () => {
      unsubStatus()
      unsubInput()
    }
  }, [dispatch])

  // Listen for teammate events — route by payload.tabId
  useEffect(() => {
    const paneToAgent = new Map<string, { agentId: string; tabId: string }>()

    const unsubSpawned = window.api?.onTeammateSpawned?.((payload) => {
      const { tabId, agent } = payload
      const agentIds = getAgentIds(tabId)

      if (!agentIds.has(agent.id)) {
        agentIds.add(agent.id)
        dispatch({ type: 'ADD_AGENT', payload: agent, tabId })
      }
      if (agent.paneId) {
        paneToAgent.set(agent.paneId, { agentId: agent.id, tabId })
      }
      // Auto-select first teammate
      if (!selectedTeammateIdRef.current) {
        dispatch({ type: 'SELECT_TEAMMATE', payload: agent.id, tabId })
      }
    })

    const unsubExited = window.api?.onTeammateExited?.((payload) => {
      const { tabId, agentId } = payload
      dispatch({ type: 'REMOVE_AGENT', payload: agentId, tabId })
      const agentIds = getAgentIds(tabId)
      agentIds.delete(agentId)
    })

    const unsubRenamed = window.api?.onTeammateRenamed?.((payload) => {
      dispatch({
        type: 'UPDATE_AGENT',
        payload: { id: payload.agentId, name: payload.name },
        tabId: payload.tabId
      })
    })

    const unsubStatus = window.api?.onTeammateStatus?.((payload) => {
      dispatch({
        type: 'UPDATE_AGENT',
        payload: {
          id: payload.agentId,
          model: payload.model,
          contextPercent: payload.contextPercent,
          branch: payload.branch,
          lastActivity: Date.now()
        },
        tabId: payload.tabId
      })
    })

    return () => {
      unsubSpawned?.()
      unsubExited?.()
      unsubRenamed?.()
      unsubStatus?.()
    }
  }, [dispatch])

  const startTeam = useCallback(
    async (config: TeamConfig) => {
      const tabId = activeTabId
      dispatch({ type: 'SET_TEAM_STATUS', payload: 'starting', tabId })

      const result = await window.api.teamStart({ tabId, config })
      const agentIds = getAgentIds(tabId)

      for (const agent of result.agents) {
        agentIds.add(agent.id)
        dispatch({ type: 'ADD_AGENT', payload: agent, tabId })

        if (!teamLeadSetRef.current.get(tabId) && !agent.isTeammate) {
          dispatch({ type: 'SET_TEAM_LEAD', payload: agent.id, tabId })
          teamLeadSetRef.current.set(tabId, true)
        }
      }

      if (!teamLeadSetRef.current.get(tabId) && result.agents.length > 0) {
        dispatch({ type: 'SET_TEAM_LEAD', payload: result.agents[0].id, tabId })
        teamLeadSetRef.current.set(tabId, true)
      }

      dispatch({ type: 'SET_TEAM_STATUS', payload: 'running', tabId })
    },
    [dispatch, activeTabId]
  )

  const stopTeam = useCallback(async () => {
    const tabId = activeTabId
    await window.api.teamStop({ tabId })

    const agentIds = getAgentIds(tabId)
    for (const id of agentIds) {
      dispatch({ type: 'REMOVE_AGENT', payload: id, tabId })
    }
    agentIds.clear()
    teamLeadSetRef.current.set(tabId, false)
    dispatch({ type: 'SET_TEAM_STATUS', payload: 'stopped', tabId })
  }, [dispatch, activeTabId])

  // Keep refs in sync for menu handler closures
  startTeamRef.current = startTeam
  stopTeamRef.current = stopTeam

  const stopAgent = useCallback(
    async (agentId: string) => {
      await window.api.agentStop({ tabId: activeTabId, agentId })
    },
    [activeTabId]
  )

  const restartAgent = useCallback(
    async (agentId: string) => {
      await window.api.agentRestart({ tabId: activeTabId, agentId })
    },
    [activeTabId]
  )

  return {
    startTeam,
    stopTeam,
    stopAgent,
    restartAgent,
    isTeamRunning
  }
}
