import type {
  AgentState,
  AgentStatus,
  FileChangeEvent,
  FileTreeNode,
  GitStatus,
  TeamConfig
} from './types'

// Main → Renderer channels
export const MainToRenderer = {
  AGENT_OUTPUT: 'agent:output',
  AGENT_STATUS_CHANGE: 'agent:status-change',
  AGENT_INPUT_NEEDED: 'agent:input-needed',
  FILE_CHANGED: 'file:changed',
  FILE_TREE_UPDATE: 'file:tree-update',
  GIT_STATUS_UPDATE: 'git:status-update',
  TEAM_TEAMMATE_SPAWNED: 'team:teammate-spawned',
  TEAM_TEAMMATE_EXITED: 'team:teammate-exited',
  TEAM_TEAMMATE_RENAMED: 'team:teammate-renamed',
  TEAM_TEAMMATE_STATUS: 'team:teammate-status',
  TEAMMATE_OUTPUT: 'teammate:output'
} as const

// Renderer → Main channels (invoke/handle pattern)
export const RendererToMain = {
  AGENT_INPUT: 'agent:input',
  AGENT_STOP: 'agent:stop',
  AGENT_RESTART: 'agent:restart',
  AGENT_RESIZE: 'agent:resize',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_TREE_REQUEST: 'file:tree-request',
  GIT_DIFF: 'git:diff',
  TEAM_START: 'team:start',
  TEAM_STOP: 'team:stop',
  TEAMMATE_INPUT: 'teammate:input',
  TEAMMATE_RESIZE: 'teammate:resize',
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close'
} as const

// Payload types for Main → Renderer
export interface AgentOutputPayload {
  tabId: string
  agentId: string
  data: string
}

export interface AgentStatusChangePayload {
  tabId: string
  agentId: string
  status: AgentStatus
  agent: AgentState
}

export interface AgentInputNeededPayload {
  tabId: string
  agentId: string
  agentName: string
  prompt?: string
}

export interface FileChangedPayload {
  tabId: string
  event: FileChangeEvent
}

export interface FileTreeUpdatePayload {
  tabId: string
  tree: FileTreeNode[]
}

export interface GitStatusUpdatePayload {
  tabId: string
  status: GitStatus
}

// Payload types for Renderer → Main (request/response)
export interface AgentInputRequest {
  tabId: string
  agentId: string
  data: string
}

export interface AgentStopRequest {
  tabId: string
  agentId: string
}

export interface AgentRestartRequest {
  tabId: string
  agentId: string
}

export interface AgentResizeRequest {
  tabId: string
  agentId: string
  cols: number
  rows: number
}

export interface FileReadRequest {
  tabId: string
  filePath: string
}

export interface FileReadResponse {
  content: string
  filePath: string
}

export interface FileWriteRequest {
  tabId: string
  filePath: string
  content: string
}

export interface FileTreeRequest {
  tabId: string
  rootPath: string
  depth?: number
}

export interface GitDiffRequest {
  tabId: string
  filePath: string
}

export interface GitDiffResponse {
  diff: string
  filePath: string
  original?: string
}

export interface TeamStartRequest {
  tabId: string
  config: TeamConfig
}

export interface TeamStartResponse {
  agents: AgentState[]
}

export interface TeamStopRequest {
  tabId: string
}

export interface TabCreateRequest {
  projectPath: string
}

export interface TabCreateResponse {
  tabId: string
  projectPath: string
  projectName: string
}

export interface TabCloseRequest {
  tabId: string
}

export interface TeammateOutputPayload {
  tabId: string
  paneId: string
  data: string
}

export interface TeammateInputRequest {
  tabId: string
  paneId: string
  data: string
}

export interface TeammateResizeRequest {
  tabId: string
  paneId: string
  cols: number
  rows: number
}

export interface TeammateSpawnedPayload {
  tabId: string
  agentId: string
  agent: AgentState
  paneId: string
  sessionName: string
}

export interface TeammateExitedPayload {
  tabId: string
  agentId: string
  paneId: string
  sessionName: string
  exitCode: number
}

export interface TeammateRenamedPayload {
  tabId: string
  agentId: string
  name: string
  paneId: string
}

export interface TeammateStatusPayload {
  tabId: string
  agentId: string
  model?: string
  contextPercent?: string
  branch?: string
  project?: string
}
