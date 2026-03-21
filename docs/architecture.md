# Architecture

Hivemind follows Electron's multi-process architecture with three layers: the **main process** (Node.js), the **preload bridge** (context isolation), and the **renderer process** (React).

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐ │
│  │ Terminal  │ │ Companion│ │ Editor │ │  File Tree   │ │
│  │  Panes   │ │  Panel   │ │ (Monaco│ │  + Git       │ │
│  │ (xterm)  │ │          │ │  )     │ │  Status      │ │
│  └────┬─────┘ └────┬─────┘ └───┬────┘ └──────┬───────┘ │
│       │             │           │              │         │
│       └─────────────┴───────────┴──────────────┘         │
│                         │ window.api (preload)           │
├─────────────────────────┼───────────────────────────────┤
│                    Preload Bridge                        │
│           contextBridge.exposeInMainWorld()              │
├─────────────────────────┼───────────────────────────────┤
│                    Main Process                          │
│  ┌───────────┐ ┌────────────┐ ┌─────────────────────┐  │
│  │ PtyManager│ │ FileService│ │ TeamSession          │  │
│  │           │ │ FileWatcher│ │  ┌─────────────────┐ │  │
│  │ node-pty  │ │ GitService │ │  │ TmuxProxyServer │ │  │
│  │ sessions  │ │ chokidar   │ │  │ (Unix socket)   │ │  │
│  └─────┬─────┘ └────────────┘ │  └────────┬────────┘ │  │
│        │                      │           │           │  │
│        │                      │    ┌──────┴──────┐   │  │
│        │                      │    │ tmux server │   │  │
│        │                      │    │ (isolated)  │   │  │
│        │                      │    └─────────────┘   │  │
│        │                      └─────────────────────┘  │
└────────┴────────────────────────────────────────────────┘
         │
    OS PTY / Shell
```

## Multi-Tab Architecture

Hivemind supports multiple project tabs. Each tab is fully isolated with its own set of services. The main process maintains a `Map<string, TabContext>` mapping tab IDs to per-tab resources:

```typescript
interface TabContext {
  session: TeamSession | null // tmux proxy (if team is running)
  ptyManager: PtyManager // agent PTY lifecycle
  fileService: FileService // file I/O
  gitService: GitService // git operations
  projectPath: string // root directory
  projectName: string // display name
}
```

Every IPC request includes a `tabId` field. The main process looks up the correct `TabContext` and delegates to its services. This means two tabs can run independent team sessions with separate tmux servers, PTYs, and file watchers simultaneously.

**Tab lifecycle:**

1. `tab:create` → allocates `TabContext` with fresh services, starts file watching
2. `tab:close` → stops team session (if running), destroys PTYs, cleans up watchers

## Main Process (`src/main/`)

The main process is the backend. It manages PTY sessions, file I/O, git operations, and the tmux integration that enables Claude Code's team feature.

### Entry Point (`src/main/index.ts`)

On app ready, the entry point:

1. Creates a `BrowserWindow` (1400x900, dark theme, hidden titlebar)
2. Creates `TeamConfigService` for loading YAML team configs
3. Initializes all IPC services via `createIpcServices()` — a factory that returns handlers for every IPC channel
4. Registers callbacks for tab lifecycle: `onTabCreated` wires `FileExplorerService` + `NotificationService` per tab, `onSessionCreated` wires `TeamSession` events to IPC senders
5. Builds the application menu with keyboard shortcuts
6. Registers cleanup handlers to destroy PTYs and stop teams on quit

### IPC Service Factory (`src/main/services/createIpcServices.ts`)

The `createIpcServices()` factory is the central orchestration layer. It returns an `IpcServices` object containing a handler for every IPC channel. Internally, it manages the `Map<string, TabContext>` and routes each request to the correct tab's services.

Key design points:

- **Path validation**: All file operations run through `assertPathWithinRoot()` to prevent path traversal
- **Graceful fallback**: `tryGetTab()` returns null instead of throwing for non-critical operations (file reads, git status) — prevents errors when tabs are closing
- **Session cleanup**: `onTabClose` stops any running team session before destroying resources

### Services

| Service               | File                              | Purpose                                                                                          |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PtyManager`          | `pty/PtyManager.ts`               | Spawns and manages node-pty sessions for agents                                                  |
| `FileService`         | `services/FileService.ts`         | Reads/writes files, builds directory trees                                                       |
| `FileExplorerService` | `services/FileExplorerService.ts` | Combines FileService + chokidar watcher + GitService for reactive file tree                      |
| `GitService`          | `services/GitService.ts`          | Git status and diff via simple-git                                                               |
| `TeamConfigService`   | `services/TeamConfigService.ts`   | Loads and validates YAML team configs, auto-assigns colors/avatars                               |
| `ClaudeConfigService` | `services/ClaudeConfigService.ts` | Writes hook + MCP config to `.claude/settings.local.json` and `.mcp.json` for agent interception |
| `NotificationService` | `services/NotificationService.ts` | Native OS notifications when agents need input                                                   |

