import { describe, it, expect } from 'vitest'
import {
  AGENT_COLORS,
  AGENT_AVATARS,
  GRID_CONFIGS,
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_GRID_LAYOUT,
  INPUT_DETECTION_TIMEOUT_MS,
  INPUT_PROMPT_PATTERNS,
  FILE_SAVE_DEBOUNCE_MS,
  FILE_TREE_MAX_DEPTH,
  WINDOW_DEFAULTS
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

  describe('GRID_CONFIGS', () => {
    it('has all expected layout keys', () => {
      expect(Object.keys(GRID_CONFIGS).sort()).toEqual(
        ['1x1', '1x2', '2x1', '2x2', '3x2', 'auto'].sort()
      )
    })

    it('each config has matching layout, columns, and rows', () => {
      for (const [key, config] of Object.entries(GRID_CONFIGS)) {
        expect(config.layout).toBe(key)
        expect(config.columns).toBeGreaterThan(0)
        expect(config.rows).toBeGreaterThan(0)
      }
    })

    it('1x1 has 1 column and 1 row', () => {
      expect(GRID_CONFIGS['1x1']).toEqual({ layout: '1x1', columns: 1, rows: 1 })
    })

    it('2x2 has 2 columns and 2 rows', () => {
      expect(GRID_CONFIGS['2x2']).toEqual({ layout: '2x2', columns: 2, rows: 2 })
    })

    it('3x2 has 3 columns and 2 rows', () => {
      expect(GRID_CONFIGS['3x2']).toEqual({ layout: '3x2', columns: 3, rows: 2 })
    })
  })

  describe('defaults', () => {
    it('DEFAULT_SIDEBAR_WIDTH is a positive number', () => {
      expect(DEFAULT_SIDEBAR_WIDTH).toBeGreaterThan(0)
      expect(DEFAULT_SIDEBAR_WIDTH).toBe(250)
    })

    it('DEFAULT_GRID_LAYOUT is auto', () => {
      expect(DEFAULT_GRID_LAYOUT).toBe('auto')
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
      expect(INPUT_PROMPT_PATTERNS).toContain('$ ')
      expect(INPUT_PROMPT_PATTERNS).toContain('> ')
      expect(INPUT_PROMPT_PATTERNS).toContain('(y/n)')
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
