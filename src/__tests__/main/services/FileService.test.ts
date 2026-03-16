import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { FileService } from '../../../main/services/FileService'
import type { FileTreeNode } from '../../../shared/types'

describe('FileService', () => {
  let service: FileService
  let tmpDir: string

  beforeEach(async () => {
    service = new FileService()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileservice-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readFile', () => {
    it('reads file contents as string', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      await fs.writeFile(filePath, 'hello world')
      const content = await service.readFile(filePath)
      expect(content).toBe('hello world')
    })

    it('reads utf-8 content correctly', async () => {
      const filePath = path.join(tmpDir, 'unicode.txt')
      await fs.writeFile(filePath, '日本語テスト 🚀')
      const content = await service.readFile(filePath)
      expect(content).toBe('日本語テスト 🚀')
    })

    it('throws on file not found', async () => {
      await expect(service.readFile(path.join(tmpDir, 'nope.txt'))).rejects.toThrow()
    })

    it('throws on directory path', async () => {
      await expect(service.readFile(tmpDir)).rejects.toThrow()
    })
  })

  describe('writeFile', () => {
    it('writes content to a new file', async () => {
      const filePath = path.join(tmpDir, 'output.txt')
      await service.writeFile(filePath, 'written content')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('written content')
    })

    it('overwrites existing file', async () => {
      const filePath = path.join(tmpDir, 'overwrite.txt')
      await fs.writeFile(filePath, 'old')
      await service.writeFile(filePath, 'new')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('new')
    })

    it('creates intermediate directories', async () => {
      const filePath = path.join(tmpDir, 'sub', 'deep', 'file.txt')
      await service.writeFile(filePath, 'nested')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('nested')
    })
  })

  describe('getFileTree', () => {
    it('returns empty array for empty directory', async () => {
      const tree = await service.getFileTree(tmpDir)
      expect(tree).toEqual([])
    })

    it('lists files in a flat directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), '')
      await fs.writeFile(path.join(tmpDir, 'b.ts'), '')
      const tree = await service.getFileTree(tmpDir)
      expect(tree).toHaveLength(2)
      expect(tree.map((n: FileTreeNode) => n.name).sort()).toEqual(['a.txt', 'b.ts'])
      expect(tree.every((n: FileTreeNode) => n.type === 'file')).toBe(true)
    })

    it('builds nested tree for subdirectories', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'))
      await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), '')
      await fs.writeFile(path.join(tmpDir, 'README.md'), '')

      const tree = await service.getFileTree(tmpDir)
      const srcNode = tree.find((n: FileTreeNode) => n.name === 'src')
      expect(srcNode).toBeDefined()
      expect(srcNode!.type).toBe('directory')
      expect(srcNode!.children).toHaveLength(1)
      expect(srcNode!.children![0].name).toBe('index.ts')
    })

    it('sorts directories before files', async () => {
      await fs.writeFile(path.join(tmpDir, 'z-file.txt'), '')
      await fs.mkdir(path.join(tmpDir, 'a-dir'))
      const tree = await service.getFileTree(tmpDir)
      expect(tree[0].name).toBe('a-dir')
      expect(tree[1].name).toBe('z-file.txt')
    })

    it('excludes node_modules, .git, dist, out by default', async () => {
      await fs.mkdir(path.join(tmpDir, 'node_modules'))
      await fs.mkdir(path.join(tmpDir, '.git'))
      await fs.mkdir(path.join(tmpDir, 'dist'))
      await fs.mkdir(path.join(tmpDir, 'out'))
      await fs.writeFile(path.join(tmpDir, 'index.ts'), '')

      const tree = await service.getFileTree(tmpDir)
      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('index.ts')
    })

    it('sets correct path on nodes', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'))
      await fs.writeFile(path.join(tmpDir, 'src', 'app.ts'), '')

      const tree = await service.getFileTree(tmpDir)
      const srcNode = tree.find((n: FileTreeNode) => n.name === 'src')!
      expect(srcNode.path).toBe(path.join(tmpDir, 'src'))
      expect(srcNode.children![0].path).toBe(path.join(tmpDir, 'src', 'app.ts'))
    })
  })

  describe('detectLanguage', () => {
    it('detects TypeScript', () => {
      expect(service.detectLanguage('file.ts')).toBe('typescript')
      expect(service.detectLanguage('file.tsx')).toBe('typescript')
    })

    it('detects JavaScript', () => {
      expect(service.detectLanguage('file.js')).toBe('javascript')
      expect(service.detectLanguage('file.jsx')).toBe('javascript')
    })

    it('detects common languages', () => {
      expect(service.detectLanguage('file.css')).toBe('css')
      expect(service.detectLanguage('file.html')).toBe('html')
      expect(service.detectLanguage('file.json')).toBe('json')
      expect(service.detectLanguage('file.md')).toBe('markdown')
      expect(service.detectLanguage('file.py')).toBe('python')
      expect(service.detectLanguage('file.yml')).toBe('yaml')
      expect(service.detectLanguage('file.yaml')).toBe('yaml')
    })

    it('returns plaintext for unknown extensions', () => {
      expect(service.detectLanguage('file.xyz')).toBe('plaintext')
      expect(service.detectLanguage('noext')).toBe('plaintext')
    })
  })
})
