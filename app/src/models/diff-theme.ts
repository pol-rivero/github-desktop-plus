export type DiffTheme = 'default' | 'catppuccin'

export const defaultDiffTheme: DiffTheme = 'default'
export const catppuccinDiffTheme: DiffTheme = 'catppuccin'

export const availableDiffThemes: ReadonlyArray<DiffTheme> = [
  defaultDiffTheme,
  catppuccinDiffTheme,
]

const diffThemeLabels: Readonly<Record<DiffTheme, string>> = {
  default: 'Default',
  catppuccin: 'Catppuccin (matches app theme)',
}

export function parseDiffTheme(value: string | null): DiffTheme {
  return availableDiffThemes.includes(value as DiffTheme)
    ? (value as DiffTheme)
    : defaultDiffTheme
}

export function getDiffThemeLabel(theme: DiffTheme): string {
  return diffThemeLabels[theme]
}
