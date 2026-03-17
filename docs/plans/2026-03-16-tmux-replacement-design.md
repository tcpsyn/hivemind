# Replacing tmux with Native Electron Pane Management

**Date**: 2026-03-16
**Status**: Approved

## Problem Statement

Claude Code agent teams use tmux in iTerm to manage the team lead and teammates. This has fundamental UX problems:

1. **Focus stealing** — new teammate panes grab keyboard focus
2. **Copy/paste broken** — can't mouse-select and copy from tmux panes
3. **Mouse scrolling broken** — scrolling one pane bleeds into others or enters copy mode
4. **No notifications** — must visually monitor every pane
5. **Cramped panes** — 10+ teammates means unreadable tiny panes

Our Electron app replaces tmux entirely, solving all of these.

## Approach: Fake tmux Binary

Claude Code spawns teammates by calling `tmux` commands (new-window, send-keys, list-panes, etc.). We intercept these by providing a **fake tmux binary** that routes commands to our Electron app via Unix domain socket.

### Why This Works

1. Claude checks `TMUX_PROGRAM` env var for the tmux binary path — we point it to our shim
2. Claude's teammate IPC is file-based (`~/.claude/teams/<name>/inboxes/`) — completely decoupled from tmux
3. Only ~10 tmux commands need implementing
4. The `backendType` field and existing iTerm2 backend prove Claude's tmux interaction is already abstracted

### Why Not Other Approaches

- **Process monitoring**: Claude won't spawn teammates without `TMUX` env var set
- **Wrapping real tmux**: Still has the same copy/paste and focus problems
- **iTerm2 backend**: Uses AppleScript, not portable, undocumented

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  TeamSession      │    │  FakeTmuxServer                  │   │
│  │  - env setup      │───▶│  - Unix domain socket listener   │   │
│  │  - lead spawn     │    │  - Command parser/router         │   │
│  │  - lifecycle      │    │  - paneId ↔ agentId mapping     │   │
│  └──────────────────┘    └──────────┬───────────────────────┘   │
│                                      │                           │
│                                      ▼                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PtyManager (enhanced)                                    │   │
│  │  - createTeammatePty(cmd, cwd, env) → AgentState         │   │
│  │  - capturePane(agentId) → string (for capture-pane cmd)  │   │
│  │  - paneIdMap: Map<paneId, agentId>                        │   │
│  │  - outputBuffers: ring buffer per PTY                     │   │
│  │  emits: data, exit, input-needed, agent-spawned           │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │ IPC                                                  │
└───────────┼──────────────────────────────────────────────────────┘
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Electron Renderer                             │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  Lead Terminal       │  │  Companion Panel                 │  │
│  │  (~65%, default      │  │  ┌─ Teammate Dashboard ───────┐ │  │
│  │   focus, interactive)│  │  │  Status cards, progress,   │ │  │
│  │                      │  │  │  Quick Approve buttons     │ │  │
│  │                      │  │  └────────────────────────────┘ │  │
│  │                      │  │  ┌─ Selected Teammate Term ──┐ │  │
│  │                      │  │  │  xterm.js (read + input)  │ │  │
│  │                      │  │  └────────────────────────────┘ │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Fake tmux Binary

A Node.js script (`#!/usr/bin/env node`) at a bundled path. Claude finds it via `TMUX_PROGRAM` env var.

### Commands to Implement

