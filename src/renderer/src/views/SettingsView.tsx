import { useEffect, useState } from 'react'
import { useTheme } from '../context/theme-context'
import { READER_FONT_OPTIONS, type ReaderFontId } from '@shared/types'

const FONT_SIZE_OPTIONS = [90, 100, 110, 125, 150]
const LINE_SPACING_OPTIONS = [1.2, 1.5, 1.8, 2.2]

export default function SettingsView(): React.JSX.Element {
  const { theme, setTheme } = useTheme()
  const [libraryFolder, setLibraryFolder] = useState('')
  const [readerTheme, setReaderThemeState] = useState<'light' | 'dark'>('light')
  const [fontFamily, setFontFamilyState] = useState<ReaderFontId>('default')
  const [fontSize, setFontSizeState] = useState(100)
  const [lineSpacing, setLineSpacingState] = useState(1.5)
  const [columns, setColumnsState] = useState<1 | 2>(1)

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setLibraryFolder(settings.libraryFolder)
      if (settings.readerTheme === 'dark' || settings.readerTheme === 'light') {
        setReaderThemeState(settings.readerTheme)
      }
      setFontFamilyState(settings.fontFamily)
      setFontSizeState(settings.fontSize)
      setLineSpacingState(settings.lineSpacing)
      setColumnsState(settings.columns)
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

  const setFontFamily = (next: ReaderFontId): void => {
    setFontFamilyState(next)
    window.api.setFontFamily(next)
  }

  const setFontSize = (next: number): void => {
    setFontSizeState(next)
    window.api.setFontSize(next)
  }

  const setLineSpacing = (next: number): void => {
    setLineSpacingState(next)
    window.api.setLineSpacing(next)
  }

  const setColumns = (next: 1 | 2): void => {
    setColumnsState(next)
    window.api.setColumns(next)
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
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text-soft)]">Tema de lectura</h3>
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

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--color-text-soft)]">
          Tipografía del lector
        </h3>
        <p className="mb-2 text-xs text-[var(--color-text-soft)]">
          Solo aplica a libros EPUB (el PDF se muestra como imagen de la página original).
        </p>

        <div className="mb-3">
          <p className="mb-1 text-xs text-[var(--color-text-soft)]">Fuente</p>
          <div className="flex flex-wrap gap-2">
            {READER_FONT_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setFontFamily(option.id)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  fontFamily === option.id
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-xs text-[var(--color-text-soft)]">Tamaño de letra</p>
          <div className="flex flex-wrap gap-2">
            {FONT_SIZE_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setFontSize(option)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  fontSize === option
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
                }`}
              >
                {option}%
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-xs text-[var(--color-text-soft)]">Interlineado</p>
          <div className="flex flex-wrap gap-2">
            {LINE_SPACING_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setLineSpacing(option)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  lineSpacing === option
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
                }`}
              >
                {option}×
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-[var(--color-text-soft)]">Columnas</p>
          <div className="flex gap-2">
            {([1, 2] as const).map((option) => (
              <button
                key={option}
                onClick={() => setColumns(option)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  columns === option
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-bg-mute)]'
                }`}
              >
                {option === 1 ? '1 columna' : '2 columnas'}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
