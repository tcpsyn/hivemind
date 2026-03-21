# IPC Reference

All IPC communication is defined in `src/shared/ipc-channels.ts`. The preload script (`src/preload/index.ts`) exposes these as typed methods on `window.api`.

Every request and event payload includes a `tabId` field to support multi-project tabs. The main process routes each call to the correct `TabContext` (PTY, files, git, team session) based on this ID.

## Channel Overview

Hivemind uses two IPC patterns:

- **Invoke** (Renderer → Main): Request/response. Renderer calls `ipcRenderer.invoke(channel, payload)`, main handles with `ipcMain.handle(channel, handler)`. All payloads are validated with Zod schemas before handling.
- **Push** (Main → Renderer): One-way events. Main calls `webContents.send(channel, payload)`, renderer subscribes via `ipcRenderer.on(channel, callback)`.

## Renderer → Main (Invoke Channels)

### Tab Management

#### `tab:create`

Create a new project tab. The main process creates per-tab services (PtyManager, FileService, GitService) and returns a unique tab ID.

```typescript
interface TabCreateRequest {
  projectPath: string // Absolute path to project directory
}

interface TabCreateResponse {
  tabId: string // Unique ID: "tab-{n}-{timestamp}"
  projectPath: string
  projectName: string // basename of projectPath
}
```

#### `tab:close`

Close a project tab. Stops any running team session, destroys PTYs, and cleans up per-tab services.

```typescript
interface TabCloseRequest {
  tabId: string
}
// Returns: void
```

### Agent Management

#### `agent:input`

Send keyboard input to an agent's PTY stdin.

```typescript
interface AgentInputRequest {
  tabId: string
  agentId: string
  data: string // Raw input data (keystrokes, pasted text)
}
// Returns: void
```

#### `agent:stop`

Kill an agent's PTY process.

```typescript
interface AgentStopRequest {
  tabId: string
  agentId: string
}
// Returns: void
```

#### `agent:restart`

Stop and respawn an agent with the same config (name, role, avatar, color). Runs `claude` in the tab's project directory.

```typescript
interface AgentRestartRequest {
  tabId: string
  agentId: string
}
// Returns: void
```

#### `agent:resize`

Resize an agent's PTY dimensions (triggered by terminal container resize).

```typescript
interface AgentResizeRequest {
  tabId: string
  agentId: string
  cols: number
  rows: number
}
// Returns: void
```

#### `dialog:open-folder`

Open a native folder picker dialog. Returns the selected directory path or null if cancelled. This channel is not part of the `RendererToMain` enum — it is registered directly.

```typescript
// No request payload
// Returns: string | null
```

### File Operations

All file operations validate that the requested path is within the tab's project root via `assertPathWithinRoot()`. Path traversal attempts throw an error.

#### `file:read`

Read a file's content.

```typescript
interface FileReadRequest {
  tabId: string
  filePath: string
}

interface FileReadResponse {
  content: string // UTF-8 file content
  filePath: string
}
```

#### `file:write`

Write content to a file. Creates parent directories if needed.

```typescript
interface FileWriteRequest {
  tabId: string
  filePath: string
  content: string
}
// Returns: void
```

#### `file:tree-request`

Get a directory tree starting from a root path.

```typescript
interface FileTreeRequest {
  tabId: string
  rootPath: string
  depth?: number
}
// Returns: FileTreeNode[]
```

```typescript
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  gitStatus?: GitFileStatus // 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | null
}
```

Ignored directories: `node_modules`, `.git`, `.claude`, `dist`, `out`. Max depth: 10 levels.

### Git Operations

#### `git:diff`

Get the git diff for a file.

```typescript
interface GitDiffRequest {
  tabId: string
  filePath: string
}

interface GitDiffResponse {
  diff: string
  filePath: string
  original?: string // Original file content from git
}
```

### Team Management

#### `team:start`

Create a new team session with an isolated tmux server and spawn the lead agent. The config is enriched with auto-assigned colors/avatars before use.

