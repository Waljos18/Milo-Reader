import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadConfig, saveConfig } from '../config'
import { openDatabase } from '../db/database'
import {
  addBook,
  addBookmark,
  addHighlightWithNote,
  closeOrphanSessions,
  deleteBookmark,
  deleteHighlightCascade,
  endReadingSession,
  getBookById,
  getProgress,
  getReadingStats,
  getSetting,
  listAllAnnotations,
  listBookmarksForBook,
  listBooks,
  listHighlightsForBook,
  saveProgress,
  setCoverPath,
  setSetting,
  startReadingSession,
  touchLastOpened
} from '../db/repositories'
import {
  detectFormat,
  importBookBuffer,
  importBookFile,
  saveCoverFile,
  titleFromFilename
} from '../library'
import type {
  AppSettings,
  CatalogBook,
  DictionaryResult,
  NewAnnotationInput,
  NewBookmarkInput,
  ReaderFontId,
  TranslationResult
} from '../../shared/types'

// Limite practico por consulta de la API gratuita de MyMemory (evita requests rechazados por texto muy largo).
const TRANSLATE_MAX_CHARS = 480

const TYPOGRAPHY_DEFAULTS = {
  fontFamily: 'default' as ReaderFontId,
  fontSize: 100,
  lineSpacing: 1.5,
  columns: 1 as const
}

const GUTENDEX_BASE_URL = 'https://gutendex.com/books/'

/** Solo interesan libros con EPUB descargable; Gutendex tambien lista formatos sin ese link. */
function parseGutendexBook(raw: {
  id: number
  title?: string
  authors?: Array<{ name?: string }>
  languages?: string[]
  download_count?: number
  formats?: Record<string, string>
}): CatalogBook | null {
  const epubUrl = raw.formats?.['application/epub+zip']
  if (!epubUrl) return null

  return {
    gutenbergId: raw.id,
    title: raw.title ?? 'Sin titulo',
    author: raw.authors?.[0]?.name ?? null,
    coverUrl: raw.formats?.['image/jpeg'] ?? null,
    epubUrl,
    languages: raw.languages ?? [],
    downloadCount: raw.download_count ?? 0
  }
}

async function lookupEnglishWord(word: string): Promise<DictionaryResult | null> {
  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Diccionario fallo (HTTP ${response.status})`)

  const data = await response.json()
  const entry = Array.isArray(data) ? data[0] : null
  if (!entry) return null

  const phonetic: string | null =
    entry.phonetic ?? entry.phonetics?.find((p: { text?: string }) => p.text)?.text ?? null

  const definitions: string[] = []
  const synonyms = new Set<string>()
  for (const meaning of entry.meanings ?? []) {
    for (const def of meaning.definitions ?? []) {
      if (definitions.length < 8) {
        definitions.push(`[${meaning.partOfSpeech}] ${def.definition}`)
      }
      def.synonyms?.forEach((s: string) => synonyms.add(s))
    }
    meaning.synonyms?.forEach((s: string) => synonyms.add(s))
  }

  return {
    word: entry.word ?? word,
    language: 'en',
    phonetic,
    definitions,
    synonyms: Array.from(synonyms).slice(0, 10)
  }
}

/**
 * El extract de Wiktionary conserva los encabezados wikitexto ("== Español ==", "==== Sustantivo
 * femenino ====") como texto plano, y cada definicion numerada empieza siempre al inicio de una
 * linea nueva - eso es lo que permite separarlas de forma confiable procesando linea por linea
 * (unir todo en un solo string perderia esa señal, ya que numeros tambien aparecen dentro del
 * texto de algunas definiciones).
 */
function parseSpanishWiktionaryExtract(
  fullText: string
): { definitions: string[]; synonyms: string[] } | null {
  const lines = fullText.split('\n').map((l) => l.trim())
  const isLevel2Header = (l: string): boolean => /^==[^=].*[^=]==$/.test(l)

  const startIdx = lines.findIndex((l) => isLevel2Header(l) && /español/i.test(l))
  if (startIdx === -1) return null
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (isLevel2Header(lines[i])) {
      endIdx = i
      break
    }
  }
  const section = lines.slice(startIdx + 1, endIdx)

  const senses: Array<{ pos: string; text: string }> = []
  const synonyms = new Set<string>()
  let currentPos = ''
  let skippingEtimologia = false
  let afterPosHeaderInflectionLine = false

  for (const raw of section) {
    if (!raw) continue

    const headerMatch = raw.match(/^=+\s*(.+?)\s*=+$/)
    if (headerMatch) {
      const title = headerMatch[1]
      skippingEtimologia = /^etimolog/i.test(title)
      if (!skippingEtimologia) {
        currentPos = title
        afterPosHeaderInflectionLine = true
      }
      continue
    }
    if (skippingEtimologia) continue
    if (afterPosHeaderInflectionLine) {
      afterPosHeaderInflectionLine = false
      continue
    }

    const synMatch = raw.match(/^Sin[oó]nimos?:\s*(.+)$/i)
    if (synMatch) {
      synMatch[1].split(',').forEach((s) => synonyms.add(s.trim()))
      continue
    }
    if (/^(Uso|Ámbito|Nota|Ejemplos?):/i.test(raw)) continue

    const numberedMatch = raw.match(/^(\d{1,2})\.?\s*(.*)$/)
    if (numberedMatch) {
      senses.push({ pos: currentPos, text: numberedMatch[2] })
    } else if (senses.length > 0) {
      senses[senses.length - 1].text = `${senses[senses.length - 1].text} ${raw}`.trim()
    }
  }

  const cleaned = senses.map((s) => ({ pos: s.pos, text: s.text.trim() })).filter((s) => s.text)
  if (cleaned.length === 0) return null

  let lastPos = ''
  const definitions = cleaned.slice(0, 8).map((s) => {
    const label = s.pos !== lastPos ? `[${s.pos}] ` : ''
    lastPos = s.pos
    return `${label}${s.text}`
  })

  return { definitions, synonyms: Array.from(synonyms).slice(0, 10) }
}

async function lookupSpanishWord(word: string): Promise<DictionaryResult | null> {
  const url = `https://es.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&prop=extracts&format=json&formatversion=2&explaintext=1&redirects=1`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Diccionario fallo (HTTP ${response.status})`)

  const data = await response.json()
  const page = data?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) return null

  const parsed = parseSpanishWiktionaryExtract(page.extract)
  if (!parsed) return null

  return { word, language: 'es', phonetic: null, ...parsed }
}

