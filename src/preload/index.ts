import { contextBridge, ipcRenderer } from 'electron'
import { RendererToMain, MainToRenderer } from '../shared/ipc-channels'
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
  TeamStopRequest,
  TabCreateRequest,
  TabCreateResponse,
  TabCloseRequest,
  AgentOutputPayload,
  AgentStatusChangePayload,
  AgentInputNeededPayload,
  FileChangedPayload,
  FileTreeUpdatePayload,
  GitStatusUpdatePayload,
  TeammateSpawnedPayload,
  TeammateExitedPayload,
  TeammateOutputPayload,
  TeammateInputRequest,
  TeammateResizeRequest,
  TeammateRenamedPayload,
  TeammateStatusPayload
} from '../shared/ipc-channels'
import type { FileTreeNode, AgentState } from '../shared/types'

export interface ElectronApi {
  // Renderer → Main (invoke/handle)
  agentInput: (req: AgentInputRequest) => Promise<void>
  agentStop: (req: AgentStopRequest) => Promise<void>
  agentRestart: (req: AgentRestartRequest) => Promise<void>
  agentResize: (req: AgentResizeRequest) => Promise<void>
  fileRead: (req: FileReadRequest) => Promise<FileReadResponse>
  fileWrite: (req: FileWriteRequest) => Promise<void>
  fileTreeRequest: (req: FileTreeRequest) => Promise<FileTreeNode[]>
  gitDiff: (req: GitDiffRequest) => Promise<GitDiffResponse>
  teamStart: (req: TeamStartRequest) => Promise<TeamStartResponse>
  teamStop: (req: TeamStopRequest) => Promise<void>

  // Tab management
  tabCreate: (req: TabCreateRequest) => Promise<TabCreateResponse>
  tabClose: (req: TabCloseRequest) => Promise<void>
  openFolderDialog: () => Promise<string | null>

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
  onTeammateRenamed: (callback: (payload: TeammateRenamedPayload) => void) => () => void
  onTeammateStatus: (callback: (payload: TeammateStatusPayload) => void) => () => void
  sendTeammateInput: (req: TeammateInputRequest) => Promise<void>
  teammateResize: (req: TeammateResizeRequest) => Promise<void>

  // Auto-start and menu events
  onTeamAutoStarted: (
    callback: (payload: {
      tabId: string
      projectName: string
      projectPath: string
      agents: AgentState[]
    }) => void
  ) => () => void
  onMenuTeamStart: (callback: (config: unknown) => void) => () => void
  onMenuTeamStop: (callback: () => void) => () => void
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
  agentInput: (req) => ipcRenderer.invoke(RendererToMain.AGENT_INPUT, req),
  agentStop: (req) => ipcRenderer.invoke(RendererToMain.AGENT_STOP, req),
  agentRestart: (req) => ipcRenderer.invoke(RendererToMain.AGENT_RESTART, req),
  agentResize: (req) => ipcRenderer.invoke(RendererToMain.AGENT_RESIZE, req),
  fileRead: (req) => ipcRenderer.invoke(RendererToMain.FILE_READ, req),
  fileWrite: (req) => ipcRenderer.invoke(RendererToMain.FILE_WRITE, req),
  fileTreeRequest: (req) => ipcRenderer.invoke(RendererToMain.FILE_TREE_REQUEST, req),
  gitDiff: (req) => ipcRenderer.invoke(RendererToMain.GIT_DIFF, req),
  teamStart: (req) => ipcRenderer.invoke(RendererToMain.TEAM_START, req),
  teamStop: (req) => ipcRenderer.invoke(RendererToMain.TEAM_STOP, req),

  // Tab management
  tabCreate: (req) => ipcRenderer.invoke(RendererToMain.TAB_CREATE, req),
  tabClose: (req) => ipcRenderer.invoke(RendererToMain.TAB_CLOSE, req),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),

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
  teammateResize: (req) => ipcRenderer.invoke(RendererToMain.TEAMMATE_RESIZE, req),

  // Auto-start event
  onTeamAutoStarted: createOnHandler<{
    tabId: string
    projectName: string
    projectPath: string
    agents: unknown[]
  }>('team:auto-started'),

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
