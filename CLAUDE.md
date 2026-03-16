# Claude Frontend (cc_frontend)

An Electron + React + TypeScript desktop application that provides a rich IDE-like interface for managing Claude Code agent teams.

## Tech Stack
- **Runtime**: Electron
- **Frontend**: React + TypeScript
- **Terminal**: xterm.js
- **Editor**: Monaco Editor
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Build**: Vite + electron-builder
- **Package Manager**: pnpm

## Project Structure
```
src/
  main/           # Electron main process
    ipc/          # IPC handlers
    pty/          # PTY management
    services/     # Main process services
  renderer/       # React renderer
    components/   # React components
    hooks/        # Custom React hooks
    state/        # State management
    styles/       # Global styles
  shared/         # Shared types and utilities
  __tests__/      # Test files mirroring src structure
```

## Development Commands
```bash
pnpm dev          # Start in development mode
pnpm build        # Build for production
pnpm test         # Run all tests
pnpm test:unit    # Run unit tests (Vitest)
pnpm test:e2e     # Run E2E tests (Playwright)
pnpm lint         # Run ESLint
pnpm format       # Run Prettier
```

## Architecture Decisions
- Main process manages PTY sessions and spawns Claude CLI processes
- Renderer communicates with main via typed IPC channels
- Each agent gets a dedicated PTY with output piped to xterm.js
- State management uses React context + useReducer (no external lib unless needed)
- File watching via chokidar in main process, updates pushed to renderer via IPC

## Git Workflow
- `main` branch is always deployable
- Feature branches: `feature/<description>`
- Bug fixes: `fix/<description>`
- All changes via PRs with review
- Commits follow conventional style: `feat:`, `fix:`, `test:`, `docs:`, `chore:`

## Testing Standards
- TDD: tests written before implementation
- Unit tests for all business logic
- Integration tests for IPC communication
- E2E tests for critical user workflows
- Minimum 80% code coverage target
