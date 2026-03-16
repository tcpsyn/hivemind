import { describe, it, expect } from 'vitest'
import { agentConfigSchema, teamConfigSchema } from '../../shared/validators'

describe('agentConfigSchema', () => {
  it('validates a valid agent config', () => {
    const result = agentConfigSchema.safeParse({
      name: 'architect',
      role: 'Lead architect',
      command: 'claude --team my-team --role architect'
    })
    expect(result.success).toBe(true)
  })

  it('validates with optional avatar and color', () => {
    const result = agentConfigSchema.safeParse({
      name: 'frontend',
      role: 'React developer',
      command: 'claude --role frontend',
      avatar: 'robot-1',
      color: '#4ECDC4'
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = agentConfigSchema.safeParse({
      name: '',
      role: 'Some role',
      command: 'claude'
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty role', () => {
    const result = agentConfigSchema.safeParse({
      name: 'agent',
      role: '',
      command: 'claude'
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty command', () => {
    const result = agentConfigSchema.safeParse({
      name: 'agent',
      role: 'role',
      command: ''
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color', () => {
    const result = agentConfigSchema.safeParse({
      name: 'agent',
      role: 'role',
      command: 'claude',
      color: 'red'
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    const result = agentConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('teamConfigSchema', () => {
  const validTeam = {
    name: 'my-feature-team',
    project: '/path/to/project',
    agents: [
      {
        name: 'architect',
        role: 'Lead architect',
        command: 'claude --role architect'
      },
      {
        name: 'frontend',
        role: 'React developer',
        command: 'claude --role frontend'
      }
    ]
  }

  it('validates a valid team config', () => {
    const result = teamConfigSchema.safeParse(validTeam)
    expect(result.success).toBe(true)
  })

  it('rejects empty team name', () => {
    const result = teamConfigSchema.safeParse({ ...validTeam, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty project path', () => {
    const result = teamConfigSchema.safeParse({ ...validTeam, project: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty agents array', () => {
    const result = teamConfigSchema.safeParse({ ...validTeam, agents: [] })
    expect(result.success).toBe(false)
  })

  it('rejects if any agent is invalid', () => {
    const result = teamConfigSchema.safeParse({
      ...validTeam,
      agents: [
        { name: 'valid', role: 'role', command: 'cmd' },
        { name: '', role: 'role', command: 'cmd' }
      ]
    })
    expect(result.success).toBe(false)
  })

  it('validates team with optional agent fields', () => {
    const result = teamConfigSchema.safeParse({
      name: 'team',
      project: '/project',
      agents: [
        {
          name: 'agent',
          role: 'role',
          command: 'cmd',
          avatar: 'robot-1',
          color: '#FF6B6B'
        }
      ]
    })
    expect(result.success).toBe(true)
  })
})
