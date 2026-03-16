import { z } from 'zod'

export const agentConfigSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  role: z.string().min(1, 'Agent role is required'),
  command: z.string().min(1, 'Agent command is required'),
  avatar: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional()
})

export const teamConfigSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  project: z.string().min(1, 'Project path is required'),
  agents: z.array(agentConfigSchema).min(1, 'At least one agent is required')
})

export type ValidatedAgentConfig = z.infer<typeof agentConfigSchema>
export type ValidatedTeamConfig = z.infer<typeof teamConfigSchema>
