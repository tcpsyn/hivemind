export type AgentStatus = 'running' | 'idle' | 'waiting' | 'stopped'

export interface AgentState {
  id: string
  name: string
  role: string
  avatar: string
  color: string
  status: AgentStatus
  needsInput: boolean
  lastActivity: number
  pid?: number
  paneId?: string
  sessionName?: string
  isTeammate?: boolean
  agentType?: string
  model?: string
  contextPercent?: string
  branch?: string
}

export interface PaneInfo {
  paneId: string
  pid: number
  tty?: string
  cols: number
  rows: number
  name: string
  isActive: boolean
}

export interface AgentConfig {
  name: string
  role: string
  command: string
  avatar?: string
  color?: string
}

export interface TeamConfig {
  name: string
  project: string
  agents: AgentConfig[]
}

export type GridLayout = '1x1' | '2x1' | '1x2' | '2x2' | '3x2' | 'auto'

export interface GridConfig {
  layout: GridLayout
  columns: number
  rows: number
}

export interface EditorTab {
  id: string
  filePath: string
  fileName: string
  language: string
  isModified: boolean
  isReadOnly: boolean
}

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  gitStatus?: GitFileStatus
}

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | null

export interface AppNotification {
  id: string
  agentId: string
  agentName: string
  message: string
  timestamp: number
  read: boolean
}

export type ActiveTab = 'agents' | 'editor' | 'git'

export type TeamStatus = 'stopped' | 'starting' | 'running'

export type ViewMode = 'lead' | 'grid'

export interface TabLayout {
  gridConfig: GridConfig
  maximizedPaneId: string | null
  viewMode: ViewMode
  teamLeadId: string | null
  selectedTeammateId: string | null
  companionPanelCollapsed: boolean
}

export interface ProjectTab {
  id: string
  projectPath: string
  projectName: string
  agents: Map<string, AgentState>
  layout: TabLayout
  editor: {
    openFiles: EditorTab[]
    activeFileId: string | null
  }
  notifications: AppNotification[]
  teamStatus: TeamStatus
}

export interface AppState {
  tabs: Map<string, ProjectTab>
  activeTabId: string
  activeFeatureTab: ActiveTab
  recentProjects: string[]
  globalLayout: {
    tabOrder: string[]
    sidebarWidth: number
    sidebarCollapsed: boolean
  }
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export interface GitStatus {
  files: Array<{
    path: string
    status: GitFileStatus
  }>
  branch: string
  ahead: number
  behind: number
}
