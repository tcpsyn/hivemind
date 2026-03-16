import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import Sidebar from '../../../renderer/src/components/Sidebar'

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

  it('shows placeholder content for file tree', () => {
    renderSidebar()
    expect(screen.getByTestId('files-placeholder')).toBeInTheDocument()
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
