import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ePub, { type Book } from 'epubjs'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { BookWithProgress } from '@shared/types'
import { coverColorFor } from '@renderer/lib/bookCover'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const COVER_MAX_WIDTH = 300

type LibraryFilter = 'all' | 'reading' | 'finished'

async function resizeToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  const bitmap = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer]))
  const scale = Math.min(1, COVER_MAX_WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * `book.coverUrl()` de epubjs 0.3.93 usa `document.getElementById()` sobre el XML del OPF, que
 * no funciona sin DTD (la mayoria de los EPUB no tienen), asi que casi siempre devuelve null
 * aunque el libro declare portada. Se busca a mano en el manifest ya parseado (que si funciona,
 * porque se arma iterando `<item>` en vez de con getElementById).
 */
function findEpubCoverHref(book: Book): string | null {
  const items = Object.values(book.packaging.manifest)
  const byProperty = items.find((item) => item.properties?.includes('cover-image'))
  if (byProperty) return byProperty.href
  if (book.packaging.manifest.cover) return book.packaging.manifest.cover.href
  return null
}

async function generateEpubCover(fileBytes: Uint8Array): Promise<Uint8Array | null> {
  const book = ePub(fileBytes.buffer as ArrayBuffer)
  await book.ready
  const href = findEpubCoverHref(book)
  if (!href) return null

  const resolved = book.resolve(href)
  // No usar fetch() sobre una blob: URL: el CSP de la app (connect-src cae a default-src 'self')
  // lo bloquea. `archive.getBlob` lee el byte del zip en memoria directamente, sin red de por medio.
  const blob = book.archived
    ? await book.archive.getBlob(resolved)
    : await (await fetch(resolved)).blob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return resizeToPng(bytes)
}

interface ExtractedMetadata {
  title: string | null
  author: string | null
}

async function extractEpubMetadata(fileBytes: Uint8Array): Promise<ExtractedMetadata> {
  const book = ePub(fileBytes.buffer as ArrayBuffer)
  await book.ready
  const meta = book.packaging.metadata
  return {
    title: meta.title?.trim() || null,
    author: meta.creator?.trim() || null
  }
}

async function extractPdfMetadata(fileBytes: Uint8Array): Promise<ExtractedMetadata> {
  const doc = await getDocument({ data: fileBytes }).promise
  try {
    const { info } = await doc.getMetadata()
    const { Title, Author } = info as { Title?: string; Author?: string }
    return {
      title: Title?.trim() || null,
      author: Author?.trim() || null
    }
  } finally {
    doc.loadingTask.destroy()
  }
}

async function generatePdfCover(fileBytes: Uint8Array): Promise<Uint8Array | null> {
  const doc = await getDocument({ data: fileBytes }).promise
  try {
    const page = await doc.getPage(1)
    const unscaled = page.getViewport({ scale: 1 })
    const scale = COVER_MAX_WIDTH / unscaled.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    doc.loadingTask.destroy()
  }
}

export default function LibraryView(): React.JSX.Element {
  const [books, setBooks] = useState<BookWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<LibraryFilter>('all')

  useEffect(() => {
    window.api.getBooks().then((result) => {
      setBooks(result)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCovers(): Promise<void> {
      for (const book of books) {
        if (cancelled || covers[book.id]) continue

        if (!book.coverPath) {
          try {
            const fileBytes = await window.api.getBookFile(book.id)
            const cover =
              book.format === 'epub'
                ? await generateEpubCover(fileBytes)
                : await generatePdfCover(fileBytes)
            if (cover) await window.api.saveCover(book.id, cover)
          } catch {
            continue
          }
        }

        if (cancelled) return
        const fileBytes = await window.api.getCoverFile(book.id)
        if (cancelled || !fileBytes) continue
        const url = URL.createObjectURL(new Blob([fileBytes.buffer as ArrayBuffer]))
        setCovers((prev) => ({ ...prev, [book.id]: url }))
      }
    }

    loadCovers()

    return () => {
      cancelled = true
    }
    // `covers` se lee para saltear libros ya procesados, pero no debe disparar el efecto de
    // nuevo en cada portada que termina de cargar (reiniciaria el loop innecesariamente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books])

  const handleAddBooks = async (): Promise<void> => {
    const { books: updated, newBookIds } = await window.api.addBooks()
    setBooks(updated)

    for (const bookId of newBookIds) {
      const book = updated.find((b) => b.id === bookId)
      if (!book) continue

      try {
        const fileBytes = await window.api.getBookFile(bookId)
        const meta =
          book.format === 'epub'
            ? await extractEpubMetadata(fileBytes)
            : await extractPdfMetadata(fileBytes)
        if (!meta.title && !meta.author) continue

        const title = meta.title ?? book.title
        await window.api.updateMetadata(bookId, title, meta.author)
        setBooks((prev) =>
          prev.map((b) => (b.id === bookId ? { ...b, title, author: meta.author } : b))
        )
      } catch {
        continue
      }
    }
  }

  const readingCount = books.filter(
    (b) => b.progress && b.progress.percentComplete > 0 && b.progress.percentComplete < 99
  ).length

  const filteredBooks = books.filter((book) => {
    if (filter === 'all') return true
    const pct = book.progress?.percentComplete ?? 0
    if (filter === 'finished') return pct >= 99
    return pct > 0 && pct < 99
  })

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-[32px] font-semibold tracking-tight">Tu biblioteca</h2>
          <p className="mt-1.5 text-[13.5px] text-[var(--color-text-soft)]">
            {books.length} {books.length === 1 ? 'libro' : 'libros'}
            {readingCount > 0 && ` · ${readingCount} en progreso`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-[3px]">
            {(
              [
                ['all', 'Todos'],
                ['reading', 'Leyendo'],
                ['finished', 'Terminados']
              ] as [LibraryFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] ${
                  filter === value
                    ? 'bg-[var(--color-bg-elevated)] font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                    : 'font-medium text-[var(--color-text-soft)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleAddBooks}
            className="flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[var(--shadow-sm)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar libros
          </button>
        </div>
      </div>

      {loading && <p className="text-[var(--color-text-soft)]">Cargando...</p>}

      {!loading && books.length === 0 && (
        <p className="text-[var(--color-text-soft)]">
          Todavia no agregaste ningun libro. Usa &quot;Agregar libros&quot; para importar EPUB o
          PDF.
        </p>
      )}

      {!loading && books.length > 0 && filteredBooks.length === 0 && (
        <p className="text-[var(--color-text-soft)]">No hay libros en esta categoria.</p>
      )}

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filteredBooks.map((book) => {
          const pct = book.progress?.percentComplete ?? 0
          return (
            <Link key={book.id} to={`/reader/${book.id}`} className="flex flex-col gap-2.5">
              <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] shadow-[var(--shadow-sm)]">
                {covers[book.id] ? (
                  <img
                    src={covers[book.id]}
                    alt={book.title}
                    className="h-full w-full bg-[var(--color-bg-mute)] object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-end p-4"
                    style={{ background: coverColorFor(book.id) }}
                  >
                    <div className="absolute inset-2.5 rounded-lg border border-white/30" />
                    <span className="relative z-10 mb-2 text-[9px] font-bold uppercase tracking-[.12em] text-white/80">
                      {book.format}
                    </span>
                    <div className="relative z-10 mt-auto">
                      <div className="font-serif text-[17px] font-semibold leading-tight text-white/95">
                        {book.title}
                      </div>
                      <div className="mt-2 h-px w-7 bg-white/30" />
                      {book.author && (
                        <div className="mt-2 text-[10.5px] text-white/80">{book.author}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div className="truncate text-[13.5px] font-semibold">{book.title}</div>
                {book.author && (
                  <div className="font-serif truncate text-xs italic text-[var(--color-text-soft)]">
                    {book.author}
                  </div>
                )}
                {pct >= 99 ? (
                  <div className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">Terminado</div>
                ) : pct > 0 ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-bg-mute)]">
                    <div
                      className="h-full bg-[var(--color-accent)]"
                      style={{ width: `${Math.round(pct)}%` }}
                    />
                  </div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">
                    Sin empezar
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
