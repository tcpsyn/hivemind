import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

interface ErrorBoundaryProps {
  children: ReactNode
  fallbackLabel?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" data-testid="error-boundary-fallback">
          <div className="error-boundary-content">
            <span className="error-boundary-icon">!</span>
            <span className="error-boundary-label">
              {this.props.fallbackLabel ?? 'Something went wrong'}
            </span>
            <span className="error-boundary-message">{this.state.error?.message}</span>
            <button
              className="error-boundary-retry"
              data-testid="error-boundary-retry"
              onClick={this.handleRetry}
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
