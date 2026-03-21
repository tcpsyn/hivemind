import { promises as fs } from 'fs'
import { join, dirname } from 'path'

export interface ClaudeConfigServiceOptions {
  projectDir: string
  binDir: string
  tmuxSocket: string
  realTmuxPath: string
  sessionName?: string
  leadPaneId?: string
}

export class ClaudeConfigService {
  private projectDir: string
  private binDir: string
  private tmuxSocket: string
  private realTmuxPath: string
  private sessionName: string
  private leadPaneId: string
  private settingsBackup: string | null = null
  private mcpBackup: string | null = null

  constructor(opts: ClaudeConfigServiceOptions) {
    this.projectDir = opts.projectDir
    this.binDir = opts.binDir
    this.tmuxSocket = opts.tmuxSocket
    this.realTmuxPath = opts.realTmuxPath
    this.sessionName = opts.sessionName ?? ''
    this.leadPaneId = opts.leadPaneId ?? '%0'
  }

  async writeConfigs(): Promise<void> {
    await this.writeHooksConfig()
    await this.writeMcpConfig()
  }

  async cleanup(): Promise<void> {
    const settingsPath = join(this.projectDir, '.claude', 'settings.local.json')
    const mcpPath = join(this.projectDir, '.mcp.json')

    if (this.settingsBackup) {
      await fs.writeFile(settingsPath, this.settingsBackup)
    } else {
      try {
        await fs.unlink(settingsPath)
      } catch {
        /* didn't exist */
      }
    }

    if (this.mcpBackup) {
      await fs.writeFile(mcpPath, this.mcpBackup)
    } else {
      try {
        await fs.unlink(mcpPath)
      } catch {
        /* didn't exist */
      }
    }
  }

  private async writeHooksConfig(): Promise<void> {
    const settingsPath = join(this.projectDir, '.claude', 'settings.local.json')
    await fs.mkdir(dirname(settingsPath), { recursive: true })

    let existing: Record<string, unknown> = {}
    try {
      const raw = await fs.readFile(settingsPath, 'utf-8')
      existing = JSON.parse(raw)
      this.settingsBackup = raw
    } catch {
      /* no existing file */
    }

    const existingPermissions = (existing.permissions as Record<string, unknown>) || {}
    const existingAllow = (existingPermissions.allow as string[]) || []

    const merged = {
      ...existing,
      permissions: {
        ...existingPermissions,
        allow: [
          ...existingAllow.filter(
            (p: string) =>
              !p.startsWith('mcp__hivemind__') &&
              !['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(*)', 'Bash(pnpm *)'].includes(p)
          ),
          // Hivemind MCP tools
          'mcp__hivemind__hivemind_list_teammates',
          'mcp__hivemind__hivemind_check_teammate',
          'mcp__hivemind__hivemind_send_message',
          // Common tools — auto-approve so teammates work without permission prompts
          'Read',
          'Write',
          'Edit',
          'Glob',
          'Grep',
          'Bash(pnpm *)'
        ]
      },
      hooks: {
        ...((existing.hooks as Record<string, unknown>) || {}),
        // Filter out any Agent hooks — let Claude Code handle agent spawning natively
        PreToolUse: [
          ...(
            ((existing.hooks as Record<string, unknown>)?.PreToolUse as Array<
              Record<string, unknown>
            >) || []
          ).filter((hook: Record<string, unknown>) => hook.matcher !== 'Agent')
        ]
      }
    }

    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2))
  }

  private async writeMcpConfig(): Promise<void> {
    const mcpPath = join(this.projectDir, '.mcp.json')

    let existing: { mcpServers?: Record<string, unknown> } = {}
    try {
      const raw = await fs.readFile(mcpPath, 'utf-8')
      existing = JSON.parse(raw)
      this.mcpBackup = raw
    } catch {
      /* no existing file */
    }

    const merged = {
      mcpServers: {
        ...(existing.mcpServers || {}),
        hivemind: {
          command: 'node',
          args: [join(this.binDir, 'hivemind-mcp-server.mjs')],
          env: {
            CC_TMUX_SOCKET: this.tmuxSocket,
            CC_TMUX_SESSION: this.sessionName,
            REAL_TMUX: this.realTmuxPath,
            TMUX_PANE: this.leadPaneId
          }
        }
      }
    }

    await fs.writeFile(mcpPath, JSON.stringify(merged, null, 2))
  }
}
