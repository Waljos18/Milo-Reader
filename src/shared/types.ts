export type BookFormat = 'epub' | 'pdf'

export interface Book {
  id: string
  title: string
  author: string | null
  filePath: string
  format: BookFormat
  coverPath: string | null
  addedAt: string
  lastOpenedAt: string | null
  totalLocations: number | null
}

export interface ReadingProgress {
  bookId: string
  currentLocation: string
  percentComplete: number
  updatedAt: string
}

export interface Bookmark {
  id: string
  bookId: string
  location: string
  label: string | null
  createdAt: string
}

export interface NewBookmarkInput {
  bookId: string
  location: string
  label: string | null
}

export interface Highlight {
  id: string
  bookId: string
  location: string
  selectedText: string
  color: string
  createdAt: string
}

export interface Note {
  id: string
  bookId: string
  highlightId: string | null
  location: string
  text: string
  createdAt: string
}

export interface ReadingSession {
  id: string
  bookId: string
  startedAt: string
  endedAt: string | null
  locationsRead: number
}

export interface BookReadingStats {
  bookId: string
  bookTitle: string
  totalSeconds: number
  locationsRead: number
  sessionCount: number
  percentComplete: number | null
}

export interface DailyReadingStats {
  date: string
  seconds: number
  locationsRead: number
}

export interface ReadingStatsSummary {
  totalSeconds: number
  totalLocationsRead: number
  sessionCount: number
  booksRead: number
  byBook: BookReadingStats[]
  recentDays: DailyReadingStats[]
}

export interface AppSettings {
  libraryFolder: string | null
  theme: 'light' | 'dark' | 'system'
  fontFamily: string
  fontSize: number
  lineSpacing: number
  columns: 1 | 2
}

export interface BookWithProgress extends Book {
  progress: ReadingProgress | null
}

export interface AnnotationEntry {
  highlight: Highlight
  note: Note | null
}

export interface GlobalAnnotationEntry extends AnnotationEntry {
  bookId: string
  bookTitle: string
}

export interface NewAnnotationInput {
  bookId: string
  location: string
  selectedText: string
  color: string
  noteText: string | null
}

/** Forma de `Highlight.location` para PDF: pagina + rects normalizados (0..1) relativos al recorte de la pagina. */
export interface PdfHighlightLocation {
  page: number
  rects: Array<{ x: number; y: number; w: number; h: number }>
}
