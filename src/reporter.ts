import { mkdir, copyFile, writeFile } from 'fs/promises'
import { join } from 'path'

import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter'
import pLimit from 'p-limit'

import { writeReportArtifact } from './report-artifact.ts'
import { extractScreenshotNames } from './reporter-utils.ts'

const MAX_CONCURRENT_FILE_OPS = 5

export interface CreeveyReporterOptions {
  serverUrl?: string
  screenshotDir?: string
  offlineReportPath?: string
  reportHtmlPath?: string
}

interface AttachmentData {
  name: string
  path: string
  contentType: string
}

export class CreeveyReporter implements Reporter {
  private ws: WebSocket | null = null
  private serverUrl: string
  private screenshotDir: string
  private queue: string[] = []
  private workerIndex: number
  private offlineReportPath: string
  private reportHtmlPath: string
  private isOfflineMode = false
  private hadOfflineMode = false
  private runEvents: Array<{ type: 'test-begin' | 'test-end' | 'run-end'; data: unknown }> = []

  constructor(options: CreeveyReporterOptions = {}) {
    this.serverUrl = options.serverUrl ?? 'ws://localhost:3000'
    this.screenshotDir = options.screenshotDir ?? './screenshots'
    this.workerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? '0', 10) || 0
    this.offlineReportPath = options.offlineReportPath ?? `./creevey-offline-report-${this.workerIndex}.json`
    this.reportHtmlPath = options.reportHtmlPath ?? './creevey-report.html'
  }

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    console.log(`[CreeveyReporter] Starting run with ${suite.allTests().length} tests`)
    await mkdir(this.screenshotDir, { recursive: true })
    this.connect()
  }

  private connect(): void {
    const WebSocketConstructor = globalThis.WebSocket
    if (typeof WebSocketConstructor !== 'function') {
      console.log('[CreeveyReporter] WebSocket unavailable in current runtime; offline mode enabled')
      this.enableOfflineMode()
      return
    }

    try {
      this.ws = new WebSocketConstructor(this.serverUrl)
      this.ws.onopen = (): void => {
        console.log('[CreeveyReporter] Connected to Creevey server')
        this.isOfflineMode = false
        for (const msg of this.queue) this.ws!.send(msg)
        this.queue = []
      }
      this.ws.onerror = (error): void => {
        console.error('[CreeveyReporter] WebSocket error:', error)
        this.enableOfflineMode()
      }
      this.ws.onclose = (): void => {
        console.log('[CreeveyReporter] Disconnected from Creevey server')
        this.enableOfflineMode()
      }
    } catch (e) {
      console.error('[CreeveyReporter] Failed to connect:', e)
      this.enableOfflineMode()
    }
  }

  private enableOfflineMode(): void {
    if (!this.isOfflineMode) {
      this.isOfflineMode = true
      this.hadOfflineMode = true
      console.log('[CreeveyReporter] Offline mode enabled - events will be queued to file')
    }
  }

  onTestBegin(test: TestCase): void {
    const titlePath: string[] = []
    let suite: Suite | undefined = test.parent
    while (suite && suite.type === 'describe') {
      titlePath.unshift(suite.title)
      suite = suite.parent
    }
    this.send({
      type: 'test-begin',
      data: {
        id: test.id,
        title: test.title,
        titlePath,
        browser: test.parent.project()?.name ?? 'chromium',
        location: {
          file: test.location.file,
          line: test.location.line,
        },
      },
    })
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const savedAttachments = await this.saveAttachments(test.id, result)
    await this.copySnapshotBaselines(test, result, savedAttachments)

    this.send({
      type: 'test-end',
      data: {
        id: test.id,
        title: test.title,
        status: result.status,
        attachments: savedAttachments,
        error: result.errors.length > 0 ? result.errors[0]?.message : undefined,
        duration: result.duration,
      },
    })
  }

  private async copySnapshotBaselines(
    test: TestCase,
    result: TestResult,
    savedAttachments: AttachmentData[],
  ): Promise<void> {
    if (result.status !== 'passed') return
    const snapshotNames = extractScreenshotNames(result.steps)
    if (snapshotNames.length === 0) return

    const projectName = test.parent.project()?.name ?? 'chromium'
    const snapshotDir = `${test.location.file}-snapshots`
    const testScreenshotDir = join(this.screenshotDir, this.sanitizeId(test.id))
    const limit = pLimit(MAX_CONCURRENT_FILE_OPS)

    const copyPromises = snapshotNames.map((name) =>
      limit(async () => {
        const baseName = name.replace(/\.png$/, '')
        const snapshotPath = join(snapshotDir, `${baseName}-${projectName}-${process.platform}.png`)
        const destName = `${baseName}-expected`
        const destPath = join(testScreenshotDir, destName)
        try {
          await mkdir(testScreenshotDir, { recursive: true })
          await copyFile(snapshotPath, destPath)
          savedAttachments.push({
            name: destName,
            path: `${this.sanitizeId(test.id)}/${destName}`,
            contentType: 'image/png',
          })
          console.log(`[CreeveyReporter] Attached baseline: ${snapshotPath}`)
        } catch {
          // baseline not found yet (first run), skip
        }
      }),
    )

    await Promise.all(copyPromises)
  }

  private async saveAttachments(testId: string, result: TestResult): Promise<AttachmentData[]> {
    const savedAttachments: AttachmentData[] = []
    const testScreenshotDir = join(this.screenshotDir, this.sanitizeId(testId))
    const limit = pLimit(MAX_CONCURRENT_FILE_OPS)

    const attachmentPromises = result.attachments
      .filter(
        (attachment): attachment is typeof attachment & { path: string } =>
          attachment.contentType === 'image/png' && attachment.path !== undefined,
      )
      .map((attachment) =>
        limit(async () => {
          try {
            await mkdir(testScreenshotDir, { recursive: true })
            const fileName = attachment.name
            const destPath = join(testScreenshotDir, fileName)
            await copyFile(attachment.path, destPath)
            const attachmentData: AttachmentData = {
              name: attachment.name,
              path: `${this.sanitizeId(testId)}/${fileName}`,
              contentType: attachment.contentType,
            }
            savedAttachments.push(attachmentData)
            console.log(`[CreeveyReporter] Saved screenshot: ${destPath}`)
          } catch (e) {
            console.error(`[CreeveyReporter] Failed to save screenshot: ${attachment.path}`, e)
            const fallbackData: AttachmentData = {
              name: attachment.name,
              path: attachment.path,
              contentType: attachment.contentType,
            }
            savedAttachments.push(fallbackData)
          }
        }),
      )

    await Promise.all(attachmentPromises)

    return savedAttachments
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9-_]/g, '_')
  }

  private async writeOfflineReport(): Promise<void> {
    if (this.runEvents.length === 0) {
      console.log('[CreeveyReporter] No offline events to write')
      return
    }

    try {
      const report = {
        version: 1,
        generatedAt: new Date().toISOString(),
        workers: this.workerIndex + 1,
        events: this.runEvents.map((e) => ({
          ...e,
          timestamp: Date.now(),
          workerIndex: this.workerIndex,
        })),
      }

      await writeFile(this.offlineReportPath, JSON.stringify(report, null, 2))
      console.log(`[CreeveyReporter] Wrote offline report: ${this.offlineReportPath}`)
    } catch (e) {
      console.error('[CreeveyReporter] Failed to write offline report:', e)
    }
  }

  private async writeStaticArtifact(): Promise<void> {
    try {
      await writeReportArtifact({
        events: this.runEvents,
        screenshotDir: this.screenshotDir,
        reportHtmlPath: this.reportHtmlPath,
      })
      console.log(`[CreeveyReporter] Wrote report artifact: ${this.reportHtmlPath}`)
    } catch (e) {
      console.error('[CreeveyReporter] Failed to write report artifact:', e)
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    this.send({
      type: 'run-end',
      data: {
        status: result.status,
      },
    })

    await this.writeStaticArtifact()

    if (this.hadOfflineMode) {
      await this.writeOfflineReport()
    }

    await new Promise<void>((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }
      this.ws.onclose = (): void => {
        resolve()
      }
      setTimeout(() => {
        this.ws?.close()
        resolve()
      }, 1000)
      this.ws.close()
    })
  }

  private send(msg: object): void {
    const msgObj = msg as { type?: string; data?: unknown }
    if (msgObj.type === 'test-begin' || msgObj.type === 'test-end' || msgObj.type === 'run-end') {
      this.runEvents.push({
        type: msgObj.type,
        data: msgObj.data,
      })
    }

    const payload = JSON.stringify(msg)
    if (!this.isOfflineMode) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(payload)
      } else {
        this.queue.push(payload)
      }
    }
  }
}

export default CreeveyReporter
