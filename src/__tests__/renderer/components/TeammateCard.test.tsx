import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeammateCard } from '../../../renderer/src/components/TeammateCard'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'

function makeTeammate(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'teammate-1',
    name: 'researcher',
    role: 'Research agent',
    avatar: 'robot-2',
    color: '#4ecdc4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    isTeammate: true,
    agentType: 'Explore',
    ...overrides
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: {
      agentInput: vi.fn().mockResolvedValue(undefined)
    },
    writable: true,
    configurable: true
  })
})

function renderCard(
  agent: AgentState,
  props: { isSelected?: boolean; onSelect?: () => void } = {}
) {
  return render(
    <AppProvider>
      <TeammateCard
        agent={agent}
        isSelected={props.isSelected ?? false}
        onSelect={props.onSelect ?? vi.fn()}
      />
    </AppProvider>
  )
}

describe('TeammateCard', () => {
  it('renders agent name and type', () => {
    renderCard(makeTeammate())
    expect(screen.getByText('researcher')).toBeInTheDocument()
    expect(screen.getByText('Explore')).toBeInTheDocument()
  })

  it('renders avatar', () => {
    renderCard(makeTeammate())
    expect(screen.getByTestId('agent-avatar')).toBeInTheDocument()
  })

  it('renders status dot with correct class', () => {
    renderCard(makeTeammate({ status: 'running' }))
    expect(screen.getByTestId('teammate-status-dot')).toHaveClass('running')
  })

  it('shows last activity text', () => {
    renderCard(makeTeammate({ lastActivity: Date.now() }))
    expect(screen.getByTestId('teammate-last-activity')).toBeInTheDocument()
  })

  it('applies selected class when isSelected', () => {
    renderCard(makeTeammate(), { isSelected: true })
    expect(screen.getByTestId('teammate-card-teammate-1')).toHaveClass('selected')
  })

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    renderCard(makeTeammate(), { onSelect })
    fireEvent.click(screen.getByTestId('teammate-card-teammate-1'))
    expect(onSelect).toHaveBeenCalled()
  })

  describe('needs-input state', () => {
    it('shows amber styling when needs input', () => {
      renderCard(makeTeammate({ needsInput: true }))
      expect(screen.getByTestId('teammate-card-teammate-1')).toHaveClass('needs-input')
    })

    it('shows Approve and Deny buttons when needs input', () => {
      renderCard(makeTeammate({ needsInput: true }))
      expect(screen.getByTestId('btn-approve')).toBeInTheDocument()
      expect(screen.getByTestId('btn-deny')).toBeInTheDocument()
    })

    it('does not show Approve/Deny when not needing input', () => {
      renderCard(makeTeammate({ needsInput: false }))
      expect(screen.queryByTestId('btn-approve')).not.toBeInTheDocument()
      expect(screen.queryByTestId('btn-deny')).not.toBeInTheDocument()
    })

    it('Approve button sends y to agent PTY', () => {
      renderCard(makeTeammate({ needsInput: true }))
      fireEvent.click(screen.getByTestId('btn-approve'))
      expect(window.api.agentInput).toHaveBeenCalledWith({
        agentId: 'teammate-1',
        data: 'y\n'
      })
    })

    it('Deny button sends n to agent PTY', () => {
      renderCard(makeTeammate({ needsInput: true }))
      fireEvent.click(screen.getByTestId('btn-deny'))
      expect(window.api.agentInput).toHaveBeenCalledWith({
        agentId: 'teammate-1',
        data: 'n\n'
      })
    })

    it('Approve button does not trigger onSelect (no focus steal)', () => {
      const onSelect = vi.fn()
      renderCard(makeTeammate({ needsInput: true }), { onSelect })
      fireEvent.click(screen.getByTestId('btn-approve'))
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('Deny button does not trigger onSelect (no focus steal)', () => {
      const onSelect = vi.fn()
      renderCard(makeTeammate({ needsInput: true }), { onSelect })
      fireEvent.click(screen.getByTestId('btn-deny'))
      expect(onSelect).not.toHaveBeenCalled()
    })
  })
})
