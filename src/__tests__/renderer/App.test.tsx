import { describe, it, expect } from 'vitest'
import { render, screen } from '../helpers'
import App from '../../renderer/src/App'

describe('App', () => {
  it('renders the app title', () => {
    render(<App />)
    expect(screen.getByText('Claude Frontend')).toBeInTheDocument()
  })

  it('has the app class on the root element', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app')).toBeInTheDocument()
  })
})
