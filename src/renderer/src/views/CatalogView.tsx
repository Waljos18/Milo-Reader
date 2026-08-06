import { useEffect, useState } from 'react'
import type { CatalogBook } from '@shared/types'

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
      <h2 className="mb-6 text-xl font-semibold">Catalogo (Project Gutenberg)</h2>

      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por titulo o autor..."
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white"
        >
          Buscar
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      {loading && <p className="text-[var(--color-text-soft)]">Buscando...</p>}

      {!loading && books.length === 0 && !error && (
        <p className="text-[var(--color-text-soft)]">Sin resultados.</p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {books.map((book) => {
          const alreadyInLibrary =
            addedIds.has(book.gutenbergId) || libraryTitles.has(book.title.toLowerCase())
          const isDownloading = downloadingId === book.gutenbergId

          return (
            <div
              key={book.gutenbergId}
              className="flex flex-col rounded-md border border-[var(--color-border)] p-3"
            >
              <div className="mb-2 flex h-40 items-center justify-center overflow-hidden rounded bg-[var(--color-bg-mute)] text-xs uppercase text-[var(--color-text-soft)]">
                {covers[book.gutenbergId] ? (
                  <img
                    src={covers[book.gutenbergId]}
                    alt={book.title}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  'epub'
                )}
              </div>
              <span className="truncate text-sm font-medium" title={book.title}>
                {book.title}
              </span>
              <span className="truncate text-xs text-[var(--color-text-soft)]">
                {book.author ?? 'Autor desconocido'}
              </span>
              <button
                onClick={() => handleDownload(book)}
                disabled={alreadyInLibrary || isDownloading}
                className="mt-2 rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                {alreadyInLibrary
                  ? 'En tu biblioteca'
                  : isDownloading
                    ? 'Descargando...'
                    : 'Agregar a biblioteca'}
              </button>
            </div>
          )
        })}
      </div>

      {books.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => runSearch(page - 1)}
            disabled={!hasPrevious || loading}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-[var(--color-text-soft)]">Pagina {page}</span>
          <button
            onClick={() => runSearch(page + 1)}
            disabled={!hasNext || loading}
            className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