### PTY Management (`src/main/pty/PtyManager.ts`)

PtyManager wraps `node-pty` to provide agent terminal sessions:

- **`createPty(config, cwd, extraEnv?)`** — Spawns a login shell running the agent's command. Each agent gets a unique ID (`agent-{counter}-{timestamp}`), status tracking, and event listeners for data/exit/error.
- **`sendInput(agentId, data)`** — Writes to the PTY's stdin. Clears the `needsInput` flag on the agent.
- **`resize(agentId, cols, rows)`** — Resizes the PTY dimensions.
- **`destroyPty(agentId)`** / **`destroyAll()`** — Kills processes and cleans up.

**Input detection:** PtyManager monitors output for prompt patterns (`❯`, `(y/n)`, `[Y/n]`, `[y/N]`, `(yes/no)` — defined as `INPUT_PROMPT_PATTERNS` in `constants.ts`) and emits an `input-needed` event. The detection auto-clears after `INPUT_DETECTION_TIMEOUT_MS` if no user input arrives.

### Tmux Integration (`src/main/tmux/`)

The tmux layer is what makes agent teams work. Claude Code uses tmux to spawn teammate agents as panes. Hivemind intercepts this by running a dedicated tmux server and proxying pane output to the renderer.

See [Team Management](./team-management.md) for the full flow.

Key files:

- `TeamSession.ts` — Orchestrates the tmux server lifecycle, lead agent spawning, and ClaudeConfigService for hook/MCP injection
- `TmuxProxyServer.ts` — Unix socket server that polls tmux for pane discovery, streams output via `pipe-pane`, and detects teammate status (model, context%, branch)
- `parseClaudeCommand.ts` — Extracts agent metadata from Claude CLI flags (`--agent-name`, `--agent-color`, `--agent-type`, etc.)

### Hook Interception (`src/main/services/ClaudeConfigService.ts`)

When a team session starts, `ClaudeConfigService` writes two config files into the project:

1. **`.claude/settings.local.json`** — Removes any `PreToolUse` Agent hook (so Claude Code handles agent spawning natively via tmux), and grants MCP permission for hivemind tools
2. **`.mcp.json`** — Registers the `hivemind-mcp-server` with tmux environment variables (`CC_TMUX_SOCKET`, `CC_TMUX_SESSION`, `REAL_TMUX`, `TMUX_PANE`)

Both files are backed up before writing and restored on session stop.

### MCP Server (`src/main/mcp/hivemind-mcp-server.ts`)

A standalone Node.js MCP server that runs as a subprocess of each Claude Code agent (via stdio transport). It provides five tools for teammate coordination:

