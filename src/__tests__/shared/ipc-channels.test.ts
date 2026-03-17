import { describe, it, expect } from 'vitest'
import { MainToRenderer, RendererToMain } from '../../shared/ipc-channels'

describe('IPC channels', () => {
  describe('MainToRenderer', () => {
    it('defines all expected event channels', () => {
      expect(MainToRenderer.AGENT_OUTPUT).toBe('agent:output')
      expect(MainToRenderer.AGENT_STATUS_CHANGE).toBe('agent:status-change')
      expect(MainToRenderer.AGENT_INPUT_NEEDED).toBe('agent:input-needed')
      expect(MainToRenderer.FILE_CHANGED).toBe('file:changed')
      expect(MainToRenderer.FILE_TREE_UPDATE).toBe('file:tree-update')
      expect(MainToRenderer.GIT_STATUS_UPDATE).toBe('git:status-update')
      expect(MainToRenderer.TEAM_TEAMMATE_SPAWNED).toBe('team:teammate-spawned')
      expect(MainToRenderer.TEAM_TEAMMATE_EXITED).toBe('team:teammate-exited')
      expect(MainToRenderer.TEAM_TEAMMATE_RENAMED).toBe('team:teammate-renamed')
      expect(MainToRenderer.TEAM_TEAMMATE_STATUS).toBe('team:teammate-status')
      expect(MainToRenderer.TEAMMATE_OUTPUT).toBe('teammate:output')
    })

    it('has no duplicate channel names', () => {
      const values = Object.values(MainToRenderer)
      expect(new Set(values).size).toBe(values.length)
    })

    it('all channels follow namespace:action format', () => {
      for (const channel of Object.values(MainToRenderer)) {
        expect(channel).toMatch(/^[a-z]+:[a-z-]+$/)
      }
    })
  })

  describe('RendererToMain', () => {
    it('defines all expected invoke channels', () => {
      expect(RendererToMain.AGENT_INPUT).toBe('agent:input')
      expect(RendererToMain.AGENT_STOP).toBe('agent:stop')
      expect(RendererToMain.AGENT_RESTART).toBe('agent:restart')
      expect(RendererToMain.AGENT_RESIZE).toBe('agent:resize')
      expect(RendererToMain.FILE_READ).toBe('file:read')
      expect(RendererToMain.FILE_WRITE).toBe('file:write')
      expect(RendererToMain.FILE_TREE_REQUEST).toBe('file:tree-request')
      expect(RendererToMain.GIT_DIFF).toBe('git:diff')
      expect(RendererToMain.TEAM_START).toBe('team:start')
      expect(RendererToMain.TEAM_STOP).toBe('team:stop')
      expect(RendererToMain.TEAMMATE_INPUT).toBe('teammate:input')
    })

    it('has no duplicate channel names', () => {
      const values = Object.values(RendererToMain)
      expect(new Set(values).size).toBe(values.length)
    })

    it('all channels follow namespace:action format', () => {
      for (const channel of Object.values(RendererToMain)) {
        expect(channel).toMatch(/^[a-z]+:[a-z-]+$/)
      }
    })
  })

  it('MainToRenderer and RendererToMain channels do not overlap', () => {
    const mainChannels = new Set(Object.values(MainToRenderer))
    const rendererChannels = new Set(Object.values(RendererToMain))

    for (const channel of mainChannels) {
      expect(rendererChannels.has(channel)).toBe(false)
    }
  })
})
