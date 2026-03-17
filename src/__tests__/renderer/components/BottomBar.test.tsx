import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import BottomBar from '../../../renderer/src/components/BottomBar'
import type { AgentState } from '../../../shared/types'

function renderBottomBar() {
  return render(
    <AppProvider>
      <BottomBar />
    </AppProvider>
  )
}

describe('BottomBar', () => {
  it('renders with bottombar testid', () => {
    renderBottomBar()
    expect(screen.getByTestId('bottombar')).toBeInTheDocument()
  })

  it('shows agent status summary', () => {
    const Wrapper = () => {
      const dispatch = useAppDispatch()
      const agents: AgentState[] = [
        {
          id: '1',
          name: 'a',
          role: 'r',
          avatar: 'robot-1',
          color: '#FF6B6B',
          status: 'running',
          needsInput: false,
          lastActivity: Date.now()
        },
        {
          id: '2',
          name: 'b',
          role: 'r',
          avatar: 'robot-2',
          color: '#4ECDC4',
          status: 'running',
          needsInput: false,
          lastActivity: Date.now()
        },
        {
          id: '3',
          name: 'c',
          role: 'r',
          avatar: 'robot-3',
          color: '#45B7D1',
          status: 'idle',
          needsInput: false,
          lastActivity: Date.now()
        },
        {
          id: '4',
          name: 'd',
          role: 'r',
          avatar: 'circuit',
          color: '#96CEB4',
          status: 'waiting',
          needsInput: true,
          lastActivity: Date.now()
        }
      ]
      agents.forEach((a) => dispatch({ type: 'ADD_AGENT', payload: a }))
      return <BottomBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByText(/2 running/)).toBeInTheDocument()
    expect(screen.getByText(/1 idle/)).toBeInTheDocument()
    expect(screen.getByText(/1 waiting/)).toBeInTheDocument()
  })

  it('shows no agents message when empty', () => {
    renderBottomBar()
    expect(screen.getByText(/no agents/i)).toBeInTheDocument()
  })

  it('shows last activity timestamp', () => {
    const now = Date.now()
    const Wrapper = () => {
      const dispatch = useAppDispatch()
      dispatch({
        type: 'ADD_AGENT',
        payload: {
          id: '1',
          name: 'a',
          role: 'r',
          avatar: 'robot-1',
          color: '#FF6B6B',
          status: 'running',
          needsInput: false,
          lastActivity: now
        }
      })
      return <BottomBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByTestId('last-activity')).toBeInTheDocument()
  })
})
