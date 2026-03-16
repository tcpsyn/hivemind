import { render, type RenderOptions } from '@testing-library/react'
import { type ReactElement } from 'react'

function AllProviders({ children }: { children: React.ReactNode }) {
  // Add context providers here as the app grows
  // e.g., <AppStateProvider><ThemeProvider>{children}</ThemeProvider></AppStateProvider>
  return <>{children}</>
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export { customRender as render }
export { screen, within, waitFor, act } from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
