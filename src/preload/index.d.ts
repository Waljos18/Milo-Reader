import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AddBooksResult,
  AnnotationEntry,
  AppSettings,
  Bookmark,
  BookWithProgress,
  CatalogBook,
  CatalogSearchResult,
  DictionaryResult,
  GlobalAnnotationEntry,
  Highlight,
  NewAnnotationInput,
  NewBookmarkInput,
  Note,
  ReadingProgress,
  ReadingSession,
  ReadingStatsSummary,
  TranslationResult
} from '../shared/types'

export interface MiloReaderApi {
  getSettings: () => Promise<AppSettings>
  chooseLibraryFolder: () => Promise<string>
  setTheme: (theme: string) => Promise<void>
  setReaderTheme: (readerTheme: string) => Promise<void>
  setFontFamily: (fontFamily: string) => Promise<void>
  setFontSize: (fontSize: number) => Promise<void>
  setLineSpacing: (lineSpacing: number) => Promise<void>
  setColumns: (columns: number) => Promise<void>
  getBooks: () => Promise<BookWithProgress[]>
  addBooks: () => Promise<AddBooksResult>
  updateMetadata: (bookId: string, title: string, author: string | null) => Promise<void>
  getBook: (bookId: string) => Promise<BookWithProgress | null>
  getBookFile: (bookId: string) => Promise<Uint8Array>
  getProgress: (bookId: string) => Promise<ReadingProgress | null>
  saveProgress: (bookId: string, currentLocation: string, percentComplete: number) => Promise<void>
  addAnnotation: (input: NewAnnotationInput) => Promise<{ highlight: Highlight; note: Note | null }>
  listAnnotationsForBook: (bookId: string) => Promise<AnnotationEntry[]>
  deleteAnnotation: (highlightId: string) => Promise<void>
  listAllAnnotations: () => Promise<GlobalAnnotationEntry[]>
  addBookmark: (input: NewBookmarkInput) => Promise<Bookmark>
  listBookmarksForBook: (bookId: string) => Promise<Bookmark[]>
  deleteBookmark: (bookmarkId: string) => Promise<void>
  startReadingSession: (bookId: string) => Promise<ReadingSession>
  endReadingSession: (sessionId: string, locationsRead: number) => Promise<void>
  getReadingStats: () => Promise<ReadingStatsSummary>
  saveCover: (bookId: string, bytes: Uint8Array) => Promise<void>
  getCoverFile: (bookId: string) => Promise<Uint8Array | null>
  translateText: (text: string) => Promise<TranslationResult>
  lookupWord: (word: string) => Promise<DictionaryResult>
  searchCatalog: (query: string, page: number) => Promise<CatalogSearchResult>
  getCatalogCover: (url: string) => Promise<Uint8Array | null>
  downloadCatalogBook: (book: CatalogBook) => Promise<BookWithProgress[]>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: MiloReaderApi
  }
}
