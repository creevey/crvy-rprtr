import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFile, rm } from 'fs/promises'
import { join } from 'path'

import { safeParse, OfflineReportSchema } from '../src/schemas'
import type { OfflineReport } from '../src/types'

const fixtureDir = join(import.meta.dir, 'fixtures', 'vitest-browser')
const outputDir = join(fixtureDir, 'output')
const reportPath = join(outputDir, 'creevey-offline-report-0.json')

setDefaultTimeout(30000)

async function cleanupOutput(): Promise<void> {
  await rm(outputDir, { recursive: true, force: true })
}

async function readOfflineReport(): Promise<OfflineReport | null> {
  const parsed: unknown = JSON.parse(await readFile(reportPath, 'utf-8'))
  return safeParse(OfflineReportSchema, parsed)
}

afterEach(async () => {
  await cleanupOutput()
})

describe('Vitest browser integration', () => {
  test('real vitest run produces Creevey offline report with screenshot diff artifacts', async () => {
    await cleanupOutput()

    const child = Bun.spawn({
      cmd: ['bunx', 'vitest', 'run', '--config', join(fixtureDir, 'vitest.config.ts')],
      cwd: fixtureDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    })

    const exitCode = await child.exited
    await new Response(child.stdout).text()
    await new Response(child.stderr).text()

    expect(exitCode).toBe(1)

    const report = await readOfflineReport()
    expect(report).not.toBeNull()
    expect(report!.events).toHaveLength(3)

    const testEndEvent = report!.events[1] as {
      type: string
      data: {
        attachments: Array<{ name: string }>
        images: Record<string, Record<string, string>>
      }
    }
    expect(testEndEvent.type).toBe('test-end')
    expect(testEndEvent.data.attachments.map((attachment) => attachment.name).sort()).toEqual([
      'hero-section-actual.png',
      'hero-section-diff.png',
      'hero-section-expected.png',
    ])

    const image = testEndEvent.data.images['hero-section']
    expect(image.expect.endsWith('/hero-section-expected.png')).toBe(true)
    expect(image.actual.endsWith('/hero-section-actual.png')).toBe(true)
    expect(image.diff.endsWith('/hero-section-diff.png')).toBe(true)
    expect(
      image.approveToPath.endsWith(
        `/__screenshots__/vitest.integration.browser.test.ts/hero-section-chromium-${process.platform}.png`,
      ),
    ).toBe(true)
    expect(image.approveFromPath.endsWith('/hero-section-actual.png')).toBe(true)
    expect(JSON.stringify(testEndEvent)).toContain('toMatchScreenshot')
  })
})
