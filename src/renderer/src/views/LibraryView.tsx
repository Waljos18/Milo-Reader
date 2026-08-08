import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ePub, { type Book } from 'epubjs'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { BookWithProgress } from '@shared/types'

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const COVER_MAX_WIDTH = 300

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Mi biblioteca</h2>
        <button
          onClick={handleAddBooks}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm text-white"
        >
          Agregar libros
        </button>
      </div>

      {loading && <p className="text-[var(--color-text-soft)]">Cargando...</p>}

      {!loading && books.length === 0 && (
        <p className="text-[var(--color-text-soft)]">
          Todavia no agregaste ningun libro. Usa &quot;Agregar libros&quot; para importar EPUB o
          PDF.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {books.map((book) => (
          <Link
            key={book.id}
            to={`/reader/${book.id}`}
            className="flex flex-col rounded-md border border-[var(--color-border)] p-3 hover:bg-[var(--color-bg-soft)]"
          >
            <div className="mb-2 flex h-40 items-center justify-center overflow-hidden rounded bg-[var(--color-bg-mute)] text-xs uppercase text-[var(--color-text-soft)]">
              {covers[book.id] ? (
                <img
                  src={covers[book.id]}
                  alt={book.title}
                  className="h-full w-full object-contain"
                />
              ) : (
                book.format
              )}
            </div>
            <span className="truncate text-sm font-medium">{book.title}</span>
            {book.progress && (
              <span className="text-xs text-[var(--color-text-soft)]">
                {Math.round(book.progress.percentComplete)}%
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
