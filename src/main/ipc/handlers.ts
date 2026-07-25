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
import { detectFormat, importBookFile, saveCoverFile, titleFromFilename } from '../library'
import type { NewAnnotationInput, NewBookmarkInput } from '../../shared/types'

export async function registerIpcHandlers(mainWindow: BrowserWindow): Promise<void> {
  let config = loadConfig()
  await openDatabase(join(config.libraryFolder, 'library.db'))
  closeOrphanSessions()

  ipcMain.handle('settings:get', () => ({
    libraryFolder: config.libraryFolder,
    theme: getSetting('theme') ?? 'system',
    readerTheme: getSetting('readerTheme') ?? 'light'
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

  ipcMain.handle('bookmarks:listForBook', (_event, bookId: string) =>
    listBookmarksForBook(bookId)
  )

  ipcMain.handle('bookmarks:delete', (_event, bookmarkId: string) => deleteBookmark(bookmarkId))

  ipcMain.handle('sessions:start', (_event, bookId: string) => startReadingSession(bookId))

  ipcMain.handle(
    'sessions:end',
    (_event, sessionId: string, locationsRead: number) => {
      endReadingSession(sessionId, locationsRead)
    }
  )

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
}
