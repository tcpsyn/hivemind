import type { PtyManager } from '../pty/PtyManager'
import type { FileService } from './FileService'
import type { GitService } from './GitService'
import type { TeamConfigService } from './TeamConfigService'
import type { IpcServices } from '../ipc/handlers'
import { TeamSession } from '../tmux/TeamSession'

export interface ServiceDeps {
  ptyManager: PtyManager
  fileService: FileService
  gitService: GitService
  teamConfigService: TeamConfigService
}

export function createIpcServices(deps: ServiceDeps): IpcServices {
  const { ptyManager, fileService, gitService, teamConfigService } = deps
  let activeSession: TeamSession | null = null

  return {
    onAgentCreate: async (req) => {
      const agent = await ptyManager.createPty(req.config, req.cwd)
      return { agentId: agent.id, agent }
    },

    onAgentInput: async (req) => {
      ptyManager.sendInput(req.agentId, req.data)
    },

    onAgentStop: async (req) => {
      ptyManager.destroyPty(req.agentId)
    },

    onAgentRestart: async (req) => {
      const agents = ptyManager.getAll()
      const existing = agents.get(req.agentId)
      if (!existing) throw new Error(`Agent ${req.agentId} not found`)

      const name = existing.name
      const role = existing.role
      const avatar = existing.avatar
      const color = existing.color

      ptyManager.destroyPty(req.agentId)

      await ptyManager.createPty(
        { name, role, command: `claude --role ${role}`, avatar, color },
        process.cwd()
      )
    },

    onAgentResize: async (req) => {
      ptyManager.resize(req.agentId, req.cols, req.rows)
    },

    onFileRead: async (req) => {
      const content = await fileService.readFile(req.filePath)
      return { content, filePath: req.filePath }
    },

    onFileWrite: async (req) => {
      await fileService.writeFile(req.filePath, req.content)
    },

    onFileTreeRequest: async (req) => {
      return fileService.getFileTree(req.rootPath)
    },

    onGitDiff: async (req) => {
      const diff = await gitService.getDiff(req.filePath)
      return { diff, filePath: req.filePath }
    },

    onGitStatus: async (_req) => {
      return gitService.getStatus()
    },

    onTeamStart: async (req) => {
      const config = teamConfigService.enrichConfig(req.config)

      if (activeSession) {
        await activeSession.stop()
      }

      activeSession = new TeamSession(config.name, config.project, ptyManager)
      const leadCommand = config.agents?.[0]?.command || 'claude'
      const leadAgent = await activeSession.start(leadCommand)

      return { agents: [leadAgent] }
    },

    onTeamStop: async () => {
      if (activeSession) {
        await activeSession.stop()
        activeSession = null
      }
    },

    getActiveSession: () => activeSession
  }
}
