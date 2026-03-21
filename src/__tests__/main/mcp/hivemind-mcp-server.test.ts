import { describe, it, expect } from 'vitest'
import {
  parsePaneList,
  formatCheckResult,
  formatCheckError
} from '../../../main/mcp/hivemind-mcp-server'

describe('hivemind-mcp-server', () => {
  describe('parsePaneList', () => {
    it('parses tmux list-panes output correctly', () => {
      const raw = ['%0|lead|1234|0', '%1|researcher|5678|0', '%2|coder|9012|1'].join('\n')

      const result = parsePaneList(raw, '%0')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: '%1',
        title: 'researcher',
        pid: '5678',
        status: 'running'
      })
      expect(result[1]).toEqual({
        id: '%2',
        title: 'coder',
        pid: '9012',
        status: 'exited'
      })
    })

    it('excludes lead pane', () => {
      const raw = '%0|lead|1234|0\n%1|teammate|5678|0'
      const result = parsePaneList(raw, '%0')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('%1')
    })

    it('handles empty pane list', () => {
      expect(parsePaneList('', '%0')).toEqual([])
      expect(parsePaneList('  \n  ', '%0')).toEqual([])
    })

    it('uses "teammate" as default title when title is empty', () => {
      const raw = '%1||5678|0'
      const result = parsePaneList(raw, '%0')
      expect(result[0].title).toBe('teammate')
    })

    it('returns empty when all panes are the lead pane', () => {
      const raw = '%0|lead|1234|0'
      const result = parsePaneList(raw, '%0')
      expect(result).toEqual([])
    })
  })

  describe('formatCheckResult', () => {
    it('returns formatted JSON with pane info', () => {
      const result = formatCheckResult('%1', 'line 1\nline 2', 'running')
      const data = JSON.parse(result.content[0].text)

      expect(data.pane_id).toBe('%1')
      expect(data.status).toBe('running')
      expect(data.recent_output).toBe('line 1\nline 2')
    })

    it('returns exited status', () => {
      const result = formatCheckResult('%2', 'done', 'exited')
      const data = JSON.parse(result.content[0].text)

      expect(data.status).toBe('exited')
      expect(data.recent_output).toBe('done')
    })

    it('handles empty output', () => {
      const result = formatCheckResult('%1', '', 'running')
      const data = JSON.parse(result.content[0].text)

      expect(data.recent_output).toBe('')
      expect(data.status).toBe('running')
    })
  })

  describe('formatCheckError', () => {
    it('returns error response with pane ID', () => {
      const result = formatCheckError('%99')

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe('Pane %99 not found or inaccessible.')
    })
  })
})
