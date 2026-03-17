import {
  existsSync,
  mkdirSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { teamConfigSchema } from '../../shared/validators'
import { AGENT_COLORS, AGENT_AVATARS } from '../../shared/constants'
import type { TeamConfig, AgentConfig } from '../../shared/types'

export class TeamConfigService {
  private configDir: string

  constructor(configDir: string) {
    this.configDir = configDir
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
  }

  loadConfig(filename: string): TeamConfig {
    const filePath = join(this.configDir, filename)
    const content = readFileSync(filePath, 'utf-8')
    const data = parse(content)
    const result = teamConfigSchema.safeParse(data)
    if (!result.success) {
      throw new Error(`Invalid team config: ${result.error.message}`)
    }
    return result.data as TeamConfig
  }

  enrichConfig(config: TeamConfig): TeamConfig {
    const usedColors = new Set(config.agents.filter((a) => a.color).map((a) => a.color))
    const usedAvatars = new Set(config.agents.filter((a) => a.avatar).map((a) => a.avatar))

    let colorIndex = 0
    let avatarIndex = 0

    const enrichedAgents: AgentConfig[] = config.agents.map((agent) => {
      let color = agent.color
      let avatar = agent.avatar

      if (!color) {
        while (colorIndex < AGENT_COLORS.length && usedColors.has(AGENT_COLORS[colorIndex])) {
          colorIndex++
        }
        color = AGENT_COLORS[colorIndex % AGENT_COLORS.length]
        usedColors.add(color)
        colorIndex++
      }

      if (!avatar) {
        while (avatarIndex < AGENT_AVATARS.length && usedAvatars.has(AGENT_AVATARS[avatarIndex])) {
          avatarIndex++
        }
        avatar = AGENT_AVATARS[avatarIndex % AGENT_AVATARS.length]
        usedAvatars.add(avatar)
        avatarIndex++
      }

      return { ...agent, color, avatar }
    })

    return { ...config, agents: enrichedAgents }
  }
}
