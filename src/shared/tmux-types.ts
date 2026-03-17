export interface ParsedTmuxCommand {
  command: string
  args: Record<string, string | boolean>
  rawArgs: string[]
}

export interface TmuxRequest {
  id: string
  command: string
  args: Record<string, string | boolean | number>
  rawArgs: string[]
}

export interface TmuxResponse {
  id: string
  exitCode: number
  stdout: string
  stderr: string
}

export type TmuxCommand =
  | 'new-session'
  | 'new-window'
  | 'split-window'
  | 'send-keys'
  | 'list-panes'
  | 'list-sessions'
  | 'capture-pane'
  | 'display-message'
  | 'has-session'
  | 'kill-session'
  | 'kill-pane'
  | 'select-pane'
  | 'resize-pane'
