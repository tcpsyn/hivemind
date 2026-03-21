import { ipcMain, BrowserWindow, dialog } from 'electron'
import { RendererToMain, MainToRenderer } from '../../shared/ipc-channels'
import {
  tabCreateRequestSchema,
  tabCloseRequestSchema,
  agentInputRequestSchema,
  agentStopRequestSchema,
  agentRestartRequestSchema,
  agentResizeRequestSchema,
  fileReadRequestSchema,
  fileWriteRequestSchema,
  fileTreeRequestSchema,
  gitDiffRequestSchema,
  teamStartRequestSchema,
  teamStopRequestSchema,
  teammateInputRequestSchema,
  teammateResizeRequestSchema,
  teammateOutputReadyRequestSchema
} from '../../shared/validators'
import type { ZodSchema } from 'zod'
import type {
  TabCreateRequest,
  TabCreateResponse,
  TabCloseRequest,
  AgentInputRequest,
  AgentStopRequest,
  AgentRestartRequest,
  AgentResizeRequest,
  FileReadRequest,
  FileReadResponse,
  FileWriteRequest,
  FileTreeRequest,
  GitDiffRequest,
  GitDiffResponse,
  TeamStartRequest,
  TeamStartResponse,
  TeamStopRequest,
  TeammateInputRequest,
  TeammateResizeRequest,
  TeammateOutputReadyRequest,
  AgentOutputPayload,
  AgentStatusChangePayload,
  AgentInputNeededPayload,
  FileChangedPayload,
  FileTreeUpdatePayload,
  GitStatusUpdatePayload,
  TeammateSpawnedPayload,
  TeammateExitedPayload,
  TeammateOutputPayload,
  TeammateRenamedPayload,
  TeammateStatusPayload
} from '../../shared/ipc-channels'
import type { FileTreeNode } from '../../shared/types'
import type { TabContext } from '../services/createIpcServices'

function validated<T>(schema: ZodSchema<T>, handler: (req: T) => Promise<unknown>) {
  return (_event: Electron.IpcMainInvokeEvent, raw: unknown) => {
    const result = schema.safeParse(raw)
    if (!result.success) {
      throw new Error(`IPC validation failed: ${result.error.message}`)
    }
    return handler(result.data)
  }
}

export interface IpcServices {
  onTabCreate: (req: TabCreateRequest) => Promise<TabCreateResponse>
  onTabClose: (req: TabCloseRequest) => Promise<void>
  onAgentInput: (req: AgentInputRequest) => Promise<void>
  onAgentStop: (req: AgentStopRequest) => Promise<void>
  onAgentRestart: (req: AgentRestartRequest) => Promise<void>
  onAgentResize: (req: AgentResizeRequest) => Promise<void>
  onFileRead: (req: FileReadRequest) => Promise<FileReadResponse>
  onFileWrite: (req: FileWriteRequest) => Promise<void>
  onFileTreeRequest: (req: FileTreeRequest) => Promise<FileTreeNode[]>
  onGitDiff: (req: GitDiffRequest) => Promise<GitDiffResponse>
  onTeamStart: (req: TeamStartRequest) => Promise<TeamStartResponse>
  onTeamStop: (req: TeamStopRequest) => Promise<void>
  onTeammateInput: (req: TeammateInputRequest) => Promise<void>
  onTeammateResize: (req: TeammateResizeRequest) => Promise<void>
  onTeammateOutputReady: (req: TeammateOutputReadyRequest) => Promise<void>
  getTab?: (tabId: string) => TabContext | null
  getTabs?: () => Map<string, TabContext>
  destroyAllTabs?: () => Promise<void>
}

