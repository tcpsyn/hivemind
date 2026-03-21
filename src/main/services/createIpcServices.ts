import { PtyManager } from '../pty/PtyManager'
import { FileService } from './FileService'
import { GitService } from './GitService'
import { TeamSession } from '../tmux/TeamSession'
import type { TeamConfigService } from './TeamConfigService'
import type { IpcServices } from '../ipc/handlers'
import * as path from 'path'

function assertPathWithinRoot(filePath: string, rootPath: string): void {
  const resolved = path.resolve(rootPath, filePath)
  const normalizedRoot = path.resolve(rootPath) + path.sep
  if (resolved !== path.resolve(rootPath) && !resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path traversal denied: ${filePath} is outside project root`)
  }
}

export interface TabContext {
  session: TeamSession | null
  ptyManager: PtyManager
  fileService: FileService
  gitService: GitService
  projectPath: string
  projectName: string
}

export interface TabServices {
  ptyManager: PtyManager
  fileService: FileService
  gitService: GitService
}

export interface ServiceDeps {
  teamConfigService: TeamConfigService
  onTabCreated?: (tabId: string, context: TabContext) => void
  onTabClosing?: (tabId: string) => void
  onSessionCreated?: (tabId: string, session: TeamSession) => void
  createTabServices?: (projectPath: string) => TabServices
}

let tabIdCounter = 0

export function createIpcServices(deps: ServiceDeps): IpcServices {
  const { teamConfigService } = deps
  const tabs = new Map<string, TabContext>()

  function getTab(tabId: string): TabContext {
    const tab = tabs.get(tabId)
    if (!tab) throw new Error(`No tab context found for tabId: ${tabId}`)
    return tab
  }

  function tryGetTab(tabId: string): TabContext | null {
    return tabs.get(tabId) ?? null
  }

  return {
    onTabCreate: async (req) => {
      const tabId = `tab-${++tabIdCounter}-${Date.now()}`
      const projectName = path.basename(req.projectPath) || 'project'

      const { ptyManager, fileService, gitService } = deps.createTabServices
        ? deps.createTabServices(req.projectPath)
        : {
            ptyManager: new PtyManager(),
            fileService: new FileService(),
            gitService: new GitService(req.projectPath)
          }

      const context: TabContext = {
        session: null,
        ptyManager,
        fileService,
        gitService,
        projectPath: req.projectPath,
        projectName
      }

      tabs.set(tabId, context)
      deps.onTabCreated?.(tabId, context)

      return { tabId, projectPath: req.projectPath, projectName }
    },

    onTabClose: async (req) => {
      const tab = tabs.get(req.tabId)
      if (!tab) return

      deps.onTabClosing?.(req.tabId)

      if (tab.session) {
        await tab.session.stop()
      }
      tab.ptyManager.removeAllListeners()
      tab.ptyManager.destroyAll()
      tabs.delete(req.tabId)
    },

    onAgentInput: async (req) => {
      getTab(req.tabId).ptyManager.sendInput(req.agentId, req.data)
    },

    onAgentStop: async (req) => {
      getTab(req.tabId).ptyManager.destroyPty(req.agentId)
    },

    onAgentRestart: async (req) => {
      const tab = getTab(req.tabId)
      const agents = tab.ptyManager.getAll()
      const existing = agents.get(req.agentId)
      if (!existing) throw new Error(`Agent ${req.agentId} not found`)

      const { name, role, avatar, color } = existing

      tab.ptyManager.destroyPty(req.agentId)

      await tab.ptyManager.createPty(
        { name, role, command: 'claude', avatar, color },
        tab.projectPath
      )
    },

    onAgentResize: async (req) => {
      getTab(req.tabId).ptyManager.resize(req.agentId, req.cols, req.rows)
    },

    onFileRead: async (req) => {
      const tab = tryGetTab(req.tabId)
      if (!tab) return { content: '', filePath: req.filePath }
      assertPathWithinRoot(req.filePath, tab.projectPath)
      const content = await tab.fileService.readFile(req.filePath)
      return { content, filePath: req.filePath }
    },

    onFileWrite: async (req) => {
      const tab = getTab(req.tabId)
      assertPathWithinRoot(req.filePath, tab.projectPath)
      await tab.fileService.writeFile(req.filePath, req.content)
    },

    onFileTreeRequest: async (req) => {
      const tab = tryGetTab(req.tabId)
      if (!tab) return []
      assertPathWithinRoot(req.rootPath, tab.projectPath)
      return tab.fileService.getFileTree(req.rootPath)
    },

    onGitDiff: async (req) => {
      const tab = tryGetTab(req.tabId)
      if (!tab) return { diff: '', filePath: req.filePath }
      assertPathWithinRoot(req.filePath, tab.projectPath)
      const diff = await tab.gitService.getDiff(req.filePath)
      return { diff, filePath: req.filePath }
    },

    onTeamStart: async (req) => {
      const tab = getTab(req.tabId)
      const config = teamConfigService.enrichConfig(req.config)

      if (tab.session) {
        await tab.session.stop()
      }

      tab.session = new TeamSession(config.name, config.project, tab.ptyManager)
      deps.onSessionCreated?.(req.tabId, tab.session)
      const leadCommand = config.agents?.[0]?.command || 'claude'
      const leadAgent = await tab.session.start(leadCommand)

      return { agents: [leadAgent] }
    },

    onTeamStop: async (req) => {
      const tab = getTab(req.tabId)
      if (tab.session) {
        await tab.session.stop()
        tab.session = null
      }
    },

    onTeammateInput: async (req) => {
      const tab = getTab(req.tabId)
      if (!tab.session) throw new Error('No active team session')
      await tab.session.sendTeammateInput(req.paneId, req.data, req.useKeys)
    },

    onTeammateResize: async (req) => {
      const tab = getTab(req.tabId)
      if (!tab.session) throw new Error('No active team session')
      const server = tab.session.getServer()
      if (server) {
        await server.resizePane(req.paneId, req.cols, req.rows)
      }
    },

    onTeammateOutputReady: async (req) => {
      const tab = getTab(req.tabId)
      if (!tab.session) throw new Error('No active team session')
      const server = tab.session.getServer()
      if (server) {
        await server.flushBufferedOutput(req.paneId, req.cols, req.rows)
      }
    },

    getTab: (tabId) => tabs.get(tabId) ?? null,
    getTabs: () => tabs,
    destroyAllTabs: async () => {
      for (const [, tab] of tabs) {
        if (tab.session) {
          await tab.session.stop().catch(() => {})
        }
        tab.ptyManager.destroyAll()
      }
      tabs.clear()
    }
  }
}
