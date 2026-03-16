import * as fs from 'fs/promises'
import * as path from 'path'
import type { FileTreeNode } from '../../shared/types'

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out'])

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

export class FileService {
  async readFile(filePath: string): Promise<string> {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${filePath}`)
    }
    return fs.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async getFileTree(rootPath: string): Promise<FileTreeNode[]> {
    return this.buildTree(rootPath)
  }

  detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext'
  }

  private async buildTree(dirPath: string): Promise<FileTreeNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const nodes: FileTreeNode[] = []

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const children = await this.buildTree(fullPath)
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children
        })
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file'
        })
      }
    }

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }
}
