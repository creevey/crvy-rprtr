import { join } from 'path'

import { ApproveRequestBodySchema, safeParse } from '../schemas.ts'
import type { Images, TestData } from '../types.ts'
import { copyFilePortable, respondWithFile } from './file-utils.ts'

export interface RoutesContext {
  reportData: {
    isRunning: boolean
    tests: Record<string, TestData>
    browsers: string[]
    isUpdateMode: boolean
    screenshotDir: string
  }
  staticDir: string
  saveReport: () => Promise<void>
}

export const LIVE_UPDATES_WEBSOCKET_PATH = '/'

export function isWebSocketUpgradeRequest(req: Request): boolean {
  return (
    new URL(req.url).pathname === LIVE_UPDATES_WEBSOCKET_PATH &&
    req.headers.get('upgrade')?.toLowerCase() === 'websocket'
  )
}

async function handleRoot(ctx: RoutesContext): Promise<Response> {
  const html = await respondWithFile(join(ctx.staticDir, 'index.html'), 'text/html')
  return html ?? new Response('Not Found', { status: 404 })
}

async function handleAppCss(): Promise<Response> {
  const css = await respondWithFile('./src/client/app.css', 'text/css')
  return css ?? new Response('Not Found', { status: 404 })
}

async function handleSrcFiles(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/src/'.length)
  const filePath = `./src/${path}`
  const contentType =
    filePath.endsWith('.ts') || filePath.endsWith('.tsx')
      ? 'application/javascript'
      : filePath.endsWith('.css')
        ? 'text/css'
        : 'text/plain'
  const file = await respondWithFile(filePath, contentType)
  return file ?? new Response('Not Found', { status: 404 })
}

function handleApiReport(ctx: RoutesContext): Response {
  return Response.json(ctx.reportData)
}

async function updateBaseline(image: Images | undefined): Promise<void> {
  const approveFromPath = image?.approveFromPath
  const approveToPath = image?.approveToPath
  if (approveFromPath === undefined || approveToPath === undefined) return

  await copyFilePortable(approveFromPath, approveToPath)
  console.log(`  ✔ Updated baseline: ${approveToPath}`)
}

async function handleApiApprove(ctx: RoutesContext, req: Request): Promise<Response> {
  try {
    const rawBody: unknown = await req.json()
    const parsed = safeParse(ApproveRequestBodySchema, rawBody)
    if (!parsed) {
      console.error('Invalid approve request body', rawBody)
      return Response.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }
    const { id, retry, image } = parsed

    const test = ctx.reportData.tests[id]
    if (test !== null && test !== undefined) {
      test.approved ??= {}
      test.approved[image] = retry
      await ctx.saveReport()

      try {
        await updateBaseline(test.results?.[retry]?.images?.[image])
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`  ✗ Failed to update baseline: ${errorMsg}`)
      }

      console.log(`  ✔ Approved [${test.browser}] ${test.title} — ${image}`)
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
}

async function handleApiApproveAll(ctx: RoutesContext): Promise<Response> {
  let approvedCount = 0
  const baselineUpdates: Promise<void>[] = []

  Object.values(ctx.reportData.tests).forEach((test) => {
    if (!test?.results) return
    const approved: Record<string, number> = {}
    const lastRetry = test.results.length - 1
    const lastResult = test.results[lastRetry]
    if (!lastResult?.images) return
    Object.keys(lastResult.images).forEach((imageName) => {
      approved[imageName] = lastRetry
      approvedCount++

      baselineUpdates.push(
        updateBaseline(lastResult.images?.[imageName]).catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error(`  ✗ Failed to update baseline: ${errorMsg}`)
        }),
      )
    })
    test.approved = approved
  })

  await ctx.saveReport()
  await Promise.all(baselineUpdates)
  console.log(`  ✔ Approved all — ${approvedCount} image(s)`)
  return Response.json({ success: true })
}

async function handleApiImages(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/api/images/'.length)
  const imagePath = `./images/${path}`
  const file = await respondWithFile(imagePath)
  return file ?? Response.json({ error: 'Image not found' }, { status: 404 })
}

async function handleScreenshots(ctx: RoutesContext, req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/screenshots/'.length)
  const screenshotPath = `${ctx.reportData.screenshotDir}/${path}`
  const file = await respondWithFile(screenshotPath)
  return file ?? Response.json({ error: 'Screenshot not found' }, { status: 404 })
}

async function handleDist(ctx: RoutesContext, req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/dist/'.length)
  const filePath = join(ctx.staticDir, path)
  const contentType = filePath.endsWith('.css')
    ? 'text/css'
    : filePath.endsWith('.js')
      ? 'application/javascript'
      : filePath.endsWith('.svelte')
        ? 'text/plain'
        : 'application/octet-stream'
  const file = await respondWithFile(filePath, contentType)
  return file ?? new Response('Not Found', { status: 404 })
}

export function createRoutes(ctx: RoutesContext): Record<string, (req: Request) => Promise<Response>> {
  return {
    '/api/approve': (req: Request) => handleApiApprove(ctx, req),
    '/api/approve-all': () => handleApiApproveAll(ctx),
    '/api/report': async () => handleApiReport(ctx),
  }
}

export function handleHttpRequest(ctx: RoutesContext, req: Request): Promise<Response> {
  const pathname = new URL(req.url).pathname

  if (pathname === '/') {
    return handleRoot(ctx)
  }

  if (pathname === '/src/client/app.css') {
    return handleAppCss()
  }

  if (pathname.startsWith('/src/')) {
    return handleSrcFiles(req)
  }

  if (pathname === '/api/report') {
    return Promise.resolve(handleApiReport(ctx))
  }

  if (pathname === '/api/approve') {
    return handleApiApprove(ctx, req)
  }

  if (pathname === '/api/approve-all') {
    return handleApiApproveAll(ctx)
  }

  if (pathname.startsWith('/api/images/')) {
    return handleApiImages(req)
  }

  if (pathname.startsWith('/screenshots/')) {
    return handleScreenshots(ctx, req)
  }

  if (pathname.startsWith('/dist/')) {
    return handleDist(ctx, req)
  }

  return Promise.resolve(new Response('Not Found', { status: 404 }))
}
