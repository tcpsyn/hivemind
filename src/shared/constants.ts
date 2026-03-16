import type { GridConfig, GridLayout } from './types'

export const AGENT_COLORS = [
  '#FF6B6B', // coral
  '#4ECDC4', // teal
  '#45B7D1', // sky
  '#96CEB4', // sage
  '#FFEAA7', // gold
  '#DDA0DD', // plum
  '#98D8C8', // mint
  '#F7DC6F', // amber
  '#BB8FCE', // lavender
  '#85C1E9', // azure
  '#F0B27A', // peach
  '#82E0AA' // emerald
] as const

export const AGENT_AVATARS = [
  'robot-1',
  'robot-2',
  'robot-3',
  'circuit',
  'diamond',
  'hexagon',
  'star',
  'shield',
  'bolt',
  'gear',
  'cube',
  'prism'
] as const

export const GRID_CONFIGS: Record<GridLayout, GridConfig> = {
  '1x1': { layout: '1x1', columns: 1, rows: 1 },
  '2x1': { layout: '2x1', columns: 2, rows: 1 },
  '1x2': { layout: '1x2', columns: 1, rows: 2 },
  '2x2': { layout: '2x2', columns: 2, rows: 2 },
  '3x2': { layout: '3x2', columns: 3, rows: 2 },
  auto: { layout: 'auto', columns: 2, rows: 2 }
}

export const DEFAULT_SIDEBAR_WIDTH = 250
export const DEFAULT_GRID_LAYOUT: GridLayout = 'auto'

export const INPUT_DETECTION_TIMEOUT_MS = 5000
export const INPUT_PROMPT_PATTERNS = ['❯', '$ ', '> ', '? ', '(y/n)', '[Y/n]', '[y/N]']

export const FILE_SAVE_DEBOUNCE_MS = 500
export const FILE_TREE_MAX_DEPTH = 10

export const WINDOW_DEFAULTS = {
  width: 1400,
  height: 900,
  minWidth: 800,
  minHeight: 600
}
