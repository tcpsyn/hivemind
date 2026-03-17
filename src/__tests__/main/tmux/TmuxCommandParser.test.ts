import { describe, it, expect } from 'vitest'
import { parseTmuxArgs } from '../../../main/tmux/TmuxCommandParser'

describe('TmuxCommandParser', () => {
  describe('basic command parsing', () => {
    it('parses new-window with -t and -n flags', () => {
      const result = parseTmuxArgs(['new-window', '-t', 'main', '-n', 'researcher'])
      expect(result.command).toBe('new-window')
      expect(result.args).toEqual({ t: 'main', n: 'researcher' })
    })

    it('parses has-session with -t', () => {
      const result = parseTmuxArgs(['has-session', '-t', 'main'])
      expect(result.command).toBe('has-session')
      expect(result.args).toEqual({ t: 'main' })
    })

    it('parses new-session with -d and -s flags', () => {
      const result = parseTmuxArgs(['new-session', '-d', '-s', 'main'])
      expect(result.command).toBe('new-session')
      expect(result.args).toEqual({ d: true, s: 'main' })
    })

    it('parses kill-session with -t', () => {
      const result = parseTmuxArgs(['kill-session', '-t', 'main'])
      expect(result.command).toBe('kill-session')
      expect(result.args).toEqual({ t: 'main' })
    })

    it('parses kill-pane with -t', () => {
      const result = parseTmuxArgs(['kill-pane', '-t', '%3'])
      expect(result.command).toBe('kill-pane')
      expect(result.args).toEqual({ t: '%3' })
    })

    it('parses select-pane with -t', () => {
      const result = parseTmuxArgs(['select-pane', '-t', '%2'])
      expect(result.command).toBe('select-pane')
      expect(result.args).toEqual({ t: '%2' })
    })
  })

  describe('boolean flags', () => {
    it('parses -d as boolean true', () => {
      const result = parseTmuxArgs(['new-window', '-d', '-t', 'main'])
      expect(result.args.d).toBe(true)
      expect(result.args.t).toBe('main')
    })

    it('parses -p as boolean true for capture-pane', () => {
      const result = parseTmuxArgs(['capture-pane', '-t', '%1', '-p'])
      expect(result.command).toBe('capture-pane')
      expect(result.args.p).toBe(true)
      expect(result.args.t).toBe('%1')
    })
  })

  describe('version flag', () => {
    it('parses -V as the command', () => {
      const result = parseTmuxArgs(['-V'])
      expect(result.command).toBe('-V')
      expect(result.args).toEqual({})
    })
  })

  describe('list-panes with -F format string', () => {
    it('parses -F with format string', () => {
      const result = parseTmuxArgs(['list-panes', '-t', 'main', '-F', '#{pane_id}:#{pane_pid}'])
      expect(result.command).toBe('list-panes')
      expect(result.args.t).toBe('main')
      expect(result.args.F).toBe('#{pane_id}:#{pane_pid}')
    })
  })

  describe('display-message', () => {
    it('parses display-message with -p and format string', () => {
      const result = parseTmuxArgs(['display-message', '-p', '#{session_name}'])
      expect(result.command).toBe('display-message')
      expect(result.args.p).toBe(true)
      expect(result.rawArgs).toContain('#{session_name}')
    })

    it('parses display-message with -t and -p', () => {
      const result = parseTmuxArgs(['display-message', '-t', 'main', '-p', '#{window_id}'])
      expect(result.command).toBe('display-message')
      expect(result.args.t).toBe('main')
      expect(result.args.p).toBe(true)
      expect(result.rawArgs).toContain('#{window_id}')
    })
  })

  describe('resize-pane', () => {
    it('parses resize-pane with -x and -y', () => {
      const result = parseTmuxArgs(['resize-pane', '-t', '%1', '-x', '120', '-y', '40'])
      expect(result.command).toBe('resize-pane')
      expect(result.args.t).toBe('%1')
      expect(result.args.x).toBe('120')
      expect(result.args.y).toBe('40')
    })
  })

  describe('send-keys special handling', () => {
    it('parses send-keys with target and command string + Enter', () => {
      const result = parseTmuxArgs([
        'send-keys',
        '-t',
        '%1',
        'claude --agent-id researcher@team --resume',
        'Enter'
      ])
      expect(result.command).toBe('send-keys')
      expect(result.args.t).toBe('%1')
      expect(result.rawArgs).toContain('claude --agent-id researcher@team --resume')
      expect(result.rawArgs).toContain('Enter')
    })

    it('parses send-keys with -l literal flag', () => {
      const result = parseTmuxArgs(['send-keys', '-t', '%2', '-l', 'some text'])
      expect(result.command).toBe('send-keys')
      expect(result.args.t).toBe('%2')
      expect(result.args.l).toBe(true)
      expect(result.rawArgs).toContain('some text')
    })

    it('preserves all trailing args as rawArgs for send-keys', () => {
      const result = parseTmuxArgs(['send-keys', '-t', '%0', 'echo', 'hello world', 'Enter'])
      expect(result.command).toBe('send-keys')
      expect(result.args.t).toBe('%0')
      expect(result.rawArgs).toEqual(['echo', 'hello world', 'Enter'])
    })
  })

  describe('split-window', () => {
    it('parses split-window with -h and -t', () => {
      const result = parseTmuxArgs(['split-window', '-h', '-t', 'main'])
      expect(result.command).toBe('split-window')
      expect(result.args.h).toBe(true)
      expect(result.args.t).toBe('main')
    })

    it('parses split-window with -v', () => {
      const result = parseTmuxArgs(['split-window', '-v', '-t', '%1'])
      expect(result.command).toBe('split-window')
      expect(result.args.v).toBe(true)
      expect(result.args.t).toBe('%1')
    })
  })

  describe('edge cases', () => {
    it('handles empty args', () => {
      const result = parseTmuxArgs([])
      expect(result.command).toBe('')
      expect(result.args).toEqual({})
      expect(result.rawArgs).toEqual([])
    })

    it('handles unknown commands gracefully', () => {
      const result = parseTmuxArgs(['some-future-command', '-t', 'main'])
      expect(result.command).toBe('some-future-command')
      expect(result.args.t).toBe('main')
    })

    it('stores rawArgs for all commands', () => {
      const result = parseTmuxArgs(['new-window', '-t', 'main', '-n', 'worker'])
      expect(result.rawArgs).toEqual(['new-window', '-t', 'main', '-n', 'worker'])
    })

    it('parses list-sessions with no args', () => {
      const result = parseTmuxArgs(['list-sessions'])
      expect(result.command).toBe('list-sessions')
      expect(result.args).toEqual({})
    })
  })
})
