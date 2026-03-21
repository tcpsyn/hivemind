#!/usr/bin/env node
/**
 * Hivemind MCP Server - standalone Node.js MCP server for teammate status queries.
 * Spawned by Claude Code as a subprocess via stdio transport.
 * Queries tmux directly using env vars REAL_TMUX and CC_TMUX_SOCKET.
 * Uses console.error() for all logging (stdout reserved for JSON-RPC).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import { z } from 'zod'

const TMUX_CMD = process.env.REAL_TMUX || 'tmux'
const TMUX_SOCKET = process.env.CC_TMUX_SOCKET || ''
const TMUX_SESSION = process.env.CC_TMUX_SESSION || ''
const LEAD_PANE = process.env.TMUX_PANE || '%0'

export interface PaneInfo {
  id: string
  title: string
  pid: string
  status: 'running' | 'exited'
}

export function runTmux(tmuxCmd: string, tmuxSocket: string, args: string[]): string {
  const socketArgs = tmuxSocket ? ['-L', tmuxSocket] : []
  return execFileSync(tmuxCmd, [...socketArgs, ...args], {
    encoding: 'utf-8',
    timeout: 5000
  }).trim()
}

export function parsePaneList(raw: string, leadPane: string): PaneInfo[] {
  if (!raw.trim()) return []
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, title, pid, dead] = line.split('|')
      return {
        id,
        title: title || 'teammate',
        pid,
        status: (dead === '1' ? 'exited' : 'running') as 'running' | 'exited'
      }
    })
    .filter((p) => p.id !== leadPane)
}

export function listTeammates(
  tmuxCmd: string,
  tmuxSocket: string,
  leadPane: string,
  sessionName?: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  let raw: string
  try {
    const listArgs = sessionName
      ? [
          'list-panes',
          '-t',
          sessionName,
          '-a',
          '-F',
          '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_dead}'
        ]
      : ['list-panes', '-a', '-F', '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_dead}']
    raw = runTmux(tmuxCmd, tmuxSocket, listArgs)
  } catch {
    return { content: [{ type: 'text', text: 'No active teammates found.' }] }
  }

  const panes = parsePaneList(raw, leadPane)

  if (panes.length === 0) {
    return { content: [{ type: 'text', text: 'No active teammates found.' }] }
  }
  return { content: [{ type: 'text', text: JSON.stringify(panes, null, 2) }] }
}

export function formatCheckResult(
  paneId: string,
  output: string,
  status: 'running' | 'exited'
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ pane_id: paneId, status, recent_output: output }, null, 2)
      }
    ]
  }
}

export function formatCheckError(paneId: string): {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
} {
  return {
    content: [{ type: 'text', text: `Pane ${paneId} not found or inaccessible.` }],
    isError: true
  }
}

export function checkTeammate(
  tmuxCmd: string,
  tmuxSocket: string,
  paneId: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    const output = runTmux(tmuxCmd, tmuxSocket, ['capture-pane', '-t', paneId, '-p', '-S', '-200'])
    let status: 'running' | 'exited' = 'running'
    try {
      const dead = runTmux(tmuxCmd, tmuxSocket, [
        'display-message',
        '-t',
        paneId,
        '-p',
        '#{pane_dead}'
      ])
      if (dead === '1') status = 'exited'
    } catch {
      /* pane may have been destroyed between calls */
    }

    return formatCheckResult(paneId, output, status)
  } catch {
    return formatCheckError(paneId)
  }
}

export function sendMessage(
  tmuxCmd: string,
  tmuxSocket: string,
  paneId: string,
  message: string
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    // Send the message as keyboard input to the teammate's tmux pane.
    // The teammate is an interactive Claude Code session waiting at a prompt.
    // Use send-keys with -l (literal) to avoid key name interpretation.
    runTmux(tmuxCmd, tmuxSocket, ['send-keys', '-t', paneId, '-l', message])
    // Send Enter to submit
    runTmux(tmuxCmd, tmuxSocket, ['send-keys', '-t', paneId, 'Enter'])
    return {
      content: [
        {
          type: 'text',
          text: `Message sent to pane ${paneId}. Use hivemind_check_teammate to see their response.`
        }
      ]
    }
  } catch {
    return {
      content: [
        { type: 'text', text: `Failed to send message to pane ${paneId}. Pane may not exist.` }
      ],
      isError: true
    }
  }
}

