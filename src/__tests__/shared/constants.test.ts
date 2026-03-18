import { describe, it, expect } from 'vitest'
import {
  AGENT_COLORS,
  AGENT_AVATARS,
  DEFAULT_SIDEBAR_WIDTH,
  INPUT_DETECTION_TIMEOUT_MS,
  INPUT_PROMPT_PATTERNS,
  FILE_SAVE_DEBOUNCE_MS,
  FILE_TREE_MAX_DEPTH,
  WINDOW_DEFAULTS,
  TERMINAL_THEME
} from '../../shared/constants'

describe('constants', () => {
  describe('AGENT_COLORS', () => {
    it('contains 12 colors', () => {
      expect(AGENT_COLORS).toHaveLength(12)
    })

    it('all colors are valid hex strings', () => {
      for (const color of AGENT_COLORS) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('all colors are unique', () => {
      expect(new Set(AGENT_COLORS).size).toBe(AGENT_COLORS.length)
    })
  })

  describe('AGENT_AVATARS', () => {
    it('contains 12 avatars', () => {
      expect(AGENT_AVATARS).toHaveLength(12)
    })

    it('all avatars are unique', () => {
      expect(new Set(AGENT_AVATARS).size).toBe(AGENT_AVATARS.length)
    })

    it('all avatars are non-empty strings', () => {
      for (const avatar of AGENT_AVATARS) {
        expect(typeof avatar).toBe('string')
        expect(avatar.length).toBeGreaterThan(0)
      }
    })
  })

  describe('defaults', () => {
    it('DEFAULT_SIDEBAR_WIDTH is a positive number', () => {
      expect(DEFAULT_SIDEBAR_WIDTH).toBeGreaterThan(0)
      expect(DEFAULT_SIDEBAR_WIDTH).toBe(250)
    })
  })

  describe('TERMINAL_THEME', () => {
    it('has all required xterm theme properties', () => {
      expect(TERMINAL_THEME.background).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TERMINAL_THEME.foreground).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TERMINAL_THEME.cursor).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TERMINAL_THEME.cursorAccent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TERMINAL_THEME.selectionBackground).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TERMINAL_THEME.selectionForeground).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  describe('timing constants', () => {
    it('INPUT_DETECTION_TIMEOUT_MS is a positive number', () => {
      expect(INPUT_DETECTION_TIMEOUT_MS).toBeGreaterThan(0)
    })

    it('FILE_SAVE_DEBOUNCE_MS is a positive number', () => {
      expect(FILE_SAVE_DEBOUNCE_MS).toBeGreaterThan(0)
    })
  })

  describe('INPUT_PROMPT_PATTERNS', () => {
    it('contains common terminal prompt patterns', () => {
      expect(INPUT_PROMPT_PATTERNS).toContain('❯')
      expect(INPUT_PROMPT_PATTERNS).toContain('(y/n)')
      expect(INPUT_PROMPT_PATTERNS).toContain('[Y/n]')
      expect(INPUT_PROMPT_PATTERNS).toContain('[y/N]')
      expect(INPUT_PROMPT_PATTERNS).toContain('(yes/no)')
    })

    it('does not contain overly broad patterns', () => {
      expect(INPUT_PROMPT_PATTERNS).not.toContain('$ ')
      expect(INPUT_PROMPT_PATTERNS).not.toContain('> ')
      expect(INPUT_PROMPT_PATTERNS).not.toContain('? ')
    })
  })

  describe('FILE_TREE_MAX_DEPTH', () => {
    it('is a positive number', () => {
      expect(FILE_TREE_MAX_DEPTH).toBeGreaterThan(0)
    })
  })

  describe('WINDOW_DEFAULTS', () => {
    it('has valid dimensions', () => {
      expect(WINDOW_DEFAULTS.width).toBeGreaterThan(0)
      expect(WINDOW_DEFAULTS.height).toBeGreaterThan(0)
      expect(WINDOW_DEFAULTS.minWidth).toBeGreaterThan(0)
      expect(WINDOW_DEFAULTS.minHeight).toBeGreaterThan(0)
    })

    it('min dimensions are smaller than defaults', () => {
      expect(WINDOW_DEFAULTS.minWidth).toBeLessThanOrEqual(WINDOW_DEFAULTS.width)
      expect(WINDOW_DEFAULTS.minHeight).toBeLessThanOrEqual(WINDOW_DEFAULTS.height)
    })
  })
})
