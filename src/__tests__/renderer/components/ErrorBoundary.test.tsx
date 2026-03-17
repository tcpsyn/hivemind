import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../helpers'

// Must import directly since ErrorBoundary is a class component
import ErrorBoundary from '../../../renderer/src/components/ErrorBoundary'

function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test explosion')
  return <div>Content is fine</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test explosion')).toBeInTheDocument()
  })

  it('renders custom fallback label', () => {
    render(
      <ErrorBoundary fallbackLabel="Terminal grid error">
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText('Terminal grid error')).toBeInTheDocument()
  })

  it('recovers on retry click', async () => {
    const { userEvent } = await import('../../helpers')

    // We need to track whether to throw. Use a ref-like approach.
    let shouldThrow = true
    function Conditional() {
      if (shouldThrow) throw new Error('Boom')
      return <div>Recovered content</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>
    )

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument()

    // Set shouldThrow to false before clicking retry
    shouldThrow = false

    await userEvent.click(screen.getByTestId('error-boundary-retry'))

    // After retry, it re-renders children — since shouldThrow is false, should succeed
    rerender(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>
    )

    // The retry resets state, re-renders children
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument()
  })

  it('shows retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('error-boundary-retry')).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-retry')).toHaveTextContent('Retry')
  })
})
