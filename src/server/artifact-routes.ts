import { realpath } from 'fs/promises'
import { resolve } from 'path'

import { respondWithFile } from './file-utils.ts'
import type { RoutesContext } from './routes.ts'
import { isPathWithinRoots } from './utils.ts'

async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path)
  } catch {
    return null
  }
}

export async function handleFile(ctx: RoutesContext, req: Request): Promise<Response> {
  const notFound = (): Response => new Response('Not Found', { status: 404 })

  let decodedPath: string
  try {
    decodedPath = resolve(decodeURIComponent(new URL(req.url).pathname.slice('/file/'.length)))
  } catch {
    return notFound()
  }

  // Resolve symlinks on BOTH the target and the roots before the containment check:
  // resolve() is lexical, but readFile would follow a symlink out of an allowed root.
  const realTarget = await realpathOrNull(decodedPath)
  if (realTarget === null) {
    return notFound()
  }

  const realRoots = (await Promise.all((ctx.artifactRoots ?? []).map((root) => realpathOrNull(resolve(root))))).filter(
    (root): root is string => root !== null,
  )

  if (!isPathWithinRoots(realTarget, realRoots)) {
    return notFound()
  }

  try {
    const file = await respondWithFile(realTarget)
    return file ?? notFound()
  } catch {
    // e.g. EISDIR when the resolved target is a directory inside an allowed root.
    return notFound()
  }
}
