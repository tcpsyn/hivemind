import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import AgentListItem from '../../../renderer/src/components/AgentListItem'
import type { AgentState } from '../../../shared/types'

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'architect',
    role: 'Lead architect',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    ...overrides
  }
}

function renderItem(
  agent: AgentState,
  props: {
    onClick?: () => void
    onAgentContextMenu?: (agentId: string, action: string) => void
  } = {}
) {
  return render(
    <AppProvider>
      <AgentListItem agent={agent} agentId={agent.id} {...props} />
    </AppProvider>
  )
}

describe('AgentListItem', () => {
  it('renders agent name', () => {
    renderItem(makeAgent())
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('renders agent role', () => {
    renderItem(makeAgent())
    expect(screen.getByText('Lead architect')).toBeInTheDocument()
  })

  it('renders avatar SVG', () => {
    const { container } = renderItem(makeAgent())
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('shows colored left border matching agent color', () => {
    renderItem(makeAgent({ color: '#4ECDC4' }))
    const item = screen.getByTestId('agent-list-item-agent-1')
    expect(item.style.borderLeftColor).toBeTruthy()
  })

  it('renders status badge with running class', () => {
    renderItem(makeAgent({ status: 'running' }))
    const badge = screen.getByTestId('status-badge')
    expect(badge).toHaveClass('running')
  })

  it('renders status badge with idle class', () => {
    renderItem(makeAgent({ status: 'idle' }))
    const badge = screen.getByTestId('status-badge')
    expect(badge).toHaveClass('idle')
  })

  it('renders status badge with waiting class', () => {
    renderItem(makeAgent({ status: 'waiting', needsInput: true }))
    const badge = screen.getByTestId('status-badge')
    expect(badge).toHaveClass('waiting')
  })

  it('renders status badge with stopped class', () => {
    renderItem(makeAgent({ status: 'stopped' }))
    const badge = screen.getByTestId('status-badge')
    expect(badge).toHaveClass('stopped')
  })

  it('applies pulse animation class when needsInput is true', () => {
    renderItem(makeAgent({ status: 'waiting', needsInput: true }))
    const item = screen.getByTestId('agent-list-item-agent-1')
    expect(item).toHaveClass('needs-input')
  })

  it('does not apply pulse class when needsInput is false', () => {
    renderItem(makeAgent({ needsInput: false }))
    const item = screen.getByTestId('agent-list-item-agent-1')
    expect(item).not.toHaveClass('needs-input')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderItem(makeAgent(), { onClick })

    await user.click(screen.getByTestId('agent-list-item-agent-1'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows context menu on right-click', async () => {
    renderItem(makeAgent())
    const item = screen.getByTestId('agent-list-item-agent-1')

    fireEvent.contextMenu(item)

    expect(screen.getByText('Restart')).toBeInTheDocument()
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('View History')).toBeInTheDocument()
  })

  it('calls onAgentContextMenu with agentId and action when menu item clicked', async () => {
    const onAgentContextMenu = vi.fn()
    const user = userEvent.setup()
    renderItem(makeAgent(), { onAgentContextMenu })

    const item = screen.getByTestId('agent-list-item-agent-1')
    fireEvent.contextMenu(item)

    await user.click(screen.getByText('Restart'))
    expect(onAgentContextMenu).toHaveBeenCalledWith('agent-1', 'restart')
  })

  it('hides context menu when clicking outside', async () => {
    const user = userEvent.setup()
    renderItem(makeAgent())

    const item = screen.getByTestId('agent-list-item-agent-1')
    fireEvent.contextMenu(item)
    expect(screen.getByText('Restart')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByText('Restart')).not.toBeInTheDocument()
  })

  it('displays status text', () => {
    renderItem(makeAgent({ status: 'running' }))
    expect(screen.getByText('Running')).toBeInTheDocument()
  })
})
