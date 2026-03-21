#!/usr/bin/env node
/**
 * Hivemind MCP Server — provides teammate status tools to Claude Code.
 * Spawned by Claude Code as a subprocess via stdio transport.
 * Queries tmux directly using env vars REAL_TMUX and CC_TMUX_SOCKET.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execFileSync } from 'child_process'
import { z } from 'zod'

// NOTE: Canonical source is src/main/mcp/hivemind-mcp-server.ts — rebuild with `pnpm build:mcp`
const TMUX_CMD = process.env.REAL_TMUX || 'tmux'
const TMUX_SOCKET = process.env.CC_TMUX_SOCKET || ''
const TMUX_SESSION = process.env.CC_TMUX_SESSION || ''
const LEAD_PANE = process.env.TMUX_PANE || '%0'

function runTmux(...args) {
  const socketArgs = TMUX_SOCKET ? ['-L', TMUX_SOCKET] : []
  return execFileSync(TMUX_CMD, [...socketArgs, ...args], {
    encoding: 'utf-8',
    timeout: 5000
  }).trim()
}

const server = new McpServer({ name: 'hivemind', version: '1.0.0' })

server.tool(
  'hivemind_list_teammates',
  'List all active teammate agent panes and their status.',
  {},
  async () => {
    let result
    try {
      const listArgs = TMUX_SESSION
        ? ['list-panes', '-t', TMUX_SESSION, '-a', '-F', '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_dead}']
        : ['list-panes', '-a', '-F', '#{pane_id}|#{pane_title}|#{pane_pid}|#{pane_dead}']
      const raw = runTmux(...listArgs)
      const panes = raw.split('\n')
        .filter(Boolean)
        .map(line => {
          const [id, title, pid, dead] = line.split('|')
          return { id, title: title || 'teammate', pid, status: dead === '1' ? 'exited' : 'running' }
        })
        .filter(p => p.id !== LEAD_PANE)

      if (panes.length === 0) {
        result = { content: [{ type: 'text', text: 'No active teammates found.' }] }
      } else {
        result = { content: [{ type: 'text', text: JSON.stringify(panes, null, 2) }] }
      }
    } catch {
      result = { content: [{ type: 'text', text: 'No active teammates found.' }] }
    }
    return result
  }
)

server.tool(
  'hivemind_check_teammate',
  'Check the recent output and status of a specific teammate pane',
  { pane_id: z.string().describe('The tmux pane ID (e.g., %1, %2)') },
  async ({ pane_id }) => {
    try {
      const output = runTmux('capture-pane', '-t', pane_id, '-p', '-S', '-200')
      let status = 'running'
      try {
        const dead = runTmux('display-message', '-t', pane_id, '-p', '#{pane_dead}')
        if (dead === '1') status = 'exited'
      } catch { /* pane may have been destroyed */ }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ pane_id, status, recent_output: output }, null, 2)
        }]
      }
    } catch {
      return {
        content: [{ type: 'text', text: `Pane ${pane_id} not found or inaccessible.` }],
        isError: true
      }
    }
  }
)

server.tool(
  'hivemind_send_message',
  'Send a message/task to a teammate agent. The message will be typed into the teammate\'s terminal as user input. Use this to assign tasks, ask questions, or give instructions to teammates.',
  {
    pane_id: z.string().describe('The tmux pane ID (e.g., %1, %2)'),
    message: z.string().describe('The message to send to the teammate')
  },
  async ({ pane_id, message }) => {
    try {
      runTmux('send-keys', '-t', pane_id, '-l', message)
      runTmux('send-keys', '-t', pane_id, 'Enter')
      return {
        content: [{ type: 'text', text: `Message sent to pane ${pane_id}. Use hivemind_check_teammate to see their response.` }]
      }
    } catch {
      return {
        content: [{ type: 'text', text: `Failed to send message to pane ${pane_id}. Pane may not exist.` }],
        isError: true
      }
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('Hivemind MCP server running on stdio')
