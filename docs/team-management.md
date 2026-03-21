# Team Management

Agent teams are the core feature of Hivemind. A team consists of a **lead agent** that can spawn **teammate agents** to work in parallel. Under the hood, this uses tmux — Hivemind manages a dedicated tmux server and proxies pane output to the UI.

## Team Configuration

Team configs are YAML files stored in `~/.hivemind/teams/`. They define the agents in a team session.

### Schema

```yaml
name: my-team
project: /path/to/project
agents:
  - name: Lead
    role: team-lead
    command: claude --team-lead
    avatar: robot-1 # optional
    color: '#FF6B6B' # optional
  - name: Backend
    role: backend-dev
    command: claude --agent
    avatar: gear # optional
    color: '#4ECDC4' # optional
```

**Required fields:**

- `name` — Team name
- `project` — Absolute path to the project directory
- `agents` — Array of at least one agent config:
  - `name` — Display name
  - `role` — Description shown in the UI
  - `command` — Shell command to run

**Optional agent fields:**

- `avatar` — One of 12 SVG icons (see [Configuration](./configuration.md#agent-avatars))
- `color` — Hex color for the agent's UI accent

Configs without avatar or color get them auto-assigned from the predefined palette by `TeamConfigService.enrichConfig()`.

### Validation

Configs are validated with Zod schemas (`src/shared/validators.ts`). Invalid configs are rejected before the team starts.

## Starting a Team

Teams can be started two ways:

1. **Menu**: `Cmd+Shift+S` opens a file dialog to select a YAML config
2. **API**: Renderer calls `window.api.teamStart({ config })`

### Startup Flow

```
1. User triggers team start with TeamConfig
   │
2. Main process: TeamSession.start()
   │
   ├── Find real tmux binary (/opt/homebrew/bin/tmux or /usr/local/bin/tmux)
   ├── Clean up stale Unix sockets from previous sessions
   │
   ├── Create isolated tmux server:
   │   tmux -L {socket} new-session -d -s {sessionName} -x 200 -y 50
   │
   ├── Get TMUX env value:
   │   tmux display-message -p '#{socket_path},#{pid},0'
   │
   ├── Start TmuxProxyServer (Unix socket listener)
   │
   └── Spawn lead agent via PtyManager.createPty() with env vars:
       TMUX={socket_path,pid,0}
       TMUX_PANE={lead-pane-id}
       CC_FRONTEND_SOCKET={proxy-socket-path}
       CC_TMUX_SOCKET={socket-name}
       CC_TMUX_SESSION={session-name}
       REAL_TMUX=/path/to/tmux
       CLAUDECODE=1
       CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

3. Lead agent (Claude CLI) detects TMUX env var
   → Uses tmux to spawn teammate panes

4. TmuxProxyServer polls tmux list-panes every 2s
   → Discovers new panes
   → Sets up output streaming via tmux pipe-pane
   → Emits teammate-detected events

5. Main process creates AgentState for each teammate
   → Sends TEAM_TEAMMATE_SPAWNED to renderer

6. Renderer adds teammates to CompanionPanel
```

## Tmux Proxy Server

`TmuxProxyServer` is the bridge between tmux and the renderer. It runs as a Unix socket server in the main process.

### Pane Discovery

Every 2 seconds, the proxy runs:

```
tmux list-panes -t {session} -a -F '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}'
```

New panes (not in `knownPanes`) trigger teammate detection:

1. Extract agent metadata from the Claude command via `parseClaudeCommand()` (looks for `--agent-id`, `--agent-name`, `--team-name`, `--agent-color`, `--agent-type`, `--permission-mode`, `--model`, `--parent-session-id` flags)
2. If no name found, poll child processes with `pgrep -P {pid} -a`
3. Emit `teammate-detected` with the agent state

### Output Streaming

For each discovered pane, the proxy sets up streaming:

**Primary method** — `tmux pipe-pane`:

```
tmux pipe-pane -t {paneId} -o 'tee -a "{outFile}" > /dev/null'
```

The proxy polls the temp file every 200ms for new content.

**Fallback** — `tmux capture-pane`:

```
tmux capture-pane -t {paneId} -p -J
```

The `-J` flag joins wrapped lines. For reattach snapshots, `-e` is also used to include escape sequences. Polled every 500ms. Used when pipe-pane is unavailable or goes silent.

### Input Handling

When the renderer sends input to a teammate:

1. **Primary**: Direct write to the pane's TTY file (`pane.tty`)
2. **Fallback**: `tmux send-keys -t {paneId} -l {data}`

### Teammate Renaming

Claude Code agents can rename themselves. The proxy detects name changes through `send-keys` notifications or by re-parsing the Claude command flags. When detected, it emits `teammate-renamed`.

### Pane Exit

When a pane disappears from `tmux list-panes`, the proxy emits `teammate-exited`. The main process removes the agent state and notifies the renderer.

## Stopping a Team

`Cmd+Shift+X` or `window.api.teamStop()`:

1. TmuxProxyServer stops polling and closes the Unix socket
2. TeamSession kills the tmux server: `tmux -L {socket} kill-server`
3. PtyManager destroys the lead agent's PTY
4. All teammate agent states are cleaned up
5. Renderer removes all agents from the UI

## Input Detection & Notifications

When an agent needs user input:

1. PtyManager checks output against `INPUT_PROMPT_PATTERNS` (❯, (y/n), [Y/n], [y/N], (yes/no))
2. Emits `input-needed` event
3. NotificationService shows native OS notification (debounced: 10s minimum between notifications per agent)

Clicking a notification focuses the Electron window and sends a `notification:focus-agent` event. The dock badge updates with the count of pending notifications.
