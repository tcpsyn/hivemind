import { useState, useEffect, useRef, useCallback } from 'react'

const SAVE_DEBOUNCE_MS = 500

export function useEditor(filePath: string | null) {
  const [content, setContentState] = useState('')
  const [isModified, setIsModified] = useState(false)
  const [isReadOnly, setIsReadOnly] = useState(true)
  const originalContent = useRef('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPath = useRef(filePath)

  useEffect(() => {
    currentPath.current = filePath
    if (!filePath) return

    setIsModified(false)
    setIsReadOnly(true)

    window.api.fileRead({ filePath }).then((res) => {
      if (currentPath.current === filePath) {
        originalContent.current = res.content
        setContentState(res.content)
      }
    })
  }, [filePath])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  const doSave = useCallback(
    async (contentToSave: string) => {
      if (!filePath) return
      await window.api.fileWrite({ filePath, content: contentToSave })
      originalContent.current = contentToSave
      setIsModified(false)
    },
    [filePath]
  )

  const setContent = useCallback(
    (newContent: string) => {
      setContentState(newContent)
      const modified = newContent !== originalContent.current
      setIsModified(modified)

      if (!isReadOnly && modified) {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current)
        }
        debounceTimer.current = setTimeout(() => {
          doSave(newContent)
        }, SAVE_DEBOUNCE_MS)
      }
    },
    [isReadOnly, doSave]
  )

  const toggleReadOnly = useCallback(() => {
    setIsReadOnly((prev) => !prev)
  }, [])

  const save = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    await doSave(content)
  }, [content, doSave])

  return {
    content,
    isModified,
    isReadOnly,
    setContent,
    toggleReadOnly,
    save
  }
}
