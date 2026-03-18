import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitService } from '../../../main/services/GitService'
// Mock simple-git
const mockGit = {
  status: vi.fn(),
  diff: vi.fn(),
  branch: vi.fn()
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGit)
}))

describe('GitService', () => {
  let service: GitService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitService('/tmp/test-repo')
  })

  describe('getStatus', () => {
    it('returns parsed git status with file statuses', async () => {
      mockGit.status.mockResolvedValue({
        modified: ['src/index.ts'],
        not_added: ['new-file.txt'],
        deleted: ['old.ts'],
        created: ['added.ts'],
        renamed: [{ from: 'old-name.ts', to: 'new-name.ts' }],
        current: 'main',
        ahead: 2,
        behind: 1,
        files: [
          { path: 'src/index.ts', index: 'M', working_dir: 'M' },
          { path: 'new-file.txt', index: '?', working_dir: '?' },
          { path: 'old.ts', index: 'D', working_dir: ' ' },
          { path: 'added.ts', index: 'A', working_dir: ' ' },
          { path: 'new-name.ts', index: 'R', working_dir: ' ' }
        ]
      })

      const status = await service.getStatus()
      expect(status.branch).toBe('main')
      expect(status.ahead).toBe(2)
      expect(status.behind).toBe(1)
      expect(status.files).toEqual(
        expect.arrayContaining([
          { path: 'src/index.ts', status: 'modified' },
          { path: 'new-file.txt', status: 'untracked' },
          { path: 'old.ts', status: 'deleted' },
          { path: 'added.ts', status: 'added' },
          { path: 'new-name.ts', status: 'renamed' }
        ])
      )
    })

    it('returns empty files array when repo is clean', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        deleted: [],
        created: [],
        renamed: [],
        current: 'main',
        ahead: 0,
        behind: 0,
        files: []
      })

      const status = await service.getStatus()
      expect(status.files).toEqual([])
      expect(status.branch).toBe('main')
    })

    it('handles detached HEAD', async () => {
      mockGit.status.mockResolvedValue({
        modified: [],
        not_added: [],
        deleted: [],
        created: [],
        renamed: [],
        current: null,
        ahead: 0,
        behind: 0,
        files: []
      })

      const status = await service.getStatus()
      expect(status.branch).toBe('')
    })
  })

  describe('getDiff', () => {
    it('returns diff string for a file', async () => {
      const diffOutput = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo'
+import { bar } from './bar'

 foo()`
      mockGit.diff.mockResolvedValue(diffOutput)

      const diff = await service.getDiff('src/index.ts')
      expect(diff).toBe(diffOutput)
      expect(mockGit.diff).toHaveBeenCalledWith(['--', 'src/index.ts'])
    })

    it('returns empty string when no diff', async () => {
      mockGit.diff.mockResolvedValue('')
      const diff = await service.getDiff('clean-file.ts')
      expect(diff).toBe('')
    })

    it('supports staged diff', async () => {
      mockGit.diff.mockResolvedValue('staged diff output')
      await service.getDiff('file.ts', true)
      expect(mockGit.diff).toHaveBeenCalledWith(['--cached', '--', 'file.ts'])
    })
  })

  describe('error handling', () => {
    it('throws when git command fails', async () => {
      mockGit.status.mockRejectedValue(new Error('not a git repository'))
      await expect(service.getStatus()).rejects.toThrow('not a git repository')
    })

    it('throws when diff fails', async () => {
      mockGit.diff.mockRejectedValue(new Error('fatal: bad revision'))
      await expect(service.getDiff('bad-file.ts')).rejects.toThrow('fatal: bad revision')
    })
  })
})
