# Claude Frontend — Design Document

**Date**: 2026-03-16
**Status**: Approved

## Overview

A desktop application (Electron + React + TypeScript) that replaces tmux-in-iTerm for managing Claude Code agent teams. Provides an IDE-like experience with terminal panes, file editing, agent management, and system notifications.

## Goals

1. **Usable agent management** — see all agents, their status, and who needs input at a glance
2. **Real copy/paste** — mouse-based text selection and clipboard in any pane
3. **Notifications** — in-app visual indicators + macOS native notifications when agents need input
4. **IDE integration** — file tree, editor, git diffs without leaving the app
5. **Agent identity** — avatars and colors make each agent instantly recognizable

## Non-Goals (v1)

- Full LSP/language server support
- Multi-project/multi-root workspaces
- Remote/SSH agent management
- Plugin system

---

## Architecture

### Process Model

```
┌─────────────────────────────────┐
│         Electron Main           │
│  ┌───────────┐  ┌────────────┐  │
│  │ PTY Manager│  │ File Watcher│ │
│  │ (node-pty) │  │ (chokidar)  │ │
│  └─────┬─────┘  └──────┬─────┘  │
│        │    IPC Bridge   │       │
│  ┌─────┴────────────────┴─────┐  │
│  │      IPC Handlers          │  │
│  └─────────────┬──────────────┘  │
└────────────────┼─────────────────┘
                 │ contextBridge
┌────────────────┼─────────────────┐
│         Electron Renderer        │
│  ┌─────────────┴──────────────┐  │
│  │        React App           │  │
│  │  ┌────────┐ ┌───────────┐  │  │
│  │  │Sidebar │ │ Main Area │  │  │
│  │  │        │ │ ┌───────┐ │  │  │
│  │  │Agents  │ │ │xterm  │ │  │  │
│  │  │Files   │ │ │Monaco │ │  │  │
│  │  └────────┘ │ └───────┘ │  │  │
│  │             └───────────┘  │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### Main Process Responsibilities

- **PTY Manager**: Spawns and manages `claude` CLI processes via `node-pty`. Each agent gets a dedicated PTY. Handles lifecycle (start, stop, restart). Monitors output for "waiting for input" patterns.
- **File Watcher**: Uses `chokidar` to watch the project directory. Pushes file change events to renderer via IPC.
- **Git Service**: Uses `simple-git` to provide git status, diff, and file history.
- **Notification Service**: Triggers macOS native notifications via Electron's Notification API.

### IPC Channels (typed)

```typescript
// Main → Renderer
'agent:output'        // PTY data from agent
'agent:status-change' // Agent status update
'agent:input-needed'  // Agent is waiting for input
'file:changed'        // File system change event
'file:tree-update'    // Full file tree refresh
'git:status-update'   // Git status changed

// Renderer → Main
'agent:create'        // Spawn new agent PTY
'agent:input'         // Send input to agent PTY
'agent:stop'          // Stop agent process
'agent:restart'       // Restart agent process
'agent:resize'        // Resize agent PTY
'file:read'           // Read file contents
'file:write'          // Write file contents
'file:tree-request'   // Request file tree
'git:diff'            // Request git diff for file
'git:status'          // Request git status
'team:start'          // Start a team configuration
'team:stop'           // Stop all agents
```

### Preload Script

Uses `contextBridge.exposeInMainWorld` to expose a typed `window.api` object. No `nodeIntegration` — strict security model.

---

## UI Layout

### App Shell

```
┌──────────────────────────────────────────────────────┐
│ Top Bar: [Project Name] [path]    [Team ▾] [● 1 needs input] │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Sidebar   │         Main Content Area               │
│  (250px)   │                                         │
│            │  [Agents] [Editor] [Git]  ← tab bar    │
│  ┌──────┐  │  ┌─────────────┬─────────────┐         │
│  │Agents│  │  │  Agent 1    │  Agent 2    │         │
│  │ List │  │  │  (xterm)    │  (xterm)    │         │
│  │      │  │  │             │             │         │
│  ├──────┤  │  ├─────────────┼─────────────┤         │
│  │ File │  │  │  Agent 3    │  Agent 4    │         │
│  │ Tree │  │  │  (xterm)    │  (xterm)    │         │
│  │      │  │  │             │             │         │
│  └──────┘  │  └─────────────┴─────────────┘         │
├────────────┴─────────────────────────────────────────┤
│ Bottom Bar: [3 running] [1 idle] [1 waiting] [2 files changed] │
└──────────────────────────────────────────────────────┘
```

### Sidebar — Agent Panel

Each agent entry displays:
- **Avatar**: Auto-assigned from a curated set of distinct SVG icons (robot variants, geometric shapes, animals). Configurable in team config.
- **Color**: Unique color from a high-contrast palette. Used for pane header, sidebar indicator, and notification grouping.
- **Name/Role**: Agent name and brief role description.
- **Status Badge**: Running (green pulse), Idle (gray), Waiting for Input (amber pulse), Stopped (red).

Right-click context menu: Restart, Stop, View Full History, Copy Last Output.

When an agent needs input:
- Sidebar entry gets a pulsing amber border
- Entry auto-sorts to top of list
- Count shown in top bar

### Sidebar — File Tree

- Standard collapsible tree, lazy-loaded for large projects
- Git status icons: M (modified/orange), A (added/green), D (deleted/red), ? (untracked/gray)
- Click to open in editor tab
- Right-click: Open in Finder, Copy Path, View Git History

### Main Content — Agent Grid

- Configurable grid: 1x1, 2x1, 1x2, 2x2, 3x2 (auto-fit based on agent count)
- Each pane:
  - Thin colored header: avatar + name + status dot
  - xterm.js terminal with full PTY
  - Mouse selection → clipboard copy
  - Click to focus, type to send input
  - Pane border glows amber when input needed
- Grid is resizable (drag borders between panes)
- Double-click header to maximize a pane (escape to restore)

### Main Content — Editor View

- Tab bar for open files
- Monaco editor with syntax highlighting
- Read-only by default, click "Edit" to enable writing
- Git diff view (inline or side-by-side) accessible per file
- Changes auto-save with debounce (500ms)

### Top Bar

- Project name and path
- Team dropdown: start/stop team, select team config
- Global status: agent counts by state, notification count
- Settings gear icon

### Bottom Bar

- Agent summary: "3 running · 1 idle · 1 waiting"
- File change summary: "2 files modified"
- Last activity timestamp

---

## Agent Identity System

### Colors

Palette of 12 high-contrast colors, auto-assigned round-robin:
```
#FF6B6B (coral), #4ECDC4 (teal), #45B7D1 (sky), #96CEB4 (sage),
#FFEAA7 (gold), #DDA0DD (plum), #98D8C8 (mint), #F7DC6F (amber),
#BB8FCE (lavender), #85C1E9 (azure), #F0B27A (peach), #82E0AA (emerald)
```

### Avatars

Set of 12+ distinct SVG icons. Robot variants, geometric patterns, or abstract shapes. Each visually distinct at small sizes (24x24). Assigned alongside colors — no two agents share avatar+color combo.

### Configuration

```yaml
# team.yml
name: "my-feature-team"
project: "/path/to/project"
agents:
  - name: "architect"
    role: "Lead architect and coordinator"
    command: "claude --team my-team --role architect"
    avatar: "robot-1"      # optional, auto-assigned if omitted
    color: "#4ECDC4"       # optional, auto-assigned if omitted
  - name: "frontend"
    role: "React frontend developer"
    command: "claude --team my-team --role frontend"
  - name: "backend"
    role: "Backend and infrastructure"
    command: "claude --team my-team --role backend"
  - name: "qa"
    role: "Test engineer"
    command: "claude --team my-team --role qa"
