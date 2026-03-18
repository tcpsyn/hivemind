import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeammateTerminalPane } from '../../../renderer/src/components/TeammateTerminalPane'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'
import type { ReactNode } from 'react'

vi.mock('../../../renderer/src/hooks/useTeammateTerminal', () => ({
  useTeammateTerminal: vi.fn()
}))

vi.mock('../../../renderer/src/components/AgentAvatar', () => ({
  default: ({ avatar, color, size }: { avatar: string; color: string; size: number }) => (
    <span data-testid="agent-avatar" data-avatar={avatar} data-color={color} data-size={size} />
  )
}))

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'teammate-1',
    name: 'researcher',
    role: 'Research assistant',
    avatar: 'robot-2',
    color: '#4ECDC4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    paneId: '%1',
    ...overrides
  }
}

describe('TeammateTerminalPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the pane with correct test ID', () => {
    render(<TeammateTerminalPane agent={makeAgent()} />, { wrapper })
    expect(screen.getByTestId('teammate-terminal-pane-teammate-1')).toBeInTheDocument()
  })

  it('displays the agent name', () => {
    render(<TeammateTerminalPane agent={makeAgent({ name: 'coder' })} />, { wrapper })
    expect(screen.getByText('coder')).toBeInTheDocument()
  })

  it('displays the agent role', () => {
    render(<TeammateTerminalPane agent={makeAgent({ role: 'Code writer' })} />, { wrapper })
    expect(screen.getByText('Code writer')).toBeInTheDocument()
  })

  it('renders the agent avatar', () => {
    render(<TeammateTerminalPane agent={makeAgent({ avatar: 'robot-3', color: '#FF6B6B' })} />, {
      wrapper
    })
    const avatar = screen.getByTestId('agent-avatar')
    expect(avatar).toHaveAttribute('data-avatar', 'robot-3')
    expect(avatar).toHaveAttribute('data-color', '#FF6B6B')
    expect(avatar).toHaveAttribute('data-size', '20')
  })

  it('shows the status dot with correct class', () => {
    render(<TeammateTerminalPane agent={makeAgent({ status: 'running' })} />, { wrapper })
    const dot = screen.getByTestId('status-dot')
    expect(dot).toHaveClass('status-dot')
    expect(dot).toHaveClass('running')
  })

  it('applies agent color to pane header border', () => {
    render(<TeammateTerminalPane agent={makeAgent({ color: '#45B7D1' })} />, { wrapper })
    const header = screen.getByTestId('pane-header')
    expect(header.style.borderTopColor).toBe('rgb(69, 183, 209)')
  })

  it('renders a terminal container', () => {
    render(<TeammateTerminalPane agent={makeAgent()} />, { wrapper })
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
  })

  it('calls useTeammateTerminal with tabId and paneId', async () => {
    const { useTeammateTerminal } = await import('../../../renderer/src/hooks/useTeammateTerminal')
    render(<TeammateTerminalPane agent={makeAgent({ paneId: '%5' })} />, { wrapper })

    expect(useTeammateTerminal).toHaveBeenCalledWith('tab-default', '%5', expect.any(Object))
  })
})
