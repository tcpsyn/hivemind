import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditor } from '../../../renderer/src/hooks/useEditor'

const mockFileRead = vi.fn()
const mockFileWrite = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    fileRead: mockFileRead,
    fileWrite: mockFileWrite
  },
  writable: true,
  configurable: true
})

describe('useEditor — filePath change edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFileRead.mockReset()
    mockFileWrite.mockReset()
    mockFileRead.mockResolvedValue({ content: '', filePath: '' })
    mockFileWrite.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels pending save when filePath changes', async () => {
    mockFileRead
      .mockResolvedValueOnce({ content: 'file A', filePath: '/a.ts' })
      .mockResolvedValueOnce({ content: 'file B', filePath: '/b.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(({ path }) => useEditor(path), {
      initialProps: { path: '/a.ts' }
    })

    await vi.waitFor(() => {
      expect(result.current.content).toBe('file A')
    })

    // Enable editing and make a change
    act(() => result.current.toggleReadOnly())
    act(() => result.current.setContent('modified A'))

    // Before debounce fires, switch to different file
    vi.advanceTimersByTime(200)
    rerender({ path: '/b.ts' })

    // Advance past debounce — the save for file A should NOT fire
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(mockFileWrite).not.toHaveBeenCalled()
  })

  it('does not apply stale file read response after filePath changes', async () => {
    // First read is slow, second is fast
    let resolveFirst: ((val: { content: string; filePath: string }) => void) | null = null
    mockFileRead
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ content: 'file B content', filePath: '/b.ts' })

    const { result, rerender } = renderHook(({ path }) => useEditor(path), {
      initialProps: { path: '/a.ts' }
    })

    // Switch to /b.ts before /a.ts finishes loading
    rerender({ path: '/b.ts' })

    await vi.waitFor(() => {
      expect(result.current.content).toBe('file B content')
    })

    // Now resolve the stale /a.ts response — it should be ignored
    resolveFirst!({ content: 'file A content', filePath: '/a.ts' })

    // Content should still be file B
    expect(result.current.content).toBe('file B content')
  })

  it('resets isModified and isReadOnly when filePath changes', async () => {
    mockFileRead
      .mockResolvedValueOnce({ content: 'original', filePath: '/a.ts' })
      .mockResolvedValueOnce({ content: 'other file', filePath: '/b.ts' })

    const { result, rerender } = renderHook(({ path }) => useEditor(path), {
      initialProps: { path: '/a.ts' }
    })

    await vi.waitFor(() => expect(result.current.content).toBe('original'))

    act(() => result.current.toggleReadOnly())
    act(() => result.current.setContent('modified'))
    expect(result.current.isModified).toBe(true)
    expect(result.current.isReadOnly).toBe(false)

    rerender({ path: '/b.ts' })

    await vi.waitFor(() => {
      expect(result.current.content).toBe('other file')
    })
    expect(result.current.isModified).toBe(false)
    expect(result.current.isReadOnly).toBe(true)
  })

  it('handles null filePath without error', () => {
    const { result } = renderHook(() => useEditor(null))
    expect(result.current.content).toBe('')
    expect(result.current.isReadOnly).toBe(true)
    expect(mockFileRead).not.toHaveBeenCalled()
  })

  it('save uses current filePath, not stale one', async () => {
    mockFileRead
      .mockResolvedValueOnce({ content: 'file A', filePath: '/a.ts' })
      .mockResolvedValueOnce({ content: 'file B', filePath: '/b.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(({ path }) => useEditor(path), {
      initialProps: { path: '/a.ts' }
    })

    await vi.waitFor(() => expect(result.current.content).toBe('file A'))

    rerender({ path: '/b.ts' })

    await vi.waitFor(() => expect(result.current.content).toBe('file B'))

    act(() => result.current.toggleReadOnly())
    act(() => result.current.setContent('changed B'))

    await act(async () => {
      await result.current.save()
    })

    expect(mockFileWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/b.ts',
        content: 'changed B'
      })
    )
  })

  it('cleans up debounce timer on unmount', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result, unmount } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => expect(result.current.content).toBe('original'))

    act(() => result.current.toggleReadOnly())
    act(() => result.current.setContent('changed'))

    unmount()

    // Advance past debounce — save should not fire after unmount
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(mockFileWrite).not.toHaveBeenCalled()
  })
})
