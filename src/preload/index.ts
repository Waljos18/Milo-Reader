import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  chooseLibraryFolder: () => ipcRenderer.invoke('settings:chooseLibraryFolder'),
  setTheme: (theme: string) => ipcRenderer.invoke('settings:setTheme', theme),
  setReaderTheme: (readerTheme: string) =>
    ipcRenderer.invoke('settings:setReaderTheme', readerTheme),
  setFontFamily: (fontFamily: string) => ipcRenderer.invoke('settings:setFontFamily', fontFamily),
  setFontSize: (fontSize: number) => ipcRenderer.invoke('settings:setFontSize', fontSize),
  setLineSpacing: (lineSpacing: number) =>
    ipcRenderer.invoke('settings:setLineSpacing', lineSpacing),
  setColumns: (columns: number) => ipcRenderer.invoke('settings:setColumns', columns),
  getBooks: () => ipcRenderer.invoke('library:getBooks'),
  addBooks: () => ipcRenderer.invoke('library:addBooks'),
  updateMetadata: (bookId: string, title: string, author: string | null) =>
    ipcRenderer.invoke('library:updateMetadata', bookId, title, author),
  getBook: (bookId: string) => ipcRenderer.invoke('library:getBook', bookId),
  getBookFile: (bookId: string) => ipcRenderer.invoke('library:getBookFile', bookId),
  getProgress: (bookId: string) => ipcRenderer.invoke('library:getProgress', bookId),
  saveProgress: (bookId: string, currentLocation: string, percentComplete: number) =>
    ipcRenderer.invoke('library:saveProgress', bookId, currentLocation, percentComplete),
  addAnnotation: (input: unknown) => ipcRenderer.invoke('annotations:add', input),
  listAnnotationsForBook: (bookId: string) => ipcRenderer.invoke('annotations:listForBook', bookId),
  deleteAnnotation: (highlightId: string) => ipcRenderer.invoke('annotations:delete', highlightId),
  listAllAnnotations: () => ipcRenderer.invoke('annotations:listAll'),
  addBookmark: (input: unknown) => ipcRenderer.invoke('bookmarks:add', input),
  listBookmarksForBook: (bookId: string) => ipcRenderer.invoke('bookmarks:listForBook', bookId),
  deleteBookmark: (bookmarkId: string) => ipcRenderer.invoke('bookmarks:delete', bookmarkId),
  startReadingSession: (bookId: string) => ipcRenderer.invoke('sessions:start', bookId),
  endReadingSession: (sessionId: string, locationsRead: number) =>
    ipcRenderer.invoke('sessions:end', sessionId, locationsRead),
  getReadingStats: () => ipcRenderer.invoke('stats:get'),
  saveCover: (bookId: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('library:saveCover', bookId, bytes),
  getCoverFile: (bookId: string) => ipcRenderer.invoke('library:getCoverFile', bookId),
  translateText: (text: string) => ipcRenderer.invoke('translation:translate', text),
  lookupWord: (word: string) => ipcRenderer.invoke('dictionary:lookup', word),
  searchCatalog: (query: string, page: number) => ipcRenderer.invoke('catalog:search', query, page),
  getCatalogCover: (url: string) => ipcRenderer.invoke('catalog:getCover', url),
  downloadCatalogBook: (book: unknown) => ipcRenderer.invoke('catalog:download', book)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
