import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  launchApp,
  addAgent,
  addAllMockAgents,
  sendAgentOutput,
  sendInputNeeded,
  sendIpcEvent,
  MOCK_AGENTS
} from './helpers'

test.describe('Agent Lifecycle', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    ;({ electronApp, window } = await launchApp())
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test.describe.configure({ mode: 'serial' })

  test('agents appear in sidebar after status-change events', async () => {
    await addAllMockAgents(electronApp)

    for (const agent of MOCK_AGENTS) {
      await expect(
        window.locator(`[data-testid="agent-list-item-${agent.id}"]`)
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('agent list items display name and role', async () => {
    for (const agent of MOCK_AGENTS) {
      const item = window.locator(`[data-testid="agent-list-item-${agent.id}"]`)
      await expect(item.locator('.agent-list-item-name')).toContainText(agent.name)
      await expect(item.locator('.agent-list-item-role')).toContainText(agent.role)
    }
  })

  test('agent list items show correct status badges', async () => {
    // Builder is 'running'
    const builderBadge = window.locator(
      '[data-testid="agent-list-item-agent-1"] [data-testid="status-badge"]'
    )
    await expect(builderBadge).toHaveClass(/running/)

    // Reviewer is 'idle'
    const reviewerBadge = window.locator(
      '[data-testid="agent-list-item-agent-3"] [data-testid="status-badge"]'
    )
    await expect(reviewerBadge).toHaveClass(/idle/)
  })

  test('agent list items have color-coded borders', async () => {
    const builderItem = window.locator('[data-testid="agent-list-item-agent-1"]')
    const style = await builderItem.getAttribute('style')
    // Style should include borderLeftColor from agent.color
    expect(style).toContain('border-left-color')
  })

  test('terminal panes render for each agent', async () => {
    const agentsTab = window.locator('[data-testid="topbar"] button.topbar-tab', {
      hasText: 'Agents'
    })
    await agentsTab.click()

    for (const agent of MOCK_AGENTS) {
      await expect(
        window.locator(`[data-testid="terminal-pane-${agent.id}"]`)
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('terminal panes have correct headers with name and role', async () => {
    const builderPane = window.locator('[data-testid="terminal-pane-agent-1"]')
    const header = builderPane.locator('[data-testid="pane-header"]')
    await expect(header).toBeVisible()
    await expect(header.locator('.pane-name')).toContainText('Builder')
    await expect(header.locator('.pane-role')).toContainText('developer')
  })

  test('terminal panes have status dots', async () => {
    const builderPane = window.locator('[data-testid="terminal-pane-agent-1"]')
    const statusDot = builderPane.locator('[data-testid="status-dot"]')
    await expect(statusDot).toBeVisible()
    await expect(statusDot).toHaveClass(/running/)
  })

  test('terminal panes contain xterm terminal containers', async () => {
    const builderPane = window.locator('[data-testid="terminal-pane-agent-1"]')
    const terminalContainer = builderPane.locator('[data-testid="terminal-container"]')
    await expect(terminalContainer).toBeVisible()
    // xterm.js should have rendered its DOM
    await expect(terminalContainer.locator('.xterm')).toBeVisible({ timeout: 5000 })
  })

  test('pane grid adjusts layout based on agent count', async () => {
    // With 3 agents, autoGridSize returns cols=2, rows=2
    const grid = window.locator('.pane-grid')
    await expect(grid).toBeVisible()

    const cols = await grid.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--grid-cols')
    )
    const rows = await grid.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--grid-rows')
    )
    expect(cols.trim()).toBe('2')
    expect(rows.trim()).toBe('2')
  })

  test('bottom bar shows agent status summary', async () => {
    const bottombar = window.locator('[data-testid="bottombar"]')
    await expect(bottombar).toContainText('running')
  })

  test('top bar shows running status count', async () => {
    const topbar = window.locator('[data-testid="topbar"]')
    await expect(topbar.locator('.status-count.running')).toBeVisible()
  })

  test('input-needed indicator appears on agent list item', async () => {
    await sendInputNeeded(electronApp, 'agent-1', 'Builder')

    const builderItem = window.locator('[data-testid="agent-list-item-agent-1"]')
    await expect(builderItem).toHaveClass(/needs-input/, { timeout: 5000 })
  })

  test('input-needed indicator appears on terminal pane', async () => {
    const builderPane = window.locator('[data-testid="terminal-pane-agent-1"]')
    await expect(builderPane).toHaveClass(/needs-input/)
  })

  test('notification badge appears in topbar when agent needs input', async () => {
    const badge = window.locator('[data-testid="notification-badge"]')
    await expect(badge).toBeVisible({ timeout: 5000 })
    const count = await badge.textContent()
    expect(parseInt(count || '0')).toBeGreaterThan(0)
  })

  test('agents needing input sort to top of sidebar list', async () => {
    // Builder (needs-input) should be first in the list
    const items = window.locator('[data-testid^="agent-list-item-"]')
    const firstItem = items.first()
    const firstTestId = await firstItem.getAttribute('data-testid')
    expect(firstTestId).toBe('agent-list-item-agent-1')
  })

  test('agent status change updates sidebar badge', async () => {
    // Change Reviewer to 'stopped'
    await sendIpcEvent(electronApp, 'agent:status-change', {
      agentId: 'agent-3',
      status: 'stopped',
      agent: { ...MOCK_AGENTS[2], status: 'stopped' }
    })

    const reviewerBadge = window.locator(
      '[data-testid="agent-list-item-agent-3"] [data-testid="status-badge"]'
    )
    await expect(reviewerBadge).toHaveClass(/stopped/, { timeout: 5000 })
  })

  test('top bar reflects updated status counts', async () => {
    const topbar = window.locator('[data-testid="topbar"]')
    await expect(topbar.locator('.status-count.stopped')).toBeVisible({ timeout: 5000 })
  })

  test('agent context menu appears on right-click', async () => {
    const agentItem = window.locator('[data-testid="agent-list-item-agent-2"]')
    await agentItem.click({ button: 'right' })

    const menu = window.locator('.agent-context-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })

    await expect(menu.locator('button', { hasText: 'Restart' })).toBeVisible()
    await expect(menu.locator('button', { hasText: 'Stop' })).toBeVisible()
    await expect(menu.locator('button', { hasText: 'View History' })).toBeVisible()
  })

  test('context menu closes on outside click', async () => {
    // Menu should still be open from previous test
    const menu = window.locator('.agent-context-menu')

    // Click outside the menu to close
    await window.locator('[data-testid="main-content"]').click({ force: true })
    await expect(menu).not.toBeVisible({ timeout: 3000 })
  })

  test('double-click pane header maximizes the pane', async () => {
    const paneHeader = window.locator(
      '[data-testid="terminal-pane-agent-2"] [data-testid="pane-header"]'
    )
    await paneHeader.dblclick()

    const grid = window.locator('.pane-grid')
    await expect(grid).toHaveClass(/maximized/, { timeout: 3000 })
  })

  test('Escape key restores maximized pane', async () => {
    const grid = window.locator('.pane-grid')
    // Grid should be maximized from previous test
    await expect(grid).toHaveClass(/maximized/)

    await window.keyboard.press('Escape')
    await expect(grid).not.toHaveClass(/maximized/, { timeout: 3000 })
  })

  test('terminal receives agent output via IPC', async () => {
    await sendAgentOutput(electronApp, 'agent-1', 'Hello from Builder\r\n')

    // Verify xterm container is populated (canvas-based, so check DOM structure)
    const container = window.locator(
      '[data-testid="terminal-pane-agent-1"] [data-testid="terminal-container"] .xterm'
    )
    await expect(container).toBeVisible()

    // xterm renders to canvas; verify the screen element has children
    const hasScreen = await container.locator('.xterm-screen').count()
    expect(hasScreen).toBeGreaterThan(0)
  })

  test('adding a fourth agent updates grid layout', async () => {
    const agent4 = {
      id: 'agent-4',
      name: 'Deployer',
      role: 'devops',
      avatar: 'circuit',
      color: '#96CEB4',
      status: 'running' as const,
      needsInput: false,
      lastActivity: Date.now()
    }
    await addAgent(electronApp, agent4)

    await expect(
      window.locator('[data-testid="terminal-pane-agent-4"]')
    ).toBeVisible({ timeout: 5000 })

    // With 4 agents, grid stays 2x2
    const grid = window.locator('.pane-grid')
    const cols = await grid.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--grid-cols')
    )
    expect(cols.trim()).toBe('2')
  })
})
