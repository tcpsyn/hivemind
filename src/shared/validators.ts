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

// IPC request schemas
const tabIdField = z.string().min(1)
const agentIdField = z.string().min(1)
const filePathField = z.string().min(1)

export const tabCreateRequestSchema = z.object({
  projectPath: z.string().min(1)
})

export const tabCloseRequestSchema = z.object({
  tabId: tabIdField
})

export const agentInputRequestSchema = z.object({
  tabId: tabIdField,
  agentId: agentIdField,
  data: z.string()
})

export const agentStopRequestSchema = z.object({
  tabId: tabIdField,
  agentId: agentIdField
})

export const agentRestartRequestSchema = z.object({
  tabId: tabIdField,
  agentId: agentIdField
})

export const agentResizeRequestSchema = z.object({
  tabId: tabIdField,
  agentId: agentIdField,
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
})

export const fileReadRequestSchema = z.object({
  tabId: tabIdField,
  filePath: filePathField
})

export const fileWriteRequestSchema = z.object({
  tabId: tabIdField,
  filePath: filePathField,
  content: z.string()
})

export const fileTreeRequestSchema = z.object({
  tabId: tabIdField,
  rootPath: z.string().min(1),
  depth: z.number().int().positive().optional()
})

export const gitDiffRequestSchema = z.object({
  tabId: tabIdField,
  filePath: filePathField
})

export const teamStartRequestSchema = z.object({
  tabId: tabIdField,
  config: teamConfigSchema
})

export const teamStopRequestSchema = z.object({
  tabId: tabIdField
})

export const teammateInputRequestSchema = z.object({
  tabId: tabIdField,
  paneId: z.string().min(1),
  data: z.string(),
  useKeys: z.boolean().optional()
})

export const teammateResizeRequestSchema = z.object({
  tabId: tabIdField,
  paneId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
})

export const teammateOutputReadyRequestSchema = z.object({
  tabId: tabIdField,
  paneId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
})
