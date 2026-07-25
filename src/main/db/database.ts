import initSqlJs, { type Database } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import schemaSql from './schema.sql?raw'

let db: Database | null = null
let dbFilePath: string | null = null

export async function openDatabase(filePath: string): Promise<void> {
  const SQL = await initSqlJs({
    // Electron reads files transparently out of app.asar, so this also
    // resolves correctly in a packaged build, not just in `npm run dev`.
    locateFile: (file) => join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', file)
  })

  dbFilePath = filePath
  mkdirSync(dirname(filePath), { recursive: true })
  const existing = existsSync(filePath) ? readFileSync(filePath) : undefined

  db = new SQL.Database(existing)
  db.run(schemaSql)
  persist()
}

export function persist(): void {
  if (!db || !dbFilePath) return
  writeFileSync(dbFilePath, Buffer.from(db.export()))
}

export function getDb(): Database {
  if (!db) throw new Error('La base de datos aun no fue inicializada')
  return db
}
