import { resolve } from 'path'

import { respondWithFile } from './file-utils.ts'
import type { RoutesContext } from './routes.ts'
import { isPathWithinRoots } from './utils.ts'

export async function handleFile(ctx: RoutesContext, req: Request): Promise<Response> {
  const encoded = new URL(req.url).pathname.slice('/file/'.length)
  let absolutePath: string
  try {
    absolutePath = resolve(decodeURIComponent(encoded))
  } catch {
    return new Response('Not Found', { status: 404 })
  }

  if (!isPathWithinRoots(absolutePath, ctx.artifactRoots ?? [])) {
    return new Response('Not Found', { status: 404 })
  }

  const file = await respondWithFile(absolutePath)
  return file ?? new Response('Not Found', { status: 404 })
}
