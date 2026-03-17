import { describe, it, expect } from 'vitest'
import { formatTmuxString } from '../../../main/tmux/TmuxResponseFormatter'

describe('TmuxResponseFormatter', () => {
  const defaultVars = {
    pane_id: '%0',
    pane_pid: '12345',
    pane_tty: '/dev/ttys001',
    pane_width: '80',
    pane_height: '24',
    pane_index: '0',
    pane_active: '1',
    pane_title: 'lead',
    window_id: '@0',
    window_index: '0',
    window_name: 'lead',
    window_active: '1',
    session_id: '$0',
    session_name: 'main',
    session_windows: '1',
    session_attached: '1'
  }

  describe('basic variable interpolation', () => {
    it('interpolates a single variable', () => {
      expect(formatTmuxString('#{pane_id}', defaultVars)).toBe('%0')
    })

    it('interpolates multiple variables', () => {
      const result = formatTmuxString('#{pane_id}:#{pane_pid}', defaultVars)
      expect(result).toBe('%0:12345')
    })

    it('returns literal text with no variables', () => {
      expect(formatTmuxString('hello world', defaultVars)).toBe('hello world')
    })

    it('returns empty string for empty input', () => {
      expect(formatTmuxString('', defaultVars)).toBe('')
    })
  })

  describe('pane variables', () => {
    it('interpolates pane_id', () => {
      expect(formatTmuxString('#{pane_id}', defaultVars)).toBe('%0')
    })

    it('interpolates pane_pid', () => {
      expect(formatTmuxString('#{pane_pid}', defaultVars)).toBe('12345')
    })

    it('interpolates pane_tty', () => {
      expect(formatTmuxString('#{pane_tty}', defaultVars)).toBe('/dev/ttys001')
    })

    it('interpolates pane_width', () => {
      expect(formatTmuxString('#{pane_width}', defaultVars)).toBe('80')
    })

    it('interpolates pane_height', () => {
      expect(formatTmuxString('#{pane_height}', defaultVars)).toBe('24')
    })

    it('interpolates pane_index', () => {
      expect(formatTmuxString('#{pane_index}', defaultVars)).toBe('0')
    })

    it('interpolates pane_active', () => {
      expect(formatTmuxString('#{pane_active}', defaultVars)).toBe('1')
    })

    it('interpolates pane_title', () => {
      expect(formatTmuxString('#{pane_title}', defaultVars)).toBe('lead')
    })
  })

  describe('window variables', () => {
    it('interpolates window_id', () => {
      expect(formatTmuxString('#{window_id}', defaultVars)).toBe('@0')
    })

    it('interpolates window_index', () => {
      expect(formatTmuxString('#{window_index}', defaultVars)).toBe('0')
    })

    it('interpolates window_name', () => {
      expect(formatTmuxString('#{window_name}', defaultVars)).toBe('lead')
    })

    it('interpolates window_active', () => {
      expect(formatTmuxString('#{window_active}', defaultVars)).toBe('1')
    })
  })

  describe('session variables', () => {
    it('interpolates session_id', () => {
      expect(formatTmuxString('#{session_id}', defaultVars)).toBe('$0')
    })

    it('interpolates session_name', () => {
      expect(formatTmuxString('#{session_name}', defaultVars)).toBe('main')
    })

    it('interpolates session_windows', () => {
      expect(formatTmuxString('#{session_windows}', defaultVars)).toBe('1')
    })

    it('interpolates session_attached', () => {
      expect(formatTmuxString('#{session_attached}', defaultVars)).toBe('1')
    })
  })

  describe('complex format strings', () => {
    it('handles typical list-panes format', () => {
      const fmt = '#{pane_id}:#{pane_pid}:#{pane_tty}:#{pane_width}x#{pane_height}'
      const result = formatTmuxString(fmt, defaultVars)
      expect(result).toBe('%0:12345:/dev/ttys001:80x24')
    })

    it('handles format with mixed literals and variables', () => {
      const fmt = 'Pane #{pane_id} (pid #{pane_pid}) in session #{session_name}'
      const result = formatTmuxString(fmt, defaultVars)
      expect(result).toBe('Pane %0 (pid 12345) in session main')
    })

    it('handles typical list-sessions format', () => {
      const fmt = '#{session_name}: #{session_windows} windows (attached)'
      const result = formatTmuxString(fmt, defaultVars)
      expect(result).toBe('main: 1 windows (attached)')
    })
  })

  describe('unknown variables', () => {
    it('replaces unknown variables with empty string', () => {
      expect(formatTmuxString('#{nonexistent}', defaultVars)).toBe('')
    })

    it('handles mix of known and unknown variables', () => {
      const result = formatTmuxString('#{pane_id}:#{unknown}:#{pane_pid}', defaultVars)
      expect(result).toBe('%0::12345')
    })
  })

  describe('edge cases', () => {
    it('handles adjacent variables with no separator', () => {
      const result = formatTmuxString('#{pane_id}#{pane_pid}', defaultVars)
      expect(result).toBe('%012345')
    })

    it('handles format strings with only literals and colons', () => {
      expect(formatTmuxString('a:b:c', defaultVars)).toBe('a:b:c')
    })

    it('handles incomplete variable syntax (no closing brace)', () => {
      expect(formatTmuxString('#{pane_id', defaultVars)).toBe('#{pane_id')
    })

    it('handles empty variable name', () => {
      expect(formatTmuxString('#{}', defaultVars)).toBe('')
    })

    it('handles hash without brace', () => {
      expect(formatTmuxString('#pane_id', defaultVars)).toBe('#pane_id')
    })
  })
})
