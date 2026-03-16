import { ipcMain, BrowserWindow } from 'electron'
import { RendererToMain, MainToRenderer } from '../../shared/ipc-channels'
import type {
  AgentCreateRequest,
  AgentCreateResponse,
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
  GitStatusRequest,
  TeamStartRequest,
  TeamStartResponse,
  AgentOutputPayload,
  AgentStatusChangePayload,
  AgentInputNeededPayload,
  FileChangedPayload,
  FileTreeUpdatePayload,
  GitStatusUpdatePayload
} from '../../shared/ipc-channels'
import type { FileTreeNode, GitStatus } from '../../shared/types'

export interface IpcServices {
  onAgentCreate: (req: AgentCreateRequest) => Promise<AgentCreateResponse>
  onAgentInput: (req: AgentInputRequest) => Promise<void>
  onAgentStop: (req: AgentStopRequest) => Promise<void>
  onAgentRestart: (req: AgentRestartRequest) => Promise<void>
  onAgentResize: (req: AgentResizeRequest) => Promise<void>
  onFileRead: (req: FileReadRequest) => Promise<FileReadResponse>
  onFileWrite: (req: FileWriteRequest) => Promise<void>
  onFileTreeRequest: (req: FileTreeRequest) => Promise<FileTreeNode[]>
  onGitDiff: (req: GitDiffRequest) => Promise<GitDiffResponse>
  onGitStatus: (req: GitStatusRequest) => Promise<GitStatus>
  onTeamStart: (req: TeamStartRequest) => Promise<TeamStartResponse>
  onTeamStop: () => Promise<void>
}

export function registerIpcHandlers(services: IpcServices): void {
  ipcMain.handle(RendererToMain.AGENT_CREATE, (_event, req: AgentCreateRequest) =>
    services.onAgentCreate(req)
  )
  ipcMain.handle(RendererToMain.AGENT_INPUT, (_event, req: AgentInputRequest) =>
    services.onAgentInput(req)
  )
  ipcMain.handle(RendererToMain.AGENT_STOP, (_event, req: AgentStopRequest) =>
    services.onAgentStop(req)
  )
  ipcMain.handle(RendererToMain.AGENT_RESTART, (_event, req: AgentRestartRequest) =>
    services.onAgentRestart(req)
  )
  ipcMain.handle(RendererToMain.AGENT_RESIZE, (_event, req: AgentResizeRequest) =>
    services.onAgentResize(req)
  )
  ipcMain.handle(RendererToMain.FILE_READ, (_event, req: FileReadRequest) =>
    services.onFileRead(req)
  )
  ipcMain.handle(RendererToMain.FILE_WRITE, (_event, req: FileWriteRequest) =>
    services.onFileWrite(req)
  )
  ipcMain.handle(RendererToMain.FILE_TREE_REQUEST, (_event, req: FileTreeRequest) =>
    services.onFileTreeRequest(req)
  )
  ipcMain.handle(RendererToMain.GIT_DIFF, (_event, req: GitDiffRequest) =>
    services.onGitDiff(req)
  )
  ipcMain.handle(RendererToMain.GIT_STATUS, (_event, req: GitStatusRequest) =>
    services.onGitStatus(req)
  )
  ipcMain.handle(RendererToMain.TEAM_START, (_event, req: TeamStartRequest) =>
    services.onTeamStart(req)
  )
  ipcMain.handle(RendererToMain.TEAM_STOP, () => services.onTeamStop())
}

export function removeIpcHandlers(): void {
  Object.values(RendererToMain).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
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
