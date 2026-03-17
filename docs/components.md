# Components

All components live in `src/renderer/src/components/`. Each has a matching `.css` file for scoped styles.

## Component Hierarchy

```
App
└── ErrorBoundary
    └── AppProvider (state context)
        └── AppShell
            ├── TopBar
            ├── Sidebar
            │   ├── AgentList
            │   │   └── AgentListItem (per agent)
            │   │       └── AgentAvatar
            │   └── FileTree
            │       └── FileTreeItem (recursive)
            ├── [Main Content — tab-dependent]
            │   ├── PaneGrid (agents tab, grid view)
            │   │   └── TerminalPane (per agent)
            │   ├── LeadLayout (agents tab, lead view)
            │   │   ├── TerminalPane (lead agent)
            │   │   └── CompanionPanel
            │   │       ├── TeammateCard (per teammate)
            │   │       └── TeammateTerminalPane (selected)
            │   └── EditorView (editor tab)
            │       ├── EditorTabBar
            │       ├── MonacoEditor
            │       └── DiffView
            └── BottomBar
```

## Shell & Layout

### AppShell

The main layout container. Uses CSS Grid with named areas:

```
┌────────────────────────────────────────┐
│              TopBar                     │
├──────────┬─────────────────────────────┤
│          │                             │
│ Sidebar  │        Main Content         │
│          │   (PaneGrid / LeadLayout    │
│          │    / EditorView)            │
│          │                             │
├──────────┴─────────────────────────────┤
│              BottomBar                  │
└────────────────────────────────────────┘
```

Listens for menu events (`menu:toggle-sidebar`, `menu:set-tab`, `menu:team-start`, `menu:team-stop`, `menu:about`).

### TopBar

- **Left**: Project name and path
- **Center**: Tab buttons — Agents, Editor, Git
- **Right**: Agent status counts (running/idle/waiting/stopped), notification badge

### BottomBar

- **Left**: Agent status summary text
- **Right**: Last activity timestamp

### Sidebar

Two collapsible sections:
- **Agents** — `AgentList` showing all agents with status
- **Files** — `FileTree` with git status badges

Resizable via drag handle on the right edge. Width persists to localStorage. Can be fully collapsed.

## Agent Display

### PaneGrid

Grid view for multiple agents. Auto-calculates layout based on agent count:

| Agents | Grid |
|--------|------|
| 1 | 1x1 |
| 2 | 2x1 |
| 3-4 | 2x2 |
| 5-6 | 3x2 |

Double-click a pane header or press `Cmd+1-4` to maximize. Press `Escape` to restore.

### LeadLayout

Split view for team sessions:

```
┌──────────────────────┬───────────────────┐
│                      │  CompanionPanel   │
│   Lead Agent         │  ┌─────────────┐  │
│   Terminal           │  │ Teammate    │  │
│   (TerminalPane)     │  │ Dashboard   │  │
│                      │  ├─────────────┤  │
│                      │  │ Teammate    │  │
│                      │  │ Terminal    │  │
│                      │  └─────────────┘  │
└──────────────────────┴───────────────────┘
```

- Draggable divider between lead and companion (col-resize)
- Companion panel defaults to 35% width, min 280px, max 60%
- Toggle companion with `Cmd+\`

### TerminalPane

Individual agent terminal. Contains:
- **Header**: Agent avatar, name, role, colored status dot
- **Body**: xterm.js terminal container

Uses the `useTerminal` hook to manage the xterm.js instance. If the agent's `needsInput` flag is set, the pane highlights with a yellow glow animation.

### CompanionPanel

Teammate management panel (right side of LeadLayout):
- **Top**: Teammate dashboard with cards sorted by priority (needs-input first)
- **Divider**: Draggable row-resize between dashboard and terminal
- **Bottom**: Terminal for the selected teammate

### TeammateCard

Shows teammate status at a glance:
- Avatar, name, agent type, status dot
- Relative timestamp ("Just now", "5s ago", "2m ago")
- If `needsInput`: Approve/Deny buttons that send `y\n` or `n\n` via IPC
- Click to select and view terminal output

### AgentAvatar

SVG-based avatar with 12 icon options: robot-1, robot-2, robot-3, circuit, diamond, hexagon, star, shield, bolt, gear, cube, prism. Each renders with the agent's assigned color as tint.

## File Explorer

### FileTree

Keyboard-navigable tree view:
- **Arrow keys**: Navigate up/down
- **Left/Right**: Collapse/expand directories
- **Enter**: Open file in editor

Loads tree data via `window.api.fileTreeRequest()` and reloads on `onFileChanged` events. Context menu supports "Copy Path".

### FileTreeItem

Individual tree node:
- File/folder icon with expansion chevron for directories
- Git status badge: `M` (modified), `A` (added), `D` (deleted), `?` (untracked), `R` (renamed)
- Depth-based indentation (16px per level)

## Editor

### EditorView

Tab-based file editor:
- **Top**: `EditorTabBar` with close buttons per tab, modified indicator
- **Toggles**: Edit/Read Only mode, Diff/Editor view
- **Body**: `MonacoEditor` or `DiffView`

### MonacoEditor

Monaco editor instance configured with:
- Dark theme, 13px font size
- Minimap enabled, line numbers on
- Automatic language detection from file extension
- `onContentChange` callback for modification tracking

### DiffView

Git diff viewer with two modes:
- **Inline**: Unified diff
- **Side-by-Side**: Split view

Loads the original version from git and compares with the current file content.

## Error Handling

### ErrorBoundary

React error boundary wrapping the app. On error, shows:
- Error message
- Retry button
- Component stack logged to console

### ErrorDialog

Modal dialog for displaying errors with a details section. Dismissed with Escape key.

## Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useTerminal` | `hooks/useTerminal.ts` | Creates xterm.js instance, subscribes to agent output, handles input, auto-resizes via FitAddon + ResizeObserver |
| `useTeammateTerminal` | `hooks/useTeammateTerminal.ts` | Same as useTerminal but for teammate panes (uses paneId instead of agentId) |
| `useAgentManager` | `hooks/useAgentManager.ts` | Orchestrates agent lifecycle — listens to team/agent/teammate events, dispatches state updates. Exports: `startTeam`, `stopTeam`, `stopAgent`, `restartAgent`, `isTeamRunning` |
| `useFileTree` | `hooks/useFileTree.ts` | Loads file tree, tracks expanded directories, reloads on file changes |
| `useEditor` | `hooks/useEditor.ts` | File content loading, modification tracking, debounced autosave (500ms), read-only toggle |
| `useLayoutPersistence` | `hooks/useLayoutPersistence.ts` | Persists/restores layout state to localStorage with `hivemind:` prefix |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut handler (see [Configuration](./configuration.md#keyboard-shortcuts)) |
