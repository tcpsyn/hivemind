import type {
  AgentConfig,
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
  TEAM_TEAMMATE_EXITED: 'team:teammate-exited'
} as const

// Renderer → Main channels (invoke/handle pattern)
export const RendererToMain = {
  AGENT_CREATE: 'agent:create',
  AGENT_INPUT: 'agent:input',
  AGENT_STOP: 'agent:stop',
  AGENT_RESTART: 'agent:restart',
  AGENT_RESIZE: 'agent:resize',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_TREE_REQUEST: 'file:tree-request',
  GIT_DIFF: 'git:diff',
  GIT_STATUS: 'git:status',
  TEAM_START: 'team:start',
  TEAM_STOP: 'team:stop'
} as const

// Payload types for Main → Renderer
export interface AgentOutputPayload {
  agentId: string
  data: string
}

export interface AgentStatusChangePayload {
  agentId: string
  status: AgentStatus
  agent: AgentState
}

export interface AgentInputNeededPayload {
  agentId: string
  agentName: string
  prompt?: string
}

export interface FileChangedPayload {
  event: FileChangeEvent
}

export interface FileTreeUpdatePayload {
  tree: FileTreeNode[]
}

export interface GitStatusUpdatePayload {
  status: GitStatus
}

// Payload types for Renderer → Main (request/response)
export interface AgentCreateRequest {
  config: AgentConfig
  cwd: string
}

export interface AgentCreateResponse {
  agentId: string
  agent: AgentState
}

export interface AgentInputRequest {
  agentId: string
  data: string
}

export interface AgentStopRequest {
  agentId: string
}

export interface AgentRestartRequest {
  agentId: string
}

export interface AgentResizeRequest {
  agentId: string
  cols: number
  rows: number
}

export interface FileReadRequest {
  filePath: string
}

export interface FileReadResponse {
  content: string
  filePath: string
}

export interface FileWriteRequest {
  filePath: string
  content: string
}

export interface FileTreeRequest {
  rootPath: string
  depth?: number
}

export interface GitDiffRequest {
  filePath: string
}

export interface GitDiffResponse {
  diff: string
  filePath: string
  original?: string
}

export interface GitStatusRequest {
  rootPath: string
}

export interface TeamStartRequest {
  config: TeamConfig
}

export interface TeamStartResponse {
  agents: AgentState[]
}

export interface TeammateSpawnedPayload {
  agentId: string
  agent: AgentState
  paneId: string
  sessionName: string
}

export interface TeammateExitedPayload {
  agentId: string
  paneId: string
  sessionName: string
  exitCode: number
}
