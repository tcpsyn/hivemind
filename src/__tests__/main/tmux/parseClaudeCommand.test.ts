import { describe, it, expect } from 'vitest'
import { parseClaudeCommand } from '../../../main/tmux/parseClaudeCommand'

describe('parseClaudeCommand', () => {
  it('parses full command with all flags', () => {
    const result = parseClaudeCommand(
      'claude --agent-id researcher@team --agent-name researcher --agent-color blue --agent-type Explore --team-name myteam --permission-mode acceptEdits --model haiku --parent-session-id sess-123'
    )
    expect(result).toEqual({
      agentId: 'researcher@team',
      agentName: 'researcher',
      agentColor: 'blue',
      agentType: 'Explore',
      teamName: 'myteam',
      permissionMode: 'acceptEdits',
      model: 'haiku',
      parentSessionId: 'sess-123'
    })
  })

  it('parses partial command with only some flags', () => {
    const result = parseClaudeCommand('claude --agent-name worker --team-name project1')
    expect(result).toEqual({
      agentName: 'worker',
      teamName: 'project1'
    })
  })

  it('returns empty object for command without claude flags', () => {
    const result = parseClaudeCommand('ls -la /tmp')
    expect(result).toEqual({})
  })

  it('returns empty object for bare claude command', () => {
    const result = parseClaudeCommand('claude')
    expect(result).toEqual({})
  })

  it('handles quoted values', () => {
    const result = parseClaudeCommand(
      'claude --agent-name "my researcher" --agent-color "#FF0000"'
    )
    expect(result).toEqual({
      agentName: 'my researcher',
      agentColor: '#FF0000'
    })
  })

  it('handles single-quoted values', () => {
    const result = parseClaudeCommand("claude --agent-name 'code reviewer' --agent-type Explore")
    expect(result).toEqual({
      agentName: 'code reviewer',
      agentType: 'Explore'
    })
  })

  it('handles command with extra arguments after flags', () => {
    const result = parseClaudeCommand(
      'claude --agent-id test@team --agent-name test --prompt "do something"'
    )
    expect(result.agentId).toBe('test@team')
    expect(result.agentName).toBe('test')
  })

  it('ignores unknown flags', () => {
    const result = parseClaudeCommand('claude --unknown-flag value --agent-name worker')
    expect(result).toEqual({
      agentName: 'worker'
    })
  })
})
