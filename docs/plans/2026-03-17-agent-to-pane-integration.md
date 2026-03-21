# Agent-to-Pane Integration — Implementation Plan

> **ARCHIVED (2026-03-21):** This plan is superseded. The hook-based interception approach (`agent-intercept-hook`) was replaced by native Claude Code team support. Claude Code now handles agent spawning natively via tmux when `TMUX` env var is set. The `ClaudeConfigService` removes any Agent hook (rather than adding one) and registers the MCP server with 3 tools (`list_teammates`, `check_teammate`, `send_message`). The `report_complete` and `get_updates` tools described below were never shipped.

**Goal:** Make Claude Code's Agent tool spawn visible, interactive tmux panes in Hivemind instead of invisible background subprocesses.

**Architecture (original, superseded):** A PreToolUse hook intercepts every `Agent` tool call, blocks it (exit 2), and creates a tmux pane running `claude` with the agent's prompt. A lightweight MCP server provides `list_teammates` and `check_teammate` tools so the lead agent can query teammate status. Hivemind's existing pane discovery picks up the new panes automatically.

**Tech Stack:** Bash (hook script), TypeScript + @modelcontextprotocol/sdk (MCP server), Node.js (config service)

---

## Architecture Diagram

```
Lead Claude Code (in PTY)
  │
  ├─ Calls Agent tool ──→ PreToolUse hook (bin/agent-intercept-hook)
  │                          │  reads stdin JSON, extracts prompt
  │                          │  creates tmux pane via $REAL_TMUX
  │                          │  runs `claude "$PROMPT"` in pane
  │                          │  stderr: "Agent spawned in pane %X"
  │                          └─ exit 2 (blocks Agent tool)
  │
  ├─ Calls MCP tool ──→ hivemind MCP server (bin/hivemind-mcp-server.mjs)
  │   list_teammates       queries tmux directly via $REAL_TMUX/$CC_TMUX_SOCKET
  │   check_teammate       captures pane output via tmux capture-pane
  │
  └─ Existing flow: output piped to xterm.js via PtyManager

Hivemind Main Process
  │
  ├─ TmuxProxyServer.discoverPanes() — polls every 2s, finds new pane
  ├─ Emits teammate-spawned → IPC → renderer shows in sidebar + grid
  └─ ClaudeConfigService — writes hook + MCP config before session start
```

## Key Design Decisions

1. **Hook creates tmux pane directly** — no bidirectional socket needed. The hook script calls `$REAL_TMUX` to create a split-window. Hivemind discovers it via existing polling.

2. **MCP server is standalone** — spawned by Claude Code as a subprocess via stdio transport. Queries tmux directly (no IPC with Hivemind needed). Gets tmux socket name from env vars.

3. **Config injection** — Hivemind writes `.claude/settings.local.json` (hooks) and `.mcp.json` (MCP server) into the project directory before starting the lead agent. Cleaned up on session stop.

4. **Exit code 2** — blocks the Agent tool. Stderr message becomes Claude's feedback, telling it the agent was spawned in a pane and to use MCP tools to check on it.

---

## Task 1: Hook Script (`bin/agent-intercept-hook`)

**Files:**
- Create: `bin/agent-intercept-hook`

**What it does:** Reads PreToolUse JSON from stdin, extracts the Agent tool's prompt, creates a tmux pane, runs `claude` with the prompt, exits 2 with a stderr message.

**Step 1: Create the hook script**

