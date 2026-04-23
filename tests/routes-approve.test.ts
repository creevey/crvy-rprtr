import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { createRoutes } from '../src/server/routes'
import type { TestData } from '../src/types'

const cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'creevey-routes-'))
  cleanupDirs.push(dir)
  return dir
}

function readText(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

describe('approve routes', () => {
  test('approve copies approveFromPath to approveToPath', async () => {
    const root = await createTempDir()
    const actualPath = join(root, 'actual.png')
    const baselinePath = join(root, 'snapshots', 'hero.png')

    await mkdir(dirname(baselinePath), { recursive: true })
    await writeFile(actualPath, 'new baseline')
    await writeFile(baselinePath, 'old baseline')

    const testData: TestData = {
      id: 'test-1',
      title: 'hero',
      titlePath: ['visual'],
      browser: 'chromium',
      status: 'failed',
      results: [
        {
          status: 'failed',
          retries: 0,
          images: {
            hero: {
              actual: '/screenshots/test-1/hero-actual.png',
              approveFromPath: actualPath,
              approveToPath: baselinePath,
            },
          },
        },
      ],
    }

    const routes = createRoutes({
      staticDir: root,
      saveReport: async () => {},
      reportData: {
        isRunning: false,
        tests: { 'test-1': testData },
        browsers: ['chromium'],
        isUpdateMode: false,
        screenshotDir: './screenshots',
      },
    })

    const approveRoute = routes['/api/approve']
    const response = await approveRoute(
      new Request('http://localhost/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test-1', retry: 0, image: 'hero' }),
      }),
    )

    expect(response).toBeInstanceOf(Response)
    expect(await readText(baselinePath)).toBe('new baseline')
  })

  test('approve-all skips images without approval metadata', async () => {
    const root = await createTempDir()
    const actualPath = join(root, 'actual.png')
    const baselinePath = join(root, 'snapshots', 'hero.png')

    await mkdir(dirname(baselinePath), { recursive: true })
    await writeFile(actualPath, 'updated')
    await writeFile(baselinePath, 'stale')

    const routes = createRoutes({
      staticDir: root,
      saveReport: async () => {},
      reportData: {
        isRunning: false,
        browsers: ['chromium'],
        isUpdateMode: false,
        screenshotDir: './screenshots',
        tests: {
          'test-1': {
            id: 'test-1',
            title: 'hero',
            titlePath: [],
            browser: 'chromium',
            results: [
              {
                status: 'failed',
                retries: 0,
                images: {
                  hero: {
                    approveFromPath: actualPath,
                    approveToPath: baselinePath,
                  },
                  untouched: {
                    diff: '/screenshots/test-1/untouched-diff.png',
                  },
                },
              },
            ],
          },
        },
      },
    })

    const approveAllRoute = routes['/api/approve-all']
    const response = await approveAllRoute(new Request('http://localhost/api/approve-all', { method: 'POST' }))

    expect(response).toBeInstanceOf(Response)
    expect(await readText(baselinePath)).toBe('updated')
  })
})
