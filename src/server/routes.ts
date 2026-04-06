import { join } from 'path'

import { ApproveRequestBodySchema, safeParse } from '../schemas.ts'
import type { TestData } from '../types.ts'

export interface RoutesContext {
  reportData: {
    isRunning: boolean
    tests: Record<string, TestData>
    browsers: string[]
    isUpdateMode: boolean
    screenshotDir: string
  }
  packageDir: string
  saveReport: () => Promise<void>
}

function handleRoot(
  ctx: RoutesContext,
  req: Request,
  server: { upgrade: (req: Request) => boolean },
): Response | undefined {
  if (server.upgrade(req)) return
  const html = Bun.file(join(ctx.packageDir, '..', 'index.html'))
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}

function handleAppCss(): Response {
  const css = Bun.file('./src/client/app.css')
  return new Response(css, { headers: { 'Content-Type': 'text/css' } })
}

async function handleSrcFiles(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/src/'.length)
  const filePath = `./src/${path}`
  const file = Bun.file(filePath)
  if (await file.exists()) {
    const contentType =
      filePath.endsWith('.ts') || filePath.endsWith('.tsx')
        ? 'application/javascript'
        : filePath.endsWith('.css')
          ? 'text/css'
          : 'text/plain'
    return new Response(file, { headers: { 'Content-Type': contentType } })
  }
  return new Response('Not Found', { status: 404 })
}

function handleApiReport(ctx: RoutesContext): Response {
  return Response.json(ctx.reportData)
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

      const actualUrl = test.results?.[retry]?.images?.[image]?.actual
      if (
        actualUrl !== null &&
        actualUrl !== undefined &&
        test.location?.file !== null &&
        test.location?.file !== undefined
      ) {
        const actualPath = actualUrl.replace('/screenshots/', `${ctx.reportData.screenshotDir}/`)
        const snapshotPath = `${test.location.file}-snapshots/${image}-${test.browser}-${process.platform}.png`
        try {
          await Bun.write(snapshotPath, Bun.file(actualPath))
          console.log(`  ✔ Updated baseline: ${snapshotPath}`)
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error(`  ✗ Failed to update baseline: ${errorMsg}`)
        }
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

      const actualUrl = lastResult.images?.[imageName]?.actual
      if (
        actualUrl !== null &&
        actualUrl !== undefined &&
        test.location?.file !== null &&
        test.location?.file !== undefined
      ) {
        const actualPath = actualUrl.replace('/screenshots/', `${ctx.reportData.screenshotDir}/`)
        const snapshotPath = `${test.location.file}-snapshots/${imageName}-${test.browser}-${process.platform}.png`
        baselineUpdates.push(
          Bun.write(snapshotPath, Bun.file(actualPath))
            .then(() => {
              console.log(`  ✔ Updated baseline: ${snapshotPath}`)
            })
            .catch((err: unknown) => {
              const errorMsg = err instanceof Error ? err.message : String(err)
              console.error(`  ✗ Failed to update baseline: ${errorMsg}`)
            }),
        )
      }
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
  const file = Bun.file(imagePath)
  if (await file.exists()) {
    return new Response(file)
  }
  return Response.json({ error: 'Image not found' }, { status: 404 })
}

async function handleScreenshots(ctx: RoutesContext, req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/screenshots/'.length)
  const screenshotPath = `${ctx.reportData.screenshotDir}/${path}`
  const file = Bun.file(screenshotPath)
  if (await file.exists()) {
    return new Response(file)
  }
  return Response.json({ error: 'Screenshot not found' }, { status: 404 })
}

async function handleDist(ctx: RoutesContext, req: Request): Promise<Response> {
  const path = new URL(req.url).pathname.slice('/dist/'.length)
  const filePath = join(ctx.packageDir, '..', 'dist', path)
  const file = Bun.file(filePath)
  if (await file.exists()) {
    const contentType = filePath.endsWith('.css')
      ? 'text/css'
      : filePath.endsWith('.js')
        ? 'application/javascript'
        : filePath.endsWith('.svelte')
          ? 'text/plain'
          : 'application/octet-stream'
    return new Response(file, { headers: { 'Content-Type': contentType } })
  }
  return new Response('Not Found', { status: 404 })
}

export function createRoutes(
  ctx: RoutesContext,
): Record<
  string,
  (req: Request, server?: { upgrade: (req: Request) => boolean }) => Response | Promise<Response> | undefined
> {
  return {
    '/': (req, server) => handleRoot(ctx, req, server!),
    '/src/client/app.css': () => handleAppCss(),
    '/src/*': (req) => handleSrcFiles(req),
    '/api/report': () => handleApiReport(ctx),
    '/api/approve': (req) => handleApiApprove(ctx, req),
    '/api/approve-all': () => handleApiApproveAll(ctx),
    '/api/images/*': (req) => handleApiImages(req),
    '/screenshots/*': (req) => handleScreenshots(ctx, req),
    '/dist/*': (req) => handleDist(ctx, req),
  }
}
