# Configuration

## Team Configuration Files

Team configs are YAML files stored in `~/.hivemind/teams/`. See [Team Management](./team-management.md) for the full schema and usage.

Example config:

```yaml
name: fullstack-team
project: /Users/me/my-project
agents:
  - name: Architect
    role: team-lead
    command: claude --team-lead --model opus
    avatar: star
    color: '#FFD93D'
  - name: Frontend
    role: frontend-dev
    command: claude --agent
    avatar: diamond
    color: '#6BCB77'
  - name: Backend
    role: backend-dev
    command: claude --agent
    avatar: gear
    color: '#4D96FF'
```

## Agent Avatars

12 SVG avatar icons, defined in `src/shared/constants.ts`:

| Name      | Description           |
| --------- | --------------------- |
| `robot-1` | Classic robot face    |
| `robot-2` | Alternative robot     |
| `robot-3` | Third robot variant   |
| `circuit` | Circuit board pattern |
| `diamond` | Diamond shape         |
| `hexagon` | Hexagonal shape       |
| `star`    | Star shape            |
| `shield`  | Shield icon           |
| `bolt`    | Lightning bolt        |
| `gear`    | Mechanical gear       |
| `cube`    | 3D cube               |
| `prism`   | Triangular prism      |

If an agent config omits `avatar`, one is auto-assigned from this list in order.

## Agent Colors

12 predefined colors, assigned automatically or set via config:

| Name     | Hex       |
| -------- | --------- |
| Coral    | `#FF6B6B` |
| Teal     | `#4ECDC4` |
| Sky      | `#45B7D1` |
| Sage     | `#96CEB4` |
| Gold     | `#FFEAA7` |
| Plum     | `#DDA0DD` |
| Mint     | `#98D8C8` |
| Amber    | `#F7DC6F` |
| Lavender | `#BB8FCE` |
| Azure    | `#85C1E9` |
| Peach    | `#F0B27A` |
| Emerald  | `#82E0AA` |

## Keyboard Shortcuts

All shortcuts use `Cmd` on macOS. Defined in `src/renderer/src/hooks/useKeyboardShortcuts.ts` and the application menu (`src/main/index.ts`).

### Global (Application Menu)

| Shortcut      | Action                          |
| ------------- | ------------------------------- |
| `Cmd+O`       | Open project (file dialog)      |
| `Cmd+Shift+S` | Start team (select YAML config) |
| `Cmd+Shift+X` | Stop team                       |

### Layout

| Shortcut  | Action                                     |
| --------- | ------------------------------------------ |
| `Cmd+B`   | Toggle sidebar                             |
| `Cmd+Tab` | Cycle feature tabs (Agents → Editor → Git) |
| `Cmd+1`   | Switch to Agents tab (via menu)            |
| `Cmd+2`   | Switch to Editor tab (via menu)            |
| `Cmd+G`   | Toggle view mode (lead ↔ grid)             |
| `Cmd+\`   | Toggle companion panel                     |
| `Escape`  | Restore maximized pane                     |

### Project Tabs

| Shortcut      | Action                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Cmd+T`       | New project tab                                                                                                        |
| `Cmd+W`       | Close current project tab                                                                                              |
| `Cmd+1-9`     | Switch to project tab by position (`Cmd+9` = last). Note: `Cmd+1` and `Cmd+2` are intercepted by menu for feature tabs |
| `Cmd+Shift+[` | Previous project tab                                                                                                   |
| `Cmd+Shift+]` | Next project tab                                                                                                       |

### Editor

| Shortcut | Action                      |
| -------- | --------------------------- |
| `Cmd+P`  | Quick open (hook parameter) |

## Window Defaults

Window dimensions from `src/shared/constants.ts`, layout dimensions from `src/renderer/src/styles/variables.css` and `Sidebar.tsx`:

