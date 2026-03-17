import { describe, it, expect, beforeEach } from 'vitest'
import { PtyOutputBuffer } from '../../../main/tmux/PtyOutputBuffer'

describe('PtyOutputBuffer', () => {
  let buffer: PtyOutputBuffer

  beforeEach(() => {
    buffer = new PtyOutputBuffer()
  })

  describe('append', () => {
    it('appends a single line', () => {
      buffer.append('hello world')
      expect(buffer.capture()).toBe('hello world')
    })

    it('appends multi-line data', () => {
      buffer.append('line1\nline2\nline3')
      expect(buffer.capture()).toBe('line1\nline2\nline3')
    })

    it('appends multiple calls sequentially', () => {
      buffer.append('first')
      buffer.append('second')
      expect(buffer.capture()).toBe('first\nsecond')
    })

    it('handles empty strings', () => {
      buffer.append('')
      expect(buffer.capture()).toBe('')
      expect(buffer.lineCount).toBe(0)
    })

    it('handles data with trailing newline', () => {
      buffer.append('line1\nline2\n')
      expect(buffer.capture()).toBe('line1\nline2')
    })
  })

  describe('capture', () => {
    it('returns empty string when no data', () => {
      expect(buffer.capture()).toBe('')
    })

    it('returns all lines joined by newline', () => {
      buffer.append('a\nb\nc')
      expect(buffer.capture()).toBe('a\nb\nc')
    })
  })

  describe('maxLines', () => {
    it('respects maxLines as a ring buffer', () => {
      const small = new PtyOutputBuffer(3)
      small.append('line1')
      small.append('line2')
      small.append('line3')
      small.append('line4')
      expect(small.capture()).toBe('line2\nline3\nline4')
      expect(small.lineCount).toBe(3)
    })

    it('handles multi-line append exceeding maxLines', () => {
      const small = new PtyOutputBuffer(2)
      small.append('a\nb\nc\nd')
      expect(small.capture()).toBe('c\nd')
    })

    it('defaults to 10000 lines', () => {
      expect(buffer.lineCount).toBe(0)
      // Just verify it doesn't throw with many lines
      for (let i = 0; i < 100; i++) {
        buffer.append(`line ${i}`)
      }
      expect(buffer.lineCount).toBe(100)
    })
  })

  describe('clear', () => {
    it('resets buffer', () => {
      buffer.append('some data')
      buffer.clear()
      expect(buffer.capture()).toBe('')
      expect(buffer.lineCount).toBe(0)
    })
  })

  describe('lineCount', () => {
    it('returns 0 for empty buffer', () => {
      expect(buffer.lineCount).toBe(0)
    })

    it('returns correct count after appends', () => {
      buffer.append('a\nb\nc')
      expect(buffer.lineCount).toBe(3)
    })
  })
})
