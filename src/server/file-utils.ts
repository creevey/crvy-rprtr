import { access, copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, extname } from 'path'

function isFileNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (isFileNotFound(error)) {
      return false
    }

    throw error
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath)
    return stats.isDirectory()
  } catch (error) {
    if (isFileNotFound(error)) {
      return false
    }

    throw error
  }
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await readFile(filePath, 'utf8')
    if (raw.trim() === '') {
      return null
    }

    return JSON.parse(raw) as unknown
  } catch (error) {
    if (isFileNotFound(error)) {
      return null
    }

    throw error
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function copyFilePortable(sourcePath: string, destinationPath: string): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true })
  await copyFile(sourcePath, destinationPath)
}

function inferContentType(filePath: string): string | undefined {
  switch (extname(filePath).toLowerCase()) {
    case '.css':
      return 'text/css'
    case '.gif':
      return 'image/gif'
    case '.html':
      return 'text/html'
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg'
    case '.js':
      return 'application/javascript'
    case '.json':
      return 'application/json'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.txt':
      return 'text/plain'
    case '.webp':
      return 'image/webp'
    default:
      return undefined
  }
}

export async function respondWithFile(filePath: string, contentType?: string): Promise<Response | null> {
  try {
    const file = await readFile(filePath)
    const resolvedContentType = contentType ?? inferContentType(filePath)
    const headers = resolvedContentType === undefined ? undefined : { 'Content-Type': resolvedContentType }
    return new Response(file, { headers })
  } catch (error) {
    if (isFileNotFound(error)) {
      return null
    }

    throw error
  }
}