export function registerIpcHandlers(services: IpcServices): void {
  ipcMain.handle(
    RendererToMain.TAB_CREATE,
    validated(tabCreateRequestSchema, (req) => services.onTabCreate(req))
  )
  ipcMain.handle(
    RendererToMain.TAB_CLOSE,
    validated(tabCloseRequestSchema, (req) => services.onTabClose(req))
  )
  ipcMain.handle(
    RendererToMain.AGENT_INPUT,
    validated(agentInputRequestSchema, (req) => services.onAgentInput(req))
  )
  ipcMain.handle(
    RendererToMain.AGENT_STOP,
    validated(agentStopRequestSchema, (req) => services.onAgentStop(req))
  )
  ipcMain.handle(
    RendererToMain.AGENT_RESTART,
    validated(agentRestartRequestSchema, (req) => services.onAgentRestart(req))
  )
  ipcMain.handle(
    RendererToMain.AGENT_RESIZE,
    validated(agentResizeRequestSchema, (req) => services.onAgentResize(req))
  )
  ipcMain.handle(
    RendererToMain.FILE_READ,
    validated(fileReadRequestSchema, (req) => services.onFileRead(req))
  )
  ipcMain.handle(
    RendererToMain.FILE_WRITE,
    validated(fileWriteRequestSchema, (req) => services.onFileWrite(req))
  )
  ipcMain.handle(
    RendererToMain.FILE_TREE_REQUEST,
    validated(fileTreeRequestSchema, (req) => services.onFileTreeRequest(req))
  )
  ipcMain.handle(
    RendererToMain.GIT_DIFF,
    validated(gitDiffRequestSchema, (req) => services.onGitDiff(req))
  )
  ipcMain.handle(
    RendererToMain.TEAM_START,
    validated(teamStartRequestSchema, (req) => services.onTeamStart(req))
  )
  ipcMain.handle(
    RendererToMain.TEAM_STOP,
    validated(teamStopRequestSchema, (req) => services.onTeamStop(req))
  )
  ipcMain.handle(
    RendererToMain.TEAMMATE_INPUT,
    validated(teammateInputRequestSchema, (req) => services.onTeammateInput(req))
  )
  ipcMain.handle(
    RendererToMain.TEAMMATE_RESIZE,
    validated(teammateResizeRequestSchema, (req) => services.onTeammateResize(req))
  )
  ipcMain.handle(
    RendererToMain.TEAMMATE_OUTPUT_READY,
    validated(teammateOutputReadyRequestSchema, (req) => services.onTeammateOutputReady(req))
  )

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

export function removeIpcHandlers(): void {
  Object.values(RendererToMain).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  ipcMain.removeHandler('dialog:open-folder')
}

// Helper to push events from main to renderer
export function sendToRenderer(window: BrowserWindow, channel: string, payload: unknown): void {
  if (!window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

export function sendAgentOutput(window: BrowserWindow, payload: AgentOutputPayload): void {
  sendToRenderer(window, MainToRenderer.AGENT_OUTPUT, payload)
}

export function sendAgentStatusChange(
  window: BrowserWindow,
  payload: AgentStatusChangePayload
): void {
  sendToRenderer(window, MainToRenderer.AGENT_STATUS_CHANGE, payload)
}

export function sendAgentInputNeeded(
  window: BrowserWindow,
  payload: AgentInputNeededPayload
): void {
  sendToRenderer(window, MainToRenderer.AGENT_INPUT_NEEDED, payload)
}

export function sendFileChanged(window: BrowserWindow, payload: FileChangedPayload): void {
  sendToRenderer(window, MainToRenderer.FILE_CHANGED, payload)
}

export function sendFileTreeUpdate(window: BrowserWindow, payload: FileTreeUpdatePayload): void {
  sendToRenderer(window, MainToRenderer.FILE_TREE_UPDATE, payload)
}

export function sendGitStatusUpdate(window: BrowserWindow, payload: GitStatusUpdatePayload): void {
  sendToRenderer(window, MainToRenderer.GIT_STATUS_UPDATE, payload)
}

export function sendTeammateSpawned(window: BrowserWindow, payload: TeammateSpawnedPayload): void {
  sendToRenderer(window, MainToRenderer.TEAM_TEAMMATE_SPAWNED, payload)
}

export function sendTeammateExited(window: BrowserWindow, payload: TeammateExitedPayload): void {
  sendToRenderer(window, MainToRenderer.TEAM_TEAMMATE_EXITED, payload)
}

export function sendTeammateOutput(window: BrowserWindow, payload: TeammateOutputPayload): void {
  sendToRenderer(window, MainToRenderer.TEAMMATE_OUTPUT, payload)
}

export function sendTeammateRenamed(window: BrowserWindow, payload: TeammateRenamedPayload): void {
  sendToRenderer(window, MainToRenderer.TEAM_TEAMMATE_RENAMED, payload)
}

export function sendTeammateStatus(window: BrowserWindow, payload: TeammateStatusPayload): void {
  sendToRenderer(window, MainToRenderer.TEAM_TEAMMATE_STATUS, payload)
}
