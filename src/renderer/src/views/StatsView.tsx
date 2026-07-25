import { useEffect, useState } from 'react'
import type { ReadingStatsSummary } from '@shared/types'

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`)
  return date.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function StatsView(): React.JSX.Element {
  const [stats, setStats] = useState<ReadingStatsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .getReadingStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const maxDaySeconds = Math.max(1, ...(stats?.recentDays.map((d) => d.seconds) ?? [1]))

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold">Estadísticas de lectura</h2>
      <p className="mt-1 text-sm text-[var(--color-text-soft)]">
        Tiempo y avance registrados mientras lees en MiloReader.
      </p>

      {error && <p className="mt-4 text-red-500">{error}</p>}

      {!stats && !error && (
        <p className="mt-4 text-sm text-[var(--color-text-soft)]">Cargando…</p>
      )}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Tiempo total" value={formatDuration(stats.totalSeconds)} />
            <StatCard label="Sesiones" value={String(stats.sessionCount)} />
            <StatCard label="Libros" value={String(stats.booksRead)} />
            <StatCard label="Páginas / saltos" value={String(stats.totalLocationsRead)} />
          </div>

          <section className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text-soft)]">Últimos 7 días</h3>
            <div className="flex h-36 items-end gap-2">
              {stats.recentDays.map((day) => {
                const height = Math.max(4, Math.round((day.seconds / maxDaySeconds) * 100))
                return (
                  <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--color-text-soft)]">
                      {day.seconds > 0 ? formatDuration(day.seconds) : '—'}
                    </span>
                    <div
                      className="w-full rounded-t bg-[var(--color-accent)]/80"
                      style={{ height: `${height}%` }}
                      title={`${formatDayLabel(day.date)}: ${formatDuration(day.seconds)}`}
                    />
                    <span className="truncate text-[10px] text-[var(--color-text-soft)]">
                      {formatDayLabel(day.date)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-[var(--color-text-soft)]">Por libro</h3>
            {stats.byBook.length === 0 ? (
              <p className="text-sm text-[var(--color-text-soft)]">
                Aún no hay sesiones. Abre un libro y lee un rato para empezar a registrar.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
                {stats.byBook.map((book) => (
                  <li key={book.bookId} className="flex items-center justify-between gap-4 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{book.bookTitle}</p>
                      <p className="text-xs text-[var(--color-text-soft)]">
                        {book.sessionCount} sesión{book.sessionCount === 1 ? '' : 'es'} ·{' '}
                        {book.locationsRead} páginas/saltos
                        {book.percentComplete != null
                          ? ` · ${Math.round(book.percentComplete)}%`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-[var(--color-text-soft)]">
                      {formatDuration(book.totalSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-soft)] px-3 py-3">
      <p className="text-xs text-[var(--color-text-soft)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
