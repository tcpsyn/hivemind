import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import './DiffView.css'

interface DiffViewProps {
  filePath: string
  language: string
}

export default function DiffView({ filePath, language }: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const [sideBySide, setSideBySide] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    monaco.editor.setTheme('vs-dark')

    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      renderSideBySide: sideBySide,
      automaticLayout: true,
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: 'var(--font-mono)'
    })

    editorRef.current = diffEditor

    Promise.all([
      window.api.gitDiff({ filePath }),
      window.api.fileRead({ filePath })
    ]).then(([diffRes, fileRes]) => {
      if (!editorRef.current) return

      const originalModel = monaco.editor.createModel(
        diffRes.original ?? '',
        language
      )
      const modifiedModel = monaco.editor.createModel(fileRes.content, language)

      editorRef.current.setModel({ original: originalModel, modified: modifiedModel })
    })

    return () => {
      diffEditor.dispose()
    }
  }, [filePath, language, sideBySide])

  const handleToggle = () => {
    if (editorRef.current) {
      editorRef.current.dispose()
      editorRef.current = null
    }
    setSideBySide((prev) => !prev)
  }

  return (
    <div className="diff-view" data-testid="diff-view-container">
      <div className="diff-view-toolbar">
        <button
          className="diff-toggle-btn"
          data-testid="diff-toggle-mode"
          onClick={handleToggle}
        >
          {sideBySide ? 'Inline' : 'Side by Side'}
        </button>
      </div>
      <div className="diff-view-editor" ref={containerRef} />
    </div>
  )
}
