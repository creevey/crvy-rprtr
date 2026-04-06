import type { ServerWebSocket } from 'bun'

import type { TestBeginData, TestEndData } from '../schemas.ts'
import type { TestData, WebSocketMessage } from '../types.ts'
import { attachmentsToImages, broadcastToBrowsers, mapStatus } from './utils.ts'

export interface HandlerContext {
  reportData: {
    isRunning: boolean
    tests: Record<string, TestData>
    browsers: string[]
    isUpdateMode: boolean
    screenshotDir: string
  }
  wsClients: Set<ServerWebSocket>
  currentRunIds: Set<string>
  saveReport: () => Promise<void>
}

export function handleTestBegin(ctx: HandlerContext, data: TestBeginData): void {
  const { id, title, titlePath, browser, location } = data
  ctx.currentRunIds.add(id)
  ctx.reportData.tests[id] ??= {
    id,
    titlePath: titlePath ?? [],
    browser: browser ?? '',
    title: title ?? '',
    location,
    status: 'running',
  }
  console.log(`  ▶ [${browser ?? '?'}] ${title}`)
}

export function handleTestEnd(ctx: HandlerContext, data: TestEndData): void {
  const test = ctx.reportData.tests[data.id]
  if (test !== null && test !== undefined) {
    test.status = mapStatus(data.status)
    let images = attachmentsToImages(data.attachments)
    // For passing tests with no new attachments, preserve images from the
    // previous passing result (actual-only, no diff) so screenshot tests
    // remain visible across runs without re-uploading the baseline.
    if (data.status === 'passed' && Object.keys(images).length === 0) {
      const prev = test.results?.[0]?.images ?? {}
      if (
        Object.values(prev).some(
          (img) =>
            img !== null && img !== undefined && img.actual !== null && img.actual !== undefined && img.diff === null,
        )
      ) {
        images = prev
      }
    }
    // New failure with diff images invalidates any prior approval.
    const hasDiffs = Object.values(images).some((img) => img?.diff !== null && img?.diff !== undefined)
    if (hasDiffs) test.approved = null

    test.results = [
      {
        status: data.status === 'passed' ? 'success' : 'failed',
        retries: 0,
        images,
        error: data.error,
        duration: data.duration,
      },
    ]
    const icon = data.status === 'passed' ? '✓' : data.status === 'skipped' ? '–' : '✗'
    const dur = data.duration === null || data.duration === undefined ? '' : ` (${data.duration}ms)`
    const diffCount = Object.values(images).filter((img) => img?.diff !== null && img?.diff !== undefined).length
    const diffNote = diffCount > 0 ? ` [${diffCount} diff(s)]` : ''
    const errNote = data.error !== null && data.error !== undefined ? `\n    Error: ${data.error}` : ''
    console.log(`  ${icon} [${test.browser}] ${test.title}${dur}${diffNote}${errNote}`)
  }
  broadcastToBrowsers(ctx.wsClients, { type: 'test-update', data })
}

export async function handleRunEnd(ctx: HandlerContext, data: WebSocketMessage['data']): Promise<void> {
  ctx.reportData.isRunning = false
  // Remove tests that were not part of this run (stale entries from previous runs)
  ctx.reportData.tests = Object.fromEntries(
    Object.entries(ctx.reportData.tests).filter(([id]) => ctx.currentRunIds.has(id)),
  )
  ctx.currentRunIds.clear()
  await ctx.saveReport()
  const runTests = Object.values(ctx.reportData.tests).filter((t): t is TestData => t !== null && t !== undefined)
  const passed = runTests.filter((t) => t.status === 'success').length
  const failed = runTests.filter((t) => t.status === 'failed').length
  const pending = runTests.filter((t) => t.status === 'pending').length
  console.log(`\nRun complete — ${passed} passed, ${failed} failed, ${pending} skipped`)
  broadcastToBrowsers(ctx.wsClients, { type: 'run-end', data })
}

export function handleApprove(): void {
  // WebSocket approval messages are handled via HTTP /api/approve endpoint
  // This case handles any legacy or client-initiated WebSocket approval messages
  console.log('[Server] Received approve message via WebSocket (handled via HTTP API)')
}

export function handleSync(ctx: HandlerContext): void {
  // Sync messages request a state synchronization
  console.log('[Server] Received sync message')
  broadcastToBrowsers(ctx.wsClients, { type: 'sync', data: ctx.reportData })
}
