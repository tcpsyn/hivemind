import { contextBridge, ipcRenderer } from 'electron'
import { RendererToMain, MainToRenderer } from '../shared/ipc-channels'
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
  GitStatusUpdatePayload,
  TeammateSpawnedPayload,
  TeammateExitedPayload,
  TeammateOutputPayload,
  TeammateInputRequest
} from '../shared/ipc-channels'
import type { FileTreeNode, GitStatus } from '../shared/types'

export interface ElectronApi {
  // Renderer → Main (invoke/handle)
  agentCreate: (req: AgentCreateRequest) => Promise<AgentCreateResponse>
  agentInput: (req: AgentInputRequest) => Promise<void>
  agentStop: (req: AgentStopRequest) => Promise<void>
  agentRestart: (req: AgentRestartRequest) => Promise<void>
  agentResize: (req: AgentResizeRequest) => Promise<void>
  fileRead: (req: FileReadRequest) => Promise<FileReadResponse>
  fileWrite: (req: FileWriteRequest) => Promise<void>
  fileTreeRequest: (req: FileTreeRequest) => Promise<FileTreeNode[]>
  gitDiff: (req: GitDiffRequest) => Promise<GitDiffResponse>
  gitStatus: (req: GitStatusRequest) => Promise<GitStatus>
  teamStart: (req: TeamStartRequest) => Promise<TeamStartResponse>
  teamStop: () => Promise<void>

  // Main → Renderer (event listeners)
  onAgentOutput: (callback: (payload: AgentOutputPayload) => void) => () => void
  onAgentStatusChange: (callback: (payload: AgentStatusChangePayload) => void) => () => void
  onAgentInputNeeded: (callback: (payload: AgentInputNeededPayload) => void) => () => void
  onFileChanged: (callback: (payload: FileChangedPayload) => void) => () => void
  onFileTreeUpdate: (callback: (payload: FileTreeUpdatePayload) => void) => () => void
  onGitStatusUpdate: (callback: (payload: GitStatusUpdatePayload) => void) => () => void
  onTeammateSpawned: (callback: (payload: TeammateSpawnedPayload) => void) => () => void
  onTeammateExited: (callback: (payload: TeammateExitedPayload) => void) => () => void
  onTeammateOutput: (callback: (payload: TeammateOutputPayload) => void) => () => void
  sendTeammateInput: (req: TeammateInputRequest) => Promise<void>
}

function createOnHandler<T>(channel: string) {
  return (callback: (payload: T) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const api: ElectronApi = {
  // Renderer → Main
  agentCreate: (req) => ipcRenderer.invoke(RendererToMain.AGENT_CREATE, req),
  agentInput: (req) => ipcRenderer.invoke(RendererToMain.AGENT_INPUT, req),
  agentStop: (req) => ipcRenderer.invoke(RendererToMain.AGENT_STOP, req),
  agentRestart: (req) => ipcRenderer.invoke(RendererToMain.AGENT_RESTART, req),
  agentResize: (req) => ipcRenderer.invoke(RendererToMain.AGENT_RESIZE, req),
  fileRead: (req) => ipcRenderer.invoke(RendererToMain.FILE_READ, req),
  fileWrite: (req) => ipcRenderer.invoke(RendererToMain.FILE_WRITE, req),
  fileTreeRequest: (req) => ipcRenderer.invoke(RendererToMain.FILE_TREE_REQUEST, req),
  gitDiff: (req) => ipcRenderer.invoke(RendererToMain.GIT_DIFF, req),
  gitStatus: (req) => ipcRenderer.invoke(RendererToMain.GIT_STATUS, req),
  teamStart: (req) => ipcRenderer.invoke(RendererToMain.TEAM_START, req),
  teamStop: () => ipcRenderer.invoke(RendererToMain.TEAM_STOP),

  // Main → Renderer
  onAgentOutput: createOnHandler(MainToRenderer.AGENT_OUTPUT),
  onAgentStatusChange: createOnHandler(MainToRenderer.AGENT_STATUS_CHANGE),
  onAgentInputNeeded: createOnHandler(MainToRenderer.AGENT_INPUT_NEEDED),
  onFileChanged: createOnHandler(MainToRenderer.FILE_CHANGED),
  onFileTreeUpdate: createOnHandler(MainToRenderer.FILE_TREE_UPDATE),
  onGitStatusUpdate: createOnHandler(MainToRenderer.GIT_STATUS_UPDATE),
  onTeammateSpawned: createOnHandler(MainToRenderer.TEAM_TEAMMATE_SPAWNED),
  onTeammateExited: createOnHandler(MainToRenderer.TEAM_TEAMMATE_EXITED),
  onTeammateRenamed: createOnHandler(MainToRenderer.TEAM_TEAMMATE_RENAMED),
  onTeammateStatus: createOnHandler(MainToRenderer.TEAM_TEAMMATE_STATUS),
  onTeammateOutput: createOnHandler(MainToRenderer.TEAMMATE_OUTPUT),
  sendTeammateInput: (req) => ipcRenderer.invoke(RendererToMain.TEAMMATE_INPUT, req),

  // Menu events
  onMenuTeamStart: createOnHandler<unknown>('menu:team-start'),
  onMenuTeamStop: createOnHandler<void>('menu:team-stop')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback for non-isolated contexts
  window.api = api
}
