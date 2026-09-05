import { useEffect, useState } from 'react'
import { useTheme } from '../context/theme-context'
import { READER_FONT_OPTIONS, type ReaderFontId } from '@shared/types'

const FONT_SIZE_OPTIONS = [90, 100, 110, 125, 150]
const LINE_SPACING_OPTIONS = [1.2, 1.5, 1.8, 2.2]

const FONT_PREVIEW_FAMILY: Record<ReaderFontId, string> = {
  default: 'inherit',
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI", Arial, sans-serif'
}

function SegButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-hover)]'
          : 'border-[var(--color-border)] font-medium text-[var(--color-text-soft)] hover:bg-[var(--color-bg-soft)]'
      }`}
    >
      {children}
    </button>
  )
}

function SectionCard({
  title,
  description,
  children,
  wide
}: {
  title: string
  description: string
  children: React.ReactNode
  wide?: boolean
}): React.JSX.Element {
  return (
    <section
      className={`rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 ${wide ? 'sm:col-span-2' : ''}`}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-[var(--color-text-soft)]">
        {description}
      </p>
      {children}
    </section>
  )
}

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
    <div className="max-w-3xl">
      <h2 className="font-serif mb-7 text-[32px] font-semibold tracking-tight">Ajustes</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <SectionCard
          title="Carpeta de biblioteca"
          description="Ponla dentro de tu carpeta de OneDrive o Google Drive para que se sincronice sola entre tus equipos Windows."
        >
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-[var(--color-bg-soft)] px-3 py-2 text-[11.5px] text-[var(--color-text-soft)]">
              {libraryFolder}
            </code>
            <div className="shrink-0">
              <SegButton active={false} onClick={handleChooseFolder}>
                Cambiar
              </SegButton>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Tema de la interfaz"
          description="Afecta menús, biblioteca y paneles. No cambia el color de las páginas del libro."
        >
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((option) => (
              <SegButton key={option} active={theme === option} onClick={() => setTheme(option)}>
                {option === 'light' ? 'Claro' : option === 'dark' ? 'Oscuro' : 'Sistema'}
              </SegButton>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Tema de lectura"
          description="Solo las páginas del libro. También puedes cambiarlo desde el lector."
        >
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((option) => (
              <SegButton
                key={option}
                active={readerTheme === option}
                onClick={() => setReaderTheme(option)}
              >
                {option === 'light' ? 'Claro' : 'Oscuro'}
              </SegButton>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Tipografía del lector"
          description="Solo aplica a libros EPUB (el PDF se muestra como imagen de la página original)."
          wide
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--color-text-soft)]">Fuente</p>
              <div className="flex flex-wrap gap-2">
                {READER_FONT_OPTIONS.map((option) => (
                  <SegButton
                    key={option.id}
                    active={fontFamily === option.id}
                    onClick={() => setFontFamily(option.id)}
                  >
                    <span style={{ fontFamily: FONT_PREVIEW_FAMILY[option.id] }}>Aa</span>
                    {option.label}
                  </SegButton>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--color-text-soft)]">Columnas</p>
              <div className="flex gap-2">
                {([1, 2] as const).map((option) => (
                  <SegButton
                    key={option}
                    active={columns === option}
                    onClick={() => setColumns(option)}
                  >
                    {option === 1 ? '1 columna' : '2 columnas'}
                  </SegButton>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--color-text-soft)]">
                Tamaño de letra
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FONT_SIZE_OPTIONS.map((option) => (
                  <SegButton
                    key={option}
                    active={fontSize === option}
                    onClick={() => setFontSize(option)}
                  >
                    {option}%
                  </SegButton>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--color-text-soft)]">
                Interlineado
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LINE_SPACING_OPTIONS.map((option) => (
                  <SegButton
                    key={option}
                    active={lineSpacing === option}
                    onClick={() => setLineSpacing(option)}
                  >
                    {option}×
                  </SegButton>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
