import { AppProvider } from './state/AppContext'
import AppShell from './components/AppShell'

function App(): React.JSX.Element {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

export default App
