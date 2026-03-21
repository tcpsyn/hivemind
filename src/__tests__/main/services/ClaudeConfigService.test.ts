import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { ClaudeConfigService } from '../../../main/services/ClaudeConfigService'

describe('ClaudeConfigService', () => {
  let tempDir: string
  let service: ClaudeConfigService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hivemind-test-'))
    service = new ClaudeConfigService({
      projectDir: tempDir,
      binDir: '/test/bin',
      tmuxSocket: 'test-socket',
      realTmuxPath: '/usr/bin/tmux'
    })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('writeConfigs', () => {
    it('creates .claude/settings.local.json with MCP permissions (no Agent hook)', async () => {
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)
      // No Agent hook — Claude Code handles agent spawning natively via tmux
      expect(config.hooks.PreToolUse).toHaveLength(0)
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_list_teammates')
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_check_teammate')
    })

    it('creates .mcp.json with hivemind server', async () => {
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.mcp.json'), 'utf-8')
      const config = JSON.parse(raw)
      expect(config.mcpServers.hivemind.command).toBe('node')
      expect(config.mcpServers.hivemind.args[0]).toBe('/test/bin/hivemind-mcp-server.mjs')
      expect(config.mcpServers.hivemind.env).toEqual({
        CC_TMUX_SOCKET: 'test-socket',
        CC_TMUX_SESSION: '',
        REAL_TMUX: '/usr/bin/tmux',
        TMUX_PANE: '%0'
      })
    })

    it('creates .claude directory if it does not exist', async () => {
      await service.writeConfigs()
      const stat = await fs.stat(join(tempDir, '.claude'))
      expect(stat.isDirectory()).toBe(true)
    })

    it('merges with existing settings preserving other keys', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } })
      )
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_list_teammates')
      expect(config.hooks.PreToolUse).toHaveLength(0)
    })

    it('preserves existing non-Agent PreToolUse hooks', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-hook' }] }]
          }
        })
      )
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)
      // Bash hook preserved, no Agent hook added
      expect(config.hooks.PreToolUse).toHaveLength(1)
      expect(config.hooks.PreToolUse[0].matcher).toBe('Bash')
    })

    it('removes existing Agent hook (native handling)', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Agent', hooks: [{ type: 'command', command: 'old-hook' }] }]
          }
        })
      )
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)
      // Agent hooks are filtered out — Claude Code handles agent spawning natively
      expect(config.hooks.PreToolUse).toHaveLength(0)
    })

    it('merges with existing .mcp.json preserving other servers', async () => {
      await fs.writeFile(
        join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: { github: { command: 'github-mcp-server' } }
        })
      )
      await service.writeConfigs()
      const raw = await fs.readFile(join(tempDir, '.mcp.json'), 'utf-8')
      const config = JSON.parse(raw)
      expect(config.mcpServers.github.command).toBe('github-mcp-server')
      expect(config.mcpServers.hivemind).toBeDefined()
    })
  })

  describe('cleanup', () => {
    it('removes files when no backup exists', async () => {
      await service.writeConfigs()
      await service.cleanup()
      await expect(fs.access(join(tempDir, '.claude', 'settings.local.json'))).rejects.toThrow()
      await expect(fs.access(join(tempDir, '.mcp.json'))).rejects.toThrow()
    })

    it('restores settings backup when file existed before', async () => {
      const original = JSON.stringify({
        permissions: { allow: ['Bash(npm test)'] }
      })
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(join(tempDir, '.claude', 'settings.local.json'), original)
      await service.writeConfigs()
      await service.cleanup()
      const restored = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      expect(restored).toBe(original)
    })

    it('restores .mcp.json backup when file existed before', async () => {
      const original = JSON.stringify({
        mcpServers: { github: { command: 'github-mcp-server' } }
      })
      await fs.writeFile(join(tempDir, '.mcp.json'), original)
      await service.writeConfigs()
      await service.cleanup()
      const restored = await fs.readFile(join(tempDir, '.mcp.json'), 'utf-8')
      expect(restored).toBe(original)
    })

    it('handles cleanup when files were never written', async () => {
      // cleanup should not throw even if no configs were written
      await expect(service.cleanup()).resolves.not.toThrow()
    })
  })
})
