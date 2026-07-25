import { randomUUID } from 'crypto'
import { getDb, persist } from './database'
import type {
  AnnotationEntry,
  Book,
  Bookmark,
  BookWithProgress,
  GlobalAnnotationEntry,
  Highlight,
  NewAnnotationInput,
  NewBookmarkInput,
  Note,
  ReadingProgress,
  ReadingSession,
  ReadingStatsSummary
} from '../../shared/types'

type SqlRow = Record<string, string | number | null>

function toBookWithProgress(row: SqlRow): BookWithProgress {
  return {
    id: row.id as string,
    title: row.title as string,
    author: (row.author as string | null) ?? null,
    filePath: row.file_path as string,
    format: row.format as Book['format'],
    coverPath: (row.cover_path as string | null) ?? null,
    addedAt: row.added_at as string,
    lastOpenedAt: (row.last_opened_at as string | null) ?? null,
    totalLocations: (row.total_locations as number | null) ?? null,
    progress: row.current_location
      ? {
          bookId: row.id as string,
          currentLocation: row.current_location as string,
          percentComplete: row.percent_complete as number,
          updatedAt: row.progress_updated_at as string
        }
      : null
  }
}

export function getSetting(key: string): string | null {
  const stmt = getDb().prepare('SELECT value FROM app_settings WHERE key = :key')
  stmt.bind({ ':key': key })
  const value = stmt.step() ? (stmt.getAsObject().value as string) : null
  stmt.free()
  return value
}

