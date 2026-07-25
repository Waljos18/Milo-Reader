import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, resolveTheme, type Theme } from './theme-context'

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setThemeState((settings.theme as Theme) ?? 'system')
    })
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme))
  }, [theme])

  const setTheme = (next: Theme): void => {
    setThemeState(next)
    window.api.setTheme(next)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
