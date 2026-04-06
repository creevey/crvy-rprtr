import type { ServerWebSocket } from 'bun'
import pLimit from 'p-limit'

import {
  LoadedReportDataSchema,
  OfflineReportSchema,
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
  /** Absolute path to the directory containing index.html and dist/ */
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

async function mergeOfflineReport(offlineReport: import('./schemas.ts').OfflineReport): Promise<void> {
  console.log(`[Server] Merging offline report from ${offlineReport.workers} worker(s)`)
  const limit = pLimit(MAX_CONCURRENT_FILE_OPS)

  const eventPromises = offlineReport.events.map((event) =>
    limit(() =>
      handleWebSocketMessage({
        type: event.type,
        data: event.data,
      } as WebSocketMessage),
    ),
  )

  await Promise.all(eventPromises)
}

async function loadOfflineReports(): Promise<void> {
  const workerIdx = parseInt(process.env.TEST_WORKER_INDEX ?? '0', 10)
  const patterns = [`creevey-offline-report-${workerIdx}.json`, 'creevey-offline-report.json']
  const limit = pLimit(MAX_CONCURRENT_FILE_OPS)

  const loadPromises = patterns.map((file) =>
    limit(async () => {
      const f = Bun.file(file)
      if (f.size > 0) {
        try {
          const raw: unknown = await f.json()
          const parsed = safeParse(OfflineReportSchema, raw)
          if (parsed && parsed.version === 1 && Array.isArray(parsed.events)) {
            console.log(`[Server] Loading offline report: ${file}`)
            void mergeOfflineReport(parsed)
          }
        } catch {
          // Skip invalid files
        }
      }
    }),
  )

  await Promise.all(loadPromises)
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

function runServer(port: number, packageDir: string): void {
  const routes = createRoutes({
    reportData,
    packageDir,
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

async function initData(options: ServerOptions): Promise<{ port: number; packageDir: string }> {
  const port = options.port ?? 3000
  reportData.screenshotDir = options.screenshotDir ?? './screenshots'
  reportPath = options.reportPath ?? './report.json'

  // Resolve static assets (index.html, dist/) relative to the package directory,
  // while user files (report.json, screenshots/) resolve relative to cwd.
  const packageDir = options.staticDir ?? import.meta.dir

  await loadReport()
  await loadOfflineReports()

  return { port, packageDir }
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const { port, packageDir } = await initData(options)
  runServer(port, packageDir)
}

// Auto-start when run directly (not imported)
if (import.meta.main) {
  await startServer()
}
