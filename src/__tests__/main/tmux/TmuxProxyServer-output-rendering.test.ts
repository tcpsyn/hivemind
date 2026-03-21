import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import * as fsPromises from 'fs/promises'
import { TmuxProxyServer, type ExecCommand } from '../../../main/tmux/TmuxProxyServer'

function waitForEvent<T>(emitter: TmuxProxyServer, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for '${event}'`)), timeoutMs)
    emitter.once(event, (data: T) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

function collectEvents<T>(emitter: TmuxProxyServer, event: string): T[] {
  const events: T[] = []
  emitter.on(event, (data: T) => events.push(data))
  return events
}

describe('TmuxProxyServer — output rendering pipeline', () => {
  let server: TmuxProxyServer
  let socketPath: string
  let mockExec: ReturnType<typeof vi.fn<ExecCommand>>

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `cc-output-test-${crypto.randomUUID()}.sock`)
    mockExec = vi.fn<ExecCommand>().mockResolvedValue({ stdout: '', stderr: '' })
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
    }
  })

  function createServer(opts?: {
    pollIntervalMs?: number
    leadPaneId?: string
    leadSessionName?: string
  }): TmuxProxyServer {
    server = new TmuxProxyServer(socketPath, '/usr/bin/tmux', {
      execCommand: mockExec,
      leadPaneId: opts?.leadPaneId ?? '%0',
      leadSessionName: opts?.leadSessionName,
      pollIntervalMs: opts?.pollIntervalMs ?? 0
    })
    return server
  }

  describe('output buffering until renderer ready', () => {
    it('buffers output until markPaneReady is called, then flushes', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Write output BEFORE marking ready
      await fsPromises.appendFile(outFile, 'early output\r\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Output should be buffered, not emitted
      expect(outputs).toHaveLength(0)

      // Now mark ready — should flush buffered output
      server.markPaneReady('%1')
      expect(outputs).toHaveLength(1)
      expect(outputs[0].data.toString()).toBe('early output\r\n')
    })
  })

  describe('pipe-pane streaming (startPaneStreaming + readNewOutput)', () => {
    it('emits teammate-output with file contents as Buffer', async () => {
      createServer({ leadSessionName: 'main' })

      // Track the output file path from pipe-pane call
      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          // Extract output file from pipe-pane args: tee -a "/path/to/file" > /dev/null
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')

      // Wait for pipe-pane to be called and outFile to be captured
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(outFile).toBeTruthy()

      // Register listener BEFORE writing — fs.watch delivers events near-instantly
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )
      await fsPromises.appendFile(outFile, 'Hello from agent\r\n')

      const output = await outputPromise

      expect(output.paneId).toBe('%1')
      expect(Buffer.isBuffer(output.data)).toBe(true)
      expect(output.data.toString()).toBe('Hello from agent\r\n')
    })

    it('preserves ANSI escape codes in output', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Register listener BEFORE writing — fs.watch delivers events near-instantly
      const ansiContent = '\x1b[32mSuccess\x1b[0m: \x1b[1mBold text\x1b[0m\r\n'
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )
      await fsPromises.appendFile(outFile, ansiContent)

      const output = await outputPromise
      expect(output.data.toString()).toBe(ansiContent)
    })

    it('preserves Unicode characters in output', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      const unicodeContent = '日本語テスト 🎉 émojis ñoño\r\n'
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )
      await fsPromises.appendFile(outFile, unicodeContent)

      const output = await outputPromise
      expect(output.data.toString()).toBe(unicodeContent)
    })

    it('emits incremental output (only new bytes)', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Write first chunk
      await fsPromises.appendFile(outFile, 'first line\r\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Write second chunk
      await fsPromises.appendFile(outFile, 'second line\r\n')
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(outputs.length).toBeGreaterThanOrEqual(2)
      expect(outputs[0].data.toString()).toBe('first line\r\n')
      expect(outputs[1].data.toString()).toBe('second line\r\n')
    })
  })

  describe('capture-pane fallback', () => {
    it('emits output with screen-clear ANSI prefix when content changes', async () => {
      createServer({ leadSessionName: 'main' })

      // Make pipe-pane fail so it falls back to capture-pane
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          throw new Error('pipe-pane not available')
        }
        if (Array.isArray(args) && args.includes('capture-pane')) {
          return { stdout: 'Agent output line 1\nAgent output line 2\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')

      const output = await waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )

      expect(output.paneId).toBe('%1')
      const text = output.data.toString()
      // Should start with screen-clear: ESC[2J ESC[H
      expect(text.startsWith('\x1b[2J\x1b[H')).toBe(true)
      expect(text).toContain('Agent output line 1')
      expect(text).toContain('Agent output line 2')
    })

    it('does not re-emit when capture-pane content is unchanged', async () => {
      createServer({ leadSessionName: 'main' })

      const capturedContent = 'Static output\n'
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          throw new Error('pipe-pane not available')
        }
        if (Array.isArray(args) && args.includes('capture-pane')) {
          return { stdout: capturedContent, stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')

      // Wait for multiple poll cycles (500ms each)
      await new Promise((resolve) => setTimeout(resolve, 1600))

      // Should only emit once since content doesn't change
      expect(outputs).toHaveLength(1)
    })

    it('filters Claude UI lines from capture-pane output', async () => {
      createServer({ leadSessionName: 'main' })

      const rawOutput = [
        'Actual code output here',
        '  thinking with high effort...',
        'More real output',
        '  cc_frontend  Opus 4.6  [████████████] 11%  ⌞ feature/branch',
        'Final real line'
      ].join('\n')

      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          throw new Error('pipe-pane not available')
        }
        if (Array.isArray(args) && args.includes('capture-pane')) {
          return { stdout: rawOutput, stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')

      const output = await waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )

      const text = output.data.toString()
      // Real content should be present
      expect(text).toContain('Actual code output here')
      expect(text).toContain('More real output')
      expect(text).toContain('Final real line')
      // "thinking with high effort" is now kept (less aggressive filter)
      // Only the status bar line with model + context% is stripped
      expect(text).not.toContain('Opus 4.6')
    })
  })

  describe('filterClaudeUILines', () => {
    // Access private method
    function getFilter(): (text: string) => string {
      createServer({ leadSessionName: 'main' })
      return (server as any).filterClaudeUILines.bind(server)
    }

    it('strips status bar lines with model name and context %', () => {
      const filter = getFilter()
      const input = 'real output\n  cc_frontend  Opus 4.6  [████] 25%\nmore\n'
      const result = filter(input)
      expect(result).not.toContain('Opus 4.6')
      expect(result).toContain('real output')
      expect(result).toContain('more')
    })

    it('strips Sonnet status bar', () => {
      const filter = getFilter()
      const input = 'output\n  app  Sonnet 4.6  [██] 10%  ⌞ develop\nmore\n'
      const result = filter(input)
      expect(result).not.toContain('Sonnet 4.6')
      expect(result).toContain('output')
    })

    it('strips Haiku status bar', () => {
      const filter = getFilter()
      const input = 'output\n  app  Haiku 4.5  [█] 3%\nmore\n'
      const result = filter(input)
      expect(result).not.toContain('Haiku 4.5')
    })

    it('preserves thinking/effort lines (not status bar)', () => {
      const filter = getFilter()
      const input = 'real output\n  thinking with high effort\nanother line\n'
      const result = filter(input)
      expect(result).toContain('thinking with')
      expect(result).toContain('real output')
    })

    it('preserves token counter lines (not status bar)', () => {
      const filter = getFilter()
      const input = 'real output\n  1234 tokens\nmore output\n'
      const result = filter(input)
      expect(result).toContain('1234 tokens')
    })

    it('preserves box-drawing characters in tool output', () => {
      const filter = getFilter()
      const input = '⎿ Read file.ts\n│ content here\n├ More content\n└ Done\n'
      const result = filter(input)
      expect(result).toContain('⎿ Read file.ts')
      expect(result).toContain('│ content here')
      expect(result).toContain('├ More content')
      expect(result).toContain('└ Done')
    })

    it('preserves ctrl+c and Esc lines (not status bar)', () => {
      const filter = getFilter()
      const input = 'real output\n  ctrl+c to cancel\n  Esc to cancel\nmore\n'
      const result = filter(input)
      expect(result).toContain('ctrl+c')
      expect(result).toContain('Esc to cancel')
    })

    it('preserves normal code output', () => {
      const filter = getFilter()
      const input = [
        'function hello() {',
        "  console.log('world')",
        '}',
        '',
        '// This is a comment',
        'const x = 42'
      ].join('\n')
      const result = filter(input)
      expect(result).toContain('function hello()')
      expect(result).toContain("console.log('world')")
      expect(result).toContain('const x = 42')
    })

    it('trims leading and trailing empty lines', () => {
      const filter = getFilter()
      const input = '\n\n  real content  \n\n'
      const result = filter(input)
      expect(result).toBe('  real content  ')
    })
  })

  describe('parseClaudeStatus edge cases', () => {
    function getParser(): (
      output: string
    ) => { model?: string; contextPercent?: string; branch?: string; project?: string } | null {
      createServer({ leadSessionName: 'main' })
      return (server as any).parseClaudeStatus.bind(server)
    }

    it('parses status with context in parenthesized format', () => {
      const parse = getParser()
      const output = '  cc_frontend  Opus 4.6 (1M context)  [████] 3%  ⌞ feature/status\n'
      const result = parse(output)

      expect(result).toBeDefined()
      expect(result!.model).toBe('Opus 4.6')
      expect(result!.contextPercent).toBe('3%')
    })

    it('parses status at 100% context', () => {
      const parse = getParser()
      const output = '  myapp  Sonnet 4.6  [████████████████] 100%  ⌞ main\n'
      const result = parse(output)

      expect(result).toBeDefined()
      expect(result!.contextPercent).toBe('100%')
    })

    it('parses status with trailing slash in branch', () => {
      const parse = getParser()
      const output = '  app  Opus 4.6  [██] 5%  ⌞ feature/deep/nested/branch\n'
      const result = parse(output)

      expect(result).toBeDefined()
      expect(result!.branch).toBe('feature/deep/nested/branch')
    })

    it('ignores random lines with % that are not status lines', () => {
      const parse = getParser()
      // Has a % but no model name — should return null
      const output = 'CPU usage: 85%\nMemory: 60%\n'
      const result = parse(output)
      expect(result).toBeNull()
    })

    it('is case-insensitive for model names', () => {
      const parse = getParser()
      const output = '  app  opus 4.6  [██] 5%\n'
      const result = parse(output)

      expect(result).toBeDefined()
      expect(result!.model).toBe('opus 4.6')
    })

    it('handles model name without version number', () => {
      const parse = getParser()
      const output = '  app  Opus  [██] 5%\n'
      const result = parse(output)

      expect(result).toBeDefined()
      expect(result!.model).toBe('Opus')
      expect(result!.contextPercent).toBe('5%')
    })
  })

  describe('multi-pane concurrent output', () => {
    it('emits output independently for multiple panes', async () => {
      createServer({ leadSessionName: 'main' })

      const outFiles = new Map<string, string>()
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const targetIdx = args.indexOf('-t')
          const paneId = targetIdx !== -1 ? args[targetIdx + 1] : ''
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg && paneId) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFiles.set(paneId, match[1])
          }
        }
        return { stdout: '', stderr: '' }
      })

      // Start streaming for two panes
      await server.startPaneStreaming('%1')
      await server.startPaneStreaming('%2')
      server.markPaneReady('%1')
      server.markPaneReady('%2')
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(outFiles.get('%1')).toBeTruthy()
      expect(outFiles.get('%2')).toBeTruthy()

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      // Write output to both panes
      await fsPromises.appendFile(outFiles.get('%1')!, 'Pane 1 output\r\n')
      await fsPromises.appendFile(outFiles.get('%2')!, 'Pane 2 output\r\n')

      // Wait for poll cycles
      await new Promise((resolve) => setTimeout(resolve, 500))

      const pane1Outputs = outputs.filter((o) => o.paneId === '%1')
      const pane2Outputs = outputs.filter((o) => o.paneId === '%2')

      expect(pane1Outputs.length).toBeGreaterThanOrEqual(1)
      expect(pane2Outputs.length).toBeGreaterThanOrEqual(1)
      expect(pane1Outputs[0].data.toString()).toBe('Pane 1 output\r\n')
      expect(pane2Outputs[0].data.toString()).toBe('Pane 2 output\r\n')
    })

    it('status polling emits independently per pane', async () => {
      createServer({ leadSessionName: 'main' })

      // Discover two panes
      mockExec.mockResolvedValueOnce({
        stdout: '%1|1234|worker1|/dev/ttys001|main\n%2|5678|worker2|/dev/ttys002|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      // Now mock capture-pane to return different status for each pane
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('capture-pane')) {
          const targetIdx = args.indexOf('-t')
          const paneId = targetIdx !== -1 ? args[targetIdx + 1] : ''
          if (paneId === '%1') {
            return { stdout: '  app  Opus 4.6  [████] 25%  ⌞ main\n', stderr: '' }
          }
          if (paneId === '%2') {
            return { stdout: '  app  Sonnet 4.6  [██] 10%  ⌞ develop\n', stderr: '' }
          }
        }
        return { stdout: '', stderr: '' }
      })

      const statuses = collectEvents<{
        paneId: string
        model?: string
        contextPercent?: string
      }>(server, 'teammate-status-update')

      // Wait for status polling (1000ms interval)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const pane1Status = statuses.find((s) => s.paneId === '%1')
      const pane2Status = statuses.find((s) => s.paneId === '%2')

      expect(pane1Status).toBeDefined()
      expect(pane1Status!.model).toBe('Opus 4.6')
      expect(pane1Status!.contextPercent).toBe('25%')

      expect(pane2Status).toBeDefined()
      expect(pane2Status!.model).toBe('Sonnet 4.6')
      expect(pane2Status!.contextPercent).toBe('10%')
    })
  })

  describe('pipe-pane watchdog fallback', () => {
    it('switches to capture-pane after 60 silent polls', async () => {
      createServer({ leadSessionName: 'main' })

      let capturePolled = false
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          return { stdout: '', stderr: '' }
        }
        if (Array.isArray(args) && args.includes('capture-pane')) {
          capturePolled = true
          return { stdout: 'fallback output\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')

      // Wait for 60 polls at 200ms = 12s + margin
      await new Promise((resolve) => setTimeout(resolve, 13000))

      expect(capturePolled).toBe(true)
    }, 15000)
  })

  describe('output file size management', () => {
    it('handles large output without data loss within chunk limit', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Write a chunk larger than a single line but within the 256KB chunk limit
      const largeOutput = 'x'.repeat(1000) + '\r\n'
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )
      await fsPromises.appendFile(outFile, largeOutput)

      const output = await outputPromise
      expect(output.data.toString()).toBe(largeOutput)
    })
  })

  describe('UTF-8 partial sequence handling', () => {
    it('handles multi-byte UTF-8 characters split across chunk boundaries', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Write a 4-byte emoji (🎉 = F0 9F 8E 89) with surrounding ASCII.
      // The StringDecoder ensures that if the read boundary falls mid-character,
      // the incomplete bytes are buffered until the next read completes them.
      const emoji = '🎉'
      const content = `before ${emoji} after\r\n`
      await fsPromises.appendFile(outFile, content)

      await new Promise((resolve) => setTimeout(resolve, 400))

      const combined = outputs.map((o) => o.data.toString()).join('')
      expect(combined).toContain(emoji)
      expect(combined).toContain('before')
      expect(combined).toContain('after')
      // No replacement characters (U+FFFD) should appear
      expect(combined).not.toContain('\uFFFD')
    })

    it('handles CJK characters without corruption', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // CJK characters are 3 bytes each in UTF-8
      const cjk = '日本語テスト漢字'
      await fsPromises.appendFile(outFile, cjk + '\r\n')

      await new Promise((resolve) => setTimeout(resolve, 400))

      const combined = outputs.map((o) => o.data.toString()).join('')
      expect(combined).toContain(cjk)
      expect(combined).not.toContain('\uFFFD')
    })
  })

  describe('fs.watch push-based updates', () => {
    it('delivers output faster than polling interval alone', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Register listener BEFORE writing — fs.watch delivers events near-instantly
      const start = Date.now()
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        2000
      )
      await fsPromises.appendFile(outFile, 'fast delivery\r\n')

      const output = await outputPromise
      const elapsed = Date.now() - start
      expect(output.data.toString()).toContain('fast delivery')
      // With fs.watch, delivery should be well under the 200ms poll interval.
      // Allow some headroom for CI/slow machines but it should be faster than polling.
      expect(elapsed).toBeLessThan(200)
    })
  })

  describe('truncation safety', () => {
    it('does not truncate file while unread data remains', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      const outputs = collectEvents<{ paneId: string; data: Buffer }>(server, 'teammate-output')

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Write content and let it be read
      await fsPromises.appendFile(outFile, 'chunk one\r\n')
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Write more content
      await fsPromises.appendFile(outFile, 'chunk two\r\n')
      await new Promise((resolve) => setTimeout(resolve, 400))

      const combined = outputs.map((o) => o.data.toString()).join('')
      // Both chunks should be present — no data lost
      expect(combined).toContain('chunk one')
      expect(combined).toContain('chunk two')
    })
  })

  describe('TeamSession event bridge (teammate-output data type)', () => {
    it('teammate-output data is a Buffer that converts to string faithfully', async () => {
      createServer({ leadSessionName: 'main' })

      let outFile = ''
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          const teeArg = args.find((a) => a.startsWith('tee -a'))
          if (teeArg) {
            const match = teeArg.match(/tee -a "([^"]+)"/)
            if (match) outFile = match[1]
          }
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')
      server.markPaneReady('%1')
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Register listener BEFORE writing — fs.watch delivers events near-instantly
      const content = '\x1b[38;5;196mRed\x1b[0m → 日本 "quotes" & <tags>\r\n'
      const outputPromise = waitForEvent<{ paneId: string; data: Buffer }>(
        server,
        'teammate-output',
        3000
      )
      await fsPromises.appendFile(outFile, content)

      const output = await outputPromise

      // This is what TeamSession.wireServerEvents does: data.toString()
      const asString = output.data.toString()
      expect(asString).toBe(content)
      expect(asString).toContain('\x1b[38;5;196m')
      expect(asString).toContain('日本')
      expect(asString).toContain('"quotes"')
      expect(asString).toContain('& <tags>')
    })
  })
})
