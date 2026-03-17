const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.html': 'html',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.toml': 'toml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte'
}

export function detectLanguage(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  if (dot === -1) return 'plaintext'
  const ext = filePath.slice(dot).toLowerCase()
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext'
}
