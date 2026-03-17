import { AppProvider } from './state/AppContext'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'

function App(): React.JSX.Element {
  return (
    <ErrorBoundary fallbackLabel="Application error">
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
