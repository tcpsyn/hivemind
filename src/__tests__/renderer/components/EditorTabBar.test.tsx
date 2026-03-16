import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, initialAppState, type ExtendedAppState } from '../../../renderer/src/state/AppContext'
import EditorTabBar from '../../../renderer/src/components/EditorTabBar'
import type { EditorTab } from '../../../shared/types'

function createTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'tab-1',
    filePath: '/src/index.ts',
    fileName: 'index.ts',
    language: 'typescript',
    isModified: false,
    isReadOnly: true,
    ...overrides
  }
}

function renderWithTabs(tabs: EditorTab[], activeFileId: string | null = null) {
  const stateWithTabs: ExtendedAppState = {
    ...initialAppState,
    editor: {
      openFiles: tabs,
      activeFileId: activeFileId ?? (tabs.length > 0 ? tabs[0].id : null)
    }
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <AppProvider initialState={stateWithTabs}>{children}</AppProvider>
  }

  return render(<EditorTabBar />, { wrapper: Wrapper })
}

describe('EditorTabBar', () => {
  it('renders tabs for each open file', () => {
    const tabs = [
      createTab({ id: 'tab-1', fileName: 'index.ts' }),
      createTab({ id: 'tab-2', fileName: 'App.tsx', filePath: '/src/App.tsx' })
    ]

    renderWithTabs(tabs, 'tab-1')

    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    const tabs = [
      createTab({ id: 'tab-1', fileName: 'index.ts' }),
      createTab({ id: 'tab-2', fileName: 'App.tsx' })
    ]

    renderWithTabs(tabs, 'tab-2')

    const activeTab = screen.getByTestId('editor-tab-tab-2')
    expect(activeTab).toHaveClass('active')

    const inactiveTab = screen.getByTestId('editor-tab-tab-1')
    expect(inactiveTab).not.toHaveClass('active')
  })

  it('clicking a tab switches the active tab', async () => {
    const user = userEvent.setup()
    const tabs = [
      createTab({ id: 'tab-1', fileName: 'index.ts' }),
      createTab({ id: 'tab-2', fileName: 'App.tsx' })
    ]

    renderWithTabs(tabs, 'tab-1')

    await user.click(screen.getByText('App.tsx'))

    const tab2 = screen.getByTestId('editor-tab-tab-2')
    expect(tab2).toHaveClass('active')
  })

  it('shows modified indicator dot when file is modified', () => {
    const tabs = [createTab({ id: 'tab-1', fileName: 'index.ts', isModified: true })]
    renderWithTabs(tabs, 'tab-1')

    const indicator = screen.getByTestId('modified-indicator-tab-1')
    expect(indicator).toBeInTheDocument()
  })

  it('does not show modified indicator for unmodified files', () => {
    const tabs = [createTab({ id: 'tab-1', fileName: 'index.ts', isModified: false })]
    renderWithTabs(tabs, 'tab-1')

    expect(screen.queryByTestId('modified-indicator-tab-1')).not.toBeInTheDocument()
  })

  it('clicking close button removes the tab', async () => {
    const user = userEvent.setup()
    const tabs = [
      createTab({ id: 'tab-1', fileName: 'index.ts' }),
      createTab({ id: 'tab-2', fileName: 'App.tsx' })
    ]

    renderWithTabs(tabs, 'tab-1')

    const closeBtn = screen.getByTestId('close-tab-tab-1')
    await user.click(closeBtn)

    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('renders empty when no tabs are open', () => {
    const { container } = renderWithTabs([])
    const tabBar = container.querySelector('.editor-tab-bar')
    expect(tabBar).toBeInTheDocument()
    expect(tabBar?.children.length).toBe(0)
  })

  it('close button does not propagate click to tab switch', async () => {
    const user = userEvent.setup()
    const tabs = [
      createTab({ id: 'tab-1', fileName: 'index.ts' }),
      createTab({ id: 'tab-2', fileName: 'App.tsx' })
    ]

    renderWithTabs(tabs, 'tab-2')

    // Close tab-1 (inactive). Active should remain tab-2
    const closeBtn = screen.getByTestId('close-tab-tab-1')
    await user.click(closeBtn)

    const tab2 = screen.getByTestId('editor-tab-tab-2')
    expect(tab2).toHaveClass('active')
  })
})
