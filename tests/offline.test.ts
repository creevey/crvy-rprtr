import { describe, test, expect, afterEach, beforeEach } from 'bun:test'
import { existsSync, unlinkSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'

import { OfflineReportSchema, safeParse } from '../src/schemas'
import type { OfflineReport } from '../src/schemas'

const TEST_WORKER_INDEX = '99'
const TEST_REPORT_PATH = `./crvy-rprtr-${TEST_WORKER_INDEX}.json`
const TEST_ARTIFACT_PATH = './test-crvy-rprtr.html'
const TEST_SCREENSHOT_DIR = './test-offline-screenshots'
const TEST_SNAPSHOT_DIR = 'tests/example.spec.ts-snapshots'

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
      if (existsSync(TEST_ARTIFACT_PATH)) {
        unlinkSync(TEST_ARTIFACT_PATH)
      }
    } catch {}
  })

  afterEach(async () => {
    try {
      await rm(TEST_SCREENSHOT_DIR, { recursive: true, force: true })
      await rm(TEST_SNAPSHOT_DIR, { recursive: true, force: true })
      if (existsSync(TEST_REPORT_PATH)) {
        await rm(TEST_REPORT_PATH)
      }
      if (existsSync(TEST_ARTIFACT_PATH)) {
        await rm(TEST_ARTIFACT_PATH)
      }
    } catch {}
    process.env.TEST_WORKER_INDEX = originalWorkerIndex
  })

  test('reporter enters offline mode when WebSocket server unavailable', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    // Cast to access private methods for testing
    type TestReporter = {
      connect: () => void
      onTestBegin: (test: object) => void
      onTestEnd: (test: object, result: object) => Promise<void>
      onEnd: (result: { status: string }) => Promise<void>
    }
    const reporterAny = reporter as unknown as TestReporter

    reporterAny.connect()

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
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    type TestReporter = {
      connect: () => void
      onEnd: (result: { status: string }) => Promise<void>
    }
    const reporterAny = reporter as unknown as TestReporter

    reporterAny.connect()

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

  test('reporter enters offline mode when WebSocket is unavailable in the runtime', async () => {
    const { CrvyRprtr } = await import('../src/reporter')
    const originalWebSocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')
    Object.defineProperty(globalThis, 'WebSocket', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    try {
      const reporter = new CrvyRprtr({
        serverUrl: 'ws://localhost:3000',
        screenshotDir: TEST_SCREENSHOT_DIR,
        reportHtmlPath: TEST_ARTIFACT_PATH,
      })

      type TestReporter = {
        connect: () => void
        onEnd: (result: { status: string }) => Promise<void>
      }
      const reporterAny = reporter as unknown as TestReporter

      reporterAny.connect()
      await reporterAny.onEnd({ status: 'passed' })

      expect(existsSync(TEST_REPORT_PATH)).toBe(true)

      const reportContent = await readFile(TEST_REPORT_PATH, 'utf-8')
      const parsed: unknown = JSON.parse(reportContent)
      const report = assertValidOfflineReport(parsed)

      expect(report.events).toHaveLength(1)
      expect(report.events[0]?.type).toBe('run-end')
    } finally {
      if (originalWebSocketDescriptor !== undefined) {
        Object.defineProperty(globalThis, 'WebSocket', originalWebSocketDescriptor)
      }
    }
  })

  test('includes visualNames for named screenshot steps without attachments', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    const sent: unknown[] = []

    type TestReporter = {
      send: (message: unknown) => void
      onTestEnd: (test: object, result: object) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (message: unknown): void => {
      sent.push(message)
    }

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-named',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: 'chromium' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot(header.png)"', steps: [] }],
          },
        ],
      },
    )

    expect(sent).toHaveLength(1)
    expect((sent[0] as { data: { visualNames: string[] } }).data.visualNames).toEqual(['header'])
  })

  test('copies a named screenshot baseline with a .png-suffixed attachment path', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    await mkdir(TEST_SNAPSHOT_DIR, { recursive: true })
    await writeFile(join(TEST_SNAPSHOT_DIR, `header-chromium-${process.platform}.png`), 'baseline image')

    const sent: unknown[] = []

    type TestReporter = {
      send: (message: unknown) => void
      onTestEnd: (test: object, result: object) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (message: unknown): void => {
      sent.push(message)
    }

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-named-copy',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: 'chromium' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot(header.png)"', steps: [] }],
          },
        ],
      },
    )

    expect(sent).toHaveLength(1)
    expect((sent[0] as { data: { visualNames: string[] } }).data.visualNames).toEqual(['header'])
    expect(
      (sent[0] as { data: { attachments: Array<{ name: string; path: string }> } }).data.attachments,
    ).toMatchObject([
      {
        name: 'header-expected.png',
        path: 'test-visual-named-copy/header-expected.png',
      },
    ])
  })

  test('copies a named screenshot baseline when the project name is empty', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    await mkdir(TEST_SNAPSHOT_DIR, { recursive: true })
    await writeFile(join(TEST_SNAPSHOT_DIR, `header-${process.platform}.png`), 'baseline image')

    const sent: unknown[] = []

    type TestReporter = {
      send: (message: unknown) => void
      onTestEnd: (test: object, result: object) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (message: unknown): void => {
      sent.push(message)
    }

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-empty-project',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: '' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot(header.png)"', steps: [] }],
          },
        ],
      },
    )

    expect(sent).toHaveLength(1)
    expect(
      (sent[0] as { data: { attachments: Array<{ name: string; path: string }> } }).data.attachments,
    ).toMatchObject([
      {
        name: 'header-expected.png',
        path: 'test-visual-empty-project/header-expected.png',
      },
    ])
  })

  test('copies a named screenshot baseline for multi-segment screenshot names', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    await mkdir(join(TEST_SNAPSHOT_DIR, 'dir'), { recursive: true })
    await writeFile(join(TEST_SNAPSHOT_DIR, 'dir', `header-chromium-${process.platform}.png`), 'baseline image')

    const sent: unknown[] = []

    type TestReporter = {
      send: (message: unknown) => void
      onTestEnd: (test: object, result: object) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (message: unknown): void => {
      sent.push(message)
    }

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-nested-copy',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: 'chromium' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot(dir/header.png)"', steps: [] }],
          },
        ],
      },
    )

    expect(sent).toHaveLength(1)
    expect((sent[0] as { data: { visualNames: string[] } }).data.visualNames).toEqual(['dir/header'])
    expect(
      (sent[0] as { data: { attachments: Array<{ name: string; path: string }> } }).data.attachments,
    ).toMatchObject([
      {
        name: 'dir/header-expected.png',
        path: 'test-visual-nested-copy/dir/header-expected.png',
      },
    ])
  })

  test('normalizes Windows-style screenshot names to forward slashes in offline attachments', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    await mkdir(join(TEST_SNAPSHOT_DIR, 'dir'), { recursive: true })
    await writeFile(join(TEST_SNAPSHOT_DIR, 'dir', `header-chromium-${process.platform}.png`), 'baseline image')

    const sent: unknown[] = []

    type TestReporter = {
      send: (message: unknown) => void
      onTestEnd: (test: object, result: object) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (message: unknown): void => {
      sent.push(message)
    }

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-windows-nested-copy',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: 'chromium' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot(dir\\header.png)"', steps: [] }],
          },
        ],
      },
    )

    expect(sent).toHaveLength(1)
    expect((sent[0] as { data: { visualNames: string[] } }).data.visualNames).toEqual(['dir/header'])
    expect(
      (sent[0] as { data: { attachments: Array<{ name: string; path: string }> } }).data.attachments,
    ).toMatchObject([
      {
        name: 'dir/header-expected.png',
        path: 'test-visual-windows-nested-copy/dir/header-expected.png',
      },
    ])
  })

  test('writes a synthetic visualName for unnamed screenshot steps into the offline payload', async () => {
    const { CrvyRprtr } = await import('../src/reporter')

    const reporter = new CrvyRprtr({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: TEST_SCREENSHOT_DIR,
      reportHtmlPath: TEST_ARTIFACT_PATH,
    })

    type TestReporter = {
      connect: () => void
      onTestBegin: (test: object) => void
      onTestEnd: (test: object, result: object) => Promise<void>
      onEnd: (result: { status: string }) => Promise<void>
    }

    const reporterAny = reporter as unknown as TestReporter
    reporterAny.connect()

    await Bun.sleep(100)

    reporterAny.onTestBegin({
      id: 'test-visual-unnamed',
      title: 'visual pass',
      location: { file: 'tests/example.spec.ts', line: 10 },
      parent: {
        title: 'Suite',
        type: 'describe',
        project: () => ({ name: 'chromium' }),
        parent: undefined,
      },
    })

    await reporterAny.onTestEnd(
      {
        id: 'test-visual-unnamed',
        title: 'visual pass',
        location: { file: 'tests/example.spec.ts', line: 10 },
        parent: {
          project: () => ({ name: 'chromium' }),
        },
      },
      {
        status: 'passed',
        errors: [],
        duration: 100,
        attachments: [],
        steps: [
          {
            title: 'outer step',
            steps: [{ title: 'Expect "toHaveScreenshot"', steps: [] }],
          },
        ],
      },
    )

    await reporterAny.onEnd({ status: 'passed' })

    const reportContent = await readFile(TEST_REPORT_PATH, 'utf-8')
    const parsed: unknown = JSON.parse(reportContent)
    const report = assertValidOfflineReport(parsed)
    const testEndEvent = report.events.find((event) => event.type === 'test-end')

    expect(testEndEvent).toBeDefined()
    expect((testEndEvent as { data: { visualNames: string[] } }).data.visualNames).toEqual(['__unnamed-screenshot-1'])
  })
})
