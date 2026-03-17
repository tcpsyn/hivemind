# IPC Reference

All IPC communication is defined in `src/shared/ipc-channels.ts`. The preload script (`src/preload/index.ts`) exposes these as typed methods on `window.api`.

## Channel Overview

Hivemind uses two IPC patterns:

- **Invoke** (Renderer → Main): Request/response. Renderer calls `ipcRenderer.invoke(channel, payload)`, main handles with `ipcMain.handle(channel, handler)`.
- **Push** (Main → Renderer): One-way events. Main calls `webContents.send(channel, payload)`, renderer subscribes via `ipcRenderer.on(channel, callback)`.

## Renderer → Main (Invoke Channels)

### Agent Management

#### `agent:create`

Spawn a new agent with a PTY session.

```typescript
// Request
interface AgentCreateRequest {
  config: AgentConfig    // { name, role, command, avatar?, color? }
  cwd: string            // Working directory
}

// Response
interface AgentCreateResponse {
  agentId: string        // Unique ID: "agent-{n}-{timestamp}"
  agent: AgentState      // Full agent state
}
```

#### `agent:input`

Send keyboard input to an agent's PTY stdin.

```typescript
interface AgentInputRequest {
  agentId: string
  data: string           // Raw input data (keystrokes, pasted text)
}
// Returns: void
```

#### `agent:stop`

Kill an agent's PTY process.

```typescript
interface AgentStopRequest {
  agentId: string
}
// Returns: void
```

#### `agent:restart`

Stop and respawn an agent with the same config.

```typescript
interface AgentRestartRequest {
  agentId: string
}
// Returns: void
```

#### `agent:resize`

Resize an agent's PTY dimensions (triggered by terminal container resize).

```typescript
interface AgentResizeRequest {
  agentId: string
  cols: number
  rows: number
}
// Returns: void
```

### File Operations

#### `file:read`

Read a file's content.

```typescript
interface FileReadRequest {
  filePath: string
}

interface FileReadResponse {
  content: string        // UTF-8 file content
}
```

#### `file:write`

Write content to a file. Creates parent directories if needed.

```typescript
interface FileWriteRequest {
  filePath: string
  content: string
}
// Returns: void
```

#### `file:tree-request`

Get a directory tree starting from a root path.

```typescript
interface FileTreeRequest {
  rootPath: string
}
// Returns: FileTreeNode[]
```

```typescript
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
  language?: string         // Monaco language ID
  gitStatus?: GitFileStatus // 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | null
}
```

Ignored directories: `node_modules`, `.git`, `dist`, `out`. Max depth: 10 levels.

### Git Operations

#### `git:diff`

Get the git diff for a file.

```typescript
interface GitDiffRequest {
  filePath: string
  staged?: boolean
}

interface GitDiffResponse {
  original: string       // Original file content from git
}
```

#### `git:status`

Get the current git status.

```typescript
interface GitStatusRequest {
  cwd?: string
}

// Response
interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: Array<{
    path: string
    status: GitFileStatus
  }>
}
```

### Team Management

#### `team:start`

Create a new team session with a tmux server and spawn the lead agent.

```typescript
interface TeamStartRequest {
  config: TeamConfig     // { name, project, agents[] }
}

interface TeamStartResponse {
  agents: AgentState[]   // All spawned agents (initially just the lead)
}
```

#### `team:stop`

Stop the active team session, kill the tmux server, and clean up all agents.

```typescript
// No request payload
// Returns: void
```

### Teammate Management

#### `teammate:input`

Send input to a teammate's tmux pane.

```typescript
interface TeammateInputRequest {
  paneId: string         // tmux pane ID (e.g., "%1")
  data: string           // Input data
}
// Returns: void
```

## Main → Renderer (Push Events)

### Agent Events

#### `agent:output`

Streaming terminal output from an agent.

```typescript
interface AgentOutputPayload {
  agentId: string
  data: string           // Raw terminal output (may contain ANSI codes)
}
```

#### `agent:status-change`

Agent status updated (e.g., process exited).

```typescript
interface AgentStatusChangePayload {
  agentId: string
  agent: AgentState
}
```

#### `agent:input-needed`

Agent is waiting for user input (prompt pattern detected).

```typescript
interface AgentInputNeededPayload {
  agentId: string
  agentName: string
}
```

### File Events

#### `file:changed`

A file was created, modified, or deleted.

```typescript
interface FileChangedPayload {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}
```

#### `file:tree-update`

Updated file tree after a filesystem change.

```typescript
interface FileTreeUpdatePayload {
  tree: FileTreeNode[]
}
```

### Git Events

#### `git:status-update`

Updated git status after a file change.

```typescript
interface GitStatusUpdatePayload {
  status: GitStatus
}
```

### Team Events

#### `team:teammate-spawned`

A new teammate pane was discovered in tmux.

```typescript
interface TeammateSpawnedPayload {
  agent: AgentState      // Includes paneId, isTeammate: true
}
```

#### `team:teammate-exited`

A teammate pane closed.

```typescript
interface TeammateExitedPayload {
  agentId: string
}
```

#### `team:teammate-renamed`

A teammate changed its display name.

```typescript
interface TeammateRenamedPayload {
  agentId: string
  name: string
}
```

#### `teammate:output`

Streaming output from a teammate's tmux pane.

```typescript
interface TeammateOutputPayload {
  paneId: string
  data: string
}
```

## Preload API Summary

The `window.api` object exposed by the preload script:

```typescript
interface ElectronApi {
  // Invoke (request/response)
  agentCreate(req: AgentCreateRequest): Promise<AgentCreateResponse>
  agentInput(req: AgentInputRequest): Promise<void>
  agentStop(req: AgentStopRequest): Promise<void>
  agentRestart(req: AgentRestartRequest): Promise<void>
  agentResize(req: AgentResizeRequest): Promise<void>
  fileRead(req: FileReadRequest): Promise<FileReadResponse>
  fileWrite(req: FileWriteRequest): Promise<void>
  fileTreeRequest(req: FileTreeRequest): Promise<FileTreeNode[]>
  gitDiff(req: GitDiffRequest): Promise<GitDiffResponse>
  gitStatus(req: GitStatusRequest): Promise<GitStatus>
  teamStart(req: TeamStartRequest): Promise<TeamStartResponse>
  teamStop(): Promise<void>

  // Event subscriptions (return unsubscribe function)
  onAgentOutput(cb: (payload: AgentOutputPayload) => void): () => void
  onAgentStatusChange(cb: (payload: AgentStatusChangePayload) => void): () => void
  onAgentInputNeeded(cb: (payload: AgentInputNeededPayload) => void): () => void
  onFileChanged(cb: (payload: FileChangedPayload) => void): () => void
  onFileTreeUpdate(cb: (payload: FileTreeUpdatePayload) => void): () => void
  onGitStatusUpdate(cb: (payload: GitStatusUpdatePayload) => void): () => void
  onTeammateSpawned(cb: (payload: TeammateSpawnedPayload) => void): () => void
  onTeammateExited(cb: (payload: TeammateExitedPayload) => void): () => void
  onTeammateOutput(cb: (payload: TeammateOutputPayload) => void): () => void
  onTeammateRenamed(cb: (payload: TeammateRenamedPayload) => void): () => void
  sendTeammateInput(req: TeammateInputRequest): Promise<void>

  // Menu events
  onMenuTeamStart(cb: (config: TeamConfig) => void): () => void
  onMenuTeamStop(cb: () => void): () => void
}
```
