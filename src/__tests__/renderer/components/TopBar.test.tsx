import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import TopBar from '../../../renderer/src/components/TopBar'

function renderTopBar() {
  return render(
    <AppProvider>
      <TopBar />
    </AppProvider>
  )
}

describe('TopBar', () => {
  it('renders the default project tab', () => {
    renderTopBar()
    expect(screen.getByText('~')).toBeInTheDocument()
  })

  it('renders feature tab buttons for Agents, Editor, Git', () => {
    renderTopBar()
    expect(screen.getByRole('button', { name: /agents/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /git/i })).toBeInTheDocument()
  })

  it('marks Agents as the default active feature tab', () => {
    renderTopBar()
    const agentsBtn = screen.getByRole('button', { name: /agents/i })
    expect(agentsBtn).toHaveClass('active')
  })

  it('switches active feature tab on click', async () => {
    const user = userEvent.setup()
    renderTopBar()

    const editorBtn = screen.getByRole('button', { name: /editor/i })
    await user.click(editorBtn)
    expect(editorBtn).toHaveClass('active')

    const agentsBtn = screen.getByRole('button', { name: /agents/i })
    expect(agentsBtn).not.toHaveClass('active')
  })

  it('renders the new tab (+) button', () => {
    renderTopBar()
    expect(screen.getByTestId('new-tab-button')).toBeInTheDocument()
  })

  it('shows status dot on default tab', () => {
    renderTopBar()
    const dot = screen.getByTestId('status-dot')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveAttribute('data-status', 'stopped')
  })
})
