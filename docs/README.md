# Hivemind Documentation

Hivemind is a desktop GUI for managing Claude Code agent teams. It replaces the raw tmux-based workflow with a polished Electron application featuring dedicated terminal panes, file editing, git integration, and a teammate dashboard.

## Table of Contents

- [Architecture](./architecture.md) — How the main process, renderer, IPC, and PTY layers fit together
- [Setup & Development](./setup.md) — Getting started, running, building, and testing
- [Components](./components.md) — React component hierarchy and key UI elements
- [Team Management](./team-management.md) — How agent teams are configured, spawned, and managed via tmux
- [IPC Reference](./ipc-reference.md) — Complete channel listing with request/response types
- [Configuration](./configuration.md) — Team configs, constants, theming, and keyboard shortcuts

## What Hivemind Does

Claude Code supports agent teams — a lead agent that can spawn teammate agents to work in parallel. The native experience runs entirely inside tmux, which has usability problems: broken mouse scrolling, copy-paste issues, limited visibility into agent status, and no dashboard.

Hivemind solves this by:

- Giving each agent a dedicated xterm.js terminal pane with full mouse/scroll support
- Providing a companion panel that shows all teammates with status indicators
- Detecting when agents need input and surfacing native OS notifications
- Integrating a file explorer with git status and a Monaco code editor
- Managing isolated tmux sessions behind the scenes so agents can still coordinate

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 41 |
| Frontend | React 19, TypeScript 5.9 |
| Terminal | xterm.js 5 + fit addon |
| Editor | Monaco Editor 0.55 |
| PTY | node-pty 1.1 |
| Build | Vite 8 + electron-vite |
| File watching | chokidar 5 |
| Git | simple-git 3.33 |
| Validation | Zod 4 |
| Config parsing | yaml 2.8 |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Package manager | pnpm |
