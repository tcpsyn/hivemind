import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
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
    backgroundColor: '#1e1e1e',
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

function initializeServices(): void {
  ptyManager = new PtyManager()
  const fileService = new FileService()
  const gitService = new GitService(process.cwd())
  const teamConfigService = new TeamConfigService(
    join(app.getPath('userData'), 'team-configs')
  )

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
  createWindow()
  initializeServices()

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