```bash
#!/bin/bash
# PreToolUse hook: intercepts Agent tool calls and spawns them as tmux panes.
# Receives JSON on stdin from Claude Code hooks system.
# Exits 2 to block the Agent tool; stderr becomes Claude's feedback.

set -euo pipefail

# Read JSON from stdin
INPUT=$(cat)

# Extract fields from tool_input
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // empty')
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "teammate"')

# If no prompt, this isn't an agent-spawning call — let it through
if [ -z "$PROMPT" ]; then
  exit 0
fi

# Require tmux socket
TMUX_CMD="${REAL_TMUX:-}"
TMUX_SOCKET="${CC_TMUX_SOCKET:-}"

if [ -z "$TMUX_CMD" ] || [ -z "$TMUX_SOCKET" ]; then
  # Not in a Hivemind session, let Claude handle it normally
  exit 0
fi

# Write prompt to temp file (handles arbitrary content safely)
PROMPT_FILE=$(mktemp /tmp/hivemind-agent-XXXXXX.txt)
echo "$PROMPT" > "$PROMPT_FILE"

# Create launcher script that reads prompt and execs claude
LAUNCHER=$(mktemp /tmp/hivemind-launch-XXXXXX.sh)
cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/bin/bash
PROMPT=$(cat "$1")
rm -f "$1" "$0"
exec claude "$PROMPT"
LAUNCHER_EOF
chmod +x "$LAUNCHER"

# Create a new tmux pane running the launcher
PANE_ID=$("$TMUX_CMD" -L "$TMUX_SOCKET" split-window -d -P -F '#{pane_id}' \
  "$LAUNCHER" "$PROMPT_FILE")

if [ $? -ne 0 ]; then
  echo "Error: Failed to create tmux pane for teammate" >&2
  rm -f "$PROMPT_FILE" "$LAUNCHER"
  exit 2
fi

# Set pane title to agent description
"$TMUX_CMD" -L "$TMUX_SOCKET" select-pane -t "$PANE_ID" -T "$DESCRIPTION" 2>/dev/null || true

# Tell lead agent the teammate was spawned (stderr → Claude's feedback)
echo "Teammate agent spawned in Hivemind pane $PANE_ID. The agent is working on: $DESCRIPTION. Use the hivemind_list_teammates or hivemind_check_teammate MCP tools to check on teammate progress and results." >&2

exit 2
```

**Step 2: Make it executable**

```bash
chmod +x bin/agent-intercept-hook
```

**Step 3: Write tests for the hook script**

Create `src/__tests__/integration/agent-intercept-hook.test.ts`:

```typescript
// Test hook script behavior with mock tmux
// - Verify it reads stdin JSON correctly
// - Verify it exits 0 when no prompt (passthrough)
// - Verify it exits 0 when not in Hivemind (no CC_TMUX_SOCKET)
// - Verify it exits 2 with stderr message when intercepting
// - Verify it calls tmux split-window with correct args
```

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```bash
git add bin/agent-intercept-hook src/__tests__/integration/agent-intercept-hook.test.ts
git commit -m "feat: add PreToolUse hook script for agent interception"
```

---

## Task 2: MCP Server (`bin/hivemind-mcp-server.mjs`)

**Files:**
- Create: `src/main/mcp/hivemind-mcp-server.ts` (source)
- Create: `bin/hivemind-mcp-server.mjs` (built output, standalone)
- Modify: `package.json` (add @modelcontextprotocol/sdk dependency)

**What it does:** A standalone MCP server that Claude Code spawns via stdio. Provides `list_teammates` and `check_teammate` tools that query tmux directly using env vars.

**Step 1: Install MCP SDK dependency**

```bash
pnpm add @modelcontextprotocol/sdk zod
```

**Step 2: Write tests for MCP server tools**

Create `src/__tests__/unit/hivemind-mcp-server.test.ts`:

```typescript
// Test the tool logic in isolation (mock execSync)
// - list_teammates: returns parsed pane list, excludes lead pane
// - check_teammate: returns captured output + status for valid pane
// - check_teammate: returns isError for unknown pane
```

**Step 3: Run tests, verify they fail**

**Step 4: Create the MCP server**

`src/main/mcp/hivemind-mcp-server.ts`:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFileSync } from "child_process";
import { z } from "zod";

const TMUX_CMD = process.env.REAL_TMUX || "tmux";
const TMUX_SOCKET = process.env.CC_TMUX_SOCKET || "";
const LEAD_PANE = process.env.TMUX_PANE || "%0";

function tmux(...args: string[]): string {
  return execFileSync(TMUX_CMD, ["-L", TMUX_SOCKET, ...args], {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
}

const server = new McpServer({ name: "hivemind", version: "1.0.0" });

server.registerTool(
  "hivemind_list_teammates",
  {
    description: "List all active teammate agent panes and their current status",
    inputSchema: z.object({}),
  },
  async () => {
    const raw = tmux("list-panes", "-a", "-F",
      "#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_dead}");
    const panes = raw.split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, title, pid, dead] = line.split("|");
        return { id, title: title || "teammate", pid, status: dead === "1" ? "exited" : "running" };
      })
      .filter((p) => p.id !== LEAD_PANE);

    if (panes.length === 0) {
      return { content: [{ type: "text", text: "No active teammates found." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(panes, null, 2) }] };
  }
);

