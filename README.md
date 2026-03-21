# Hivemind

A desktop GUI for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agent teams. Built to solve real pain points with the terminal-based tmux team experience: no more fighting with copy-paste across panes, broken mouse scrolling, or losing track of agent output when running 5+ teammates in tiny tmux splits.

This is a companion tool that extends Claude Code — it requires Claude Code to be installed and configured.

> **Note:** Claude Code Agent Teams is currently a **beta feature** behind an experimental flag. You must enable it before using this tool. See [Setup](#enabling-claude-code-agent-teams) below.

## Why This Exists

Claude Code's agent teams feature is powerful — a lead agent can spawn and coordinate multiple Claude instances working in parallel. But the default experience runs everything in tmux panes inside your terminal, which gets painful fast:

- **Copy-paste is broken** — tmux captures your clipboard, modifier keys conflict, and selecting text across panes is a nightmare
- **Mouse scrolling doesn't work** — you need tmux-specific keybindings to scroll, and even then it's clunky
- **Can't see what agents are doing** — with 3+ agents, each pane is too small to read. You're constantly cycling through panes to check status
- **Agents leak into your session** — teammate panes spawn in your existing tmux session, cluttering your workspace
- **No overview** — there's no dashboard view to see all agent statuses at a glance

This tool fixes all of that by giving each agent its own full-size terminal in a proper GUI, with a companion panel that lets you monitor and interact with all teammates simultaneously.

## Features

- **Lead agent terminal** — Full xterm.js terminal for the lead Claude Code agent, no tmux restrictions
- **Companion panel** — See all teammates in a sidebar with status indicators and last activity timestamps
- **Individual agent terminals** — Click any teammate to see their full output in a dedicated terminal pane
- **Isolated tmux sessions** — Each team gets a dedicated tmux server so agents never leak into your terminal
- **Agent auto-detection** — Teammates are discovered automatically as the lead agent spawns them
- **File browser** — Browse project files with real-time watching via chokidar
- **Monaco editor** — View and edit files with syntax highlighting
- **Git integration** — View diffs and repo status

## Enabling Claude Code Agent Teams

Agent teams is a beta feature. Enable it by adding this to your Claude Code settings:

```bash
# Open Claude Code settings
claude config set -g agentTeams true
```

Or add it manually to `~/.claude/settings.json`:

```json
{
  "agentTeams": true
}
```

Once enabled, Claude Code will use tmux to spawn teammate agents when you ask it to work with a team.

## Getting Started

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Node.js 22+
- pnpm
- tmux (installed via Homebrew: `brew install tmux`)

### Install & Run

```bash
git clone https://github.com/tcpsyn/hivemind.git
cd hivemind
pnpm install
pnpm dev
```

### Build

```bash
pnpm build
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │PtyManager│  │ TeamSession  │  │TmuxProxyServer│  │
│  │          │  │              │  │               │  │
│  │Lead PTY  │──│tmux -L sock  │──│Unix socket    │  │
│  │          │  │new-session   │  │pipe-pane      │  │
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

### How It Works

1. **TeamSession** creates a dedicated tmux server (`tmux -L cc-frontend-xxx`) so agents are isolated from your terminal
2. The lead Claude Code agent runs in a PTY with `TMUX` set so it detects tmux and spawns agents as panes
3. A `bin/tmux` wrapper intercepts all tmux commands, forwards them to the dedicated server, and notifies the app via Unix socket
4. **TmuxProxyServer** discovers new panes, extracts agent names from process args, and streams output via `pipe-pane`
5. The renderer displays each teammate in the companion panel with its own xterm.js terminal

## Development

```bash
pnpm dev            # Start in development mode
pnpm test:unit      # Run unit tests (Vitest)
pnpm test:e2e       # Run E2E tests (Playwright)
pnpm lint           # Run ESLint
pnpm format         # Run Prettier
pnpm test:coverage  # Run tests with coverage
```

## Tech Stack

- **Runtime**: Electron 41
- **Frontend**: React 19 + TypeScript 5.9
- **Terminal**: xterm.js 5
- **Editor**: Monaco Editor
- **Build**: Vite 8 + electron-vite
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Package Manager**: pnpm

## Project Structure

```
src/
  main/              # Electron main process
    ipc/             # IPC channel definitions
    mcp/             # MCP server for agent coordination
    pty/             # PTY management
    tmux/            # Team orchestration (TeamSession, TmuxProxyServer)
    services/        # File, git, and team config services
  renderer/          # React renderer
    components/      # UI components
    hooks/           # Custom hooks
    state/           # State management
  shared/            # Shared types and constants
  preload/           # Electron preload bridge
bin/
  tmux               # Tmux wrapper for command interception
```

## License

MIT
