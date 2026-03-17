import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import Sidebar from '../../../renderer/src/components/Sidebar'

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: {
      fileTreeRequest: vi.fn().mockResolvedValue([]),
      onFileChanged: vi.fn(() => vi.fn()),
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn(),
      agentRestart: vi.fn(),
      agentResize: vi.fn(),
      fileRead: vi.fn(),
      fileWrite: vi.fn(),
      gitDiff: vi.fn(),
      gitStatus: vi.fn(),
      teamStart: vi.fn(),
      teamStop: vi.fn(),
      onAgentOutput: vi.fn(() => vi.fn()),
      onAgentStatusChange: vi.fn(() => vi.fn()),
      onAgentInputNeeded: vi.fn(() => vi.fn()),
      onFileTreeUpdate: vi.fn(() => vi.fn()),
      onGitStatusUpdate: vi.fn(() => vi.fn())
    },
    writable: true,
    configurable: true
  })
})

function renderSidebar() {
  return render(
    <AppProvider>
      <Sidebar />
    </AppProvider>
  )
}

describe('Sidebar', () => {
  it('renders with sidebar testid', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })

  it('has Agents and Files sections', () => {
    renderSidebar()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Files')).toBeInTheDocument()
  })

  it('has a resize handle', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-resize-handle')).toBeInTheDocument()
  })

  it('collapses sections when header is clicked', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const agentsHeader = screen.getByText('Agents')
    await user.click(agentsHeader)

    const agentsSection = screen.getByTestId('agents-section')
    expect(agentsSection).toHaveClass('collapsed')
  })

  it('expands collapsed section when header is clicked again', async () => {
    const user = userEvent.setup()
    renderSidebar()

    const agentsHeader = screen.getByText('Agents')
    await user.click(agentsHeader)
    await user.click(agentsHeader)

    const agentsSection = screen.getByTestId('agents-section')
    expect(agentsSection).not.toHaveClass('collapsed')
  })

  it('shows placeholder content for agent list', () => {
    renderSidebar()
    expect(screen.getByTestId('agents-placeholder')).toBeInTheDocument()
  })

  it('shows file tree component in files section', () => {
    renderSidebar()
    expect(screen.getByTestId('file-tree')).toBeInTheDocument()
  })

  it('resize handle triggers mouse events', () => {
    renderSidebar()
    const handle = screen.getByTestId('sidebar-resize-handle')
    expect(handle).toBeInTheDocument()

    fireEvent.mouseDown(handle, { clientX: 250 })
    fireEvent.mouseMove(document, { clientX: 300 })
    fireEvent.mouseUp(document)
  })
})
