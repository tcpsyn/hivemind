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

describe('useEditor', () => {
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

  it('starts with empty content and not modified', () => {
    const { result } = renderHook(() => useEditor('/path/to/file.ts'))
    expect(result.current.content).toBe('')
    expect(result.current.isModified).toBe(false)
  })

  it('starts in read-only mode', () => {
    const { result } = renderHook(() => useEditor('/path/to/file.ts'))
    expect(result.current.isReadOnly).toBe(true)
  })

  it('loads file content on mount', async () => {
    mockFileRead.mockResolvedValue({ content: 'file content here', filePath: '/path/to/file.ts' })

    const { result } = renderHook(() => useEditor('/path/to/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('file content here')
    })
    expect(mockFileRead).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/path/to/file.ts' })
    )
  })

  it('reloads content when filePath changes', async () => {
    mockFileRead
      .mockResolvedValueOnce({ content: 'first file', filePath: '/a.ts' })
      .mockResolvedValueOnce({ content: 'second file', filePath: '/b.ts' })

    const { result, rerender } = renderHook(({ path }) => useEditor(path), {
      initialProps: { path: '/a.ts' }
    })

    await vi.waitFor(() => {
      expect(result.current.content).toBe('first file')
    })

    rerender({ path: '/b.ts' })

    await vi.waitFor(() => {
      expect(result.current.content).toBe('second file')
    })
  })

  it('toggleReadOnly flips the read-only state', () => {
    const { result } = renderHook(() => useEditor('/path/to/file.ts'))
    expect(result.current.isReadOnly).toBe(true)

    act(() => {
      result.current.toggleReadOnly()
    })
    expect(result.current.isReadOnly).toBe(false)

    act(() => {
      result.current.toggleReadOnly()
    })
    expect(result.current.isReadOnly).toBe(true)
  })

  it('setContent marks the file as modified', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    act(() => {
      result.current.setContent('modified content')
    })

    expect(result.current.content).toBe('modified content')
    expect(result.current.isModified).toBe(true)
  })

  it('debounces save by 500ms after content change', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    // Enable editing
    act(() => {
      result.current.toggleReadOnly()
    })

    act(() => {
      result.current.setContent('changed')
    })

    // Not saved yet
    expect(mockFileWrite).not.toHaveBeenCalled()

    // Advance 300ms — still not saved
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(mockFileWrite).not.toHaveBeenCalled()

    // Advance remaining 200ms — now saved
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(mockFileWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/file.ts',
        content: 'changed'
      })
    )
  })

  it('resets debounce timer on rapid changes', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    act(() => {
      result.current.toggleReadOnly()
    })

    act(() => {
      result.current.setContent('change 1')
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    act(() => {
      result.current.setContent('change 2')
    })

    // 300ms from last change — not saved yet
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(mockFileWrite).not.toHaveBeenCalled()

    // 500ms from last change — saved
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(mockFileWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/file.ts',
        content: 'change 2'
      })
    )
  })

  it('does not auto-save in read-only mode', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    // Stay in read-only mode, set content directly
    act(() => {
      result.current.setContent('changed')
    })

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mockFileWrite).not.toHaveBeenCalled()
  })

  it('clears modified state after successful save', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    act(() => {
      result.current.toggleReadOnly()
    })

    act(() => {
      result.current.setContent('changed')
    })

    expect(result.current.isModified).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.isModified).toBe(false)
  })

  it('save() triggers immediate save', async () => {
    mockFileRead.mockResolvedValue({ content: 'original', filePath: '/file.ts' })
    mockFileWrite.mockResolvedValue(undefined)

    const { result } = renderHook(() => useEditor('/file.ts'))

    await vi.waitFor(() => {
      expect(result.current.content).toBe('original')
    })

    act(() => {
      result.current.toggleReadOnly()
    })

    act(() => {
      result.current.setContent('changed')
    })

    await act(async () => {
      await result.current.save()
    })

    expect(mockFileWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/file.ts',
        content: 'changed'
      })
    )
    expect(result.current.isModified).toBe(false)
  })

  it('does not load content when filePath is null', () => {
    renderHook(() => useEditor(null))
    expect(mockFileRead).not.toHaveBeenCalled()
  })
})
