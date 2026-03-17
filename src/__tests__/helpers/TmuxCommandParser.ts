import type { ParsedTmuxCommand } from '../../shared/tmux-types'

const BOOLEAN_FLAGS = new Set(['d', 'h', 'v', 'p', 'l', 'a', 'e', 'g'])

const SEND_KEYS_FLAGS_WITH_VALUE = new Set(['t'])

export function parseTmuxArgs(argv: string[]): ParsedTmuxCommand {
  if (argv.length === 0) {
    return { command: '', args: {}, rawArgs: [] }
  }

  const command = argv[0]
  const rawArgs = [...argv]

  if (command === '-V') {
    return { command: '-V', args: {}, rawArgs }
  }

  const args: Record<string, string | boolean> = {}

  if (command === 'send-keys') {
    return parseSendKeys(argv, rawArgs)
  }

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

function parseSendKeys(argv: string[], rawArgs: string[]): ParsedTmuxCommand {
  const args: Record<string, string | boolean> = {}
  const keyArgs: string[] = []

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
