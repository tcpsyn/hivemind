import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { PaneInfo } from '../../../main/mcp/hivemind-mcp-server'
import {
  parsePaneList,
  formatCheckResult,
  formatCheckError,
  getUpdatesFilePath,
  reportComplete,
  getUpdates
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

  describe('getUpdatesFilePath', () => {
    it('uses session name in path', () => {
      const path = getUpdatesFilePath('my-session')
      expect(path).toBe('/tmp/hivemind-my-session-updates.jsonl')
    })

    it('defaults to "default" when no session', () => {
      const path = getUpdatesFilePath()
      expect(path).toBe('/tmp/hivemind-default-updates.jsonl')
    })

    it('sanitizes special characters in session name', () => {
      const path = getUpdatesFilePath('session/with spaces&stuff')
      expect(path).toBe('/tmp/hivemind-session_with_spaces_stuff-updates.jsonl')
    })
  })

  describe('reportComplete', () => {
    let tempDir: string
    let filePath: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'hivemind-mcp-test-'))
      filePath = join(tempDir, 'updates.jsonl')
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('appends JSONL entry to file', async () => {
      const result = reportComplete(filePath, '%1', 'Fixed the bug')

      expect(result.content[0].text).toContain('Completion reported')

      const raw = await readFile(filePath, 'utf-8')
      const entry = JSON.parse(raw.trim())
      expect(entry.pane_id).toBe('%1')
      expect(entry.summary).toBe('Fixed the bug')
      expect(entry.timestamp).toBeDefined()
    })

    it('appends multiple entries', async () => {
      reportComplete(filePath, '%1', 'Task A done')
      reportComplete(filePath, '%2', 'Task B done')

      const raw = await readFile(filePath, 'utf-8')
      const lines = raw.trim().split('\n')
      expect(lines).toHaveLength(2)

      const first = JSON.parse(lines[0])
      const second = JSON.parse(lines[1])
      expect(first.pane_id).toBe('%1')
      expect(second.pane_id).toBe('%2')
    })
  })

  describe('getUpdates', () => {
    let tempDir: string
    let filePath: string

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'hivemind-mcp-test-'))
      filePath = join(tempDir, 'updates.jsonl')
    })

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true })
    })

    it('returns "No pending updates" when file does not exist', () => {
      const result = getUpdates(join(tempDir, 'nonexistent.jsonl'))
      expect(result.content[0].text).toBe('No pending updates.')
    })

    it('returns "No pending updates" when file is empty', () => {
      writeFileSync(filePath, '')
      const result = getUpdates(filePath)
      expect(result.content[0].text).toBe('No pending updates.')
    })

    it('returns parsed updates and truncates file', async () => {
      const entry1 = JSON.stringify({
        pane_id: '%1',
        summary: 'Done A',
        timestamp: '2026-01-01T00:00:00Z'
      })
      const entry2 = JSON.stringify({
        pane_id: '%2',
        summary: 'Done B',
        timestamp: '2026-01-01T00:01:00Z'
      })
      writeFileSync(filePath, entry1 + '\n' + entry2 + '\n')

      const result = getUpdates(filePath)
      const updates = JSON.parse(result.content[0].text)

      expect(updates).toHaveLength(2)
      expect(updates[0].pane_id).toBe('%1')
      expect(updates[0].summary).toBe('Done A')
      expect(updates[1].pane_id).toBe('%2')

      // File should be truncated
      const remaining = await readFile(filePath, 'utf-8')
      expect(remaining).toBe('')
    })

    it('skips malformed JSONL lines', () => {
      writeFileSync(
        filePath,
        '{"pane_id":"%1","summary":"ok"}\nnot json\n{"pane_id":"%2","summary":"also ok"}\n'
      )

      const result = getUpdates(filePath)
      const updates = JSON.parse(result.content[0].text)

      expect(updates).toHaveLength(2)
      expect(updates[0].pane_id).toBe('%1')
      expect(updates[1].pane_id).toBe('%2')
    })

    it('works with reportComplete end-to-end', async () => {
      reportComplete(filePath, '%3', 'Implemented feature X')
      reportComplete(filePath, '%4', 'Fixed test failures')

      const result = getUpdates(filePath)
      const updates = JSON.parse(result.content[0].text)

      expect(updates).toHaveLength(2)
      expect(updates[0].summary).toBe('Implemented feature X')
      expect(updates[1].summary).toBe('Fixed test failures')

      // Second call should return empty
      const result2 = getUpdates(filePath)
      expect(result2.content[0].text).toBe('No pending updates.')
    })
  })
})
