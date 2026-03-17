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

## Main Process (`src/main/`)

The main process is the backend. It manages PTY sessions, file I/O, git operations, and the tmux integration that enables Claude Code's team feature.

### Entry Point (`src/main/index.ts`)

On app ready, the entry point:

1. Creates a `BrowserWindow` (1400x900, dark theme, hidden titlebar)
2. Initializes all services: `PtyManager`, `FileService`, `GitService`, `TeamConfigService`, `NotificationService`
3. Wires up IPC handlers via `createIpcServices()`
4. Builds the application menu with keyboard shortcuts
5. Registers cleanup handlers to destroy PTYs and stop teams on quit

### Services

| Service | File | Purpose |
|---------|------|---------|
| `PtyManager` | `pty/PtyManager.ts` | Spawns and manages node-pty sessions for agents and teammates |
| `FileService` | `services/FileService.ts` | Reads/writes files, builds directory trees with language detection |
| `FileWatcher` | `services/FileWatcher.ts` | Monitors filesystem changes via chokidar with 100ms debounce |
| `FileExplorerService` | `services/FileExplorerService.ts` | Combines FileService + FileWatcher + GitService for the file tree |
| `GitService` | `services/GitService.ts` | Git status and diff via simple-git |
| `TeamConfigService` | `services/TeamConfigService.ts` | Loads/saves YAML team configs from `~/.hivemind/teams/` |
| `NotificationService` | `services/NotificationService.ts` | Native OS notifications when agents need input |

### PTY Management (`src/main/pty/PtyManager.ts`)

PtyManager wraps `node-pty` to provide agent terminal sessions:

- **`createPty(config, cwd, extraEnv?)`** — Spawns a login shell running the agent's command. Each agent gets a unique ID (`agent-{counter}-{timestamp}`), status tracking, and a `PtyOutputBuffer` (circular buffer of 10,000 lines).
- **`createTeammatePty(command, cwd, env, sessionName, paneId)`** — Similar to `createPty` but for teammates discovered via tmux. Parses Claude CLI flags (`--agent-name`, `--agent-color`, etc.) from the command.
- **`sendInput(agentId, data)`** — Writes to the PTY's stdin.
- **`resize(agentId, cols, rows)`** — Resizes the PTY dimensions.
- **`destroyPty(agentId)`** / **`destroyAll()`** — Kills processes and cleans up.

**Input detection:** PtyManager monitors output for prompt patterns (`❯`, `$ `, `> `, `? `, `(y/n)`, etc.) and emits an `input-needed` event. The NotificationService listens for this to show native alerts.

### Tmux Integration (`src/main/tmux/`)

The tmux layer is what makes agent teams work. Claude Code uses tmux to spawn teammate agents as panes. Hivemind intercepts this by running a dedicated tmux server and proxying pane output to the renderer.

See [Team Management](./team-management.md) for the full flow.

Key files:
- `TeamSession.ts` — Orchestrates the tmux server lifecycle and lead agent spawning
- `TmuxProxyServer.ts` — Unix socket server that polls tmux for pane discovery and streams output
- `PtyOutputBuffer.ts` — Circular buffer (10,000 lines) for output history
- `parseClaudeCommand.ts` — Extracts agent metadata from Claude CLI flags
- `TmuxCommandParser.ts` — Parses tmux command arguments
- `TmuxResponseFormatter.ts` — Replaces tmux format strings with values

## Preload Bridge (`src/preload/index.ts`)

The preload script uses Electron's `contextBridge` to expose a typed `window.api` object. This is the only way the renderer can communicate with the main process.

The API surface includes:
- **12 invoke methods** — Request/response calls (agent CRUD, file I/O, git ops, team management)
- **10+ event listeners** — Subscriptions returning unsubscribe functions (agent output, status changes, teammate events, file changes)
- **Menu event handlers** — Team start/stop triggered from the application menu

All channels and payload types are defined in `src/shared/ipc-channels.ts`.

## Renderer (`src/renderer/`)

The renderer is a React 19 application. See [Components](./components.md) for the full component reference.

### State Management (`src/renderer/src/state/AppContext.tsx`)

State is managed with React context + `useReducer`. No external state library.

**State shape:**
```typescript
{
  project: { name, path }
  agents: Map<string, AgentState>
  notifications: AppNotification[]
  layout: {
    sidebarWidth, sidebarCollapsed,
    activeTab, gridConfig,
    maximizedPaneId, viewMode,
    teamLeadId, selectedTeammateId,
    companionPanelCollapsed
  }
  editor: {
    openFiles: EditorTab[]
    activeFileId: string | null
  }
}
```

**18 dispatch actions** cover project setup, agent lifecycle, layout changes, editor tabs, notifications, and team features.

Two context providers split reads from writes:
- `useAppState()` — Read-only state access
- `useAppDispatch()` — Dispatch function

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
→ IPC handler calls sendToRenderer('agent:output', payload)
→ Preload bridge forwards to renderer
→ useTerminal hook receives via onAgentOutput callback
→ xterm.js Terminal.write(data)
```

### User Types in Terminal

```
xterm.js Terminal.onData(input) → useTerminal calls api.agentInput()
→ Preload bridge invokes IPC 'agent:input'
→ IPC handler calls ptyManager.sendInput(agentId, data)
→ node-pty writes to PTY stdin
```

### File Change Detection

```
Filesystem change → chokidar event → FileWatcher emits 'file-changed'
→ FileExplorerService handles: sends FILE_CHANGED event,
  refreshes file tree (FILE_TREE_UPDATE),
  refreshes git status (GIT_STATUS_UPDATE)
→ Renderer updates file tree and git badges
```