```

---

## Notification System

### Input Detection

Monitor PTY output streams for patterns indicating the agent is waiting:
- Cursor at prompt position with no recent output (configurable timeout: 5s)
- Known prompt patterns: `❯`, `$`, `>`, `?`, `(y/n)`, `[Y/n]`
- Claude-specific: tool approval prompts, permission requests

### In-App Notifications

- **Sidebar**: Pulsing amber border on agent entry, auto-sort to top
- **Pane header**: Amber glow on the pane border
- **Top bar**: Badge count of agents needing input
- **Dock icon**: Badge number via Electron's `app.dock.setBadge()`

### Native Notifications

- macOS Notification Center via `new Notification()`
- Grouped by app, shows agent name and preview of what it's asking
- Click notification → focuses app and that agent's pane

---

## State Management

### App State (React Context + useReducer)

```typescript
interface AppState {
  project: {
    path: string;
    name: string;
  };
  agents: Map<string, AgentState>;
  layout: {
    sidebarWidth: number;
    gridConfig: GridConfig;
    activeTab: 'agents' | 'editor' | 'git';
  };
  editor: {
    openFiles: EditorTab[];
    activeFileId: string | null;
  };
  notifications: Notification[];
}

interface AgentState {
  id: string;
  name: string;
  role: string;
  avatar: string;
  color: string;
  status: 'running' | 'idle' | 'waiting' | 'stopped';
  needsInput: boolean;
  lastActivity: Date;
}
```

### Persistence

- Window state (size, position) saved to electron-store
- Layout preferences persisted
- Team configurations stored as YAML files
- Recent projects list

---

## Technology Choices

| Component | Library | Why |
|-----------|---------|-----|
| Terminal | xterm.js + @xterm/addon-fit | Industry standard, great React compat |
| Editor | Monaco Editor | VS Code's editor, syntax + themes free |
| PTY | node-pty | Native PTY for Electron main process |
| File watching | chokidar | Reliable, cross-platform |
| Git | simple-git | Clean promise-based API |
| IPC typing | electron-trpc or custom | Type-safe IPC |
| Build | Vite + electron-vite | Fast HMR, good DX |
| State | React Context + useReducer | Simple, sufficient for this scale |
| Config | yaml | Team config files |
| Persistence | electron-store | Simple key-value for preferences |

---

## Implementation Phases

### Phase 1: Foundation
- Electron + React + Vite scaffolding
- Build pipeline, test infrastructure
- Basic window with app shell layout

### Phase 2: Core Infrastructure
- PTY manager in main process
- IPC bridge with typed channels
- Agent lifecycle management

### Phase 3: Agent UI
- Sidebar agent list with avatars/colors
- xterm.js pane grid
- Agent status tracking and display

### Phase 4: Interaction
- Input detection and notification system
- Copy/paste in terminal panes
- Agent start/stop/restart controls

### Phase 5: IDE Features
- File tree with chokidar watcher
- Monaco editor integration
- Git status and diff views

### Phase 6: Polish
- Team configuration UI
- Layout persistence
- Keyboard shortcuts
- Performance optimization