| Tool                       | Purpose                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `hivemind_list_teammates`  | List active teammate panes + pending completion notifications   |
| `hivemind_check_teammate`  | Get recent output and status of a specific teammate pane        |
| `hivemind_send_message`    | Send a message/task to a teammate by typing into their terminal |
| `hivemind_report_complete` | Report task completion (writes to a shared JSONL file)          |
| `hivemind_get_updates`     | Get and consume pending teammate completion notifications       |

The server queries tmux directly using `REAL_TMUX` and `CC_TMUX_SOCKET` env vars. Completion reports are persisted to `/tmp/hivemind-{session}-updates.jsonl` and consumed (truncated) on read. Built with `@modelcontextprotocol/sdk` and bundled via `pnpm build:mcp` (esbuild).

## Preload Bridge (`src/preload/index.ts`)

The preload script uses Electron's `contextBridge` to expose a typed `window.api` object. This is the only way the renderer can communicate with the main process.

The API surface includes:

- **16 invoke methods** — Request/response calls (tab CRUD, agent lifecycle, file I/O, git ops, team + teammate management)
- **13 event listeners** — Subscriptions returning unsubscribe functions (agent output, status changes, teammate events, file changes)
- **3 menu event handlers** — Team start/stop triggered from the application menu, and auto-start on launch

All channels and payload types are defined in `src/shared/ipc-channels.ts`. See [IPC Reference](./ipc-reference.md) for the full listing.

The `createOnHandler<T>()` utility creates event listeners that properly clean up via the returned unsubscribe function, preventing stale closures.

## Renderer (`src/renderer/`)

The renderer is a React 19 application. See [Components](./components.md) for the full component reference.

### State Management (`src/renderer/src/state/AppContext.tsx`)

State is managed with React context + `useReducer`. No external state library.

**State shape:**

```typescript
interface AppState {
  tabs: Map<string, ProjectTab> // Per-project tab state
  activeTabId: string // Currently visible tab
  activeFeatureTab: 'agents' | 'editor' | 'git' // Left panel view
  recentProjects: string[] // Recently opened paths (max 10)
  globalLayout: {
    tabOrder: string[] // Tab display order
    sidebarWidth: number
    sidebarCollapsed: boolean
  }
}
```

**Per-tab state (`ProjectTab`):**

```typescript
interface ProjectTab {
  id: string
  projectPath: string
  projectName: string
  agents: Map<string, AgentState> // All agents in this tab
  layout: TabLayout // Grid config, view mode, companion panel
  editor: {
    openFiles: EditorTab[]
    activeFileId: string | null
  }
  notifications: AppNotification[]
  teamStatus: 'stopped' | 'starting' | 'running'
}
```

**Layout state (`TabLayout`):**

```typescript
interface TabLayout {
  gridConfig: GridConfig // Grid dimensions + auto mode
  maximizedPaneId: string | null // For maximizing a single pane
  viewMode: 'lead' | 'grid' // Team lead view vs equal grid
  teamLeadId: string | null // Which agent is the lead
  selectedTeammateId: string | null // Which teammate is shown in companion
  companionPanelCollapsed: boolean
}
```

**Reducer actions** cover five domains:

- **Tab lifecycle** (4 actions): `CREATE_TAB`, `CLOSE_TAB`, `SET_ACTIVE_PROJECT_TAB`, `REORDER_TABS`
- **Global UI** (4 actions): feature tab, sidebar width, sidebar toggle, recent projects
- **Per-tab agents** (3 actions): `ADD_AGENT`, `UPDATE_AGENT`, `REMOVE_AGENT`
- **Per-tab layout** (7 actions): grid, maximize/restore, view mode, team lead, teammate selection, companion toggle
- **Per-tab editor + notifications + team status** (6 actions)

The `updateTab()` helper function handles immutable per-tab mutations — it looks up the tab by ID, applies the updater function, and returns new state with a cloned Map.

**Context providers split reads from writes:**

