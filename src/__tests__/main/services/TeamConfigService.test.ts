import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TeamConfigService } from '../../../main/services/TeamConfigService'
import type { TeamConfig } from '../../../shared/types'
import { AGENT_COLORS, AGENT_AVATARS } from '../../../shared/constants'

// Mock fs and yaml - use vi.hoisted since vi.mock is hoisted
const { mockExistsSync, mockMkdirSync, mockReadFileSync, mockYamlParse } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(() => true),
  mockMkdirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockYamlParse: vi.fn()
}))

vi.mock('node:fs', () => {
  const mocks = {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readFileSync: mockReadFileSync
  }
  return { ...mocks, default: mocks }
})

vi.mock('yaml', () => ({
  parse: mockYamlParse
}))

describe('TeamConfigService', () => {
  let service: TeamConfigService

  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    service = new TeamConfigService('/tmp/test-teams')
  })

  describe('constructor', () => {
    it('creates the config directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      new TeamConfigService('/tmp/new-teams')
      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/new-teams', { recursive: true })
    })

    it('does not create directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true)
      new TeamConfigService('/tmp/existing')
      expect(mockMkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('loadConfig', () => {
    it('loads and parses a YAML config file', () => {
      const teamData = {
        name: 'my-team',
        project: '/project',
        agents: [{ name: 'agent1', role: 'role1', command: 'cmd1' }]
      }
      mockReadFileSync.mockReturnValue('yaml content')
      mockYamlParse.mockReturnValue(teamData)

      const config = service.loadConfig('my-team.yml')
      expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/test-teams/my-team.yml', 'utf-8')
      expect(config.name).toBe('my-team')
      expect(config.agents).toHaveLength(1)
    })

    it('throws on invalid config', () => {
      mockReadFileSync.mockReturnValue('yaml')
      mockYamlParse.mockReturnValue({ name: '', project: '/p', agents: [] })

      expect(() => service.loadConfig('bad.yml')).toThrow()
    })
  })

  describe('auto-assign avatars and colors', () => {
    it('assigns colors to agents without them', () => {
      const config: TeamConfig = {
        name: 'team',
        project: '/p',
        agents: [
          { name: 'a1', role: 'r', command: 'c' },
          { name: 'a2', role: 'r', command: 'c' }
        ]
      }

      const enriched = service.enrichConfig(config)
      expect(enriched.agents[0].color).toBe(AGENT_COLORS[0])
      expect(enriched.agents[1].color).toBe(AGENT_COLORS[1])
    })

    it('assigns avatars to agents without them', () => {
      const config: TeamConfig = {
        name: 'team',
        project: '/p',
        agents: [
          { name: 'a1', role: 'r', command: 'c' },
          { name: 'a2', role: 'r', command: 'c' }
        ]
      }

      const enriched = service.enrichConfig(config)
      expect(enriched.agents[0].avatar).toBe(AGENT_AVATARS[0])
      expect(enriched.agents[1].avatar).toBe(AGENT_AVATARS[1])
    })

    it('preserves manually set colors and avatars', () => {
      const config: TeamConfig = {
        name: 'team',
        project: '/p',
        agents: [
          { name: 'a1', role: 'r', command: 'c', color: '#000000', avatar: 'custom' },
          { name: 'a2', role: 'r', command: 'c' }
        ]
      }

      const enriched = service.enrichConfig(config)
      expect(enriched.agents[0].color).toBe('#000000')
      expect(enriched.agents[0].avatar).toBe('custom')
      expect(enriched.agents[1].color).toBe(AGENT_COLORS[0])
      expect(enriched.agents[1].avatar).toBe(AGENT_AVATARS[0])
    })

    it('wraps around when more agents than colors', () => {
      const agents = Array.from({ length: 15 }, (_, i) => ({
        name: `a${i}`,
        role: 'r',
        command: 'c'
      }))
      const config: TeamConfig = { name: 'team', project: '/p', agents }

      const enriched = service.enrichConfig(config)
      expect(enriched.agents[12].color).toBe(AGENT_COLORS[0])
      expect(enriched.agents[12].avatar).toBe(AGENT_AVATARS[0])
    })

    it('skips already-used colors when auto-assigning', () => {
      const config: TeamConfig = {
        name: 'team',
        project: '/p',
        agents: [
          { name: 'a1', role: 'r', command: 'c', color: AGENT_COLORS[0] },
          { name: 'a2', role: 'r', command: 'c' }
        ]
      }

      const enriched = service.enrichConfig(config)
      expect(enriched.agents[1].color).not.toBe(AGENT_COLORS[0])
      expect(enriched.agents[1].color).toBe(AGENT_COLORS[1])
    })
  })
})
