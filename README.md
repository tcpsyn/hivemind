# Claude Code Frontend

A desktop application for managing Claude Code agent teams. Provides an IDE-like interface where a lead agent can spawn and coordinate multiple teammate agents, each running in isolated tmux panes with real-time output streaming.

![Electron](https://img.shields.io/badge/Electron-41-blue) ![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Tests](https://img.shields.io/badge/Tests-632%20passing-green)

## Features

- **Agent Teams** — Spawn a lead Claude Code agent that can create and coordinate teammate agents via tmux
- **Isolated Tmux Sessions** — Each team gets a dedicated tmux server so agents don't interfere with your terminal
- **Real-time Output** — Teammate pane output is streamed to the companion panel via capture-pane polling
- **Terminal Emulation** — Full xterm.js terminals for both lead and teammate agents
- **File Browser** — Browse project files with chokidar-based file watching
- **Monaco Editor** — View and edit files with syntax highlighting
- **Git Integration** — View diffs and repo status

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │PtyManager│  │ TeamSession  │  │TmuxProxyServer│  │
│  │          │  │              │  │               │  │
│  │Lead PTY  │──│tmux -L sock  │──│Unix socket    │  │
│  │          │  │new-session   │  │capture-pane   │  │
│  └──────────┘  └──────────────┘  └───────────────┘  │
│        │              │                  │           │
│        │      ┌───────┴───────┐          │           │
│        │      │  bin/tmux     │          │           │
│        │      │  (wrapper)    │          │           │
│        │      └───────────────┘          │           │
│        ▼              ▼                  ▼           │
│  ┌─────────────── IPC Bridge ──────────────────┐    │
└──┤                                             ├────┘
   └─────────────────────────────────────────────┘
          │                            │
┌─────────▼────────────────────────────▼──────────┐
│ Electron Renderer (React)                        │
│  ┌────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │TerminalPane│  │CompanionPanel│  │  Editor   │ │
│  │(lead agent)│  │(teammates)   │  │ (Monaco)  │ │
│  └────────────┘  └──────────────┘  └──────────┘ │
└──────────────────────────────────────────────────┘
```

### How Team Spawning Works

1. **TeamSession** creates a dedicated tmux server (`tmux -L cc-frontend-xxx`) and session
2. The lead agent runs in a PTY with `TMUX` env var set so Claude Code detects tmux
3. When the lead agent spawns teammates, Claude Code creates new tmux windows via the `bin/tmux` wrapper
4. The wrapper forwards commands to the dedicated server (via `-L` flag) and notifies the app via Unix socket
5. **TmuxProxyServer** discovers new panes, extracts agent names from process args, and streams output via `capture-pane` polling
6. The renderer displays each teammate in the companion panel with its own xterm.js terminal

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- tmux (installed via Homebrew or system package manager)

### Install & Run

```bash
pnpm install
pnpm dev
```

### Build

```bash
pnpm build
```

## Development

```bash
pnpm dev            # Start in development mode
pnpm test:unit      # Run unit tests (Vitest, 632 tests)
pnpm test:e2e       # Run E2E tests (Playwright)
pnpm lint           # Run ESLint
pnpm format         # Run Prettier
pnpm test:coverage  # Run tests with coverage
```

## Project Structure

```
src/
  main/              # Electron main process
    ipc/             # IPC channel definitions and handlers
    pty/             # PTY management (PtyManager)
    tmux/            # Team orchestration (TeamSession, TmuxProxyServer)
    services/        # File, git, and team config services
  renderer/          # React renderer
    components/      # UI components (TerminalPane, CompanionPanel, etc.)
    hooks/           # Custom hooks (useTerminal, useTeammateTerminal, etc.)
    state/           # AppContext with useReducer state management
    styles/          # Global CSS variables and styles
  shared/            # Shared types, constants, and validators
  preload/           # Electron preload bridge
  __tests__/         # Tests mirroring src structure
bin/
  tmux               # Tmux wrapper script for command interception
```

## Tech Stack

- **Runtime**: Electron 41
- **Frontend**: React 19 + TypeScript 5.9
- **Terminal**: xterm.js 5 + FitAddon
- **Editor**: Monaco Editor
- **Build**: Vite 8 + electron-vite
- **Testing**: Vitest 4 (unit/integration), Playwright (E2E)
- **Package Manager**: pnpm

## License

MIT
