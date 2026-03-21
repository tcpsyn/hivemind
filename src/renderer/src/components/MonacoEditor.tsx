import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import './MonacoEditor.css'

interface MonacoEditorProps {
  filePath: string
  content: string
  language: string
  isReadOnly: boolean
  onContentChange: (content: string) => void
}

export default function MonacoEditor({
  filePath,
  content,
  language,
  isReadOnly,
  onContentChange
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const suppressChangeRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return

    monaco.editor.setTheme('vs-dark')

    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language,
      readOnly: isReadOnly,
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      fontFamily: 'var(--font-mono)',
      scrollBeyondLastLine: false,
      lineNumbers: 'on',
      renderLineHighlight: 'line',
      padding: { top: 8, bottom: 8 }
    })

    editorRef.current = editor

    const disposable = editor.onDidChangeModelContent(() => {
      if (!suppressChangeRef.current) {
        onContentChangeRef.current(editor.getValue())
      }
    })

    return () => {
      disposable.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [filePath, language])

  // Sync content from parent (e.g., file reload) without destroying the editor
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== content) {
      suppressChangeRef.current = true
      editorRef.current.setValue(content)
      suppressChangeRef.current = false
    }
  }, [content])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly: isReadOnly })
    }
  }, [isReadOnly])

  return (
    <div
      className="monaco-editor-wrapper"
      data-testid="monaco-editor-container"
      ref={containerRef}
    />
  )
}
