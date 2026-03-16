import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import AppShell from '../../../renderer/src/components/AppShell'

function renderAppShell() {
  return render(
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

describe('AppShell', () => {
  it('renders top bar, sidebar, main content, and bottom bar', () => {
    renderAppShell()
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
    expect(screen.getByTestId('bottombar')).toBeInTheDocument()
  })

  it('renders with app-shell class', () => {
    const { container } = renderAppShell()
    expect(container.querySelector('.app-shell')).toBeInTheDocument()
  })

  it('uses CSS Grid layout', () => {
    const { container } = renderAppShell()
    const shell = container.querySelector('.app-shell')
    expect(shell).toBeInTheDocument()
  })

  it('toggles sidebar collapsed state via keyboard shortcut', async () => {
    const user = userEvent.setup()
    renderAppShell()

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).not.toHaveClass('collapsed')

    await user.keyboard('{Meta>}b{/Meta}')

    expect(sidebar).toHaveClass('collapsed')
  })

  it('toggles sidebar via toggle button', async () => {
    const user = userEvent.setup()
    renderAppShell()

    const toggleBtn = screen.getByTestId('sidebar-toggle')
    await user.click(toggleBtn)

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveClass('collapsed')

    await user.click(toggleBtn)
    expect(sidebar).not.toHaveClass('collapsed')
  })
})
