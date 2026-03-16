import { render, type RenderOptions } from '@testing-library/react'
import { type ReactElement } from 'react'
import { AppProvider } from '../../renderer/src/state/AppContext'

function AllProviders({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export { customRender as render }
export { screen, within, waitFor, act } from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
