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
  libraryFolder: string
  theme: string
  readerTheme: string
  /** Solo aplica al lector EPUB; el PDF se renderiza como imagen y usa zoom en vez de tipografia. */
  fontFamily: ReaderFontId
  fontSize: number
  lineSpacing: number
  columns: 1 | 2
}

export interface BookWithProgress extends Book {
  progress: ReadingProgress | null
}

/** IDs de los libros recien insertados, para que el renderer pueda extraerles metadata real (EPUB/PDF corren epub.js/pdf.js del lado del renderer). */
export interface AddBooksResult {
  books: BookWithProgress[]
  newBookIds: string[]
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

export interface TranslationResult {
  translatedText: string
  detectedLanguage: string | null
}

export interface DictionaryResult {
  word: string
  language: 'en' | 'es'
  phonetic: string | null
  definitions: string[]
  synonyms: string[]
}

/** Juegos de fuente disponibles para el lector EPUB (compartido entre Ajustes y el lector). */
export const READER_FONT_OPTIONS = [
  { id: 'default', label: 'Predeterminada', family: '' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'sans', label: 'Sans-serif', family: '"Segoe UI", Arial, sans-serif' }
] as const

export type ReaderFontId = (typeof READER_FONT_OPTIONS)[number]['id']

export interface CatalogBook {
  gutenbergId: number
  title: string
  author: string | null
  coverUrl: string | null
  epubUrl: string
  languages: string[]
  downloadCount: number
}

export interface CatalogSearchResult {
  books: CatalogBook[]
  count: number
  hasNext: boolean
  hasPrevious: boolean
}
