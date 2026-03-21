import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import { writeFileSync, mkdtempSync, rmSync, chmodSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { resolve } from 'path'

const HOOK_PATH = resolve(__dirname, '../../../../bin/agent-intercept-hook')

function runHook(
  stdinJson: object,
  env: Record<string, string> = {}
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [HOOK_PATH], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 10000
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  }
}

describe('agent-intercept-hook', () => {
  describe('passthrough cases (exit 0)', () => {
    it('exits 0 when tool_input has no prompt', () => {
      const result = runHook({
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { description: 'some agent' }
      })
      expect(result.status).toBe(0)
    })

    it('exits 0 when prompt is empty string', () => {
      const result = runHook({
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: { prompt: '', description: 'agent' }
      })
      expect(result.status).toBe(0)
    })

    it('exits 0 when CC_TMUX_SOCKET is not set', () => {
      const result = runHook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: { prompt: 'do something', description: 'worker' }
        },
        {
          REAL_TMUX: '/usr/bin/tmux',
          CC_TMUX_SOCKET: ''
        }
      )
      expect(result.status).toBe(0)
    })

    it('exits 0 when REAL_TMUX is not set', () => {
      const result = runHook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: { prompt: 'do something', description: 'worker' }
        },
        {
          REAL_TMUX: '',
          CC_TMUX_SOCKET: 'test-socket'
        }
      )
      expect(result.status).toBe(0)
    })
  })

  describe('interception with mock tmux', () => {
    let mockBinDir: string
    let mockTmuxPath: string

    beforeAll(() => {
      mockBinDir = mkdtempSync(join(tmpdir(), 'hivemind-mock-'))
      mockTmuxPath = join(mockBinDir, 'tmux')

      // Create a mock tmux that logs calls and returns a fake pane ID
      writeFileSync(
        mockTmuxPath,
        `#!/bin/bash
# Mock tmux: log command and return fake pane ID
echo "$@" >> "${mockBinDir}/tmux-calls.log"
case "$1" in
  -L)
    case "$3" in
      new-window)
        echo "%5"
        exit 0
        ;;
      select-pane)
        exit 0
        ;;
      *)
        exit 0
        ;;
    esac
    ;;
esac
exit 0
`
      )
      chmodSync(mockTmuxPath, '755')
    })

    afterAll(() => {
      rmSync(mockBinDir, { recursive: true, force: true })
    })

    it('exits 2 and creates tmux pane when intercepting Agent tool', () => {
      const result = runHook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: {
            prompt: 'List all files in the project',
            description: 'file-lister'
          }
        },
        {
          REAL_TMUX: mockTmuxPath,
          CC_TMUX_SOCKET: 'test-socket'
        }
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('Teammate agent spawned in Hivemind pane')
      expect(result.stderr).toContain('hivemind_send_message')
      expect(result.stderr).toContain('hivemind_check_teammate')
    })

    it('uses default description when none provided', () => {
      const result = runHook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: {
            prompt: 'do some work'
          }
        },
        {
          REAL_TMUX: mockTmuxPath,
          CC_TMUX_SOCKET: 'test-socket'
        }
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('teammate')
    })
  })

  describe('tmux failure handling', () => {
    let mockBinDir: string
    let failingTmuxPath: string

    beforeAll(() => {
      mockBinDir = mkdtempSync(join(tmpdir(), 'hivemind-fail-'))
      failingTmuxPath = join(mockBinDir, 'tmux')
      writeFileSync(
        failingTmuxPath,
        `#!/bin/bash
echo "tmux error: server not found" >&2
exit 1
`
      )
      chmodSync(failingTmuxPath, '755')
    })

    afterAll(() => {
      rmSync(mockBinDir, { recursive: true, force: true })
    })

    it('exits 2 with error message when tmux new-window fails', () => {
      const result = runHook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_input: {
            prompt: 'do work',
            description: 'worker'
          }
        },
        {
          REAL_TMUX: failingTmuxPath,
          CC_TMUX_SOCKET: 'test-socket'
        }
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('Error: Failed to create tmux pane')
    })
  })
})
