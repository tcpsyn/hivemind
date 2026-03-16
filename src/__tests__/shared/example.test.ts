import { describe, it, expect } from 'vitest'

describe('Shared utilities test environment', () => {
  it('can run basic assertions', () => {
    expect(1 + 1).toBe(2)
  })

  it('can use modern JavaScript features', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2]
    ])
    expect(map.size).toBe(2)
    expect(map.get('a')).toBe(1)
  })

  it('can handle async operations', async () => {
    const result = await Promise.resolve('async works')
    expect(result).toBe('async works')
  })
})
