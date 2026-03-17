import { describe, it, expect } from 'vitest'
import AgentListItem from '../../../renderer/src/components/AgentListItem'
import FileTreeItem from '../../../renderer/src/components/FileTreeItem'

describe('React.memo wrappers', () => {
  it('AgentListItem is memoized', () => {
    // React.memo wraps the component, giving it a $$typeof symbol and a compare property
    expect(AgentListItem).toHaveProperty('$$typeof')
    expect(String(AgentListItem.$$typeof)).toContain('Symbol')
  })

  it('FileTreeItem is memoized', () => {
    expect(FileTreeItem).toHaveProperty('$$typeof')
    expect(String(FileTreeItem.$$typeof)).toContain('Symbol')
  })
})
