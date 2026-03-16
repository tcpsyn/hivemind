import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../../renderer/src/App'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByTestId('topbar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
    expect(screen.getByTestId('bottombar')).toBeInTheDocument()
  })

  it('wraps content in AppProvider (no context errors)', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app-shell')).toBeInTheDocument()
  })
})
