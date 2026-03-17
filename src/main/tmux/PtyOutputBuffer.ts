export class PtyOutputBuffer {
  private lines: string[] = []
  private maxLines: number

  constructor(maxLines = 10000) {
    this.maxLines = maxLines
  }

  append(data: string): void {
    if (data === '') return
    const newLines = data.split('\n').filter((line, i, arr) => {
      // Remove trailing empty string from split (trailing newline)
      return !(i === arr.length - 1 && line === '')
    })
    if (newLines.length === 0) return

    this.lines.push(...newLines)

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(this.lines.length - this.maxLines)
    }
  }

  capture(): string {
    return this.lines.join('\n')
  }

  clear(): void {
    this.lines = []
  }

  get lineCount(): number {
    return this.lines.length
  }
}
