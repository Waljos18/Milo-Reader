import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GlobalAnnotationEntry } from '@shared/types'

export default function AnnotationsView(): React.JSX.Element {
  const [entries, setEntries] = useState<GlobalAnnotationEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .listAllAnnotations()
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(highlightId: string): Promise<void> {
    await window.api.deleteAnnotation(highlightId)
    setEntries((prev) => prev.filter((e) => e.highlight.id !== highlightId))
  }

  return (
    <div>
      <h2 className="font-serif text-[32px] font-semibold tracking-tight">Anotaciones</h2>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-text-soft)]">
        Subrayados y notas de todos tus libros, en un solo lugar.
      </p>

      {loading && <p className="mt-4 text-sm text-[var(--color-text-soft)]">Cargando...</p>}

      {!loading && entries.length === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-soft)]">
          Todavia no subrayaste nada. Selecciona texto en un PDF para crear tu primer subrayado.
        </p>
      )}

      <ul className="mt-7 flex max-w-[760px] flex-col gap-4">
        {entries.map((entry) => (
          <li
            key={entry.highlight.id}
            className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: entry.highlight.color }}
                />
                <Link
                  to={`/reader/${entry.bookId}`}
                  className="text-sm font-semibold hover:underline"
                >
                  {entry.bookTitle}
                </Link>
              </div>
              <button
                onClick={() => handleDelete(entry.highlight.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-faint)] hover:bg-red-500/10 hover:text-red-500"
                title="Eliminar"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                </svg>
              </button>
            </div>

            <p className="font-serif mt-3.5 text-[15.5px] italic leading-relaxed text-[var(--color-text)]">
              &ldquo;{entry.highlight.selectedText}&rdquo;
            </p>

            {entry.note && (
              <p className="mt-2.5 rounded-lg bg-[var(--color-bg-soft)] p-3 text-[13px]">
                {entry.note.text}
              </p>
            )}

            <p className="mt-3 text-[11.5px] text-[var(--color-text-faint)]">
              {new Date(entry.highlight.createdAt).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
