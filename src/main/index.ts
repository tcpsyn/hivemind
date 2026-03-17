import { app, BrowserWindow, Menu, shell, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { parse as parseYaml } from 'yaml'
import { PtyManager } from './pty/PtyManager'
import { NotificationService } from './services/NotificationService'
import { TeamConfigService } from './services/TeamConfigService'
import { FileService } from './services/FileService'
import { GitService } from './services/GitService'
import { createIpcServices } from './services/createIpcServices'
import {
  registerIpcHandlers,
  sendAgentOutput,
  sendAgentStatusChange,
  sendAgentInputNeeded,
  sendTeammateSpawned,
  sendTeammateExited,
  sendTeammateOutput,
  sendTeammateRenamed,
  sendTeammateStatus
} from './ipc/handlers'
import { TeamSession } from './tmux/TeamSession'
import type { IpcServices } from './ipc/handlers'
import type { AgentState } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let notificationService: NotificationService | null = null
let ipcServices: IpcServices | null = null

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
            mainWindow?.webContents.send('menu:about')
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

function wireTeamSessionEvents(session: TeamSession): void {
  session.on(
    'teammate-spawned',
    (agentId: string, agent: AgentState, paneId: string, sessionName: string) => {
      if (mainWindow) {
        sendTeammateSpawned(mainWindow, { agentId, agent, paneId, sessionName })
      }
    }
  )

  session.on('teammate-output', (paneId: string, data: string) => {
    if (mainWindow) {
      sendTeammateOutput(mainWindow, { paneId, data })
    }
  })

  session.on(
    'teammate-exited',
    (agentId: string, paneId: string, sessionName: string, exitCode: number) => {
      if (mainWindow) {
        sendTeammateExited(mainWindow, { agentId, paneId, sessionName, exitCode })
      }
    }
  )

  session.on('teammate-renamed', (agentId: string, name: string, paneId: string) => {
    if (mainWindow) {
      sendTeammateRenamed(mainWindow, { agentId, name, paneId })
    }
  })

  session.on('teammate-status-update', (agentId: string, info: { model?: string; contextPercent?: string; branch?: string; project?: string }) => {
    if (mainWindow) {
      sendTeammateStatus(mainWindow, { agentId, ...info })
    }
  })
}

function initializeServices(): void {
  TeamSession.cleanupStaleSockets()
  ptyManager = new PtyManager()
  const fileService = new FileService()
  const gitService = new GitService(process.cwd())
  const teamConfigService = new TeamConfigService(join(app.getPath('userData'), 'team-configs'))

  ptyManager.on('error', (agentId: string, err: Error) => {
    console.error(`Agent ${agentId} error:`, err.message)
  })

  ptyManager.on('data', (agentId: string, data: string) => {
    if (mainWindow) {
      sendAgentOutput(mainWindow, { agentId, data })
    }
  })

  ptyManager.on('exit', (agentId: string) => {
    if (mainWindow && ptyManager) {
      const agents = ptyManager.getAll()
      const agent = agents.get(agentId)
      if (agent) {
        sendAgentStatusChange(mainWindow, {
          agentId,
          status: 'stopped',
          agent: { ...agent, status: 'stopped' }
        })
      }
    }
  })

  ptyManager.on('input-needed', (agentId: string) => {
    if (mainWindow && ptyManager) {
      const agents = ptyManager.getAll()
      const agent = agents.get(agentId)
      if (agent) {
        sendAgentInputNeeded(mainWindow, {
          agentId,
          agentName: agent.name
        })
      }
    }
  })

  notificationService = new NotificationService(ptyManager)

  ipcServices = createIpcServices({
    ptyManager,
    fileService,
    gitService,
    teamConfigService,
    onSessionCreated: (session) => wireTeamSessionEvents(session)
  })
  registerIpcHandlers(ipcServices)
}

async function autoStartTeamSession(projectName: string, projectPath: string): Promise<void> {
  if (!ipcServices || !mainWindow) return
  try {
    const result = await ipcServices.onTeamStart({
      config: { name: projectName, project: projectPath, agents: [] }
    })
    // Tell the renderer about the auto-started team
    mainWindow.webContents.send('team:auto-started', {
      projectName,
      projectPath,
      agents: result.agents
    })
  } catch (err) {
    console.error('Auto-start team session failed:', err)
  }
}

// Set app name for dock/taskbar display (overrides "Electron" in dev mode)
app.name = 'Hivemind'
if (process.platform === 'darwin') {
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

  // Auto-start a team session once the renderer is ready
  mainWindow!.webContents.on('did-finish-load', () => {
    // Use command line arg, CWD, or home directory as project path
    const projectPath = process.argv.find(a => !a.startsWith('-') && a.startsWith('/') && a !== process.execPath)
      || (process.cwd() !== '/' ? process.cwd() : app.getPath('home'))
    const projectName = projectPath.split('/').pop() || 'project'
    updateWindowTitle(projectName)
    autoStartTeamSession(projectName, projectPath)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
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
  // Stop active team session (cleans up socket + PTYs)
  const session = ipcServices?.getActiveSession?.()
  if (session) {
    session.stop().catch(() => {})
  }

  if (ptyManager) {
    ptyManager.destroyAll()
  }
  if (notificationService) {
    notificationService.dispose()
  }
})

export { updateWindowTitle }
