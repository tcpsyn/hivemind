import { ipcMain, BrowserWindow } from 'electron'
import { RendererToMain, MainToRenderer } from '../../shared/ipc-channels'
import type {
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
  TeammateInputRequest,
  TeammateResizeRequest,
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
import type { TeamSession } from '../tmux/TeamSession'

export interface IpcServices {
  onAgentInput: (req: AgentInputRequest) => Promise<void>
  onAgentStop: (req: AgentStopRequest) => Promise<void>
  onAgentRestart: (req: AgentRestartRequest) => Promise<void>
  onAgentResize: (req: AgentResizeRequest) => Promise<void>
  onFileRead: (req: FileReadRequest) => Promise<FileReadResponse>
  onFileWrite: (req: FileWriteRequest) => Promise<void>
  onFileTreeRequest: (req: FileTreeRequest) => Promise<FileTreeNode[]>
  onGitDiff: (req: GitDiffRequest) => Promise<GitDiffResponse>
  onTeamStart: (req: TeamStartRequest) => Promise<TeamStartResponse>
  onTeamStop: () => Promise<void>
  onTeammateInput: (req: TeammateInputRequest) => Promise<void>
  onTeammateResize: (req: TeammateResizeRequest) => Promise<void>
  getActiveSession?: () => TeamSession | null
}

export function registerIpcHandlers(services: IpcServices): void {
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
  ipcMain.handle(RendererToMain.GIT_DIFF, (_event, req: GitDiffRequest) => services.onGitDiff(req))
  ipcMain.handle(RendererToMain.TEAM_START, (_event, req: TeamStartRequest) =>
    services.onTeamStart(req)
  )
  ipcMain.handle(RendererToMain.TEAM_STOP, () => services.onTeamStop())
  ipcMain.handle(RendererToMain.TEAMMATE_INPUT, (_event, req: TeammateInputRequest) =>
    services.onTeammateInput(req)
  )
  ipcMain.handle(RendererToMain.TEAMMATE_RESIZE, (_event, req: TeammateResizeRequest) =>
    services.onTeammateResize(req)
  )
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
