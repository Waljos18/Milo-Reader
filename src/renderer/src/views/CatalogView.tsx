import { useEffect, useState } from 'react'
import type { CatalogBook } from '@shared/types'
import { coverColorFor } from '@renderer/lib/bookCover'

export default function CatalogView(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [books, setBooks] = useState<CatalogBook[]>([])
  const [hasNext, setHasNext] = useState(false)
  const [hasPrevious, setHasPrevious] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [covers, setCovers] = useState<Record<number, string>>({})
  const [libraryTitles, setLibraryTitles] = useState<Set<string>>(new Set())
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    window.api.getBooks().then((existing) => {
      setLibraryTitles(new Set(existing.map((b) => b.title.toLowerCase())))
    })
  }, [])

  const runSearch = async (searchPage: number): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.searchCatalog(query, searchPage)
      setBooks(result.books)
      setHasNext(result.hasNext)
      setHasPrevious(result.hasPrevious)
      setPage(searchPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar en el catalogo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Se difiere a un microtask para no llamar setState de forma sincronica dentro del efecto
    // (runSearch actualiza `loading` como primer paso). Busquedas siguientes las dispara el
    // form o la paginacion, no este efecto.
    queueMicrotask(() => runSearch(1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCovers(): Promise<void> {
      for (const book of books) {
        if (cancelled || !book.coverUrl || covers[book.gutenbergId]) continue
        const bytes = await window.api.getCatalogCover(book.coverUrl)
        if (cancelled || !bytes) continue
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer]))
        setCovers((prev) => ({ ...prev, [book.gutenbergId]: url }))
      }
    }

    loadCovers()

    return () => {
      cancelled = true
    }
    // `covers` se lee solo para saltear libros ya cargados, no debe reiniciar el loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    runSearch(1)
  }

  const handleDownload = async (book: CatalogBook): Promise<void> => {
    setDownloadingId(book.gutenbergId)
    setError(null)
    try {
      await window.api.downloadCatalogBook(book)
      setAddedIds((prev) => new Set(prev).add(book.gutenbergId))
      setLibraryTitles((prev) => new Set(prev).add(book.title.toLowerCase()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al descargar el libro')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div>
      <h2 className="font-serif text-[32px] font-semibold tracking-tight">Catálogo</h2>
      <p className="mt-1.5 mb-6 text-[13.5px] text-[var(--color-text-soft)]">
        Miles de libros gratuitos de Project Gutenberg, listos para leer.
      </p>

      <form onSubmit={handleSubmit} className="relative mb-7 max-w-[480px]">
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-faint)"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por titulo o autor..."
          className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-3 pl-[42px] pr-4 text-[13.5px] shadow-[var(--shadow-sm)]"
        />
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      {loading && <p className="text-[var(--color-text-soft)]">Buscando...</p>}

      {!loading && books.length === 0 && !error && (
        <p className="text-[var(--color-text-soft)]">Sin resultados.</p>
      )}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {books.map((book) => {
          const alreadyInLibrary =
            addedIds.has(book.gutenbergId) || libraryTitles.has(book.title.toLowerCase())
          const isDownloading = downloadingId === book.gutenbergId

          return (
            <div key={book.gutenbergId} className="flex flex-col">
              <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] shadow-[var(--shadow-sm)]">
                {covers[book.gutenbergId] ? (
                  <img
                    src={covers[book.gutenbergId]}
                    alt={book.title}
                    className="h-full w-full bg-[var(--color-bg-mute)] object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-end p-4"
                    style={{ background: coverColorFor(String(book.gutenbergId)) }}
                  >
                    <div className="absolute inset-2.5 rounded-lg border border-white/30" />
                    <span className="relative z-10 mb-2 text-[9px] font-bold uppercase tracking-[.12em] text-white/80">
                      EPUB
                    </span>
                    <div className="relative z-10 mt-auto">
                      <div className="font-serif text-[17px] font-semibold leading-tight text-white/95">
                        {book.title}
                      </div>
                      <div className="mt-2 h-px w-7 bg-white/30" />
                      <div className="mt-2 text-[10.5px] text-white/80">
                        {book.author ?? 'Autor desconocido'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-2.5 truncate text-[13px] font-semibold" title={book.title}>
                {book.title}
              </div>
              <div className="font-serif truncate text-[11.5px] italic text-[var(--color-text-soft)]">
                {book.author ?? 'Autor desconocido'}
              </div>
              {alreadyInLibrary ? (
                <button
                  disabled
                  className="mt-2.5 flex items-center justify-center gap-1.5 rounded-full bg-[var(--color-accent-2-soft)] py-1.5 text-[11.5px] font-semibold text-[var(--color-accent-2)]"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  En tu biblioteca
                </button>
              ) : (
                <button
                  onClick={() => handleDownload(book)}
                  disabled={isDownloading}
                  className="mt-2.5 rounded-full border-[1.5px] border-[var(--color-accent)] py-1.5 text-[11.5px] font-semibold text-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  {isDownloading ? 'Descargando...' : 'Agregar a biblioteca'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {books.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={() => runSearch(page - 1)}
            disabled={!hasPrevious || loading}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-[13px] font-medium disabled:opacity-40"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Anterior
          </button>
          <span className="text-[13px] text-[var(--color-text-soft)]">Página {page}</span>
          <button
            onClick={() => runSearch(page + 1)}
            disabled={!hasNext || loading}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2 text-[13px] font-medium disabled:opacity-40"
          >
            Siguiente
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
