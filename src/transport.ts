import { copyFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

import pLimit from 'p-limit'

import type { Attachment, OfflineReport, WebSocketMessage } from './types.ts'

const MAX_CONCURRENT_FILE_OPS = 5

export interface CreeveyTransportOptions {
  serverUrl?: string
  screenshotDir?: string
  offlineReportPath?: string
}

export interface SavedAttachment extends Attachment {
  localPath: string
}

export interface CopyArtifact {
  contentType: string
  name: string
  sourcePath: string
}

export class CreeveyTransport {
  private ws: WebSocket | null = null
  private readonly serverUrl: string
  readonly screenshotDir: string
  private readonly offlineReportPath: string
  private readonly workerIndex: number
  private readonly limit = pLimit(MAX_CONCURRENT_FILE_OPS)
  private readonly queue: string[] = []
  private isOfflineMode = false
  private offlineEvents: Array<{ type: 'test-begin' | 'test-end' | 'run-end'; data: unknown }> = []

  constructor(options: CreeveyTransportOptions = {}) {
    this.serverUrl = options.serverUrl ?? 'ws://localhost:3000'
    this.screenshotDir = options.screenshotDir ?? './screenshots'
    this.workerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? '0', 10) || 0
    this.offlineReportPath = options.offlineReportPath ?? `./creevey-offline-report-${this.workerIndex}.json`
  }

  async start(): Promise<void> {
    await mkdir(this.screenshotDir, { recursive: true })
    this.connect()
  }

  sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9-_]/g, '_')
  }

  resolveSavedPath(relativePath: string): string {
    return join(this.screenshotDir, relativePath)
  }

  async saveArtifacts(testId: string, artifacts: CopyArtifact[]): Promise<SavedAttachment[]> {
    const savedAttachments: SavedAttachment[] = []
    const testScreenshotDirName = this.sanitizeId(testId)
    const testScreenshotDir = join(this.screenshotDir, testScreenshotDirName)

    const copyPromises = artifacts.map((artifact) =>
      this.limit(async () => {
        try {
          await mkdir(testScreenshotDir, { recursive: true })
          const relativePath = `${testScreenshotDirName}/${artifact.name}`
          const destPath = join(testScreenshotDir, artifact.name)
          await copyFile(artifact.sourcePath, destPath)
          savedAttachments.push({
            name: artifact.name,
            path: relativePath,
            contentType: artifact.contentType,
            localPath: destPath,
          })
        } catch (error) {
          console.error(`[CreeveyReporter] Failed to save screenshot: ${artifact.sourcePath}`, error)
          savedAttachments.push({
            name: artifact.name,
            path: artifact.sourcePath,
            contentType: artifact.contentType,
            localPath: artifact.sourcePath,
          })
        }
      }),
    )

    await Promise.all(copyPromises)

    return savedAttachments
  }

  send(message: WebSocketMessage): void {
    const payload = JSON.stringify(message)

    if (this.isOfflineMode) {
      if (message.type === 'test-begin' || message.type === 'test-end' || message.type === 'run-end') {
        this.offlineEvents.push({
          type: message.type,
          data: message.data,
        })
      }
      return
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload)
      return
    }

    this.queue.push(payload)
  }

  async finish(runEndData: WebSocketMessage['data']): Promise<void> {
    this.send({
      type: 'run-end',
      data: runEndData,
    })

    if (this.isOfflineMode) {
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

  private connect(): void {
    try {
      this.ws = new WebSocket(this.serverUrl)
      this.ws.onopen = (): void => {
        console.log('[CreeveyReporter] Connected to Creevey server')
        if (this.isOfflineMode) {
          this.offlineEvents = []
          this.isOfflineMode = false
        }
        for (const message of this.queue.splice(0)) {
          this.ws?.send(message)
        }
      }
      this.ws.onerror = (error): void => {
        console.error('[CreeveyReporter] WebSocket error:', error)
        this.enableOfflineMode()
      }
      this.ws.onclose = (): void => {
        console.log('[CreeveyReporter] Disconnected from Creevey server')
        this.enableOfflineMode()
      }
    } catch (error) {
      console.error('[CreeveyReporter] Failed to connect:', error)
      this.enableOfflineMode()
    }
  }

  private enableOfflineMode(): void {
    if (!this.isOfflineMode) {
      this.isOfflineMode = true
      console.log('[CreeveyReporter] Offline mode enabled - events will be queued to file')
    }
  }

  private async writeOfflineReport(): Promise<void> {
    const report: OfflineReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      workers: this.workerIndex + 1,
      events: this.offlineEvents.map((event) => ({
        ...event,
        timestamp: Date.now(),
        workerIndex: this.workerIndex,
      })),
    }

    try {
      await writeFile(this.offlineReportPath, JSON.stringify(report, null, 2))
      console.log(`[CreeveyReporter] Wrote offline report: ${this.offlineReportPath}`)
    } catch (error) {
      console.error('[CreeveyReporter] Failed to write offline report:', error)
    }
  }
}