export async function registerIpcHandlers(mainWindow: BrowserWindow): Promise<void> {
  let config = loadConfig()
  await openDatabase(join(config.libraryFolder, 'library.db'))
  closeOrphanSessions()

  ipcMain.handle('settings:get', (): AppSettings => ({
    libraryFolder: config.libraryFolder,
    theme: getSetting('theme') ?? 'system',
    readerTheme: getSetting('readerTheme') ?? 'light',
    fontFamily: (getSetting('fontFamily') as ReaderFontId | null) ?? TYPOGRAPHY_DEFAULTS.fontFamily,
    fontSize: Number(getSetting('fontSize') ?? TYPOGRAPHY_DEFAULTS.fontSize),
    lineSpacing: Number(getSetting('lineSpacing') ?? TYPOGRAPHY_DEFAULTS.lineSpacing),
    columns: (Number(getSetting('columns') ?? TYPOGRAPHY_DEFAULTS.columns) === 2 ? 2 : 1) as 1 | 2
  }))

  ipcMain.handle('settings:chooseLibraryFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return config.libraryFolder

    config = { libraryFolder: result.filePaths[0] }
    saveConfig(config)
    await openDatabase(join(config.libraryFolder, 'library.db'))
    return config.libraryFolder
  })

  ipcMain.handle('settings:setTheme', (_event, theme: string) => {
    setSetting('theme', theme)
  })

  ipcMain.handle('settings:setReaderTheme', (_event, readerTheme: string) => {
    setSetting('readerTheme', readerTheme)
  })

  ipcMain.handle('settings:setFontFamily', (_event, fontFamily: string) => {
    setSetting('fontFamily', fontFamily)
  })

  ipcMain.handle('settings:setFontSize', (_event, fontSize: number) => {
    setSetting('fontSize', String(fontSize))
  })

  ipcMain.handle('settings:setLineSpacing', (_event, lineSpacing: number) => {
    setSetting('lineSpacing', String(lineSpacing))
  })

  ipcMain.handle('settings:setColumns', (_event, columns: number) => {
    setSetting('columns', String(columns))
  })

  ipcMain.handle('library:getBooks', () => listBooks())

  ipcMain.handle('library:addBooks', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Libros', extensions: ['epub', 'pdf'] }]
    })
    if (result.canceled) return listBooks()

    for (const sourcePath of result.filePaths) {
      const format = detectFormat(sourcePath)
      if (!format) continue

      const destPath = importBookFile(config.libraryFolder, sourcePath)
      addBook({
        title: titleFromFilename(sourcePath),
        author: null,
        filePath: destPath,
        format,
        coverPath: null,
        totalLocations: null
      })
    }

    return listBooks()
  })

  ipcMain.handle('library:getBook', (_event, bookId: string) => {
    const book = getBookById(bookId)
    if (book) touchLastOpened(bookId)
    return book
  })

  ipcMain.handle('library:getBookFile', (_event, bookId: string) => {
    const book = getBookById(bookId)
    if (!book) throw new Error('Libro no encontrado')
    return new Uint8Array(readFileSync(book.filePath))
  })

  ipcMain.handle('library:getProgress', (_event, bookId: string) => getProgress(bookId))

  ipcMain.handle(
    'library:saveProgress',
    (_event, bookId: string, currentLocation: string, percentComplete: number) => {
      saveProgress(bookId, currentLocation, percentComplete)
    }
  )

  ipcMain.handle('annotations:add', (_event, input: NewAnnotationInput) =>
    addHighlightWithNote(input)
  )

  ipcMain.handle('annotations:listForBook', (_event, bookId: string) =>
    listHighlightsForBook(bookId)
  )

  ipcMain.handle('annotations:delete', (_event, highlightId: string) =>
    deleteHighlightCascade(highlightId)
  )

  ipcMain.handle('annotations:listAll', () => listAllAnnotations())

  ipcMain.handle('bookmarks:add', (_event, input: NewBookmarkInput) => addBookmark(input))

  ipcMain.handle('bookmarks:listForBook', (_event, bookId: string) => listBookmarksForBook(bookId))

  ipcMain.handle('bookmarks:delete', (_event, bookmarkId: string) => deleteBookmark(bookmarkId))

  ipcMain.handle('sessions:start', (_event, bookId: string) => startReadingSession(bookId))

  ipcMain.handle('sessions:end', (_event, sessionId: string, locationsRead: number) => {
    endReadingSession(sessionId, locationsRead)
  })

  ipcMain.handle('stats:get', () => getReadingStats())

  ipcMain.handle('library:saveCover', (_event, bookId: string, bytes: Uint8Array) => {
    const coverPath = saveCoverFile(config.libraryFolder, bookId, bytes)
    setCoverPath(bookId, coverPath)
  })

  ipcMain.handle('library:getCoverFile', (_event, bookId: string) => {
    const book = getBookById(bookId)
    if (!book?.coverPath) return null
    return new Uint8Array(readFileSync(book.coverPath))
  })

  ipcMain.handle(
    'translation:translate',
    async (_event, text: string): Promise<TranslationResult> => {
      const query = text.trim().slice(0, TRANSLATE_MAX_CHARS)
      if (!query) return { translatedText: '', detectedLanguage: null }

      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=autodetect|es`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Traduccion fallo (HTTP ${response.status})`)

      const data = await response.json()
      const translatedText: string = data?.responseData?.translatedText ?? ''
      if (translatedText.toUpperCase().includes('MYMEMORY WARNING')) {
        throw new Error('Limite diario de traducciones gratuitas alcanzado, proba mas tarde')
      }
      if (data?.responseStatus && data.responseStatus !== 200) {
        throw new Error(data.responseDetails || 'Traduccion fallo')
      }

      return {
        translatedText,
        detectedLanguage: data?.responseData?.detectedLanguage ?? null
      }
    }
  )

  ipcMain.handle(
    'dictionary:lookup',
    async (_event, rawWord: string): Promise<DictionaryResult> => {
      const word = rawWord
        .trim()
        .split(/\s+/)[0]
        ?.toLowerCase()
        .replace(/[^\p{L}'-]/gu, '')
      if (!word) throw new Error('Selecciona una sola palabra para ver su definicion')

      const english = await lookupEnglishWord(word)
      if (english) return english

      const spanish = await lookupSpanishWord(word)
      if (spanish) return spanish

      throw new Error(`No se encontro definicion para "${word}"`)
    }
  )

  ipcMain.handle('catalog:search', async (_event, query: string, page: number) => {
    const url = new URL(GUTENDEX_BASE_URL)
    if (query.trim()) url.searchParams.set('search', query.trim())
    url.searchParams.set('page', String(Math.max(1, page)))

    const response = await fetch(url.toString())
    if (!response.ok) throw new Error(`Catalogo fallo (HTTP ${response.status})`)
    const data = await response.json()

    const books = ((data.results ?? []) as Parameters<typeof parseGutendexBook>[0][])
      .map(parseGutendexBook)
      .filter((b): b is CatalogBook => b !== null)

    return {
      books,
      count: data.count ?? books.length,
      hasNext: Boolean(data.next),
      hasPrevious: Boolean(data.previous)
    }
  })

  ipcMain.handle(
    'catalog:getCover',
    async (_event, coverUrl: string): Promise<Uint8Array | null> => {
      const response = await fetch(coverUrl)
      if (!response.ok) return null
      return new Uint8Array(await response.arrayBuffer())
    }
  )

  ipcMain.handle('catalog:download', async (_event, book: CatalogBook) => {
    const epubResponse = await fetch(book.epubUrl)
    if (!epubResponse.ok) throw new Error(`Descarga fallo (HTTP ${epubResponse.status})`)
    const epubBytes = new Uint8Array(await epubResponse.arrayBuffer())

    const destPath = importBookBuffer(config.libraryFolder, book.title, epubBytes)
    const newBook = addBook({
      title: book.title,
      author: book.author,
      filePath: destPath,
      format: 'epub',
      coverPath: null,
      totalLocations: null
    })

    if (book.coverUrl) {
      try {
        const coverResponse = await fetch(book.coverUrl)
        if (coverResponse.ok) {
          const coverBytes = new Uint8Array(await coverResponse.arrayBuffer())
          const coverPath = saveCoverFile(config.libraryFolder, newBook.id, coverBytes, 'jpg')
          setCoverPath(newBook.id, coverPath)
        }
      } catch {
        // La portada es opcional: si falla, el libro ya quedo agregado sin ella.
      }
    }

    return listBooks()
  })
}
