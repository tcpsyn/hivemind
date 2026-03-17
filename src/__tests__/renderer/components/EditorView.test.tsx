import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AppProvider,
  initialAppState
} from '../../../renderer/src/state/AppContext'
import EditorView from '../../../renderer/src/components/EditorView'
import type { EditorTab, AppState } from '../../../shared/types'

const { mockMonacoCreate, mockMonacoSetTheme, mockMonacoCreateModel, mockCreateDiffEditor } =
  vi.hoisted(() => ({
    mockMonacoCreate: vi.fn(() => ({
      dispose: vi.fn(),
      setValue: vi.fn(),
      getValue: vi.fn(() => ''),
      updateOptions: vi.fn(),
      onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
      getModel: vi.fn(() => ({ dispose: vi.fn() })),
      layout: vi.fn()
    })),
    mockMonacoSetTheme: vi.fn(),
    mockMonacoCreateModel: vi.fn(() => ({})),
    mockCreateDiffEditor: vi.fn(() => ({
      dispose: vi.fn(),
      layout: vi.fn(),
      setModel: vi.fn()
    }))
  }))

vi.mock('monaco-editor', () => ({
  editor: {
    create: mockMonacoCreate,
    createDiffEditor: mockCreateDiffEditor,
    createModel: mockMonacoCreateModel,
    setTheme: mockMonacoSetTheme
  },
  Uri: {
    file: vi.fn((path: string) => ({ path }))
  }
}))

Object.defineProperty(window, 'api', {
  value: {
    fileRead: vi.fn().mockResolvedValue({ content: '', filePath: '' }),
    fileWrite: vi.fn().mockResolvedValue(undefined),
    gitDiff: vi.fn().mockResolvedValue({ diff: '', filePath: '', original: '' })
  },
  writable: true,
  configurable: true
})

function createTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'tab-1',
    filePath: '/src/index.ts',
    fileName: 'index.ts',
    language: 'typescript',
    isModified: false,
    isReadOnly: true,
    ...overrides
  }
}

function renderEditorView(tabs: EditorTab[] = [], activeFileId: string | null = null) {
  const defaultTab = initialAppState.tabs.get('tab-default')!
  const tabsMap = new Map(initialAppState.tabs)
  tabsMap.set('tab-default', {
    ...defaultTab,
    editor: {
      openFiles: tabs,
      activeFileId: activeFileId ?? (tabs.length > 0 ? tabs[0].id : null)
    }
  })
  const state: AppState = { ...initialAppState, tabs: tabsMap }

  return render(
    <AppProvider initialState={state}>
      <EditorView />
    </AppProvider>
  )
}

describe('EditorView', () => {
  it('renders the editor view container', () => {
    renderEditorView()
    expect(screen.getByTestId('editor-view')).toBeInTheDocument()
  })

  it('shows EditorTabBar when files are open', () => {
    const tabs = [createTab()]
    renderEditorView(tabs)
    expect(screen.getByTestId('editor-tab-bar')).toBeInTheDocument()
  })

  it('shows empty state when no files are open', () => {
    renderEditorView([])
    expect(screen.getByTestId('editor-empty-state')).toBeInTheDocument()
  })

  it('renders Monaco editor for active file', () => {
    const tabs = [createTab()]
    renderEditorView(tabs, 'tab-1')
    expect(screen.getByTestId('monaco-editor-container')).toBeInTheDocument()
  })

  it('shows edit toggle button', () => {
    const tabs = [createTab()]
    renderEditorView(tabs, 'tab-1')
    expect(screen.getByTestId('edit-toggle')).toBeInTheDocument()
  })

  it('edit toggle switches between read-only and editable', async () => {
    const user = userEvent.setup()
    const tabs = [createTab()]
    renderEditorView(tabs, 'tab-1')

    const toggle = screen.getByTestId('edit-toggle')
    expect(toggle).toHaveTextContent('Edit')

    await user.click(toggle)
    expect(toggle).toHaveTextContent('Read Only')
  })

  it('shows diff toggle button', () => {
    const tabs = [createTab()]
    renderEditorView(tabs, 'tab-1')
    expect(screen.getByTestId('diff-toggle')).toBeInTheDocument()
  })
})