export function setSetting(key: string, value: string): void {
  getDb().run(
    `INSERT INTO app_settings (key, value) VALUES (:key, :value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    { ':key': key, ':value': value }
  )
  persist()
}

export function listBooks(): BookWithProgress[] {
  const stmt = getDb().prepare(`
    SELECT b.*, rp.current_location, rp.percent_complete, rp.updated_at AS progress_updated_at
    FROM book b
    LEFT JOIN reading_progress rp ON rp.book_id = b.id
    ORDER BY b.last_opened_at IS NULL, b.last_opened_at DESC, b.added_at DESC
  `)
  const books: BookWithProgress[] = []
  while (stmt.step()) {
    books.push(toBookWithProgress(stmt.getAsObject() as SqlRow))
  }
  stmt.free()
  return books
}

export function getBookById(id: string): BookWithProgress | null {
  const stmt = getDb().prepare(`
    SELECT b.*, rp.current_location, rp.percent_complete, rp.updated_at AS progress_updated_at
    FROM book b
    LEFT JOIN reading_progress rp ON rp.book_id = b.id
    WHERE b.id = :id
  `)
  stmt.bind({ ':id': id })
  const book = stmt.step() ? toBookWithProgress(stmt.getAsObject() as SqlRow) : null
  stmt.free()
  return book
}

export function touchLastOpened(id: string): void {
  getDb().run('UPDATE book SET last_opened_at = :now WHERE id = :id', {
    ':now': new Date().toISOString(),
    ':id': id
  })
  persist()
}

export function saveProgress(
  bookId: string,
  currentLocation: string,
  percentComplete: number
): void {
  getDb().run(
    `INSERT INTO reading_progress (book_id, current_location, percent_complete, updated_at)
     VALUES (:bookId, :currentLocation, :percentComplete, :updatedAt)
     ON CONFLICT(book_id) DO UPDATE SET
       current_location = excluded.current_location,
       percent_complete = excluded.percent_complete,
       updated_at = excluded.updated_at`,
    {
      ':bookId': bookId,
      ':currentLocation': currentLocation,
      ':percentComplete': percentComplete,
      ':updatedAt': new Date().toISOString()
    }
  )
  persist()
}

export function getProgress(bookId: string): ReadingProgress | null {
  const stmt = getDb().prepare('SELECT * FROM reading_progress WHERE book_id = :bookId')
  stmt.bind({ ':bookId': bookId })
  let progress: ReadingProgress | null = null
  if (stmt.step()) {
    const row = stmt.getAsObject() as SqlRow
    progress = {
      bookId: row.book_id as string,
      currentLocation: row.current_location as string,
      percentComplete: row.percent_complete as number,
      updatedAt: row.updated_at as string
    }
  }
  stmt.free()
  return progress
}

export function addBook(book: Omit<Book, 'id' | 'addedAt' | 'lastOpenedAt'>): Book {
  const id = randomUUID()
  const addedAt = new Date().toISOString()
  getDb().run(
    `INSERT INTO book (id, title, author, file_path, format, cover_path, added_at, last_opened_at, total_locations)
     VALUES (:id, :title, :author, :filePath, :format, :coverPath, :addedAt, NULL, :totalLocations)`,
    {
      ':id': id,
      ':title': book.title,
      ':author': book.author,
      ':filePath': book.filePath,
      ':format': book.format,
      ':coverPath': book.coverPath,
      ':addedAt': addedAt,
      ':totalLocations': book.totalLocations
    }
  )
  persist()
  return { ...book, id, addedAt, lastOpenedAt: null }
}

export function setCoverPath(bookId: string, coverPath: string): void {
  getDb().run('UPDATE book SET cover_path = :coverPath WHERE id = :id', {
    ':coverPath': coverPath,
    ':id': bookId
  })
  persist()
}

export function addHighlightWithNote(input: NewAnnotationInput): {
  highlight: Highlight
  note: Note | null
} {
  const highlightId = randomUUID()
  const createdAt = new Date().toISOString()

  getDb().run(
    `INSERT INTO highlight (id, book_id, location, selected_text, color, created_at)
     VALUES (:id, :bookId, :location, :selectedText, :color, :createdAt)`,
    {
      ':id': highlightId,
      ':bookId': input.bookId,
      ':location': input.location,
      ':selectedText': input.selectedText,
      ':color': input.color,
      ':createdAt': createdAt
    }
  )

  let note: Note | null = null
  if (input.noteText) {
    const noteId = randomUUID()
    getDb().run(
      `INSERT INTO note (id, book_id, highlight_id, location, text, created_at)
       VALUES (:id, :bookId, :highlightId, :location, :text, :createdAt)`,
      {
        ':id': noteId,
        ':bookId': input.bookId,
        ':highlightId': highlightId,
        ':location': input.location,
        ':text': input.noteText,
        ':createdAt': createdAt
      }
    )
    note = {
      id: noteId,
      bookId: input.bookId,
      highlightId,
      location: input.location,
      text: input.noteText,
      createdAt
    }
  }

  persist()
  return {
    highlight: {
      id: highlightId,
      bookId: input.bookId,
      location: input.location,
      selectedText: input.selectedText,
      color: input.color,
      createdAt
    },
    note
  }
}

export function deleteHighlightCascade(highlightId: string): void {
  getDb().run('DELETE FROM note WHERE highlight_id = :id', { ':id': highlightId })
  getDb().run('DELETE FROM highlight WHERE id = :id', { ':id': highlightId })
  persist()
}

export function listHighlightsForBook(bookId: string): AnnotationEntry[] {
  const stmt = getDb().prepare(`
    SELECT h.id AS h_id, h.location AS h_location, h.selected_text, h.color, h.created_at AS h_created_at,
           n.id AS n_id, n.text AS n_text, n.created_at AS n_created_at
    FROM highlight h
    LEFT JOIN note n ON n.highlight_id = h.id
    WHERE h.book_id = :bookId
    ORDER BY h.created_at ASC
  `)
  stmt.bind({ ':bookId': bookId })

  const entries: AnnotationEntry[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as SqlRow
    entries.push({
      highlight: {
        id: row.h_id as string,
        bookId,
        location: row.h_location as string,
        selectedText: row.selected_text as string,
        color: row.color as string,
        createdAt: row.h_created_at as string
      },
      note: row.n_id
        ? {
            id: row.n_id as string,
            bookId,
            highlightId: row.h_id as string,
            location: row.h_location as string,
            text: row.n_text as string,
            createdAt: row.n_created_at as string
          }
        : null
    })
  }
  stmt.free()
  return entries
}

function toBookmark(row: SqlRow): Bookmark {
  return {
    id: row.id as string,
    bookId: row.book_id as string,
    location: row.location as string,
    label: (row.label as string | null) ?? null,
    createdAt: row.created_at as string
  }
}

export function addBookmark(input: NewBookmarkInput): Bookmark {
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  getDb().run(
    `INSERT INTO bookmark (id, book_id, location, label, created_at)
     VALUES (:id, :bookId, :location, :label, :createdAt)`,
    {
      ':id': id,
      ':bookId': input.bookId,
      ':location': input.location,
      ':label': input.label,
      ':createdAt': createdAt
    }
  )
  persist()
  return {
    id,
    bookId: input.bookId,
    location: input.location,
    label: input.label,
    createdAt
  }
}

export function listBookmarksForBook(bookId: string): Bookmark[] {
  const stmt = getDb().prepare(`
    SELECT * FROM bookmark
    WHERE book_id = :bookId
    ORDER BY created_at ASC
  `)
  stmt.bind({ ':bookId': bookId })
  const bookmarks: Bookmark[] = []
  while (stmt.step()) {
    bookmarks.push(toBookmark(stmt.getAsObject() as SqlRow))
  }
  stmt.free()
  return bookmarks
}

export function deleteBookmark(bookmarkId: string): void {
  getDb().run('DELETE FROM bookmark WHERE id = :id', { ':id': bookmarkId })
  persist()
}

export function startReadingSession(bookId: string): ReadingSession {
  const id = randomUUID()
  const startedAt = new Date().toISOString()
  getDb().run(
    `INSERT INTO reading_session (id, book_id, started_at, ended_at, locations_read)
     VALUES (:id, :bookId, :startedAt, NULL, 0)`,
    { ':id': id, ':bookId': bookId, ':startedAt': startedAt }
  )
  persist()
  return { id, bookId, startedAt, endedAt: null, locationsRead: 0 }
}

export function endReadingSession(sessionId: string, locationsRead: number): void {
  getDb().run(
    `UPDATE reading_session
     SET ended_at = :endedAt, locations_read = :locationsRead
     WHERE id = :id AND ended_at IS NULL`,
    {
      ':id': sessionId,
      ':endedAt': new Date().toISOString(),
      ':locationsRead': Math.max(0, Math.floor(locationsRead))
    }
  )
  persist()
}

/** Cierra sesiones huérfanas (p. ej. cierre brusco de la app) para no inflar el tiempo. */
export function closeOrphanSessions(): void {
  getDb().run(
    `UPDATE reading_session
     SET ended_at = started_at
     WHERE ended_at IS NULL`
  )
  persist()
}

export function getReadingStats(): ReadingStatsSummary {
  const stmt = getDb().prepare(`
    SELECT s.id, s.book_id, s.started_at, s.ended_at, s.locations_read,
           b.title AS book_title, rp.percent_complete
    FROM reading_session s
    JOIN book b ON b.id = s.book_id
    LEFT JOIN reading_progress rp ON rp.book_id = s.book_id
    WHERE s.ended_at IS NOT NULL
    ORDER BY s.started_at DESC
  `)

  type SessionRow = {
    id: string
    bookId: string
    bookTitle: string
    startedAt: string
    endedAt: string
    locationsRead: number
    percentComplete: number | null
  }

  const rows: SessionRow[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as SqlRow
    rows.push({
      id: row.id as string,
      bookId: row.book_id as string,
      bookTitle: row.book_title as string,
      startedAt: row.started_at as string,
      endedAt: row.ended_at as string,
      locationsRead: (row.locations_read as number) ?? 0,
      percentComplete: (row.percent_complete as number | null) ?? null
    })
  }
  stmt.free()

  const byBookMap = new Map<
    string,
    {
      bookId: string
      bookTitle: string
      totalSeconds: number
      locationsRead: number
      sessionCount: number
      percentComplete: number | null
    }
  >()

  let totalSeconds = 0
  let totalLocationsRead = 0

  for (const row of rows) {
    const seconds = Math.max(
      0,
      Math.round((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000)
    )
    totalSeconds += seconds
    totalLocationsRead += row.locationsRead

    const existing = byBookMap.get(row.bookId)
    if (existing) {
      existing.totalSeconds += seconds
      existing.locationsRead += row.locationsRead
      existing.sessionCount += 1
      existing.percentComplete = row.percentComplete
    } else {
      byBookMap.set(row.bookId, {
        bookId: row.bookId,
        bookTitle: row.bookTitle,
        totalSeconds: seconds,
        locationsRead: row.locationsRead,
        sessionCount: 1,
        percentComplete: row.percentComplete
      })
    }
  }

  const byBook = Array.from(byBookMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds)

  const dayMap = new Map<string, { seconds: number; locationsRead: number }>()
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { seconds: 0, locationsRead: 0 })
  }

  for (const row of rows) {
    const key = row.startedAt.slice(0, 10)
    const bucket = dayMap.get(key)
    if (!bucket) continue
    const seconds = Math.max(
      0,
      Math.round((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000)
    )
    bucket.seconds += seconds
    bucket.locationsRead += row.locationsRead
  }

  return {
    totalSeconds,
    totalLocationsRead,
    sessionCount: rows.length,
    booksRead: byBook.length,
    byBook,
    recentDays: Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      seconds: data.seconds,
      locationsRead: data.locationsRead
    }))
  }
}

export function listAllAnnotations(): GlobalAnnotationEntry[] {
  const stmt = getDb().prepare(`
    SELECT h.id AS h_id, h.book_id, h.location AS h_location, h.selected_text, h.color, h.created_at AS h_created_at,
           n.id AS n_id, n.text AS n_text, n.created_at AS n_created_at,
           b.title AS book_title
    FROM highlight h
    JOIN book b ON b.id = h.book_id
    LEFT JOIN note n ON n.highlight_id = h.id
    ORDER BY h.created_at DESC
  `)

  const entries: GlobalAnnotationEntry[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as SqlRow
    const bookId = row.book_id as string
    entries.push({
      bookId,
      bookTitle: row.book_title as string,
      highlight: {
        id: row.h_id as string,
        bookId,
        location: row.h_location as string,
        selectedText: row.selected_text as string,
        color: row.color as string,
        createdAt: row.h_created_at as string
      },
      note: row.n_id
        ? {
            id: row.n_id as string,
            bookId,
            highlightId: row.h_id as string,
            location: row.h_location as string,
            text: row.n_text as string,
            createdAt: row.n_created_at as string
          }
        : null
    })
  }
  stmt.free()
  return entries
}
