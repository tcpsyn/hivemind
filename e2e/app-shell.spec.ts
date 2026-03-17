import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { launchApp } from './helpers'

test.describe('App Shell', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    ;({ electronApp, window } = await launchApp())
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('app launches and shows main window', async () => {
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length
    })
    expect(windowCount).toBe(1)
  })

  test('window has correct minimum dimensions', async () => {
    const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return win.getBounds()
    })
    expect(bounds.width).toBeGreaterThanOrEqual(800)
    expect(bounds.height).toBeGreaterThanOrEqual(600)
  })

  test('renders TopBar with tab buttons', async () => {
    const topbar = window.locator('[data-testid="topbar"]')
    await expect(topbar).toBeVisible()

    const agentsTab = topbar.locator('button.topbar-tab', { hasText: 'Agents' })
    const editorTab = topbar.locator('button.topbar-tab', { hasText: 'Editor' })
    const gitTab = topbar.locator('button.topbar-tab', { hasText: 'Git' })

    await expect(agentsTab).toBeVisible()
    await expect(editorTab).toBeVisible()
    await expect(gitTab).toBeVisible()
  })

  test('Agents tab is active by default', async () => {
    const agentsTab = window.locator('[data-testid="topbar"] button.topbar-tab', {
      hasText: 'Agents'
    })
    await expect(agentsTab).toHaveClass(/active/)
  })

  test('renders Sidebar with Agents and Files sections', async () => {
    const sidebar = window.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible()

    const agentsSection = window.locator('[data-testid="agents-section"]')
    await expect(agentsSection).toBeVisible()

    const filesSection = window.locator('[data-testid="files-section"]')
    await expect(filesSection).toBeVisible()
  })

  test('renders BottomBar with no-agents message', async () => {
    const bottombar = window.locator('[data-testid="bottombar"]')
    await expect(bottombar).toBeVisible()
    await expect(bottombar).toContainText('No agents')
  })

  test('renders main content area', async () => {
    const mainContent = window.locator('[data-testid="main-content"]')
    await expect(mainContent).toBeVisible()
  })

  test('applies dark theme', async () => {
    const bgColor = await window.evaluate(() => {
      const shell = document.querySelector('.app-shell')
      return shell ? getComputedStyle(shell).backgroundColor : ''
    })
    expect(bgColor).toBeTruthy()
  })

  test('sidebar toggle button is present', async () => {
    const toggle = window.locator('[data-testid="sidebar-toggle"]')
    await expect(toggle).toBeVisible()
  })

  test('sidebar resize handle is present', async () => {
    const handle = window.locator('[data-testid="sidebar-resize-handle"]')
    await expect(handle).toBeVisible()
  })

  test('sidebar sections can be collapsed and expanded', async () => {
    const agentsHeader = window.locator(
      '[data-testid="agents-section"] .sidebar-section-header'
    )
    const agentsBody = window.locator('[data-testid="agents-placeholder"]')

    // Should be expanded initially
    await expect(agentsBody).toBeVisible()

    // Collapse Agents section
    await agentsHeader.click()
    await expect(agentsBody).not.toBeVisible()

    // Re-expand
    await agentsHeader.click()
    await expect(agentsBody).toBeVisible()
  })

  test('clicking tab buttons switches active tab', async () => {
    const topbar = window.locator('[data-testid="topbar"]')
    const editorTab = topbar.locator('button.topbar-tab', { hasText: 'Editor' })
    const agentsTab = topbar.locator('button.topbar-tab', { hasText: 'Agents' })
    const gitTab = topbar.locator('button.topbar-tab', { hasText: 'Git' })

    await editorTab.click()
    await expect(editorTab).toHaveClass(/active/)
    await expect(agentsTab).not.toHaveClass(/active/)

    await gitTab.click()
    await expect(gitTab).toHaveClass(/active/)
    await expect(editorTab).not.toHaveClass(/active/)

    // Restore to Agents tab
    await agentsTab.click()
    await expect(agentsTab).toHaveClass(/active/)
  })

  test('empty agent list shows placeholder text', async () => {
    const agentList = window.locator('[data-testid="agent-list"]')
    await expect(agentList).toContainText('No agents')
  })

  test('sidebar toggle collapses and expands sidebar', async () => {
    const sidebar = window.locator('[data-testid="sidebar"]')
    const toggle = window.locator('[data-testid="sidebar-toggle"]')

    await expect(sidebar).not.toHaveClass(/collapsed/)

    await toggle.click()
    await expect(sidebar).toHaveClass(/collapsed/)

    await toggle.click()
    await expect(sidebar).not.toHaveClass(/collapsed/)
  })
})