- `useAppState()` — Read-only state access
- `useAppDispatch()` — Dispatch function
- `useActiveTab()` — Convenience hook for the currently active `ProjectTab` (throws if none)

### Layout Persistence (`useLayoutPersistence` hook)

Sidebar width, active tab, collapsed state, and project path persist to `localStorage` with a `hivemind:` prefix. Restored on mount.

### Styling

CSS custom properties in `variables.css` define the dark theme:

- Background: `#1a1a2e`
- 12 agent colors (coral, teal, sky, sage, gold, plum, mint, amber, lavender, azure, peach, emerald)
- Status colors: running (green), idle (gray), waiting (yellow), stopped (red)
- 4px spacing scale, system + monospace fonts

Component-specific CSS files sit alongside their components.

## Data Flow Examples

### Agent Output (streaming)

```
PTY process → node-pty onData → PtyManager emits 'data'
→ IPC handler calls sendAgentOutput({ tabId, agentId, data })
→ Preload bridge forwards to renderer
→ useTerminal hook receives via onAgentOutput callback (filtered by tabId + agentId)
→ xterm.js Terminal.write(data)
```

### User Types in Terminal

```
xterm.js Terminal.onData(input) → useTerminal calls api.agentInput({ tabId, agentId, data })
→ Preload bridge invokes IPC 'agent:input'
→ Handler validates with Zod, looks up TabContext
→ ptyManager.sendInput(agentId, data)
→ node-pty writes to PTY stdin
```

### Teammate Spawn Detection

```
Lead Claude Code agent calls Agent tool
→ Claude Code detects TMUX env var, spawns agent as tmux pane
→ TmuxProxyServer polls tmux list-panes every 2s, discovers new pane
→ parseClaudeCommand() extracts agent metadata from CLI args
→ Proxy emits 'teammate-detected'
→ TeamSession sends TEAM_TEAMMATE_SPAWNED to renderer
→ Renderer dispatches ADD_AGENT, auto-selects first teammate
```

### File Change Detection

```
Filesystem change → chokidar event → FileExplorerService.handleFileChange()
→ Debounce timer (500ms)
→ refreshTreeAndGitStatus() rebuilds file tree + git state
→ Sends FILE_TREE_UPDATE + GIT_STATUS_UPDATE to renderer (with tabId)
→ Renderer updates file tree and git badges
```

### Terminal Reattach (switching between teammates)

```
User clicks different teammate in CompanionPanel
→ Previous TeammateTerminalPane unmounts:
  - detachTerminal() removes xterm from DOM but keeps buffer in TerminalRegistry
→ New TeammateTerminalPane mounts:
  - getOrCreateTerminal() returns cached entry (or creates new)
  - attachTerminal() re-opens xterm in new container
  - If reattach: clear buffer, fit, call teammateOutputReady()
  - Main process flushes buffered output via capture-pane snapshot
```

## Key Design Decisions

### Why per-tab isolation?

Each tab gets its own PtyManager, FileService, GitService, and optional TeamSession. This avoids cross-project contamination — a team session in one tab can't affect another tab's agents or file watches.

### Why a TerminalRegistry singleton?

xterm.js instances are expensive to create and lose their buffer on disposal. The registry keeps terminals alive across React component mount/unmount cycles. When you switch between teammate views, the terminal detaches from the DOM but keeps its buffer. On reattach, all previous output is preserved.

### Why two terminal hooks?

`useTerminal` manages lead agent terminals connected to PTYs (via `agentInput`/`agentOutput`). `useTeammateTerminal` manages teammate terminals connected to tmux panes (via `sendTeammateInput`/`teammateOutput`). The reattach logic differs because teammates need `capture-pane` snapshots while lead agents stream directly from PTY.

### Why Zod validation on IPC?

Both sides of the IPC bridge are TypeScript, but the boundary is still a runtime trust boundary. Zod schemas catch shape mismatches early with descriptive errors instead of cryptic downstream failures.
