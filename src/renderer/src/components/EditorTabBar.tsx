import { useAppState, useAppDispatch, useActiveTab } from '../state/AppContext'
import './EditorTabBar.css'

export default function EditorTabBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const activeProjectTab = useActiveTab()
  const { openFiles, activeFileId } = activeProjectTab.editor

  return (
    <div className="editor-tab-bar" data-testid="editor-tab-bar">
      {openFiles.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab${tab.id === activeFileId ? ' active' : ''}`}
          data-testid={`editor-tab-${tab.id}`}
          onClick={() =>
            dispatch({ type: 'SET_ACTIVE_EDITOR_TAB', payload: tab.id, tabId: state.activeTabId })
          }
        >
          <span className="editor-tab-name">{tab.fileName}</span>
          {tab.isModified && (
            <span className="modified-indicator" data-testid={`modified-indicator-${tab.id}`} />
          )}
          <button
            className="editor-tab-close"
            data-testid={`close-tab-${tab.id}`}
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'CLOSE_EDITOR_TAB', payload: tab.id, tabId: state.activeTabId })
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
