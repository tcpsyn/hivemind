#!/usr/bin/env node
'use strict'

const net = require('net')
const crypto = require('crypto')

const BOOLEAN_FLAGS = new Set(['d', 'h', 'v', 'p', 'l', 'a', 'e', 'g'])
const SEND_KEYS_FLAGS_WITH_VALUE = new Set(['t'])
const TIMEOUT_MS = 5000

const fs = require('fs')
const argv = process.argv.slice(2)

// Debug logging
fs.appendFileSync('/tmp/fake-tmux-debug.log', `[${new Date().toISOString()}] args: ${JSON.stringify(argv)} socket: ${process.env.CC_FRONTEND_SOCKET || process.env.TMUX || 'NONE'}\n`)

if (argv.length === 0) {
  process.stderr.write('fake-tmux: error: no command specified\n')
  process.exit(1)
}

if (argv[0] === '-V') {
  process.stdout.write('tmux 3.4\n')
  process.exit(0)
}

function parseArgs(argv) {
  const command = argv[0]
  const rawArgs = [...argv]

  if (command === 'send-keys') {
    return parseSendKeys(argv, rawArgs)
  }

  const args = {}
  let i = 1
  while (i < argv.length) {
    const arg = argv[i]
    if (arg.startsWith('-') && arg.length === 2) {
      const flag = arg[1]
      if (BOOLEAN_FLAGS.has(flag)) {
        args[flag] = true
        i++
      } else if (i + 1 < argv.length) {
        args[flag] = argv[i + 1]
        i += 2
      } else {
        args[flag] = true
        i++
      }
    } else {
      i++
    }
  }

  return { command, args, rawArgs }
}

function parseSendKeys(argv, rawArgs) {
  const args = {}
  const keyArgs = []
  let i = 1
  let collectingKeys = false

  while (i < argv.length) {
    const arg = argv[i]
    if (!collectingKeys && arg.startsWith('-') && arg.length === 2) {
      const flag = arg[1]
      if (SEND_KEYS_FLAGS_WITH_VALUE.has(flag) && i + 1 < argv.length) {
        args[flag] = argv[i + 1]
        i += 2
      } else if (flag === 'l') {
        args[flag] = true
        i++
      } else {
        collectingKeys = true
        keyArgs.push(arg)
        i++
      }
    } else {
      collectingKeys = true
      keyArgs.push(arg)
      i++
    }
  }

  return { command: 'send-keys', args, rawArgs: keyArgs.length > 0 ? keyArgs : rawArgs.slice(1) }
}

const socketPath =
  process.env.CC_FRONTEND_SOCKET ||
  (process.env.TMUX ? process.env.TMUX.split(',')[0] : '')

if (!socketPath) {
  process.stderr.write('fake-tmux: error: no socket path (CC_FRONTEND_SOCKET or TMUX not set)\n')
  process.exit(1)
}

const parsed = parseArgs(argv)
const request = {
  id: crypto.randomUUID(),
  command: parsed.command,
  args: parsed.args,
  rawArgs: parsed.rawArgs
}

const client = net.createConnection(socketPath)
let buffer = ''
let responded = false

const timeout = setTimeout(() => {
  if (!responded) {
    responded = true
    process.stderr.write('fake-tmux: error: timeout waiting for response\n')
    client.destroy()
    process.exit(1)
  }
}, TIMEOUT_MS)

client.on('connect', () => {
  client.write(JSON.stringify(request) + '\n')
})

client.on('data', (data) => {
  buffer += data.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const response = JSON.parse(line)
      if (response.id === request.id) {
        responded = true
        clearTimeout(timeout)
        if (response.stdout) process.stdout.write(response.stdout)
        if (response.stderr) process.stderr.write(response.stderr)
        client.destroy()
        process.exit(response.exitCode || 0)
      }
    } catch {
      // ignore parse errors
    }
  }
})

client.on('error', (err) => {
  if (!responded) {
    responded = true
    clearTimeout(timeout)
    process.stderr.write(`fake-tmux: error: ${err.message}\n`)
    process.exit(1)
  }
})

client.on('close', () => {
  if (!responded) {
    responded = true
    clearTimeout(timeout)
    process.stderr.write('fake-tmux: error: connection closed without response\n')
    process.exit(1)
  }
})