| Command | Our Behavior |
|---|---|
| `new-session -d -s <name>` | Register session in server state |
| `new-window -t <session> -n <name>` | Allocate pane ID, register in session |
| `split-window -t <pane> -h/-v` | Same as new-window (we don't split) |
| `send-keys -t %<id> "<cmd>" Enter` | If no PTY: spawn teammate. If PTY exists: send input |
| `list-panes -t <session> -F <fmt>` | Return pane list with format string interpolation |
| `list-sessions` | Return our sessions |
| `capture-pane -t %<id> -p` | Return output from ring buffer |
| `display-message -p <fmt>` | Return formatted pane/session info |
| `has-session -t <name>` | Exit 0 if exists, 1 if not |
| `kill-session -t <name>` | Destroy all PTYs in session |
| `kill-pane -t %<id>` | Destroy PTY |
| `select-pane -t %<id>` | Emit focus event to renderer |
| `resize-pane -t %<id> -x -y` | Resize PTY |
| Unknown commands | Exit 0, log warning (graceful degradation) |

### Communication Protocol

Transport: Unix domain socket at `/tmp/cc-frontend-<session>.sock`
Format: Newline-delimited JSON (NDJSON)

```
→ {"id":"uuid","command":"new-window","args":{"t":"main","n":"researcher"},"rawArgs":[...]}
← {"id":"uuid","exitCode":0,"stdout":"","stderr":""}
```

### Environment Variables Set for Team Lead

```bash
TMUX_PROGRAM=/path/to/fake-tmux.js
TMUX=/tmp/cc-frontend-<session>.sock,<pid>,0
TMUX_PANE=%0
TERM_PROGRAM=tmux
TERM=tmux-256color
CC_FRONTEND_SOCKET=/tmp/cc-frontend-<session>.sock
```

Each teammate PTY inherits these (with its own `TMUX_PANE`), so sub-teammate spawning works recursively.

---

## Data Flow: Teammate Spawning

1. User starts team → `TeamSession.start()` creates socket server + spawns team lead PTY with fake tmux env
2. User tells team lead to create teammates
3. Team lead calls `tmux new-window -n researcher` → our fake binary → socket → FakeTmuxServer allocates pane %1
4. Team lead calls `tmux send-keys -t %1 "claude --agent-id researcher@team ..." Enter` → fake binary → socket → FakeTmuxServer calls `PtyManager.createTeammatePty()`
5. PtyManager spawns node-pty with the claude command, emits `agent-spawned`
6. Main process sends `team:teammate-spawned` IPC to renderer
7. Renderer adds teammate card to companion panel dashboard
8. PTY output flows: node-pty → PtyManager → IPC → renderer → xterm.js

---

## UX: Lead + Companion Panel Layout

### Layout

- **Sidebar** (250px): Agent list with status + file tree
- **Team Lead Terminal** (~65% of main area): Always visible, always default focus
- **Companion Panel** (~35%, collapsible): Teammate dashboard (scrollable status cards) + selected teammate terminal

### Focus Rules (Absolute)

- Focus NEVER auto-switches. New teammates spawn silently into dashboard
- User clicks a pane or uses Cmd+1-9 to switch focus
- Cmd+1 always returns to team lead
- Selection (click-drag) in unfocused panes does NOT change focus

### Copy/Paste

- xterm.js native mouse selection in ANY pane (even unfocused)
- `copyOnSelect: true` — auto-copy to clipboard on selection
- Cmd+V pastes into focused pane only
- Each pane has independent scrollback — mouse wheel scrolls only that pane

### Mouse Scrolling

- Each xterm.js instance is an independent DOM element with its own scroll context
- Mouse wheel over a pane scrolls ONLY that pane's scrollback
- No modes, no interference, no focus change — like scrolling any web element

### Notifications (Multi-Tier)

| Tier | Trigger | Action |
|------|---------|--------|
| 1 | Immediate | Dashboard card amber, sidebar pulses, sorts to top |
| 2 | 2 seconds | Top bar badge "● N need input" |
| 3 | 10 seconds | macOS native notification |
| 4 | 60 seconds | Dock bounce |

### Quick Approve

Dashboard cards for agents needing input show inline **[Approve] [Deny]** buttons. Clicking sends y/n to the teammate's PTY **without changing focus**. User stays in the team lead terminal.

### Scaling

- 1-5 teammates: all cards visible in dashboard
- 6+ teammates: dashboard scrolls, agents needing input sort to top
- Cmd+G toggles Grid Mode (existing PaneGrid) for all-at-once view

---

## Integration with Existing Codebase

### New Files

| File | Purpose |
|------|---------|
| `src/main/tmux/FakeTmuxServer.ts` | Unix socket server + command routing |
| `src/main/tmux/TmuxCommandParser.ts` | Parse tmux CLI args |
| `src/main/tmux/TmuxResponseFormatter.ts` | Format string interpolation |
| `src/main/tmux/TeamSession.ts` | Team lifecycle orchestration |
| `src/main/tmux/fake-tmux.js` | The fake binary (`chmod +x`) |
| `src/shared/tmux-types.ts` | Command/response type definitions |
| `src/renderer/src/components/LeadLayout.tsx` | Lead + Companion Panel layout |
| `src/renderer/src/components/CompanionPanel.tsx` | Dashboard + selected terminal |
| `src/renderer/src/components/TeammateCard.tsx` | Status card with Quick Approve |

### Modified Files

| File | Changes |
|------|---------|
| `PtyManager.ts` | Add createTeammatePty(), capturePane(), pane ID maps |
| `src/main/index.ts` | Wire agent-spawned events, handle TeamSession lifecycle |
| `src/shared/types.ts` | Add paneId, sessionName, isTeammate to AgentState |
| `src/shared/ipc-channels.ts` | Add team:teammate-spawned, team:teammate-exited channels |
| `createIpcServices.ts` | Change onTeamStart to use TeamSession (spawn lead only) |
| `AppShell.tsx` | Add Lead Mode vs Grid Mode toggle |
| `AppContext.tsx` | Add viewMode, teamLeadId, selectedTeammateId to state |

### Unchanged

- File-based team IPC (inboxes) — completely untouched
- Team config discovery — works as-is
- Sidebar, file tree, Monaco editor — reused

---

## Implementation Phases

### Phase 1: Core Interception
- TmuxCommandParser + FakeTmuxServer + fake-tmux.js
- Handle: new-session, new-window, send-keys, list-panes, has-session
- Unit tests for all command parsing

### Phase 2: PtyManager Extensions
- createTeammatePty(), capturePane(), pane ID maps
- Output ring buffer for capture-pane
- agent-spawned event emission
- Integration tests: fake tmux → socket → PTY creation

### Phase 3: TeamSession Orchestration
- TeamSession class with start/stop lifecycle
- Environment variable setup for lead agent
- Wire agent-spawned events to IPC
- Update onTeamStart handler

### Phase 4: Renderer - Lead Layout
- LeadLayout component (lead terminal + companion panel)
- CompanionPanel with teammate dashboard + selected terminal
- TeammateCard with status, progress, Quick Approve buttons
- View mode toggle (Lead vs Grid)

### Phase 5: Remaining tmux Commands + Robustness
- capture-pane, display-message, kill-pane, resize-pane
- Format string template engine
- Socket cleanup, timeout handling, graceful shutdown
- Comprehensive logging

### Phase 6: Polish + Production
- Compile fake-tmux.js to standalone binary
- E2E test: full team lifecycle
- Performance verification (< 10ms socket overhead)
- Edge cases: sub-teammate spawning, session recovery

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude changes tmux commands | Log unknown commands, generous parsing, monitor Claude releases |
| Claude validates tmux version | Return realistic version on `tmux -V` |
| Socket cleanup on crash | Signal handlers + stale socket detection on startup |
| PTY env mismatch | Test TMUX variable format thoroughly: `<socket>,<pid>,<session-id>` |
| Node.js not available for fake binary | Bundle as compiled binary for production |