```typescript
interface TeamStartRequest {
  tabId: string
  config: TeamConfig // { name, project, agents[] }
}

interface TeamStartResponse {
  agents: AgentState[] // Initially just the lead agent
}
```

#### `team:stop`

Stop the active team session, kill the tmux server, and clean up all agents.

```typescript
interface TeamStopRequest {
  tabId: string
}
// Returns: void
```

### Teammate Management

#### `teammate:input`

Send input to a teammate's tmux pane. Supports two modes: direct write (default) or tmux send-keys.

```typescript
interface TeammateInputRequest {
  tabId: string
  paneId: string // tmux pane ID (e.g., "%1")
  data: string // Input data
  useKeys?: boolean // If true, use tmux send-keys instead of direct write
}
// Returns: void
```

#### `teammate:resize`

Resize a teammate's tmux pane dimensions.

```typescript
interface TeammateResizeRequest {
  tabId: string
  paneId: string
  cols: number
  rows: number
}
// Returns: void
```

#### `teammate:output-ready`

Signal that the renderer has mounted a terminal for a teammate and is ready to receive output. On first mount, this triggers a `capture-pane` snapshot so the terminal shows current content. On reattach, it flushes any buffered output.

```typescript
interface TeammateOutputReadyRequest {
  tabId: string
  paneId: string
  cols: number // Terminal dimensions for resize
  rows: number
}
// Returns: void
```

## Main → Renderer (Push Events)

### Agent Events

#### `agent:output`

Streaming terminal output from an agent's PTY.

```typescript
interface AgentOutputPayload {
  tabId: string
  agentId: string
  data: string // Raw terminal output (may contain ANSI codes)
}
```

#### `agent:status-change`

Agent status updated (e.g., process started, exited). Also used as the initial agent registration event — if the renderer hasn't seen this `agentId` before, it creates the agent state from `payload.agent`.

```typescript
interface AgentStatusChangePayload {
  tabId: string
  agentId: string
  status: AgentStatus // 'running' | 'idle' | 'waiting' | 'stopped'
  agent: AgentState // Full agent state
}
```

#### `agent:input-needed`

Agent is waiting for user input (prompt pattern detected in output).

```typescript
interface AgentInputNeededPayload {
  tabId: string
  agentId: string
  agentName: string
  prompt?: string // The detected prompt text
}
```

### File Events

#### `file:changed`

A file was created, modified, or deleted.

```typescript
interface FileChangedPayload {
  tabId: string
  event: FileChangeEvent // { type, path }
}
```

#### `file:tree-update`

Updated file tree after a filesystem change. Sent after debounced refresh (500ms).

```typescript
interface FileTreeUpdatePayload {
  tabId: string
  tree: FileTreeNode[]
}
```

### Git Events

#### `git:status-update`

Updated git status after a file change.

```typescript
interface GitStatusUpdatePayload {
  tabId: string
  status: GitStatus
}
```

### Team Events

#### `team:teammate-spawned`

A new teammate pane was discovered in tmux by the proxy server's polling.

```typescript
interface TeammateSpawnedPayload {
  tabId: string
  agentId: string
  agent: AgentState // Includes paneId, sessionName, isTeammate: true
  paneId: string
  sessionName: string
}
```

#### `team:teammate-exited`

A teammate pane closed (disappeared from `tmux list-panes`).

```typescript
interface TeammateExitedPayload {
  tabId: string
  agentId: string
  paneId: string
  sessionName: string
  exitCode: number
}
```

#### `team:teammate-renamed`

A teammate changed its display name (detected via tmux window/session rename).

```typescript
interface TeammateRenamedPayload {
  tabId: string
  agentId: string
  name: string
  paneId: string
}
```

#### `team:teammate-status`

Teammate metadata update — model, context window usage, git branch, project name. Parsed from the teammate's terminal status line.

```typescript
interface TeammateStatusPayload {
  tabId: string
  agentId: string
  model?: string // e.g., "claude-sonnet-4-5-20250514"
  contextPercent?: string // e.g., "42%"
  branch?: string // Current git branch
  project?: string // Project name
}
```

