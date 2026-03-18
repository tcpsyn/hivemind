import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

let capturedOutputCb: ((payload: { paneId: string; tabId: string; data: string }) => void) | null =
  null

beforeEach(() => {
  capturedOutputCb = null
  Object.defineProperty(window, 'api', {
    value: {
      agentInput: vi.fn().mockResolvedValue(undefined),
      sendTeammateInput: vi.fn().mockResolvedValue(undefined),
      onTeammateOutput: vi.fn(
        (cb: (payload: { paneId: string; tabId: string; data: string }) => void) => {
          capturedOutputCb = cb
          return vi.fn()
        }
      )
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

  describe('activity detection', () => {
    it('shows active status dot when teammate output arrives', async () => {
      vi.useFakeTimers()
      const agent = makeTeammate({ paneId: '%1' })
      renderCard(agent)

      // Simulate teammate output to trigger active state
      act(() => {
        capturedOutputCb?.({ paneId: '%1', tabId: 'tab-1', data: 'hello' })
      })

      expect(screen.getByTestId('teammate-status-dot')).toHaveClass('active')

      // After 2 seconds, active class should be removed
      await act(async () => {
        vi.advanceTimersByTime(2100)
      })

      expect(screen.getByTestId('teammate-status-dot')).not.toHaveClass('active')
      vi.useRealTimers()
    })
  })

  describe('formatLastActivity', () => {
    it('shows "Just now" for recent activity', () => {
      renderCard(makeTeammate({ lastActivity: Date.now() - 2000 }))
      expect(screen.getByTestId('teammate-last-activity')).toHaveTextContent('Just now')
    })

    it('shows seconds for activity < 60s ago', () => {
      renderCard(makeTeammate({ lastActivity: Date.now() - 30000 }))
      expect(screen.getByTestId('teammate-last-activity')).toHaveTextContent(/\d+s ago/)
    })

    it('shows minutes for activity < 60min ago', () => {
      renderCard(makeTeammate({ lastActivity: Date.now() - 300000 }))
      expect(screen.getByTestId('teammate-last-activity')).toHaveTextContent(/\d+m ago/)
    })

    it('shows hours for activity >= 60min ago', () => {
      renderCard(makeTeammate({ lastActivity: Date.now() - 7200000 }))
      expect(screen.getByTestId('teammate-last-activity')).toHaveTextContent(/\d+h ago/)
    })
  })

  describe('display variations', () => {
    it('shows model when available', () => {
      renderCard(makeTeammate({ model: 'Opus 4.6', agentType: undefined }))
      expect(screen.getByText('Opus 4.6')).toBeInTheDocument()
    })

    it('shows context percent when available', () => {
      renderCard(makeTeammate({ model: 'Opus 4.6', contextPercent: '25%' }))
      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('shows branch when available', () => {
      renderCard(makeTeammate({ branch: 'feature/test' }))
      expect(screen.getByText('feature/test')).toBeInTheDocument()
    })

    it('falls back to role when no model or agentType', () => {
      renderCard(makeTeammate({ model: undefined, agentType: undefined, role: 'Research agent' }))
      expect(screen.getByText('Research agent')).toBeInTheDocument()
    })
  })

  describe('tmux proxy (paneId) routing', () => {
    it('Approve sends input via sendTeammateInput when paneId exists', () => {
      renderCard(makeTeammate({ needsInput: true, paneId: '%1' }))
      fireEvent.click(screen.getByTestId('btn-approve'))
      expect(window.api.sendTeammateInput).toHaveBeenCalledWith({
        paneId: '%1',
        data: 'y\n'
      })
      expect(window.api.agentInput).not.toHaveBeenCalled()
    })

    it('Deny sends input via sendTeammateInput when paneId exists', () => {
      renderCard(makeTeammate({ needsInput: true, paneId: '%1' }))
      fireEvent.click(screen.getByTestId('btn-deny'))
      expect(window.api.sendTeammateInput).toHaveBeenCalledWith({
        paneId: '%1',
        data: 'n\n'
      })
      expect(window.api.agentInput).not.toHaveBeenCalled()
    })

    it('falls back to agentInput when no paneId', () => {
      renderCard(makeTeammate({ needsInput: true }))
      fireEvent.click(screen.getByTestId('btn-approve'))
      expect(window.api.agentInput).toHaveBeenCalledWith({
        agentId: 'teammate-1',
        data: 'y\n'
      })
      expect(window.api.sendTeammateInput).not.toHaveBeenCalled()
    })
  })
})
