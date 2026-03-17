import { app, BrowserWindow, Menu, shell, dialog } from 'electron'
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
  sendAgentInputNeeded
} from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let notificationService: NotificationService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    title: 'Claude Frontend',
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
              defaultPath: join(app.getPath('home'), '.cc-frontend', 'teams'),
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
          label: 'About Claude Frontend',
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
  const title = projectName ? `Claude Frontend \u2014 ${projectName}` : 'Claude Frontend'
  mainWindow.setTitle(title)
}

function initializeServices(): void {
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

  const services = createIpcServices({
    ptyManager,
    fileService,
    gitService,
    teamConfigService
  })
  registerIpcHandlers(services)
}

app.whenReady().then(() => {
  buildAppMenu()
  createWindow()
  initializeServices()
  updateWindowTitle()

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
  if (ptyManager) {
    ptyManager.destroyAll()
  }
  if (notificationService) {
    notificationService.dispose()
  }
})

export { updateWindowTitle }
