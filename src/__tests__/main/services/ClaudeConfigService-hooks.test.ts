import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { ClaudeConfigService } from '../../../main/services/ClaudeConfigService'

describe('ClaudeConfigService — hook merging edge cases', () => {
  let tempDir: string
  let service: ClaudeConfigService

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hivemind-hooks-test-'))
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

  describe('permission merging', () => {
    it('deduplicates hivemind permissions when already present', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          permissions: {
            allow: [
              'Bash(npm test)',
              'mcp__hivemind__hivemind_list_teammates',
              'mcp__hivemind__hivemind_check_teammate'
            ]
          }
        })
      )

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)

      // Should not have duplicate hivemind permissions
      const hivemindPerms = config.permissions.allow.filter((p: string) =>
        p.startsWith('mcp__hivemind__')
      )
      expect(hivemindPerms).toHaveLength(3)
      expect(config.permissions.allow).toContain('Bash(npm test)')
    })

    it('replaces old hivemind permissions with new ones', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          permissions: {
            allow: ['mcp__hivemind__old_tool', 'Bash(npm test)']
          }
        })
      )

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)

      expect(config.permissions.allow).not.toContain('mcp__hivemind__old_tool')
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_list_teammates')
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_check_teammate')
      expect(config.permissions.allow).toContain('Bash(npm test)')
    })
  })

  describe('hook merging', () => {
    it('preserves existing non-PreToolUse hooks', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          hooks: {
            PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo done' }] }]
          }
        })
      )

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)

      expect(config.hooks.PostToolUse).toBeDefined()
      expect(config.hooks.PostToolUse).toHaveLength(1)
      // No Agent hook — native handling
      expect(config.hooks.PreToolUse).toHaveLength(0)
    })

    it('preserves non-Agent PreToolUse hooks', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(
        join(tempDir, '.claude', 'settings.local.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'OldMatcher', hooks: [{ type: 'command', command: 'old' }] }]
          }
        })
      )

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)

      // OldMatcher preserved, Agent hooks filtered out (native handling)
      expect(config.hooks.PreToolUse).toHaveLength(1)
      expect(config.hooks.PreToolUse[0].matcher).toBe('OldMatcher')
    })
  })

  describe('MCP config merging', () => {
    it('overwrites existing hivemind server config', async () => {
      await fs.writeFile(
        join(tempDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            hivemind: { command: 'old-command', args: ['old'] }
          }
        })
      )

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.mcp.json'), 'utf-8')
      const config = JSON.parse(raw)

      expect(config.mcpServers.hivemind.command).toBe('node')
      expect(config.mcpServers.hivemind.args[0]).toBe('/test/bin/hivemind-mcp-server.mjs')
    })

    it('handles malformed JSON gracefully by creating fresh config', async () => {
      await fs.writeFile(join(tempDir, '.mcp.json'), '{ invalid json }}}')

      // Should not throw — treats as fresh config
      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.mcp.json'), 'utf-8')
      const config = JSON.parse(raw)
      expect(config.mcpServers.hivemind).toBeDefined()
    })

    it('handles malformed settings.local.json by creating fresh config', async () => {
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(join(tempDir, '.claude', 'settings.local.json'), 'not json!!')

      await service.writeConfigs()

      const raw = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      const config = JSON.parse(raw)
      expect(config.permissions.allow).toContain('mcp__hivemind__hivemind_list_teammates')
      expect(config.hooks.PreToolUse).toHaveLength(0)
    })
  })

  describe('cleanup with merged configs', () => {
    it('restores original settings after merging with existing', async () => {
      const original = JSON.stringify({
        permissions: { allow: ['Bash(npm test)'] },
        hooks: { PostToolUse: [{ matcher: '*', hooks: [] }] }
      })
      await fs.mkdir(join(tempDir, '.claude'), { recursive: true })
      await fs.writeFile(join(tempDir, '.claude', 'settings.local.json'), original)

      await service.writeConfigs()
      await service.cleanup()

      const restored = await fs.readFile(join(tempDir, '.claude', 'settings.local.json'), 'utf-8')
      expect(restored).toBe(original)
    })

    it('removes settings file when it did not exist before', async () => {
      await service.writeConfigs()
      await service.cleanup()

      await expect(fs.access(join(tempDir, '.claude', 'settings.local.json'))).rejects.toThrow()
    })
  })
})
