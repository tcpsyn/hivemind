# Setup & Development

## Prerequisites

- **Node.js** 22+ (see `.nvmrc`)
- **pnpm** — package manager (`npm install -g pnpm`)
- **tmux** — required for agent team features (installed at `/opt/homebrew/bin/tmux` on macOS ARM or `/usr/local/bin/tmux`)
- **Claude CLI** — the `claude` command must be available in your PATH

## Installation

```bash
git clone <repo-url>
cd cc_frontend
pnpm install
```

`node-pty` requires native compilation. If you hit build errors, ensure you have Xcode Command Line Tools installed:

```bash
xcode-select --install
```

## Running

### Development Mode

```bash
pnpm dev
```

This starts `electron-vite` in dev mode with hot reload for the renderer. The main process restarts on changes to `src/main/`.

### Production Build

```bash
pnpm build
```

Builds the app with `electron-vite build`. Output goes to `out/`.

### Preview

```bash
pnpm preview
```

Preview the production build locally.

## Project Structure

```
src/
  main/              # Electron main process (Node.js)
    index.ts          # Entry point — window, services, menu
    ipc/              # IPC handler definitions
      handlers.ts     # All IPC channel handlers
    pty/              # PTY session management
      PtyManager.ts   # Agent/teammate PTY lifecycle
    services/         # Main process services
      FileService.ts         # File I/O and directory trees
      FileWatcher.ts         # chokidar filesystem monitoring
      FileExplorerService.ts # Combined file + git tree
      GitService.ts          # Git status and diff
      TeamConfigService.ts   # YAML team config management
      ClaudeConfigService.ts # Writes hook + MCP config for agent interception
      NotificationService.ts # Native OS notifications
    tmux/             # Tmux integration for agent teams
      TeamSession.ts         # Tmux server lifecycle
      TmuxProxyServer.ts     # Pane discovery and output streaming
      PtyOutputBuffer.ts     # Circular output buffer
      parseClaudeCommand.ts  # CLI flag extraction
      TmuxResponseFormatter.ts # Response formatting
    mcp/              # MCP server for agent coordination
      hivemind-mcp-server.ts # Teammate communication tools

  preload/            # Electron preload bridge
    index.ts          # contextBridge API definition

  renderer/           # React frontend
    index.html        # HTML shell
    src/
      main.tsx        # React entry point
      App.tsx         # Root component
      api.ts          # window.api accessor
      components/     # React components (see Components doc)
      hooks/          # Custom React hooks
      state/          # AppContext (context + useReducer)
      styles/         # CSS variables and global styles
      terminal/       # TerminalRegistry singleton

  shared/             # Shared between main and renderer
    types.ts          # Core types (AgentState, TeamConfig, etc.)
    ipc-channels.ts   # IPC channel names and payload types
    constants.ts      # Colors, avatars, defaults
    validators.ts     # Zod schemas for IPC requests and team configs
    languages.ts      # File extension → Monaco language map
    tmux-types.ts     # Tmux-specific type definitions

  __tests__/          # Tests mirroring src structure
    setup.ts          # Test environment setup (polyfills, mocks)
    main/             # Main process tests
      ipc/            # IPC handler tests
      tmux/           # TeamSession, TmuxProxyServer tests
      services/       # Service tests (ClaudeConfigService, FileExplorer, etc.)
      integration/    # Integration tests
      mcp/            # MCP server tests
    renderer/         # Renderer tests
      components/     # Component tests
      hooks/          # Hook tests
      state/          # AppContext + reducer tests
```

### Additional Build Scripts

```bash
pnpm build:mac     # Build for macOS only
pnpm build:win     # Build for Windows only
pnpm build:linux   # Build for Linux only
pnpm build:vite    # Run electron-vite build without electron-builder packaging
pnpm build:mcp     # Bundle MCP server (esbuild → bin/hivemind-mcp-server.mjs)
pnpm typecheck     # Run TypeScript type checking (tsc --noEmit)
pnpm format:check  # Check Prettier formatting without writing
pnpm clean         # Remove out/ and dist/ directories
```

## Testing

### Unit Tests

```bash
pnpm test          # Run all tests once
pnpm test:unit     # Run unit tests only
pnpm test:watch    # Run in watch mode
```

Tests use **Vitest** with:

- `jsdom` environment for renderer tests
- `node` environment for main process tests (auto-detected by path)
- Monaco editor mocked globally in `setup.ts`
- ResizeObserver polyfilled for xterm.js tests

### Coverage

```bash
pnpm test:coverage
```

Coverage thresholds (statements: 78%, branches: 65%, functions: 75%, lines: 78%) across `src/main/`, `src/renderer/src/`, `src/shared/`, and `src/preload/`.

### E2E Tests

```bash
pnpm test:e2e
```

Uses **Playwright** configured for Electron:

- Test timeout: 60s
- 1 retry on failure
- Serial execution (1 worker)
- Tests in `e2e/` directory matching `**/*.spec.ts`

## Linting & Formatting

```bash
pnpm lint          # ESLint
pnpm format        # Prettier (write mode)
```

ESLint config: TypeScript recommended + Prettier. Prettier: no semicolons, single quotes, 100 char width, no trailing commas.

## Build Configuration

### electron-vite (`electron.vite.config.ts`)

Three build targets:

- **Main**: CJS output, externalizes `electron`, `@electron-toolkit/utils`, `node-pty`
- **Preload**: CJS output, externalizes `electron`
- **Renderer**: Vite + React plugin, entry at `src/renderer/index.html`

### TypeScript

Two config files:

- **`tsconfig.node.json`**: For main + preload + shared. ESNext target, strict mode.
- **`tsconfig.web.json`**: For renderer + shared. ESNext target, `react-jsx` transform, DOM libs.
