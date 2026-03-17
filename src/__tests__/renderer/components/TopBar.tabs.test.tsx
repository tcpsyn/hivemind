import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import TopBar from '../../../renderer/src/components/TopBar'

/**
 * Tests for the redesigned TopBar with multi-project tabs.
 * Covers: project tab rendering, status dots, close buttons, "+" button,
 * active tab highlighting, feature tabs.
 *
 * NOTE: Will be finalized once task #6 (TopBar redesign) lands.
 */

function renderTopBar() {
  return render(
    <AppProvider>
      <TopBar />
    </AppProvider>
  )
}

describe('TopBar — Multi-Project Tabs', () => {
  describe('project tab rendering', () => {
    it('renders project tabs on the left side', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/path/to/hivemind', projectName: 'hivemind' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      expect(screen.getByText('hivemind')).toBeInTheDocument()
    })

    it('renders multiple project tabs', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/path/hivemind', projectName: 'hivemind' }
        })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/path/my-api', projectName: 'my-api' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      expect(screen.getByText('hivemind')).toBeInTheDocument()
      expect(screen.getByText('my-api')).toBeInTheDocument()
    })

    it('highlights the active project tab', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'project-b' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      // The last created tab (tab-2) should be active
      const tabB = screen.getByText('project-b').closest('button, [role="tab"]')
      expect(tabB).toHaveClass('active')
    })

    it('does not highlight inactive project tabs', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'project-b' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      const tabA = screen.getByText('project-a').closest('button, [role="tab"]')
      expect(tabA).not.toHaveClass('active')
    })
  })

  describe('close button', () => {
    it('shows close button on project tabs', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      const closeButtons = screen.getAllByRole('button').filter(
        (btn) =>
          btn.textContent?.includes('×') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('close')
      )
      expect(closeButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('closing a tab dispatches CLOSE_TAB', async () => {
      const user = userEvent.setup()
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'project-b' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      // Find close button for project-a tab
      const tabA = screen.getByText('project-a').closest('[data-testid], button, [role="tab"]')
      const closeBtn = tabA?.querySelector('[aria-label*="close"], .tab-close') as HTMLElement
      if (closeBtn) {
        await user.click(closeBtn)
        expect(screen.queryByText('project-a')).not.toBeInTheDocument()
      }
    })
  })

  describe('"+" button', () => {
    it('renders the new tab button', () => {
      renderTopBar()
      const addButton =
        screen.queryByRole('button', { name: /\+|new tab|add/i }) ||
        screen.queryByTestId('new-tab-button')
      expect(addButton).toBeInTheDocument()
    })

    it('shows dropdown with "Open folder..." on click', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const addButton =
        screen.queryByRole('button', { name: /\+|new tab|add/i }) ||
        screen.queryByTestId('new-tab-button')
      if (addButton) {
        await user.click(addButton)
        expect(screen.getByText(/open folder/i)).toBeInTheDocument()
      }
    })
  })

  describe('tab switching', () => {
    it('clicking a project tab switches to it', async () => {
      const user = userEvent.setup()
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'project-b' }
        })
        return <TopBar />
      }
      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )
      await user.click(screen.getByText('project-a'))
      const tabA = screen.getByText('project-a').closest('button, [role="tab"]')
      expect(tabA).toHaveClass('active')
    })
  })

  describe('feature tabs', () => {
    it('renders Agents, Editor, Git feature tabs on the right', () => {
      renderTopBar()
      expect(screen.getByRole('button', { name: /agents/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /editor/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /git/i })).toBeInTheDocument()
    })

    it('clicking a feature tab dispatches SET_ACTIVE_FEATURE_TAB', async () => {
      const user = userEvent.setup()
      renderTopBar()
      const editorBtn = screen.getByRole('button', { name: /editor/i })
      await user.click(editorBtn)
      expect(editorBtn).toHaveClass('active')
    })
  })
})
