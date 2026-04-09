import { realpathSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

function resolveRealPath(pathValue: string): string {
  try {
    return realpathSync.native(pathValue)
  } catch {
    return resolve(pathValue)
  }
}

export function isDirectExecution(moduleUrl: string): boolean {
  const entryPath = process.argv[1]
  if (entryPath === undefined) {
    return false
  }

  return (
    pathToFileURL(resolveRealPath(resolve(entryPath))).href ===
    pathToFileURL(resolveRealPath(fileURLToPath(moduleUrl))).href
  )
}
