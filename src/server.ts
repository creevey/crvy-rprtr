import { dirname, join } from 'path'

import type { ServerWebSocket } from 'bun'
import pLimit from 'p-limit'

import { findOfflineReportPaths, mergeOfflineReportsIntoTests, parseOfflineReport } from './offline-reports.ts'
import {
  LoadedReportDataSchema,
  TestBeginDataSchema,
  TestEndDataSchema,
  WebSocketMessageSchema,
  safeParse,
} from './schemas.ts'
import {
  handleTestBegin,
  handleTestEnd,
  handleRunEnd,
  handleApprove,
  handleSync,
  createRoutes,
  type HandlerContext,
} from './server/index.ts'
import type { TestData, WebSocketMessage } from './types.ts'

const MAX_CONCURRENT_FILE_OPS = 5

export interface ServerOptions {
  port?: number
  screenshotDir?: string
  reportPath?: string
  offlineReportDir?: string
  /** Absolute path to the built web UI assets directory, or its parent directory */
  staticDir?: string
}

const wsClients = new Set<ServerWebSocket>()
const currentRunIds = new Set<string>()

interface ReportData {
  isRunning: boolean
  tests: Record<string, TestData>
  browsers: string[]
  isUpdateMode: boolean
  screenshotDir: string
}

const reportData: ReportData = {
  isRunning: false,
  tests: {},
  browsers: ['chromium'],
  isUpdateMode: false,
  screenshotDir: './screenshots',
}

let reportPath = './report.json'
let offlineReportDir = '.'

async function loadReport(): Promise<void> {
  try {
    const file = Bun.file(reportPath)
    if (file.size > 0) {
      const raw: unknown = await file.json()
      const parsed = safeParse(LoadedReportDataSchema, raw)
      if (parsed) {
        reportData.tests = parsed.tests ?? {}
        reportData.isUpdateMode = parsed.isUpdateMode ?? false
      }
    }
  } catch {
    console.log('No report.json found, using empty state')
  }
}

async function saveReport(): Promise<void> {
  await Bun.write(reportPath, JSON.stringify(reportData, null, 2))
}

async function loadOfflineReports(): Promise<void> {
  const offlineReportPaths = await findOfflineReportPaths(offlineReportDir)
  if (offlineReportPaths.length === 0) {
    return
  }

  const limit = pLimit(MAX_CONCURRENT_FILE_OPS)
  const reports = await Promise.all(
    offlineReportPaths.map((filePath) =>
      limit(async () => {
        const f = Bun.file(filePath)
        if (f.size > 0) {
          try {
            const raw: unknown = await f.json()
            const parsed = parseOfflineReport(raw)
            if (parsed !== null) {
              console.log(`[Server] Loading offline report: ${filePath}`)
              return parsed
            }
          } catch {
            // Skip invalid files
          }
        }

        return null
      }),
    ),
  )

  const validReports = reports.filter((report): report is import('./schemas.ts').OfflineReport => report !== null)
  if (validReports.length === 0) {
    return
  }

  reportData.tests = mergeOfflineReportsIntoTests(reportData.tests, validReports, {
    screenshotDir: reportData.screenshotDir,
    screenshotsBaseUrl: '/screenshots/',
  })
}

function getHandlerContext(): HandlerContext {
  return {
    reportData,
    wsClients,
    currentRunIds,
    saveReport,
  }
}

async function handleWebSocketMessage(msg: WebSocketMessage): Promise<void> {
  const ctx = getHandlerContext()
  switch (msg.type) {
    case 'test-begin': {
      const data = msg.data
      const parsed = safeParse(TestBeginDataSchema, data)
      if (!parsed) {
        console.error('Invalid test-begin message data', data)
        break
      }
      handleTestBegin(ctx, parsed)
      break
    }
    case 'test-end': {
      const data = msg.data
      const parsed = safeParse(TestEndDataSchema, data)
      if (!parsed) {
        console.error('Invalid test-end message data', data)
        break
      }
      handleTestEnd(ctx, parsed)
      break
    }
    case 'run-end': {
      await handleRunEnd(ctx, msg.data)
      break
    }
    case 'approve': {
      handleApprove()
      break
    }
    case 'sync': {
      handleSync(ctx)
      break
    }
  }
}

async function resolveStaticDir(staticDir?: string): Promise<string> {
  const candidates =
    staticDir === undefined
      ? [import.meta.dir, join(import.meta.dir, '..', 'dist')]
      : [staticDir, join(staticDir, 'dist')]

  const resolvedCandidates = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists: await Bun.file(join(candidate, 'index.html')).exists(),
    })),
  )

  const resolved = resolvedCandidates.find(({ exists }) => exists)
  if (resolved !== undefined) {
    return resolved.candidate
  }

  return candidates[0]!
}

function runServer(port: number, staticDir: string): void {
  const routes = createRoutes({
    reportData,
    staticDir,
    saveReport,
  })

  Bun.serve({
    port,
    routes,
    websocket: {
      open(ws) {
        wsClients.add(ws)
      },
      message(_ws, message) {
        try {
          const parsed: unknown = JSON.parse(message.toString())
          const wsMessage = safeParse(WebSocketMessageSchema, parsed)
          if (wsMessage) {
            handleWebSocketMessage(wsMessage).catch((err: unknown) => {
              const errorMsg = err instanceof Error ? err.message : String(err)
              console.error('Error handling WebSocket message:', errorMsg)
            })
          } else {
            console.error('Invalid WebSocket message: missing or invalid type', parsed)
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error('Invalid WebSocket message:', errorMsg)
        }
      },
      close(ws) {
        wsClients.delete(ws)
      },
    },
    development: {
      hmr: true,
      console: true,
    },
  })

  console.log(`Creevey Reporter started at http://localhost:${port}`)
}

async function initData(options: ServerOptions): Promise<{ port: number; staticDir: string }> {
  const port = options.port ?? 3000
  reportData.screenshotDir = options.screenshotDir ?? './screenshots'
  reportPath = options.reportPath ?? './report.json'
  offlineReportDir = options.offlineReportDir ?? dirname(reportPath)

  // Resolve built web assets relative to the current runtime layout,
  // while user files (report.json, screenshots/) resolve relative to cwd.
  const staticDir = await resolveStaticDir(options.staticDir)

  await loadReport()
  await loadOfflineReports()

  return { port, staticDir }
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const { port, staticDir } = await initData(options)
  runServer(port, staticDir)
}

// Auto-start when run directly (not imported)
if (import.meta.main) {
  await startServer()
}