export function getUpdatesFilePath(session?: string): string {
  const safeName = (session || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `/tmp/hivemind-${safeName}-updates.jsonl`
}

export function reportComplete(
  filePath: string,
  paneId: string,
  summary: string
): { content: Array<{ type: 'text'; text: string }> } {
  const entry = JSON.stringify({
    pane_id: paneId,
    summary,
    timestamp: new Date().toISOString()
  })
  appendFileSync(filePath, entry + '\n')
  return {
    content: [{ type: 'text', text: 'Completion reported. The team lead will be notified.' }]
  }
}

export function getUpdates(filePath: string): {
  content: Array<{ type: 'text'; text: string }>
} {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return { content: [{ type: 'text', text: 'No pending updates.' }] }
  }

  const lines = raw.split('\n').filter(Boolean)
  if (lines.length === 0) {
    return { content: [{ type: 'text', text: 'No pending updates.' }] }
  }

  const updates = lines
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  // Truncate the file so updates aren't repeated
  writeFileSync(filePath, '')

  if (updates.length === 0) {
    return { content: [{ type: 'text', text: 'No pending updates.' }] }
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(updates, null, 2) }]
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'hivemind', version: '1.0.0' })
  const updatesFile = getUpdatesFilePath(TMUX_SESSION || undefined)

  server.tool(
    'hivemind_list_teammates',
    'List all active teammate agent panes, their status, AND any pending completion notifications from teammates.',
    {},
    async () => {
      const result = listTeammates(TMUX_CMD, TMUX_SOCKET, LEAD_PANE, TMUX_SESSION || undefined)
      // Append pending updates so the lead sees them without calling a separate tool
      const updates = getUpdates(updatesFile)
      if (updates.content[0].text !== 'No pending updates.') {
        result.content.push({
          type: 'text',
          text: '\n--- TEAMMATE COMPLETION NOTIFICATIONS ---\n' + updates.content[0].text
        })
      }
      return result
    }
  )

  server.tool(
    'hivemind_check_teammate',
    'Check the recent output and status of a specific teammate pane',
    { pane_id: z.string().describe('The tmux pane ID (e.g., %1, %2)') },
    async ({ pane_id }) => {
      return checkTeammate(TMUX_CMD, TMUX_SOCKET, pane_id)
    }
  )

  server.tool(
    'hivemind_send_message',
    "Send a message/task to a teammate agent. The message will be typed into the teammate's terminal as user input. Use this to assign tasks, ask questions, or give instructions to teammates.",
    {
      pane_id: z.string().describe('The tmux pane ID (e.g., %1, %2)'),
      message: z.string().describe('The message to send to the teammate')
    },
    async ({ pane_id, message }) => {
      return sendMessage(TMUX_CMD, TMUX_SOCKET, pane_id, message)
    }
  )

  server.tool(
    'hivemind_report_complete',
    'Report that you have completed your assigned task. Call this when you finish work so the team lead is notified.',
    {
      summary: z.string().describe('Brief summary of what you accomplished')
    },
    async ({ summary }) => {
      const paneId = LEAD_PANE // The calling agent's pane — resolved from env
      return reportComplete(updatesFile, paneId, summary)
    }
  )

  server.tool(
    'hivemind_get_updates',
    'Get pending completion notifications from teammates. Returns all updates since last check and clears them.',
    {},
    async () => {
      return getUpdates(updatesFile)
    }
  )

  return server
}

async function main(): Promise<void> {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Hivemind MCP server running on stdio')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
