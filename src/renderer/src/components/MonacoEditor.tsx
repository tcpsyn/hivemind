import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import './MonacoEditor.css'

interface MonacoEditorProps {
  filePath: string
  language: string
  isReadOnly: boolean
  onContentChange: (content: string) => void
}

export default function MonacoEditor({
  filePath,
  language,
  isReadOnly,
  onContentChange
}: MonacoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    monaco.editor.setTheme('vs-dark')

    const editor = monaco.editor.create(containerRef.current, {
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

    window.api.fileRead({ filePath }).then((res) => {
      if (editorRef.current) {
        editorRef.current.setValue(res.content)
      }
    })

    const disposable = editor.onDidChangeModelContent(() => {
      onContentChange(editor.getValue())
    })

    return () => {
      disposable.dispose()
      editor.dispose()
    }
  }, [filePath, language])

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
