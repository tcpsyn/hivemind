import { app, BrowserWindow, Menu, shell, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { parse as parseYaml } from 'yaml'
import { NotificationService } from './services/NotificationService'
import { TeamConfigService } from './services/TeamConfigService'
import { createIpcServices } from './services/createIpcServices'
import type { TabContext } from './services/createIpcServices'
import {
  registerIpcHandlers,
  removeIpcHandlers,
  sendAgentOutput,
  sendAgentStatusChange,
  sendAgentInputNeeded,
  sendTeammateSpawned,
  sendTeammateExited,
  sendTeammateOutput,
  sendTeammateRenamed,
  sendTeammateStatus
} from './ipc/handlers'
import { FileExplorerService } from './services/FileExplorerService'
import { TeamSession } from './tmux/TeamSession'
import type { IpcServices } from './ipc/handlers'
import type { AgentState } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let ipcServices: IpcServices | null = null

// Per-tab auxiliary services (managed alongside TabContext lifecycle)
const tabNotifications = new Map<string, NotificationService>()
const tabFileExplorers = new Map<string, FileExplorerService>()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    title: 'Hivemind',
    icon: join(__dirname, '../../resources/icon' + (process.platform === 'darwin' ? '.icns' : '.png')),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            // Will be wired to project picker in future
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            mainWindow?.webContents.send('menu:toggle-sidebar')
          }
        },
        { type: 'separator' },
        {
          label: 'Agents Tab',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow?.webContents.send('menu:set-tab', 'agents')
          }
        },
        {
          label: 'Editor Tab',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow?.webContents.send('menu:set-tab', 'editor')
          }
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Team',
      submenu: [
        {
          label: 'Start Team...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            if (!mainWindow) return
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Select Team Configuration',
              defaultPath: join(app.getPath('home'), '.hivemind', 'teams'),
              filters: [
                { name: 'YAML', extensions: ['yml', 'yaml'] },
                { name: 'All Files', extensions: ['*'] }
              ],
              properties: ['openFile']
            })
            if (result.canceled || result.filePaths.length === 0) return
            try {
              const content = readFileSync(result.filePaths[0], 'utf-8')
              const config = parseYaml(content)
              mainWindow.webContents.send('menu:team-start', config)
            } catch (err) {
              dialog.showErrorBox('Invalid Team Config', `Failed to parse: ${err}`)
            }
          }
        },
        {
          label: 'Stop Team',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: () => {
            mainWindow?.webContents.send('menu:team-stop')
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Hivemind',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Hivemind',
              message: 'Hivemind',
              detail: 'A desktop GUI for Claude Code agent teams.'
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function updateWindowTitle(projectName?: string): void {
  if (!mainWindow) return
  const title = projectName ? `Hivemind \u2014 ${projectName}` : 'Hivemind'
  mainWindow.setTitle(title)
}

function wirePtyEvents(tabId: string, context: TabContext): void {
  const { ptyManager } = context

  ptyManager.on('data', (agentId: string, data: string) => {
    if (mainWindow) {
      sendAgentOutput(mainWindow, { tabId, agentId, data })
    }
  })

  ptyManager.on('exit', (agentId: string) => {
    if (mainWindow) {
      const agents = ptyManager.getAll()
      const agent = agents.get(agentId)
      if (agent) {
        sendAgentStatusChange(mainWindow, {
          tabId,
          agentId,
          status: 'stopped',
          agent: { ...agent, status: 'stopped' }
        })
      }
    }
  })

  ptyManager.on('input-needed', (agentId: string) => {
    if (mainWindow) {
      const agents = ptyManager.getAll()
      const agent = agents.get(agentId)
      if (agent) {
        sendAgentInputNeeded(mainWindow, {
          tabId,
          agentId,
          agentName: agent.name
        })
      }
    }
  })

  ptyManager.on('error', (agentId: string, err: Error) => {
    console.error(`[${tabId}] Agent ${agentId} error:`, err.message)
  })

  // Per-tab notification service
  const notifService = new NotificationService(ptyManager)
  tabNotifications.set(tabId, notifService)

  // Per-tab file explorer service
  const fileExplorer = new FileExplorerService()
  tabFileExplorers.set(tabId, fileExplorer)
  if (mainWindow) {
    fileExplorer.start(context.projectPath, mainWindow, tabId).catch((err) => {
      console.error(`[${tabId}] FileExplorerService start failed:`, err)
    })
  }
}

function cleanupTabAuxServices(tabId: string): void {
  const notif = tabNotifications.get(tabId)
  if (notif) {
    notif.dispose()
    tabNotifications.delete(tabId)
  }
  const explorer = tabFileExplorers.get(tabId)
  if (explorer) {
    explorer.stop().catch(() => {})
    tabFileExplorers.delete(tabId)
  }
}

function wireTeamSessionEvents(tabId: string, session: TeamSession): void {
  session.on(
    'teammate-spawned',
    (agentId: string, agent: AgentState, paneId: string, sessionName: string) => {
      if (mainWindow) {
        sendTeammateSpawned(mainWindow, { tabId, agentId, agent, paneId, sessionName })
      }
    }
  )

  session.on('teammate-output', (paneId: string, data: string) => {
    if (mainWindow) {
      sendTeammateOutput(mainWindow, { tabId, paneId, data })
    }
  })

  session.on(
    'teammate-exited',
    (agentId: string, paneId: string, sessionName: string, exitCode: number) => {
      if (mainWindow) {
        sendTeammateExited(mainWindow, { tabId, agentId, paneId, sessionName, exitCode })
      }
    }
  )

  session.on('teammate-renamed', (agentId: string, name: string, paneId: string) => {
    if (mainWindow) {
      sendTeammateRenamed(mainWindow, { tabId, agentId, name, paneId })
    }
  })

  session.on('teammate-status-update', (agentId: string, info: { model?: string; contextPercent?: string; branch?: string; project?: string }) => {
    if (mainWindow) {
      sendTeammateStatus(mainWindow, { tabId, agentId, ...info })
    }
  })
}

function disposeServices(): void {
  if (ipcServices) {
    ipcServices.destroyAllTabs?.()?.catch(() => {})
    removeIpcHandlers()
    ipcServices = null
  }

  // Clean up all per-tab auxiliary services
  for (const [, notif] of tabNotifications) {
    notif.dispose()
  }
  tabNotifications.clear()

  for (const [, explorer] of tabFileExplorers) {
    explorer.stop().catch(() => {})
  }
  tabFileExplorers.clear()
}

function initializeServices(): void {
  TeamSession.cleanupStaleSockets()
  const teamConfigService = new TeamConfigService(join(app.getPath('userData'), 'team-configs'))

  ipcServices = createIpcServices({
    teamConfigService,
    onTabCreated: (tabId, context) => wirePtyEvents(tabId, context),
    onTabClosing: (tabId) => cleanupTabAuxServices(tabId),
    onSessionCreated: (tabId, session) => wireTeamSessionEvents(tabId, session)
  })
  registerIpcHandlers(ipcServices)
}

async function autoStartFirstTab(projectPath: string): Promise<void> {
  if (!ipcServices || !mainWindow) return

  try {
    const tab = await ipcServices.onTabCreate({ projectPath })

    const result = await ipcServices.onTeamStart({
      tabId: tab.tabId,
      config: { name: tab.projectName, project: projectPath, agents: [] }
    })

    mainWindow.webContents.send('team:auto-started', {
      tabId: tab.tabId,
      projectName: tab.projectName,
      projectPath,
      agents: result.agents
    })

    updateWindowTitle(tab.projectName)
  } catch (err) {
    console.error('Auto-start first tab failed:', err)
  }
}

// Set app name for dock/taskbar display (overrides "Electron" in dev mode)
app.name = 'Hivemind'
if (process.platform === 'darwin' && app.dock) {
  app.dock.setBadge('')
}

app.whenReady().then(async () => {
  // Set dock icon before creating window
  if (process.platform === 'darwin') {
    try {
      const icon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon)
      }
    } catch {
      // ignore
    }
  }

  buildAppMenu()
  createWindow()
  initializeServices()

  // Auto-start a tab + team session once the renderer is ready
  mainWindow!.webContents.on('did-finish-load', () => {
    const projectPath = process.argv.find(a => !a.startsWith('-') && a.startsWith('/') && a !== process.execPath)
      || (process.cwd() !== '/' ? process.cwd() : app.getPath('home'))
    autoStartFirstTab(projectPath)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      disposeServices()
      createWindow()
      initializeServices()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  disposeServices()
})

export { updateWindowTitle }
