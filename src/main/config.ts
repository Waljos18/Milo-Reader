import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'

export interface LocalConfig {
  libraryFolder: string
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

export function loadConfig(): LocalConfig {
  const path = configPath()
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8')) as LocalConfig
  }
  const config: LocalConfig = {
    libraryFolder: join(app.getPath('documents'), 'MiloReader')
  }
  saveConfig(config)
  return config
}

export function saveConfig(config: LocalConfig): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(config, null, 2))
}
