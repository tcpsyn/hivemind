import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useEditor } from '../hooks/useEditor'
import EditorTabBar from './EditorTabBar'
import MonacoEditor from './MonacoEditor'
import DiffView from './DiffView'
import './EditorView.css'

export default function EditorView() {
  const state = useAppState()
  const { openFiles, activeFileId } = state.editor
  const activeTab = openFiles.find((f) => f.id === activeFileId) ?? null
  const [showDiff, setShowDiff] = useState(false)

  const editor = useEditor(activeTab?.filePath ?? null)

  return (
    <div className="editor-view" data-testid="editor-view">
      {openFiles.length > 0 ? (
        <>
          <div className="editor-view-header">
            <EditorTabBar />
            <div className="editor-view-actions">
              <button
                className="editor-action-btn"
                data-testid="edit-toggle"
                onClick={editor.toggleReadOnly}
              >
                {editor.isReadOnly ? 'Edit' : 'Read Only'}
              </button>
              <button
                className="editor-action-btn"
                data-testid="diff-toggle"
                onClick={() => setShowDiff((prev) => !prev)}
              >
                {showDiff ? 'Editor' : 'Diff'}
              </button>
            </div>
          </div>
          <div className="editor-view-content">
            {activeTab &&
              (showDiff ? (
                <DiffView filePath={activeTab.filePath} language={activeTab.language} />
              ) : (
                <MonacoEditor
                  filePath={activeTab.filePath}
                  language={activeTab.language}
                  isReadOnly={editor.isReadOnly}
                  onContentChange={editor.setContent}
                />
              ))}
          </div>
        </>
      ) : (
        <div className="editor-empty-state" data-testid="editor-empty-state">
          <span className="editor-empty-text">Open a file from the sidebar to start editing</span>
        </div>
      )}
    </div>
  )
}