| Setting          | Value           | Source                          |
| ---------------- | --------------- | ------------------------------- |
| Window width     | 1400px          | `constants.ts` (WINDOW_DEFAULTS)|
| Window height    | 900px           | `constants.ts` (WINDOW_DEFAULTS)|
| Minimum width    | 800px           | `constants.ts` (WINDOW_DEFAULTS)|
| Minimum height   | 600px           | `constants.ts` (WINDOW_DEFAULTS)|
| Sidebar width    | 250px (default) | `constants.ts` (DEFAULT_SIDEBAR_WIDTH) |
| Sidebar min      | 48px            | `Sidebar.tsx` + `variables.css` |
| Sidebar max      | 500px           | `Sidebar.tsx`                   |
| TopBar height    | 40px            | `variables.css`                 |
| BottomBar height | 28px            | `variables.css`                 |

## Terminal Settings

| Setting                    | Value         | Source                   |
| -------------------------- | ------------- | ------------------------ |
| Input detection timeout    | 5000ms        | `constants.ts`           |
| File save debounce         | 500ms         | `constants.ts`           |
| File tree max depth        | 10 levels     | `constants.ts`           |
| File watcher debounce      | 100ms         | `FileWatcher.ts`         |
| Notification debounce      | 10s per agent | `NotificationService.ts` |
| Output buffer size         | 10,000 lines  | `PtyOutputBuffer.ts`     |
| Tmux pane poll interval    | 2s            | `TmuxProxyServer.ts`     |
| Pipe-pane poll interval    | 200ms         | `TmuxProxyServer.ts`     |
| Capture-pane fallback poll | 500ms         | `TmuxProxyServer.ts`     |

## Input Prompt Patterns

PtyManager watches for these patterns to detect when an agent needs input:

```
❯  (y/n)  [Y/n]  [y/N]  (yes/no)
```

Defined in `INPUT_PROMPT_PATTERNS` in `src/shared/constants.ts`.

## Theming

The dark theme is defined in CSS custom properties (`src/renderer/src/styles/variables.css`):

```css
:root {
  /* Background */
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --bg-surface: #1e2745;
  --bg-hover: #253256;
  --bg-active: #2a3a66;

  /* Text */
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-muted: #6b7280;
  --text-accent: #45b7d1;

  /* Borders */
  --border-primary: #2a3a66;
  --border-secondary: #1e2745;
  --border-focus: #45b7d1;

  /* Status */
  --status-running: #4ade80;
  --status-idle: #9ca3af;
  --status-waiting: #fbbf24;
  --status-stopped: #f87171;
  --status-active: #45b7d1;
}
```

Fonts: system UI fonts with monospace fallback (SF Mono, Fira Code, Cascadia Code, Consolas).

## Layout Persistence

The following layout state persists to `localStorage` across sessions:

| Key                | Data                                                  |
| ------------------ | ----------------------------------------------------- |
| `hivemind:layout`  | sidebarWidth, activeTab, sidebarCollapsed, gridConfig |
| `hivemind:project` | project name and path                                 |

Managed by the `useLayoutPersistence` hook.

## Ignored Directories

These directories are excluded from file tree listing and file watching:

- `node_modules`
- `.git`
- `.claude`
- `dist`
- `out`

## Language Detection

File extensions are mapped to Monaco editor languages in `src/shared/languages.ts`. Supported:

TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), CSS (`.css`, `.scss`, `.less`), HTML (`.html`), XML/SVG (`.xml`, `.svg`), JSON (`.json`), YAML (`.yaml`, `.yml`), TOML (`.toml`), Python (`.py`), Rust (`.rs`), Go (`.go`), Java (`.java`), Ruby (`.rb`), Shell (`.sh`, `.bash`, `.zsh`), Markdown (`.md`), SQL (`.sql`), GraphQL (`.graphql`, `.gql`), Vue (`.vue`), Svelte (`.svelte`)

Unknown extensions default to `plaintext`.
