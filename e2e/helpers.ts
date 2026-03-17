import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'

export interface MockAgent {
  id: string
  name: string
  role: string
  avatar: string
  color: string
  status: 'running' | 'idle' | 'waiting' | 'stopped'
  needsInput: boolean
  lastActivity: number
}

export const MOCK_AGENTS: MockAgent[] = [
  {
    id: 'agent-1',
    name: 'Builder',
    role: 'developer',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now()
  },
  {
    id: 'agent-2',
    name: 'Tester',
    role: 'qa',
    avatar: 'robot-2',
    color: '#4ECDC4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now()
  },
  {
    id: 'agent-3',
    name: 'Reviewer',
    role: 'reviewer',
    avatar: 'robot-3',
    color: '#45B7D1',
    status: 'idle',
    needsInput: false,
    lastActivity: Date.now()
  }
]

export async function launchApp(): Promise<{
  electronApp: ElectronApplication
  window: Page
}> {
  const appPath = path.join(process.cwd(), 'out', 'main', 'index.js')
  const electronApp = await electron.launch({
    args: [appPath]
  })
  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('[data-testid="topbar"]', { timeout: 15000 })
  return { electronApp, window }
}

export async function sendIpcEvent(
  electronApp: ElectronApplication,
  channel: string,
  payload: unknown
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, { channel, payload }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send(channel, payload)
      }
    },
    { channel, payload }
  )
}

export async function addAgent(
  electronApp: ElectronApplication,
  agent: MockAgent
): Promise<void> {
  await sendIpcEvent(electronApp, 'agent:status-change', {
    agentId: agent.id,
    status: agent.status,
    agent
  })
}

export async function addAllMockAgents(electronApp: ElectronApplication): Promise<void> {
  for (const agent of MOCK_AGENTS) {
    await addAgent(electronApp, agent)
  }
}

export async function sendAgentOutput(
  electronApp: ElectronApplication,
  agentId: string,
  data: string
): Promise<void> {
  await sendIpcEvent(electronApp, 'agent:output', { agentId, data })
}

export async function sendInputNeeded(
  electronApp: ElectronApplication,
  agentId: string,
  agentName: string
): Promise<void> {
  await sendIpcEvent(electronApp, 'agent:input-needed', { agentId, agentName })
}

export async function updateAgentStatus(
  electronApp: ElectronApplication,
  agent: MockAgent,
  status: MockAgent['status']
): Promise<void> {
  await sendIpcEvent(electronApp, 'agent:status-change', {
    agentId: agent.id,
    status,
    agent: { ...agent, status }
  })
}
