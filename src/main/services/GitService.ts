import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'
import type { GitFileStatus, GitStatus } from '../../shared/types'

export class GitService {
  private git: SimpleGit

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status()

    const files = status.files.map((file) => ({
      path: file.path,
      status: this.mapIndexToStatus(file.index, file.working_dir)
    }))

    return {
      branch: status.current ?? '',
      ahead: status.ahead,
      behind: status.behind,
      files
    }
  }

  async getDiff(filePath: string, staged = false): Promise<string> {
    const args = staged ? ['--cached', '--', filePath] : ['--', filePath]
    return this.git.diff(args)
  }

  async getFileStatus(filePath: string): Promise<GitFileStatus> {
    const status = await this.git.status()
    const file = status.files.find((f) => f.path === filePath)
    if (!file) return null
    return this.mapIndexToStatus(file.index, file.working_dir)
  }

  private mapIndexToStatus(index: string, workingDir: string): GitFileStatus {
    if (index === '?' || workingDir === '?') return 'untracked'
    if (index === 'A') return 'added'
    if (index === 'D' || workingDir === 'D') return 'deleted'
    if (index === 'R') return 'renamed'
    if (index === 'M' || workingDir === 'M') return 'modified'
    return null
  }
}
