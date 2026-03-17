import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import TopBar from '../../../renderer/src/components/TopBar'
import type { AgentState, AppNotification } from '../../../shared/types'

function renderTopBar() {
  return render(
    <AppProvider>
      <TopBar />
    </AppProvider>
  )
}

describe('TopBar', () => {
  it('shows project name from state', () => {
    const Wrapper = () => {
      const dispatch = useAppDispatch()
      dispatch({ type: 'SET_PROJECT', payload: { name: 'my-project', path: '/path' } })
      return <TopBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows project path from state', () => {
    const Wrapper = () => {
      const dispatch = useAppDispatch()
      dispatch({ type: 'SET_PROJECT', payload: { name: 'proj', path: '/path/to/proj' } })
      return <TopBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByText('/path/to/proj')).toBeInTheDocument()
  })

  it('renders tab buttons for Agents, Editor, Git', () => {
    renderTopBar()
    expect(screen.getByRole('button', { name: /agents/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /git/i })).toBeInTheDocument()
  })

  it('marks active tab', () => {
    renderTopBar()
    const agentsBtn = screen.getByRole('button', { name: /agents/i })
    expect(agentsBtn).toHaveClass('active')
  })

  it('switches active tab on click', async () => {
    const user = userEvent.setup()
    renderTopBar()

    const editorBtn = screen.getByRole('button', { name: /editor/i })
    await user.click(editorBtn)
    expect(editorBtn).toHaveClass('active')

    const agentsBtn = screen.getByRole('button', { name: /agents/i })
    expect(agentsBtn).not.toHaveClass('active')
  })

  it('shows agent status counts', () => {
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
          status: 'waiting',
          needsInput: true,
          lastActivity: Date.now()
        }
      ]
      agents.forEach((a) => dispatch({ type: 'ADD_AGENT', payload: a }))
      return <TopBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByText(/2 running/i)).toBeInTheDocument()
    expect(screen.getByText(/1 waiting/i)).toBeInTheDocument()
  })

  it('shows unread notification badge count', () => {
    const Wrapper = () => {
      const dispatch = useAppDispatch()
      const notif1: AppNotification = {
        id: 'n1',
        agentId: '1',
        agentName: 'a',
        message: 'test',
        timestamp: Date.now(),
        read: false
      }
      const notif2: AppNotification = {
        id: 'n2',
        agentId: '2',
        agentName: 'b',
        message: 'test',
        timestamp: Date.now(),
        read: false
      }
      const notif3: AppNotification = {
        id: 'n3',
        agentId: '3',
        agentName: 'c',
        message: 'test',
        timestamp: Date.now(),
        read: true
      }
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif1 })
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif2 })
      dispatch({ type: 'ADD_NOTIFICATION', payload: notif3 })
      return <TopBar />
    }
    render(
      <AppProvider>
        <Wrapper />
      </AppProvider>
    )
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('2')
  })

  it('does not show badge when no unread notifications', () => {
    renderTopBar()
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })
})
