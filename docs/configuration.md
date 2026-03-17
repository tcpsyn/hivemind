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
    color: "#FFD93D"
  - name: Frontend
    role: frontend-dev
    command: claude --agent
    avatar: diamond
    color: "#6BCB77"
  - name: Backend
    role: backend-dev
    command: claude --agent
    avatar: gear
    color: "#4D96FF"
```

## Agent Avatars

12 SVG avatar icons, defined in `src/shared/constants.ts`:

| Name | Description |
|------|-------------|
| `robot-1` | Classic robot face |
| `robot-2` | Alternative robot |
| `robot-3` | Third robot variant |
| `circuit` | Circuit board pattern |
| `diamond` | Diamond shape |
| `hexagon` | Hexagonal shape |
| `star` | Star shape |
| `shield` | Shield icon |
| `bolt` | Lightning bolt |
| `gear` | Mechanical gear |
| `cube` | 3D cube |
| `prism` | Triangular prism |

If an agent config omits `avatar`, one is auto-assigned from this list in order.

## Agent Colors

12 predefined colors, assigned automatically or set via config:

| Name | Hex |
|------|-----|
| Coral | `#FF6B6B` |
| Teal | `#4ECDC4` |
| Sky | `#45B7D1` |
| Sage | `#96CEB4` |
| Gold | `#FFD93D` |
| Plum | `#A06CD5` |
| Mint | `#6BCB77` |
| Amber | `#FF8C42` |
| Lavender | `#B8B8FF` |
| Azure | `#4D96FF` |
| Peach | `#FFB4A2` |
| Emerald | `#2D9C8F` |

## Keyboard Shortcuts

All shortcuts use `Cmd` on macOS. Defined in `src/renderer/src/hooks/useKeyboardShortcuts.ts` and the application menu (`src/main/index.ts`).

### Global (Application Menu)

| Shortcut | Action |
|----------|--------|
| `Cmd+O` | Open project (file dialog) |
| `Cmd+Shift+S` | Start team (select YAML config) |
| `Cmd+Shift+X` | Stop team |

### Layout

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle sidebar |
| `Cmd+Tab` | Cycle tabs (Agents → Editor → Git) |
| `Cmd+1` | Switch to Agents tab (via menu) |
| `Cmd+2` | Switch to Editor tab (via menu) |
| `Cmd+G` | Toggle view mode (lead ↔ grid) |
| `Cmd+\` | Toggle companion panel |

### Pane Management

| Shortcut | Action |
|----------|--------|
| `Cmd+1-4` | Maximize pane by index (in-app) |
| `Escape` | Restore maximized pane |

### Editor

| Shortcut | Action |
|----------|--------|
| `Cmd+W` | Close active editor tab |
| `Cmd+P` | Quick open (hook parameter) |

## Window Defaults

Defined in `src/shared/constants.ts`:

| Setting | Value |
|---------|-------|
| Window width | 1400px |
| Window height | 900px |
| Minimum width | 800px |
| Minimum height | 600px |
| Sidebar width | 250px (default) |
| Sidebar min | 48px |
| Sidebar max | 500px |
| TopBar height | 40px |
| BottomBar height | 28px |

## Terminal Settings

| Setting | Value | Source |
|---------|-------|--------|
| Input detection timeout | 5000ms | `constants.ts` |
| File save debounce | 500ms | `constants.ts` |
| File tree max depth | 10 levels | `constants.ts` |
| File watcher debounce | 100ms | `FileWatcher.ts` |
| Notification debounce | 10s per agent | `NotificationService.ts` |
| Output buffer size | 10,000 lines | `PtyOutputBuffer.ts` |
| Tmux pane poll interval | 2s | `TmuxProxyServer.ts` |
| Pipe-pane poll interval | 200ms | `TmuxProxyServer.ts` |
| Capture-pane fallback poll | 500ms | `TmuxProxyServer.ts` |

## Input Prompt Patterns

PtyManager watches for these patterns to detect when an agent needs input:

```
❯  $ >  ?  (y/n)  [Y/n]  [y/N]
```

Defined in `INPUT_PROMPT_PATTERNS` in `src/shared/constants.ts`.

## Theming

The dark theme is defined in CSS custom properties (`src/renderer/src/styles/variables.css`):

```css
/* Core */
--bg-primary: #1a1a2e
--bg-secondary: #16213e
--bg-tertiary: #1e2a45
--text-primary: #e0e0e0
--text-secondary: #a0a0a0

/* Status */
--status-running: #4ade80
--status-idle: #9ca3af
--status-waiting: #fbbf24
--status-stopped: #f87171

/* Accent */
--accent-primary: #6366f1
--accent-hover: #818cf8
```

Fonts: system UI fonts with monospace fallback (SF Mono, Fira Code, Cascadia Code, Consolas).

## Layout Persistence

The following layout state persists to `localStorage` across sessions:

| Key | Data |
|-----|------|
| `hivemind:layout` | sidebarWidth, activeTab, sidebarCollapsed, gridConfig |
| `hivemind:project` | project name and path |

Managed by the `useLayoutPersistence` hook.

## Ignored Directories

These directories are excluded from file tree listing and file watching:

- `node_modules`
- `.git`
- `dist`
- `out`

## Language Detection

File extensions are mapped to Monaco editor languages in `src/shared/languages.ts`. Supported:

TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), CSS (`.css`, `.scss`, `.less`), HTML (`.html`), XML/SVG (`.xml`, `.svg`), JSON (`.json`), YAML (`.yaml`, `.yml`), TOML (`.toml`), Python (`.py`), Rust (`.rs`), Go (`.go`), Java (`.java`), Ruby (`.rb`), Shell (`.sh`, `.bash`, `.zsh`), Markdown (`.md`), SQL (`.sql`), GraphQL (`.graphql`, `.gql`), Vue (`.vue`), Svelte (`.svelte`)

Unknown extensions default to `plaintext`.
