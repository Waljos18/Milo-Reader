import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type { BookFormat } from '../shared/types'

export function booksDir(libraryFolder: string): string {
  const dir = join(libraryFolder, 'books')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function coversDir(libraryFolder: string): string {
  const dir = join(libraryFolder, 'covers')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Evita pisar un archivo existente agregando " (1)", " (2)", etc. al nombre base. */
function uniqueDestPath(dir: string, base: string, ext: string): string {
  let destName = `${base}${ext}`
  let destPath = join(dir, destName)
  let counter = 1
  while (existsSync(destPath)) {
    destName = `${base} (${counter})${ext}`
    destPath = join(dir, destName)
    counter++
  }
  return destPath
}

/** Copies a book into the library folder (so OneDrive/Drive syncs it too) and returns its new path. */
export function importBookFile(libraryFolder: string, sourcePath: string): string {
  const dir = booksDir(libraryFolder)
  const ext = extname(sourcePath)
  const base = basename(sourcePath, ext)
  const destPath = uniqueDestPath(dir, base, ext)
  copyFileSync(sourcePath, destPath)
  return destPath
}

/** Guarda un EPUB descargado (p. ej. del catalogo Gutendex) en la carpeta de biblioteca. */
export function importBookBuffer(libraryFolder: string, title: string, bytes: Uint8Array): string {
  const dir = booksDir(libraryFolder)
  const safeBase = title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'libro'
  const destPath = uniqueDestPath(dir, safeBase, '.epub')
  writeFileSync(destPath, bytes)
  return destPath
}

export function detectFormat(filePath: string): BookFormat | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.epub') return 'epub'
  if (ext === '.pdf') return 'pdf'
  return null
}

export function titleFromFilename(filePath: string): string {
  return basename(filePath, extname(filePath))
}

export function saveCoverFile(
  libraryFolder: string,
  bookId: string,
  bytes: Uint8Array,
  ext: string = 'png'
): string {
  const dir = coversDir(libraryFolder)
  const destPath = join(dir, `${bookId}.${ext}`)
  writeFileSync(destPath, bytes)
  return destPath
}
