# Multi-Project Tabs Design

## Overview

Add tabbed multi-project support to Hivemind. Each tab runs an independent Claude Code agent team against a different project directory. Background tabs keep running.

## Decisions

1. **Background tabs keep running** — teams continue working when you switch tabs. No pause/suspend.
2. **Opening new projects** — "+" button shows recent projects list with "Open other..." folder picker fallback.
3. **Auto-start on tab open** — opening a project tab immediately spawns a lead Claude Code agent in that directory.
4. **App launch behavior** — starts with one tab at user's home directory (~) with a lead agent auto-started.
5. **Tab UI placement** — project tabs merged into the existing TopBar. Project tabs on left, Agents/Editor/Git feature tabs on right. Replaces the static project name display.
6. **Closing tabs** — confirm before closing if team is running. Close immediately if team is stopped. Closing the last tab opens a new empty tab at ~.
7. **Feature tab selection is global** — switching project tabs changes content, not view mode. New tabs always start on Agents view.

## State Architecture

### Renderer State

```typescript
interface ProjectTab {
  id: string
  projectPath: string
  projectName: string
  agents: Map<string, AgentState>
  layout: LayoutState
  editor: EditorState
  notifications: AppNotification[]
  teamStatus: 'stopped' | 'starting' | 'running'
  terminals: Map<string, Terminal>  // agentId → xterm instance
}

interface AppState {
  tabs: Map<string, ProjectTab>
  activeTabId: string
  activeFeatureTab: 'agents' | 'editor' | 'git'
  recentProjects: string[]      // persisted to localStorage
  globalLayout: { tabOrder: string[] }
}
```

### Main Process State

```typescript
interface TabContext {
  session: TeamSession | null
  ptyManager: PtyManager
  fileService: FileService
  gitService: GitService
}

// In createIpcServices:
const tabs = new Map<string, TabContext>()
```

## IPC Routing

Channel strings stay the same (`agent:input`, `team:start`, etc.). Every payload type gains a `tabId: string` field.

**Renderer → Main**: The renderer attaches `activeTabId` to every outgoing IPC call. Handlers look up `tabs.get(req.tabId)` to route to the correct `TabContext`.

**Main → Renderer**: Push events include `tabId` in the payload. The renderer dispatches to the correct tab's state. Events for non-active tabs update state but don't trigger terminal DOM operations.

**Why not one channel per tab?** Dynamic `ipcMain.handle` registration per tab is messy, hard to clean up, and doesn't work with Electron's single-handler-per-channel constraint.

## PtyManager Scoping

**One PtyManager per tab.** Each `TabContext` gets its own instance.

- Clean lifecycle — closing a tab calls `ptyManager.destroyAll()`, no orphan risk
- No ID-munging or prefix parsing needed
- Each PtyManager is lightweight (empty Map until agents spawn)
- TeamSession already accepts PtyManager in its constructor

Similarly, FileService and GitService get one instance per tab, scoped to that tab's `projectPath`.

## TopBar Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [hivemind ● ×] [my-api ● ×] [+]          [Agents][Editor][Git] │
└──────────────────────────────────────────────────────────────┘
```

**Left side — Project tabs:**
- Horizontally scrollable row of tab buttons
- Each shows: project name (basename of path), colored status dot (green=running, yellow=starting, gray=stopped), close button (×) on hover
- Active tab gets bottom border highlight using accent color
- Subtle fade/shadow on edges when overflowing

**Right side — Feature tabs** stay as-is (Agents/Editor/Git), always apply to active project tab.

**"+" button** after last project tab:
- Click shows dropdown with recent projects (last 5, from localStorage)
- "Open folder..." item at bottom triggers `dialog.showOpenDialog`

**Tab ordering:** Creation order. No drag-to-reorder in v1.

## Terminal Lifecycle

Each project tab owns its own set of xterm.js terminal instances.

**Creation:** Terminal objects and addons (WebglAddon, FitAddon) are created once when the tab first opens.

**Tab switching:** Terminals are detached from the DOM but kept alive in memory. The Terminal object continues receiving PTY data in the background. On switch-back, terminal is re-attached via `terminal.open(container)` — xterm handles this without losing scrollback.

**Why not destroy/recreate?** Recreating on every switch loses scrollback and causes flicker. An idle xterm with 5k lines of scrollback is ~2-5MB — negligible.

**Cleanup:** When a tab is closed, all Terminal instances get `.dispose()`, and the main process PtyManager destroys the PTYs.

**Hook changes:** `useTerminal` and `useTeammateTerminal` accept an optional existing Terminal instance from tab state. If one exists, attach it rather than creating new.

## File Watcher Scoping

**One chokidar watcher per tab, created lazily.**

- Each TabContext's FileService gets its own watcher scoped to the tab's projectPath
- Watcher isn't started until the user first visits Editor or file tree for that tab
- Events include tabId — renderer ignores events for non-active tabs
- Each FileService handles its own debouncing independently
- Watcher is torn down when the tab closes

### Linux inotify Guard

Linux has a system-wide cap on inotify watchers (default ~8192). Multiple tabs watching large project trees could hit this. Mitigations:

1. **Shallow watching** — only watch top 2-3 levels of the tree, expand deeper on demand (already doing depth-limited tree requests)
2. **chokidar defaults** — `usePolling: false` and `ignoreInitial: true` minimize watcher count
3. **ENOSPC error handling** — catch the error from chokidar and show a notification suggesting the user increase `fs.inotify.max_user_watches` (same approach as VS Code)

macOS (fsevents) and Windows (ReadDirectoryChangesW) have no practical limits here.

## Keyboard Shortcuts

Added to `useKeyboardShortcuts.ts`:

| Shortcut | Action |
|---|---|
| `Cmd+1` through `Cmd+9` | Switch to tab by position (Cmd+9 = last) |
| `Cmd+Shift+[` / `Cmd+Shift+]` | Previous / next tab |
| `Cmd+T` | New tab (opens "+" dropdown) |
| `Cmd+W` | Close current tab (confirm if team running) |

Windows/Linux: `Ctrl` replaces `Cmd`. No conflicts with existing shortcuts.

## Recent Projects Persistence

Stored in `localStorage` as a JSON array of path strings. Max 10 entries. Most recently opened first. Updated whenever a tab is created. Duplicates are moved to front rather than added again.

```typescript
// localStorage key: 'hivemind:recentProjects'
['\/Users/luke/code/hivemind', '/Users/luke/code/my-api', ...]
```
