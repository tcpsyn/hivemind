import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import TopBar from '../../../renderer/src/components/TopBar'

const mockTabCreate = vi.fn()
const mockTeamStart = vi.fn()
const mockOpenFolderDialog = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockTabCreate.mockResolvedValue({ tabId: 'new-tab', projectPath: '/test', projectName: 'test' })
  mockTeamStart.mockResolvedValue({ agents: [] })
  mockOpenFolderDialog.mockResolvedValue(null)

  Object.defineProperty(window, 'api', {
    value: {
      tabCreate: mockTabCreate,
      teamStart: mockTeamStart,
      openFolderDialog: mockOpenFolderDialog
    },
    writable: true,
    configurable: true
  })
})

function renderTopBar() {
  return render(
    <AppProvider>
      <TopBar />
    </AppProvider>
  )
}

describe('TopBar — error handling', () => {
  describe('openFolder', () => {
    it('does nothing when folder dialog returns null', async () => {
      const user = userEvent.setup()
      renderTopBar()

      const addButton = screen.getByTestId('new-tab-button')
      await user.click(addButton)

      const openFolder = screen.getByText(/open folder/i)
      await user.click(openFolder)

      expect(mockOpenFolderDialog).toHaveBeenCalled()
      expect(mockTabCreate).not.toHaveBeenCalled()
    })

    it('creates tab and starts team when folder is selected', async () => {
      const user = userEvent.setup()
      mockOpenFolderDialog.mockResolvedValue('/selected/path')

      renderTopBar()

      const addButton = screen.getByTestId('new-tab-button')
      await user.click(addButton)

      const openFolder = screen.getByText(/open folder/i)
      await user.click(openFolder)

      await waitFor(() => {
        expect(mockTabCreate).toHaveBeenCalledWith({ projectPath: '/selected/path' })
      })
      await waitFor(() => {
        expect(mockTeamStart).toHaveBeenCalled()
      })
    })
  })

  describe('closeTab', () => {
    it('prompts confirmation when closing a running team tab', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'project-a' }
        })
        dispatch({ type: 'SET_TEAM_STATUS', payload: 'running', tabId: 'tab-1' })
        return <TopBar />
      }

      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )

      // Find the close button for the tab
      const closeBtn = screen.getByLabelText('Close project-a')
      await user.click(closeBtn)

      expect(confirmSpy).toHaveBeenCalled()
      // Tab should still exist since user clicked cancel
      expect(screen.getByText('project-a')).toBeInTheDocument()

      confirmSpy.mockRestore()
    })

    it('closes tab without confirmation when team is stopped', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm')

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

      const closeBtn = screen.getByLabelText('Close project-a')
      await user.click(closeBtn)

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(screen.queryByText('project-a')).not.toBeInTheDocument()

      confirmSpy.mockRestore()
    })
  })

  describe('new tab menu', () => {
    it('closes menu when clicking outside', async () => {
      const user = userEvent.setup()
      renderTopBar()

      const addButton = screen.getByTestId('new-tab-button')
      await user.click(addButton)

      expect(screen.getByTestId('new-tab-menu')).toBeInTheDocument()

      // Click outside the menu
      await user.click(document.body)

      await waitFor(() => {
        expect(screen.queryByTestId('new-tab-menu')).not.toBeInTheDocument()
      })
    })

    it('toggles menu on repeated clicks of + button', async () => {
      const user = userEvent.setup()
      renderTopBar()

      const addButton = screen.getByTestId('new-tab-button')

      await user.click(addButton)
      expect(screen.getByTestId('new-tab-menu')).toBeInTheDocument()

      await user.click(addButton)
      expect(screen.queryByTestId('new-tab-menu')).not.toBeInTheDocument()
    })
  })

  describe('status dots', () => {
    it('renders status dot with correct color for running team', () => {
      const Wrapper = () => {
        const dispatch = useAppDispatch()
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'my-project' }
        })
        dispatch({ type: 'SET_TEAM_STATUS', payload: 'running', tabId: 'tab-1' })
        return <TopBar />
      }

      render(
        <AppProvider>
          <Wrapper />
        </AppProvider>
      )

      const dots = screen.getAllByTestId('status-dot')
      const runningDot = dots.find((d) => d.getAttribute('data-status') === 'running')
      expect(runningDot).toBeDefined()
      expect(runningDot).toHaveAttribute('data-status', 'running')
    })
  })
})
