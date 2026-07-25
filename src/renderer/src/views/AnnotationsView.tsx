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
      <h2 className="text-xl font-semibold">Anotaciones</h2>
      <p className="mt-1 text-sm text-[var(--color-text-soft)]">
        Subrayados y notas de todos tus libros.
      </p>

      {loading && <p className="mt-4 text-sm text-[var(--color-text-soft)]">Cargando...</p>}

      {!loading && entries.length === 0 && (
        <p className="mt-4 text-sm text-[var(--color-text-soft)]">
          Todavia no subrayaste nada. Selecciona texto en un PDF para crear tu primer subrayado.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {entries.map((entry) => (
          <li
            key={entry.highlight.id}
            className="rounded-md border border-[var(--color-border)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: entry.highlight.color }}
                />
                <Link
                  to={`/reader/${entry.bookId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {entry.bookTitle}
                </Link>
              </div>
              <button
                onClick={() => handleDelete(entry.highlight.id)}
                className="shrink-0 rounded-md border border-red-500 px-2 py-0.5 text-xs text-red-500 hover:bg-red-500/10"
              >
                Eliminar
              </button>
            </div>

            <p className="mt-2 text-sm italic text-[var(--color-text-soft)]">
              &ldquo;{entry.highlight.selectedText}&rdquo;
            </p>

            {entry.note && <p className="mt-2 text-sm">{entry.note.text}</p>}

            <p className="mt-2 text-xs text-[var(--color-text-soft)]">
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
