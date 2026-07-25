import { useEffect, useState } from 'react'
import { useTheme } from '../context/theme-context'

export default function SettingsView(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const [libraryFolder, setLibraryFolder] = useState('')
  const [readerTheme, setReaderThemeState] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setLibraryFolder(settings.libraryFolder)
      if (settings.readerTheme === 'dark' || settings.readerTheme === 'light') {
        setReaderThemeState(settings.readerTheme)
      }
    })
  }, [])

  const handleChooseFolder = async (): Promise<void> => {
    const folder = await window.api.chooseLibraryFolder()
    setLibraryFolder(folder)
  }

  const setReaderTheme = (next: 'light' | 'dark'): void => {
    setReaderThemeState(next)
    window.api.setReaderTheme(next)
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold">Ajustes</h2>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text-soft)]">
          Carpeta de biblioteca
        </h3>
        <p className="mb-2 text-xs text-[var(--color-text-soft)]">
          Ponla dentro de tu carpeta de OneDrive o Google Drive para que se sincronice sola entre
          tus equipos Windows.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-[var(--color-bg-mute)] px-2 py-1 text-xs">
            {libraryFolder}
          </code>
          <button
            onClick={handleChooseFolder}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-bg-mute)]"
          >
            Cambiar
          </button>
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text-soft)]">
          Tema de la interfaz
        </h3>
        <p className="mb-2 text-xs text-[var(--color-text-soft)]">
          Afecta menús, biblioteca y paneles. No cambia el color de las páginas del libro.
        </p>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setTheme(option)}
              className={`rounded-md border px-3 py-1 text-sm ${
                theme === option
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
              }`}
            >
              {option === 'light' ? 'Claro' : option === 'dark' ? 'Oscuro' : 'Sistema'}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text-soft)]">
          Tema de lectura
        </h3>
        <p className="mb-2 text-xs text-[var(--color-text-soft)]">
          Solo las páginas del libro. También puedes cambiarlo desde el lector.
        </p>
        <div className="flex gap-2">
          {(['light', 'dark'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setReaderTheme(option)}
              className={`rounded-md border px-3 py-1 text-sm ${
                readerTheme === option
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
              }`}
            >
              {option === 'light' ? 'Claro' : 'Oscuro'}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
