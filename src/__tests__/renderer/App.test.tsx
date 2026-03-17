import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../../renderer/src/App'

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
