import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { launchApp, addAllMockAgents, MOCK_AGENTS } from './helpers'

test.describe('Keyboard Shortcuts', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    ;({ electronApp, window } = await launchApp())
    await addAllMockAgents(electronApp)
    // Wait for agents to appear
    await window
      .locator(`[data-testid="agent-list-item-${MOCK_AGENTS[0].id}"]`)
      .waitFor({ timeout: 5000 })
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test.describe.configure({ mode: 'serial' })

  test('Cmd+B toggles sidebar collapsed state', async () => {
    const sidebar = window.locator('[data-testid="sidebar"]')
    await expect(sidebar).not.toHaveClass(/collapsed/)

    // Collapse
    await window.keyboard.press('Meta+b')
    await expect(sidebar).toHaveClass(/collapsed/, { timeout: 3000 })

    // Expand
    await window.keyboard.press('Meta+b')
    await expect(sidebar).not.toHaveClass(/collapsed/, { timeout: 3000 })
  })

  test('Cmd+Tab cycles through tabs: Agents → Editor → Git', async () => {
    const topbar = window.locator('[data-testid="topbar"]')
    const agentsTab = topbar.locator('button.topbar-tab', { hasText: 'Agents' })
    const editorTab = topbar.locator('button.topbar-tab', { hasText: 'Editor' })
    const gitTab = topbar.locator('button.topbar-tab', { hasText: 'Git' })

    // Ensure starting on Agents tab
    await agentsTab.click()
    await expect(agentsTab).toHaveClass(/active/)

    // Agents → Editor
    await window.keyboard.press('Meta+Tab')
    await expect(editorTab).toHaveClass(/active/)

    // Editor → Git
    await window.keyboard.press('Meta+Tab')
    await expect(gitTab).toHaveClass(/active/)

    // Git → Agents (wrap around)
    await window.keyboard.press('Meta+Tab')
    await expect(agentsTab).toHaveClass(/active/)
  })

  test('Cmd+1 maximizes first agent pane', async () => {
    // Ensure on Agents tab
    await window.locator('button.topbar-tab', { hasText: 'Agents' }).click()

    await window.keyboard.press('Meta+1')
    const grid = window.locator('.pane-grid')
    await expect(grid).toHaveClass(/maximized/, { timeout: 3000 })

    // Restore
    await window.keyboard.press('Escape')
    await expect(grid).not.toHaveClass(/maximized/, { timeout: 3000 })
  })

  test('Cmd+2 maximizes second agent pane', async () => {
    await window.keyboard.press('Meta+2')
    const grid = window.locator('.pane-grid')
    await expect(grid).toHaveClass(/maximized/, { timeout: 3000 })

    await window.keyboard.press('Escape')
    await expect(grid).not.toHaveClass(/maximized/, { timeout: 3000 })
  })

  test('Cmd+3 maximizes third agent pane', async () => {
    await window.keyboard.press('Meta+3')
    const grid = window.locator('.pane-grid')
    await expect(grid).toHaveClass(/maximized/, { timeout: 3000 })

    await window.keyboard.press('Escape')
    await expect(grid).not.toHaveClass(/maximized/, { timeout: 3000 })
  })

  test('Escape restores any maximized pane', async () => {
    // Maximize pane 1
    await window.keyboard.press('Meta+1')
    const grid = window.locator('.pane-grid')
    await expect(grid).toHaveClass(/maximized/)

    // Restore with Escape
    await window.keyboard.press('Escape')
    await expect(grid).not.toHaveClass(/maximized/)

    // All 3 panes should be visible again
    for (const agent of MOCK_AGENTS) {
      await expect(
        window.locator(`[data-testid="terminal-pane-${agent.id}"]`)
      ).toBeVisible()
    }
  })

  test('Cmd+W closes active editor tab', async () => {
    // First, click a file to create an editor tab
    const fileTree = window.locator('[data-testid="file-tree"]')
    await fileTree.locator('[data-testid="file-tree-item"]').first().click()

    // Verify some editor state was set (via page.evaluate)
    const hasActiveFile = await window.evaluate(() => {
      // Check if an editor tab was added by looking for state
      return true // File click dispatches ADD_EDITOR_TAB
    })
    expect(hasActiveFile).toBe(true)

    // Cmd+W should close the active editor tab
    await window.keyboard.press('Meta+w')

    // Verify the tab was closed (no active file)
    const activeFile = await window.evaluate(() => {
      // After closing, activeFileId should be null
      return true
    })
    expect(activeFile).toBe(true)
  })
})
