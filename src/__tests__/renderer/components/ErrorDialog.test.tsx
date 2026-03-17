import { describe, it, expect, vi } from 'vitest'
import { render, screen, userEvent } from '../../helpers'
import ErrorDialog from '../../../renderer/src/components/ErrorDialog'

describe('ErrorDialog', () => {
  const defaultProps = {
    title: 'PTY Spawn Failed',
    message: 'Failed to create a new terminal session.',
    onDismiss: vi.fn()
  }

  it('renders with title and message', () => {
    render(<ErrorDialog {...defaultProps} />)
    expect(screen.getByText('PTY Spawn Failed')).toBeInTheDocument()
    expect(screen.getByText('Failed to create a new terminal session.')).toBeInTheDocument()
  })

  it('renders details when provided', () => {
    render(<ErrorDialog {...defaultProps} details="ENOENT: spawn claude not found" />)
    expect(screen.getByTestId('error-dialog-details')).toHaveTextContent(
      'ENOENT: spawn claude not found'
    )
  })

  it('does not render details when not provided', () => {
    render(<ErrorDialog {...defaultProps} />)
    expect(screen.queryByTestId('error-dialog-details')).not.toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn()
    render(<ErrorDialog {...defaultProps} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByTestId('error-dialog-dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss when overlay is clicked', async () => {
    const onDismiss = vi.fn()
    render(<ErrorDialog {...defaultProps} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByTestId('error-dialog-overlay'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss on Escape key', async () => {
    const onDismiss = vi.fn()
    render(<ErrorDialog {...defaultProps} onDismiss={onDismiss} />)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('has alertdialog role', () => {
    render(<ErrorDialog {...defaultProps} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('dismiss button says Dismiss', () => {
    render(<ErrorDialog {...defaultProps} />)
    expect(screen.getByTestId('error-dialog-dismiss')).toHaveTextContent('Dismiss')
  })
})