server.registerTool(
  "hivemind_check_teammate",
  {
    description: "Check the recent output and status of a specific teammate pane",
    inputSchema: z.object({
      pane_id: z.string().describe("The tmux pane ID (e.g., %1, %2)"),
    }),
  },
  async ({ pane_id }) => {
    try {
      const output = tmux("capture-pane", "-t", pane_id, "-p", "-S", "-200");
      let status = "running";
      try {
        const dead = tmux("display-message", "-t", pane_id, "-p", "#{pane_dead}");
        if (dead === "1") status = "exited";
      } catch { /* pane may have been destroyed */ }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ pane_id, status, recent_output: output }, null, 2),
        }],
      };
    } catch {
      return {
        content: [{ type: "text", text: `Pane ${pane_id} not found or inaccessible.` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hivemind MCP server running on stdio");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
```

**Step 5: Add build script for MCP server**

The MCP server needs to be built as a standalone ES module. Add to package.json:

```json
{
  "scripts": {
    "build:mcp": "esbuild src/main/mcp/hivemind-mcp-server.ts --bundle --platform=node --format=esm --outfile=bin/hivemind-mcp-server.mjs --external:zod"
  }
}
```

Or use a simple tsc compilation step. The key is that `bin/hivemind-mcp-server.mjs` is a standalone runnable file.

**Step 6: Run tests, verify they pass**

**Step 7: Commit**

```bash
git add src/main/mcp/ src/__tests__/unit/hivemind-mcp-server.test.ts bin/hivemind-mcp-server.mjs package.json pnpm-lock.yaml
git commit -m "feat: add Hivemind MCP server for teammate status queries"
```

---

## Task 3: Configuration Service (`src/main/services/ClaudeConfigService.ts`)

**Files:**
- Create: `src/main/services/ClaudeConfigService.ts`
- Test: `src/__tests__/unit/claude-config-service.test.ts`

**What it does:** Before the lead agent starts, writes Claude Code hook config and MCP server config into the project directory. Cleans up on session stop. Merges with existing configs if present.

**Step 1: Write tests**

```typescript
// - writeHooksConfig: creates .claude/settings.local.json with PreToolUse hook
// - writeMcpConfig: creates .mcp.json with hivemind server entry
// - writeConfigs: calls both
// - cleanup: removes both files
// - mergeExisting: preserves existing settings when merging
// - cleanup restores backups if they existed
```

**Step 2: Run tests, verify they fail**

**Step 3: Implement ClaudeConfigService**

```typescript
import { promises as fs } from 'fs'
import { join, dirname } from 'path'

export class ClaudeConfigService {
  private projectDir: string
  private binDir: string
  private tmuxSocket: string
  private realTmuxPath: string
  private existingSettingsBackup: string | null = null
  private existingMcpBackup: string | null = null

  constructor(opts: {
    projectDir: string
    binDir: string
    tmuxSocket: string
    realTmuxPath: string
  }) {
    this.projectDir = opts.projectDir
    this.binDir = opts.binDir
    this.tmuxSocket = opts.tmuxSocket
    this.realTmuxPath = opts.realTmuxPath
  }

  async writeConfigs(): Promise<void> {
    await this.writeHooksConfig()
    await this.writeMcpConfig()
  }

  async cleanup(): Promise<void> {
    // Remove or restore .claude/settings.local.json
    // Remove or restore .mcp.json
  }

  private async writeHooksConfig(): Promise<void> {
    const settingsPath = join(this.projectDir, '.claude', 'settings.local.json')
    // Read existing, merge hooks, write back
    const hookConfig = {
      hooks: {
        PreToolUse: [{
          matcher: "Agent",
          hooks: [{
            type: "command",
            command: join(this.binDir, 'agent-intercept-hook'),
            timeout: 30,
          }],
        }],
      },
    }
    await fs.mkdir(dirname(settingsPath), { recursive: true })
    // Merge with existing settings if present
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(await fs.readFile(settingsPath, 'utf-8'))
      this.existingSettingsBackup = JSON.stringify(existing)
    } catch { /* no existing file */ }

    const merged = { ...existing, ...hookConfig }
    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2))
  }

  private async writeMcpConfig(): Promise<void> {
    const mcpPath = join(this.projectDir, '.mcp.json')
    const mcpEntry = {
      mcpServers: {
        hivemind: {
          command: "node",
          args: [join(this.binDir, 'hivemind-mcp-server.mjs')],
          env: {
            CC_TMUX_SOCKET: this.tmuxSocket,
            REAL_TMUX: this.realTmuxPath,
            TMUX_PANE: "%0",
          },
        },
      },
    }
    // Merge with existing .mcp.json if present
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(await fs.readFile(mcpPath, 'utf-8'))
      this.existingMcpBackup = JSON.stringify(existing)
    } catch { /* no existing file */ }

    const merged = {
      mcpServers: {
        ...(existing as { mcpServers?: Record<string, unknown> }).mcpServers,
        ...mcpEntry.mcpServers,
      },
    }
    await fs.writeFile(mcpPath, JSON.stringify(merged, null, 2))
  }
}
```

**Step 4: Run tests, verify they pass**

**Step 5: Commit**

```bash
git add src/main/services/ClaudeConfigService.ts src/__tests__/unit/claude-config-service.test.ts
git commit -m "feat: add ClaudeConfigService for hook and MCP config injection"
```

---

## Task 4: Integration — Wire Into TeamSession

**Files:**
- Modify: `src/main/tmux/TeamSession.ts` (import + use ClaudeConfigService)
- Modify: `src/main/services/createIpcServices.ts` (if needed)

**What it does:** TeamSession.start() creates a ClaudeConfigService and writes configs before starting the lead PTY. TeamSession.stop() cleans up configs.

**Step 1: Write integration test**

```typescript
// - TeamSession.start() writes .claude/settings.local.json
// - TeamSession.start() writes .mcp.json
// - Lead agent env includes necessary vars
// - TeamSession.stop() cleans up config files
```

**Step 2: Run test, verify it fails**

**Step 3: Modify TeamSession.start()**

In `TeamSession.start()`, after creating the proxy server (line 119) and before creating the lead PTY (line 124):

```typescript
// Write Claude Code hooks + MCP config for this session
this.configService = new ClaudeConfigService({
  projectDir: this.projectPath,
  binDir: TeamSession.getBinDir(),
  tmuxSocket: this.tmuxSocketName,
  realTmuxPath: this.realTmuxPath,
})
await this.configService.writeConfigs()
```

In `TeamSession.stop()`, before killing the tmux server:

```typescript
if (this.configService) {
  await this.configService.cleanup()
  this.configService = null
}
```

**Step 4: Run tests, verify they pass**

**Step 5: Run the full test suite**

```bash
pnpm test
```

**Step 6: Commit**

```bash
git add src/main/tmux/TeamSession.ts src/__tests__/integration/team-session-config.test.ts
git commit -m "feat: wire ClaudeConfigService into TeamSession lifecycle"
```

---

## Task 5: End-to-End Verification

**Step 1: Manual test checklist**

1. Start Hivemind, open a project
2. Start a team session (lead agent starts)
3. In the lead agent, ask it to spawn a teammate: "Use the Agent tool to create a teammate that lists files in this directory"
4. Verify: the Agent tool is intercepted (hook fires)
5. Verify: a new tmux pane appears
6. Verify: the pane shows up in Hivemind's sidebar
7. Verify: clicking the teammate shows a live interactive terminal
8. Verify: the lead agent sees "Agent spawned in pane %X" message
9. Verify: lead agent can call `hivemind_list_teammates` MCP tool
10. Verify: lead agent can call `hivemind_check_teammate` MCP tool
11. Verify: stopping the session cleans up config files

**Step 2: Write E2E test (if time permits)**

**Step 3: Final commit + PR**

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `bin/agent-intercept-hook` | Create | Bash hook script for PreToolUse interception |
| `src/main/mcp/hivemind-mcp-server.ts` | Create | MCP server source (list_teammates, check_teammate) |
| `bin/hivemind-mcp-server.mjs` | Create | Built MCP server (standalone, runnable by Claude Code) |
| `src/main/services/ClaudeConfigService.ts` | Create | Writes/cleans hook + MCP configs |
| `src/main/tmux/TeamSession.ts` | Modify | Wire ClaudeConfigService into start()/stop() |
| `package.json` | Modify | Add @modelcontextprotocol/sdk, build:mcp script |
| Tests (various) | Create | Unit + integration tests for all components |

## Parallelization

Tasks 1, 2, and 3 are fully independent and can be implemented in parallel:
- **Agent A**: Task 1 (hook script + tests)
- **Agent B**: Task 2 (MCP server + tests)
- **Agent C**: Task 3 (config service + tests)

Task 4 (integration) depends on all three completing first.
Task 5 (E2E verification) depends on Task 4.
