import { describe, test, expect, afterEach, beforeEach } from 'bun:test'
import { existsSync, unlinkSync } from 'fs'
import { rm } from 'fs/promises'
import { readFile } from 'fs/promises'

import { OfflineReportSchema, safeParse } from '../src/schemas'
import type { OfflineReport } from '../src/schemas'

const TEST_WORKER_INDEX = '99'
const TEST_REPORT_PATH = `./creevey-offline-report-${TEST_WORKER_INDEX}.json`
const TEST_SCREENSHOT_DIR = './test-offline-screenshots'

function assertValidOfflineReport(value: unknown): OfflineReport {
  const parsed = safeParse(OfflineReportSchema, value)
  if (parsed === null) {
    throw new Error('Invalid offline report format')
  }
  return parsed
}

describe('Offline Mode', () => {
  const originalWorkerIndex = process.env.TEST_WORKER_INDEX

  beforeEach(() => {
    process.env.TEST_WORKER_INDEX = TEST_WORKER_INDEX
    try {
      if (existsSync(TEST_REPORT_PATH)) {
        unlinkSync(TEST_REPORT_PATH)
      }
    } catch {}
  })

  afterEach(async () => {
    try {
      if (existsSync(TEST_REPORT_PATH)) {
        await rm(TEST_REPORT_PATH)
      }
    } catch {}
    try {
      await rm(TEST_SCREENSHOT_DIR, { recursive: true, force: true })
    } catch {}
    process.env.TEST_WORKER_INDEX = originalWorkerIndex
  })

  test('reporter enters offline mode when WebSocket server unavailable', async () => {
    const { CreeveyReporter } = await import('../src/reporter')

    const reporter = new CreeveyReporter({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: './test-offline-screenshots',
    })

    // Cast to access private methods for testing
    type TestReporter = {
      onBegin: (config: object, suite: { allTests: () => object[] }) => Promise<void>
      onTestBegin: (test: object) => void
      onTestEnd: (test: object, result: object) => Promise<void>
      onEnd: (result: { status: string }) => Promise<void>
    }
    const reporterAny = reporter as unknown as TestReporter

    await reporterAny.onBegin({}, { allTests: () => [{ id: 'test-1' }] })

    await Bun.sleep(100)

    // Simulate test events via the public API
    reporterAny.onTestBegin({
      id: 'test-1',
      title: 'Test 1',
      location: { file: 'test.spec.ts', line: 10 },
      parent: {
        title: 'Suite',
        type: 'describe',
        project: () => ({ name: 'chromium' }),
        parent: undefined,
      },
    })

    await reporterAny.onTestEnd(
      {
        id: 'test-1',
        title: 'Test 1',
        location: { file: 'test.spec.ts', line: 10 },
        parent: {
          title: 'Suite',
          type: 'describe',
          project: () => ({ name: 'chromium' }),
          parent: undefined,
        },
      },
      { status: 'passed', errors: [], duration: 100, attachments: [], steps: [] },
    )

    await reporterAny.onEnd({ status: 'passed' })

    expect(existsSync(TEST_REPORT_PATH)).toBe(true)

    const reportContent = await readFile(TEST_REPORT_PATH, 'utf-8')
    const parsed: unknown = JSON.parse(reportContent)

    const report = assertValidOfflineReport(parsed)

    expect(report.version).toBe(1)
    expect(report.workers).toBe(100)
    expect(report.events).toHaveLength(3)
    expect(report.events[0]?.type).toBe('test-begin')
    expect(report.events[1]?.type).toBe('test-end')
    expect(report.events[2]?.type).toBe('run-end')
  })

  test('offline report contains run-end event even with no other events', async () => {
    const { CreeveyReporter } = await import('../src/reporter')

    const reporter = new CreeveyReporter({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: './test-offline-screenshots',
    })

    type TestReporter = {
      onBegin: (config: object, suite: { allTests: () => object[] }) => Promise<void>
      onEnd: (result: { status: string }) => Promise<void>
    }
    const reporterAny = reporter as unknown as TestReporter

    await reporterAny.onBegin({}, { allTests: () => [] })

    await Bun.sleep(100)

    await reporterAny.onEnd({ status: 'passed' })

    expect(existsSync(TEST_REPORT_PATH)).toBe(true)

    const reportContent = await readFile(TEST_REPORT_PATH, 'utf-8')
    const parsed: unknown = JSON.parse(reportContent)

    const report = assertValidOfflineReport(parsed)

    expect(report.version).toBe(1)
    expect(report.events).toHaveLength(1)
    expect(report.events[0]?.type).toBe('run-end')
  })
})
