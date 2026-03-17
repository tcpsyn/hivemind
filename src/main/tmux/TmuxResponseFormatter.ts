export type TmuxVars = Record<string, string>

export function formatTmuxString(format: string, vars: TmuxVars): string {
  return format.replace(/#\{([^}]*)\}/g, (_, name: string) => {
    return vars[name] ?? ''
  })
}
