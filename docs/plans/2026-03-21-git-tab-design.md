# Git Tab Design

**Date:** 2026-03-21
**Status:** Approved for implementation

## Overview

The Git tab provides visibility into agent changes with control over commits. It shows changed files with diffs, agent attribution, and supports staging/committing from the GUI. The killer feature is "Request Review" — ask Claude to review specific changes inline.

## Design Decisions

- Changed files + diffs as primary view, with agent attribution as metadata
- Stage + commit from GUI, but NO push (push is deliberate, done elsewhere)
- "Request Review" sends changes to the lead agent for inline code review
- Reuse Monaco diff editor (DiffView.tsx already exists)
- No PR management — that's done from the terminal

## Layout

### Two-panel layout

**Left panel (file list, ~30% width):**
- Header showing current branch name and ahead/behind counts
- Changed files list grouped by status: Staged, Modified, Untracked
- Each file shows: filename, path, status badge (M/A/D/U), and which agent last modified it (color dot matching the agent's color in the sidebar)
- Checkbox per file for staging/unstaging
- Click a file to show its diff in the right panel

**Right panel (diff view, ~70% width):**
- Monaco diff editor (reusing existing DiffView component) showing the selected file's changes
- Header bar with: filename, agent attribution ("Modified by docwriter"), and action buttons
- Two action buttons in the header: "Stage" (or "Unstage") and "Request Review"

**Bottom bar:**
- Commit message input (text field, single line by default, expandable)
- "Commit" button (disabled when nothing is staged)
- Staged file count badge

### File list details
- Flat list sorted by path (no tree view — simpler, sufficient for agent workloads)
- Status groups: Staged, Modified, Untracked
- Agent attribution via color dot matching the agent's sidebar color

## Key Features

### 1. Changed Files List
- Uses existing `GitService.getStatus()` for file status
- Uses existing `FileExplorerService` file-change events to auto-refresh
- Agent attribution: track which agent last modified each file via file-change events from `wireTeamSessionEvents`

### 2. Diff View
- Reuse existing `DiffView.tsx` Monaco diff editor
- `GitService.getDiff(filePath)` for unstaged changes
- `GitService.getDiff(filePath, true)` for staged changes
- Side-by-side view with syntax highlighting

### 3. Stage/Unstage
- New `GitService` methods: `stage(filePath)`, `unstage(filePath)`, `stageAll()`, `unstageAll()`
- IPC channels for staging operations
- Checkbox in file list toggles staged/unstaged
- "Stage" / "Unstage" button in diff header for current file

### 4. Commit
- New `GitService.commit(message)` method
- Commit message input in bottom bar
- Disabled when nothing staged
- After commit, refresh status + clear message

### 5. Request Review (killer feature)
- Click "Request Review" on a file's diff header
- Sends the diff to the lead agent's terminal via tmux send-keys: "Review this diff for [filename] and provide feedback: [diff content]"
- OR: creates a temporary file with the diff and asks the lead to read and review it
- Review results appear in the lead's terminal output (visible in the Agents tab)
- Future: inline review comments in the diff view

## IPC Channels Needed

### Renderer → Main
- `git:stage` — stage a file
- `git:unstage` — unstage a file
- `git:commit` — commit with message
- `git:status` — request current status (already exists via FileExplorerService)
- `git:diff` — get diff for a file (already exists)
- `git:review` — request Claude review of a file's changes

### Main → Renderer
- `git:status-update` — already exists, pushed by FileExplorerService

## Components

```
GitView.tsx              — Main container, two-panel layout
  GitFileList.tsx        — Left panel: changed files list with checkboxes
  GitDiffPanel.tsx       — Right panel: Monaco diff + header + actions
  GitCommitBar.tsx       — Bottom: commit message input + button
```

## Implementation Notes

- GitService already has `getStatus()` and `getDiff()` — just need `stage/unstage/commit`
- `simple-git` npm package (already installed) supports all needed operations
- Agent attribution requires tracking file-change events per agent — can use the existing `teammate-output` or file-watcher events
- The "Request Review" feature can start simple: write diff to a temp file, send the lead a message to review it
- Polling `git status` every 2-3 seconds (or on file-change events) keeps the list fresh

## Out of Scope (v1)

- Push/pull operations
- Branch management (create, switch, merge)
- PR creation/management
- Inline review comments in diff view
- Blame/history view
- Conflict resolution UI
