export interface ParsedClaudeAgent {
  agentId?: string
  agentName?: string
  teamName?: string
  agentColor?: string
  agentType?: string
  permissionMode?: string
  model?: string
  parentSessionId?: string
}

const FLAG_MAP: Record<string, keyof ParsedClaudeAgent> = {
  '--agent-id': 'agentId',
  '--agent-name': 'agentName',
  '--team-name': 'teamName',
  '--agent-color': 'agentColor',
  '--agent-type': 'agentType',
  '--permission-mode': 'permissionMode',
  '--model': 'model',
  '--parent-session-id': 'parentSessionId'
}

function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote: string | null = null

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

export function parseClaudeCommand(command: string): ParsedClaudeAgent {
  const tokens = tokenize(command)
  const result: ParsedClaudeAgent = {}

  for (let i = 0; i < tokens.length; i++) {
    const key = FLAG_MAP[tokens[i]]
    if (key && i + 1 < tokens.length) {
      result[key] = tokens[i + 1]
      i++ // skip value
    }
  }

  return result
}
