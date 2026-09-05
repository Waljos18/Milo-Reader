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

function formatDayShort(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`)
  return date.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '')
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
    <div className="max-w-5xl">
      <h2 className="font-serif text-[32px] font-semibold tracking-tight">
        Estadísticas de lectura
      </h2>
      <p className="mt-1.5 text-[13.5px] text-[var(--color-text-soft)]">
        Tiempo y avance registrados mientras lees en MiloReader.
      </p>

      {error && <p className="mt-4 text-red-500">{error}</p>}

      {!stats && !error && <p className="mt-4 text-sm text-[var(--color-text-soft)]">Cargando…</p>}

      {stats && (
        <>
          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Tiempo total"
              value={formatDuration(stats.totalSeconds)}
              icon={
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </>
              }
            />
            <StatCard
              label="Sesiones"
              value={String(stats.sessionCount)}
              icon={<path d="M4 19h16M6 15l4-4 3 3 5-6" />}
            />
            <StatCard
              label="Libros"
              value={String(stats.booksRead)}
              icon={
                <>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M9 3v18M15 3v18" />
                </>
              }
            />
            <StatCard
              label="Páginas / saltos"
              value={String(stats.totalLocationsRead)}
              icon={<path d="M4 6h16M4 12h16M4 18h10" />}
            />
          </div>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row">
            <section className="flex-[1.3] rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
              <h3 className="mb-6 text-[13px] font-semibold text-[var(--color-text-soft)]">
                Últimos 7 días
              </h3>
              <div className="flex h-36 items-end gap-3">
                {stats.recentDays.map((day, i) => {
                  const height = Math.max(4, Math.round((day.seconds / maxDaySeconds) * 100))
                  const isToday = i === stats.recentDays.length - 1
                  return (
                    <div
                      key={day.date}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                    >
                      <span
                        className={`text-[10.5px] ${isToday ? 'font-bold text-[var(--color-accent-hover)]' : 'text-[var(--color-text-faint)]'} ${day.seconds === 0 ? 'invisible' : ''}`}
                      >
                        {formatDuration(day.seconds)}
                      </span>
                      <div
                        className="w-full rounded-t-[5px]"
                        style={{
                          height: `${height}%`,
                          background: isToday ? 'var(--color-accent-hover)' : 'var(--color-accent)'
                        }}
                        title={`${formatDayLabel(day.date)}: ${formatDuration(day.seconds)}`}
                      />
                      <span
                        className={`truncate text-[10.5px] ${isToday ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-faint)]'}`}
                      >
                        {isToday ? 'hoy' : formatDayShort(day.date)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="flex-1 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
              <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-text-soft)]">
                Por libro
              </h3>
              {stats.byBook.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--color-text-soft)]">
                  Aún no hay sesiones. Abre un libro y lee un rato para empezar a registrar.
                </p>
              ) : (
                <ul>
                  {stats.byBook.map((book) => (
                    <li
                      key={book.bookId}
                      className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-3.5 last:border-none"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{book.bookTitle}</p>
                        <p className="mt-0.5 text-[11.5px] text-[var(--color-text-faint)]">
                          {book.sessionCount} sesión{book.sessionCount === 1 ? '' : 'es'} ·{' '}
                          {book.locationsRead} páginas/saltos
                          {book.percentComplete != null
                            ? ` · ${Math.round(book.percentComplete)}%`
                            : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--color-text-soft)]">
                        {formatDuration(book.totalSeconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon
}: {
  label: string
  value: string
  icon: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </div>
      <p className="font-serif mt-3.5 text-[26px] font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--color-text-soft)]">{label}</p>
    </div>
  )
}
