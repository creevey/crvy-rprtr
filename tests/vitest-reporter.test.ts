import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { safeParse, OfflineReportSchema } from '../src/schemas'
import type { OfflineReport } from '../src/types'
import { CreeveyVitestReporter } from '../src/vitest'

interface MockVitestAttachment {
  contentType: string
  height: number
  name: string
  path: string
  width: number
}

interface MockVitestArtifact {
  attachments: MockVitestAttachment[]
  kind: 'visual-regression'
  message: string
  type: 'internal:toMatchScreenshot'
}

interface MockVitestDiagnostic {
  duration: number
}

interface MockVitestResult {
  errors: Array<{ message: string }>
  state: 'failed'
}

interface MockVitestCase {
  artifacts: () => MockVitestArtifact[]
  diagnostic: () => MockVitestDiagnostic
  id: string
  location: { column: number; line: number }
  module: { moduleId: string }
  name: string
  parent: {
    name: string
    parent: { type: 'module' }
    type: 'suite'
  }
  project: {
    config: {
      browser: {
        instances: Array<{ browser: string }>
      }
    }
    name: string
  }
  result: () => MockVitestResult
}

const cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'creevey-vitest-'))
  cleanupDirs.push(dir)
  return dir
}

function createTestCase(options: {
  artifacts: MockVitestArtifact[]
  browser?: string
  errors?: Array<{ message: string }>
  file: string
  id: string
  line?: number
  name: string
  suiteName?: string
}): MockVitestCase {
  const browser = options.browser ?? 'chromium'
  const suiteName = options.suiteName ?? 'visual'

  return {
    id: options.id,
    name: options.name,
    location: { line: options.line ?? 7, column: 1 },
    module: { moduleId: options.file },
    parent: {
      type: 'suite',
      name: suiteName,
      parent: { type: 'module' },
    },
    project: {
      name: browser,
      config: {
        browser: {
          instances: [{ browser }],
        },
      },
    },
    artifacts: (): MockVitestArtifact[] => options.artifacts,
    result: (): MockVitestResult => ({
      state: 'failed' as const,
      errors: options.errors ?? [{ message: 'visual mismatch' }],
    }),
    diagnostic: (): MockVitestDiagnostic => ({
      duration: 42,
    }),
  }
}

async function readOfflineReport(reportPath: string): Promise<OfflineReport | null> {
  const parsed: unknown = JSON.parse(await readFile(reportPath, 'utf-8'))
  return safeParse(OfflineReportSchema, parsed)
}

describe('CreeveyVitestReporter', () => {
  test('normalizes visual regression artifacts into Creevey images', async () => {
    const root = await createTempDir()
    const testFile = join(root, 'tests', 'hero.test.ts')
    const referencePath = join(
      root,
      'tests',
      '__screenshots__',
      'hero.test.ts',
      `hero-section-chromium-${process.platform}.png`,
    )
    const actualPath = join(
      root,
      '.vitest-attachments',
      'tests',
      'hero.test.ts',
      `hero-section-chromium-${process.platform}-actual.png`,
    )
    const diffPath = join(
      root,
      '.vitest-attachments',
      'tests',
      'hero.test.ts',
      `hero-section-chromium-${process.platform}-diff.png`,
    )
    const screenshotDir = join(root, 'creevey-screenshots')
    const reportPath = join(root, 'creevey-offline-report-0.json')

    await mkdir(dirname(referencePath), { recursive: true })
    await mkdir(dirname(actualPath), { recursive: true })
    await mkdir(dirname(diffPath), { recursive: true })
    await writeFile(referencePath, 'reference')
    await writeFile(actualPath, 'actual')
    await writeFile(diffPath, 'diff')

    const reporter = new CreeveyVitestReporter({
      serverUrl: 'ws://localhost:9999',
      screenshotDir,
      offlineReportPath: reportPath,
    })

    reporter.onInit({ config: { root } } as never)
    await reporter.onBrowserInit?.({ name: 'chromium' } as never)
    await Bun.sleep(100)

    const testCase = createTestCase({
      id: 'vitest-1',
      name: 'renders hero section',
      file: testFile,
      artifacts: [
        {
          type: 'internal:toMatchScreenshot',
          kind: 'visual-regression',
          message: 'mismatch',
          attachments: [
            { name: 'reference', path: referencePath, contentType: 'image/png', width: 100, height: 100 },
            { name: 'actual', path: actualPath, contentType: 'image/png', width: 100, height: 100 },
            { name: 'diff', path: diffPath, contentType: 'image/png', width: 100, height: 100 },
          ],
        },
      ],
    })

    reporter.onTestCaseReady?.(testCase as never)
    await reporter.onTestCaseResult?.(testCase as never)
    await reporter.onTestRunEnd?.([], [], 'failed')

    const report = await readOfflineReport(reportPath)
    expect(report).not.toBeNull()

    const event = report!.events[1] as { data: { images: Record<string, Record<string, string>> } }
    const image = event.data.images['hero-section']

    expect(image.actual).toBe('/screenshots/vitest-1/hero-section-actual.png')
    expect(image.expect).toBe('/screenshots/vitest-1/hero-section-expected.png')
    expect(image.diff).toBe('/screenshots/vitest-1/hero-section-diff.png')
    expect(image.approveToPath).toBe(referencePath)
    expect(image.approveFromPath).toBe(join(screenshotDir, 'vitest-1', 'hero-section-actual.png'))
  })

  test('uses expected screenshot as approval source on first run fallback', async () => {
    const root = await createTempDir()
    const testFile = join(root, 'tests', 'hero.test.ts')
    const referencePath = join(
      root,
      'tests',
      '__screenshots__',
      'hero.test.ts',
      `hero-section-chromium-${process.platform}.png`,
    )
    const screenshotDir = join(root, 'creevey-screenshots')
    const reportPath = join(root, 'creevey-offline-report-0.json')

    await mkdir(dirname(referencePath), { recursive: true })
    await writeFile(referencePath, 'reference')

    const reporter = new CreeveyVitestReporter({
      serverUrl: 'ws://localhost:9999',
      screenshotDir,
      offlineReportPath: reportPath,
    })

    reporter.onInit({ config: { root } } as never)
    await reporter.onBrowserInit?.({ name: 'chromium' } as never)
    await Bun.sleep(100)

    const testCase = createTestCase({
      id: 'vitest-2',
      name: 'creates baseline on first run',
      file: testFile,
      artifacts: [
        {
          type: 'internal:toMatchScreenshot',
          kind: 'visual-regression',
          message: 'No existing reference screenshot found; a new one was created.',
          attachments: [{ name: 'reference', path: referencePath, contentType: 'image/png', width: 100, height: 100 }],
        },
      ],
    })

    reporter.onTestCaseReady?.(testCase as never)
    await reporter.onTestCaseResult?.(testCase as never)
    await reporter.onTestRunEnd?.([], [], 'failed')

    const report = await readOfflineReport(reportPath)
    expect(report).not.toBeNull()

    const event = report!.events[1] as { data: { images: Record<string, Record<string, string>> } }
    const image = event.data.images['hero-section']

    expect(image.expect).toBe('/screenshots/vitest-2/hero-section-expected.png')
    expect(image.actual).toBeUndefined()
    expect(image.approveToPath).toBe(referencePath)
    expect(image.approveFromPath).toBe(join(screenshotDir, 'vitest-2', 'hero-section-expected.png'))
  })
})
