import { useEffect, useRef } from 'react'
import './ErrorDialog.css'

interface ErrorDialogProps {
  title: string
  message: string
  details?: string
  onDismiss: () => void
}

export default function ErrorDialog({ title, message, details, onDismiss }: ErrorDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <div className="error-dialog-overlay" data-testid="error-dialog-overlay" onClick={onDismiss}>
      <div
        className="error-dialog"
        data-testid="error-dialog"
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="error-dialog-header">
          <span className="error-dialog-icon">!</span>
          <span className="error-dialog-title">{title}</span>
        </div>
        <div className="error-dialog-body">
          <p className="error-dialog-message">{message}</p>
          {details && (
            <pre className="error-dialog-details" data-testid="error-dialog-details">
              {details}
            </pre>
          )}
        </div>
        <div className="error-dialog-footer">
          <button
            className="error-dialog-dismiss"
            data-testid="error-dialog-dismiss"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