#### `teammate:output`

Streaming output from a teammate's tmux pane (via `pipe-pane` or `capture-pane`).

```typescript
interface TeammateOutputPayload {
  tabId: string
  paneId: string
  data: string
}
```

### Notification Events

#### `notification:focus-agent`

Sent when the user clicks a native OS notification for an agent. The renderer should focus the Electron window and navigate to the agent's terminal. This channel is not part of the `MainToRenderer` enum — it is sent directly by `NotificationService`.

```typescript
// Payload: string (agentId)
```

### Special Events

#### `team:auto-started`

Fired when the main process auto-starts a team session on app launch (e.g., from a saved config). The renderer creates the tab and populates agents from this event.

```typescript
interface TeamAutoStartedPayload {
  tabId: string
  projectName: string
  projectPath: string
  agents: AgentState[]
}
```

#### `menu:team-start` / `menu:team-stop`

Triggered from the application menu when the user starts or stops a team via keyboard shortcut.

## Preload API Summary

The `window.api` object exposed by the preload script:

```typescript
interface ElectronApi {
  // Tab management
  tabCreate(req: TabCreateRequest): Promise<TabCreateResponse>
  tabClose(req: TabCloseRequest): Promise<void>
  openFolderDialog(): Promise<string | null>

  // Agent management (invoke)
  agentInput(req: AgentInputRequest): Promise<void>
  agentStop(req: AgentStopRequest): Promise<void>
  agentRestart(req: AgentRestartRequest): Promise<void>
  agentResize(req: AgentResizeRequest): Promise<void>

  // File operations (invoke)
  fileRead(req: FileReadRequest): Promise<FileReadResponse>
  fileWrite(req: FileWriteRequest): Promise<void>
  fileTreeRequest(req: FileTreeRequest): Promise<FileTreeNode[]>

  // Git operations (invoke)
  gitDiff(req: GitDiffRequest): Promise<GitDiffResponse>

  // Team management (invoke)
  teamStart(req: TeamStartRequest): Promise<TeamStartResponse>
  teamStop(req: TeamStopRequest): Promise<void>

  // Teammate management (invoke)
  sendTeammateInput(req: TeammateInputRequest): Promise<void>
  teammateResize(req: TeammateResizeRequest): Promise<void>
  teammateOutputReady(req: TeammateOutputReadyRequest): Promise<void>

  // Agent events (subscriptions — return unsubscribe function)
  onAgentOutput(cb: (payload: AgentOutputPayload) => void): () => void
  onAgentStatusChange(cb: (payload: AgentStatusChangePayload) => void): () => void
  onAgentInputNeeded(cb: (payload: AgentInputNeededPayload) => void): () => void

  // File/git events
  onFileChanged(cb: (payload: FileChangedPayload) => void): () => void
  onFileTreeUpdate(cb: (payload: FileTreeUpdatePayload) => void): () => void
  onGitStatusUpdate(cb: (payload: GitStatusUpdatePayload) => void): () => void

  // Team events
  onTeammateSpawned(cb: (payload: TeammateSpawnedPayload) => void): () => void
  onTeammateExited(cb: (payload: TeammateExitedPayload) => void): () => void
  onTeammateOutput(cb: (payload: TeammateOutputPayload) => void): () => void
  onTeammateRenamed(cb: (payload: TeammateRenamedPayload) => void): () => void
  onTeammateStatus(cb: (payload: TeammateStatusPayload) => void): () => void
  // Auto-start and menu events
  onTeamAutoStarted(cb: (payload: TeamAutoStartedPayload) => void): () => void
  onMenuTeamStart(cb: (config: unknown) => void): () => void
  onMenuTeamStop(cb: () => void): () => void
}
```

## Validation

All Renderer → Main requests are validated with Zod schemas before the handler executes. The `validated()` wrapper in `src/main/ipc/handlers.ts` parses the request and throws a descriptive error on schema violation. Schemas are defined in `src/shared/validators.ts`.
