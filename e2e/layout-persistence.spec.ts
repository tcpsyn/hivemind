import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { launchApp } from './helpers'

test.describe('Layout Persistence', () => {
  test.describe.configure({ mode: 'serial' })

  test('sidebar collapsed state persists across page reload', async () => {
    const { electronApp, window } = await launchApp()

    try {
      const sidebar = window.locator('[data-testid="sidebar"]')

      // Collapse sidebar
      await window.keyboard.press('Meta+b')
      await expect(sidebar).toHaveClass(/collapsed/, { timeout: 3000 })

      // Wait for persistence to save (useLayoutPersistence effect)
      await window.waitForTimeout(500)

      // Reload the page (simulates closing/reopening, preserves localStorage)
      await window.reload()
      await window.waitForSelector('[data-testid="topbar"]', { timeout: 15000 })

      // Sidebar should still be collapsed after reload
      const sidebarAfter = window.locator('[data-testid="sidebar"]')
      await expect(sidebarAfter).toHaveClass(/collapsed/, { timeout: 5000 })

      // Restore sidebar for clean state
      await window.keyboard.press('Meta+b')
      await expect(sidebarAfter).not.toHaveClass(/collapsed/, { timeout: 3000 })
      await window.waitForTimeout(500)
    } finally {
      await electronApp.close()
    }
  })

  test('active tab persists across page reload', async () => {
    const { electronApp, window } = await launchApp()

    try {
      const topbar = window.locator('[data-testid="topbar"]')

      // Switch to Editor tab
      const editorTab = topbar.locator('button.topbar-tab', { hasText: 'Editor' })
      await editorTab.click()
      await expect(editorTab).toHaveClass(/active/)

      // Wait for persistence
      await window.waitForTimeout(500)

      // Reload
      await window.reload()
      await window.waitForSelector('[data-testid="topbar"]', { timeout: 15000 })

      // Editor tab should still be active
      const editorTabAfter = window.locator(
        '[data-testid="topbar"] button.topbar-tab',
        { hasText: 'Editor' }
      )
      await expect(editorTabAfter).toHaveClass(/active/, { timeout: 5000 })

      // Restore to Agents tab
      await window
        .locator('[data-testid="topbar"] button.topbar-tab', { hasText: 'Agents' })
        .click()
      await window.waitForTimeout(500)
    } finally {
      await electronApp.close()
    }
  })

  test('sidebar width persists across page reload', async () => {
    const { electronApp, window } = await launchApp()

    try {
      const sidebar = window.locator('[data-testid="sidebar"]')

      // Get default width
      const defaultWidth = await sidebar.evaluate((el) => {
        return parseInt(el.style.width || '250', 10)
      })

      // Simulate sidebar resize by dispatching via page.evaluate
      // (we dispatch directly since drag interaction is complex)
      await window.evaluate(() => {
        // Dispatch a custom event or directly set localStorage
        localStorage.setItem(
          'hivemind:layout',
          JSON.stringify({
            sidebarWidth: 350,
            activeTab: 'agents',
            sidebarCollapsed: false,
            gridConfig: { layout: 'auto', columns: 2, rows: 2 }
          })
        )
      })

      // Reload to pick up the persisted width
      await window.reload()
      await window.waitForSelector('[data-testid="topbar"]', { timeout: 15000 })

      // Allow layout restoration effect to run
      await window.waitForTimeout(500)

      const sidebarAfter = window.locator('[data-testid="sidebar"]')
      const newWidth = await sidebarAfter.evaluate((el) => {
        return parseInt(el.style.width || '0', 10)
      })

      expect(newWidth).toBe(350)
      expect(newWidth).not.toBe(defaultWidth)

      // Restore default width
      await window.evaluate(() => {
        localStorage.removeItem('hivemind:layout')
      })
    } finally {
      await electronApp.close()
    }
  })

  test('layout persists across full app restart', async () => {
    // First launch: modify layout
    const { electronApp: app1, window: win1 } = await launchApp()

    // Switch to Git tab
    const gitTab = win1.locator('[data-testid="topbar"] button.topbar-tab', {
      hasText: 'Git'
    })
    await gitTab.click()
    await expect(gitTab).toHaveClass(/active/)

    // Wait for persistence to save
    await win1.waitForTimeout(500)

    // Close first instance
    await app1.close()

    // Second launch: verify layout was restored
    const { electronApp: app2, window: win2 } = await launchApp()

    try {
      // Git tab should still be active
      const gitTabAfter = win2.locator(
        '[data-testid="topbar"] button.topbar-tab',
        { hasText: 'Git' }
      )
      await expect(gitTabAfter).toHaveClass(/active/, { timeout: 5000 })

      // Restore to Agents tab for clean state
      await win2
        .locator('[data-testid="topbar"] button.topbar-tab', { hasText: 'Agents' })
        .click()
      await win2.waitForTimeout(500)
    } finally {
      await app2.close()
    }
  })

  test('window resize maintains layout structure', async () => {
    const { electronApp, window } = await launchApp()

    try {
      // Resize the window
      await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        win.setSize(1000, 700)
      })

      // Wait for resize to complete
      await window.waitForTimeout(500)

      // All key layout elements should still be visible
      await expect(window.locator('[data-testid="topbar"]')).toBeVisible()
      await expect(window.locator('[data-testid="sidebar"]')).toBeVisible()
      await expect(window.locator('[data-testid="main-content"]')).toBeVisible()
      await expect(window.locator('[data-testid="bottombar"]')).toBeVisible()

      // Resize back to default
      await electronApp.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        win.setSize(1400, 900)
      })
    } finally {
      await electronApp.close()
    }
  })
})
