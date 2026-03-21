# Components

All components live in `src/renderer/src/components/`. Each has a matching `.css` file for scoped styles.

## Component Hierarchy

```
App
└── ErrorBoundary
    └── AppProvider (state context)
        └── AppShell
            ├── TopBar
            │   ├── Project tabs (with status dots, close buttons, + new tab menu with recent projects)
            │   └── Feature tabs (Agents / Editor / Git)
            ├── Sidebar
            │   ├── AgentList
            │   │   └── AgentListItem (per agent)
            │   └── FileTree
            │       └── FileTreeItem (recursive)
            ├── [Main Content — per active tab, feature-dependent]
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

Each project tab (`ProjectTab`) maintains independent state: agents, layout, editor tabs, and notifications. Switching tabs swaps the entire main content area.

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

Keyboard shortcuts are handled by `useKeyboardShortcuts` (sidebar toggle, tab cycling, view mode, companion panel). Team start/stop menu events flow through the preload bridge and are handled by `useAgentManager`.

### TopBar

- **Left**: Project tabs — scrollable row of tabs with team status dots, project names, close buttons, and a `+` button that opens a dropdown with recent projects and "Open folder…"
- **Right**: Feature tabs — Agents, Editor, Git buttons for switching the main content area

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
| ------ | ---- |
| 1      | 1x1  |
| 2      | 2x1  |
| 3-4    | 2x2  |
| 5-6    | 3x2  |

Double-click a pane header to maximize. Press `Escape` to restore.

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

Uses the `useTerminal` hook to manage the xterm.js instance.

### CompanionPanel

Teammate management panel (right side of LeadLayout):

- **Top**: Teammate dashboard with cards
- **Divider**: Draggable row-resize between dashboard and terminal
- **Bottom**: Terminal for the selected teammate

### TeammateTerminalPane

Terminal pane for teammate tmux panes. Similar to `TerminalPane` but uses the `useTeammateTerminal` hook instead of `useTerminal`. Handles the complexity of reattaching to a tmux pane: on component remount, it clears stale pipe-pane data, fits the terminal, and requests a fresh `capture-pane` snapshot from the main process.

### TeammateCard

Shows teammate status at a glance:

- Avatar, name, agent type, status dot
- Model name, context window usage (e.g., "42%"), git branch
- Relative timestamp ("Just now", "5s ago", "2m ago")
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

## Hooks

| Hook                    | File                             | Purpose                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTerminal`           | `hooks/useTerminal.ts`           | Creates xterm.js instance for lead agents, subscribes to `onAgentOutput`, handles input via `agentInput`, auto-resizes via FitAddon + ResizeObserver (150ms debounce). Writes a welcome banner on first create, clears it on first output.                                                                                 |
| `useTeammateTerminal`   | `hooks/useTeammateTerminal.ts`   | Like `useTerminal` but for teammate tmux panes. Uses `sendTeammateInput`/`onTeammateOutput`. Handles reattach: clears garbled pipe-pane data, fits terminal, calls `teammateOutputReady` for capture-pane snapshot. First mount uses double-rAF to wait for DOM layout.                                                    |
| `useAgentManager`       | `hooks/useAgentManager.ts`       | Central lifecycle hook. Subscribes to all agent + teammate IPC events and dispatches state updates routed by `payload.tabId`. Tracks per-tab agent sets via refs to avoid stale closure issues. Exports: `startTeam`, `stopTeam`, `stopAgent`, `restartAgent`, `isTeamRunning`. Handles auto-start events and menu events. |
| `useFileTree`           | `hooks/useFileTree.ts`           | Loads file tree via `fileTreeRequest`, tracks expanded directories, reloads on `onFileChanged` events                                                                                                                                                                                                                      |
| `useEditor`             | `hooks/useEditor.ts`             | File content loading, modification tracking, debounced autosave (500ms), read-only toggle. Tracks file path changes to reload content.                                                                                                                                                                                     |
| `useLayoutPersistence`  | `hooks/useLayoutPersistence.ts`  | Persists/restores layout state to localStorage with `hivemind:` prefix                                                                                                                                                                                                                                                     |
| `useRecentProjects`     | `hooks/useRecentProjects.ts`     | Manages recently opened project paths for quick access                                                                                                                                                                                                                                                                     |
| `useKeyboardShortcuts`  | `hooks/useKeyboardShortcuts.ts`  | Global keyboard shortcut handler (see [Configuration](./configuration.md#keyboard-shortcuts))                                                                                                                                                                                                                              |

### Terminal Registry (`src/renderer/src/terminal/TerminalRegistry.ts`)

Singleton that manages xterm.js instance lifetimes across React mount/unmount cycles. Keyed by `{tabId}:{terminalId}` (where terminalId is either an agentId or `teammate:{paneId}`).

Key methods:

- **`getOrCreateTerminal(tabId, termId, opts, onInit)`** — Lazy-creates a terminal + FitAddon. The `onInit` callback runs once on creation and should return an unsubscribe function for IPC output subscriptions.
- **`attachTerminal(tabId, termId, container)`** — Opens the terminal in a DOM element (or re-opens if previously detached).
- **`detachTerminal(tabId, termId)`** — Removes from DOM but keeps the terminal alive with its buffer intact.
- **`disposeTerminal(tabId, termId)`** / **`disposeTabTerminals(tabId)`** — Full disposal.

**Why this matters:** xterm.js continues to update its internal buffer even when not attached to the DOM. This means you can switch between teammate views without losing any output. On reattach, xterm paints the full buffer correctly.
