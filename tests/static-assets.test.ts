import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { createRoutes } from '../src/server/routes'

describe('Static asset routing', () => {
  let staticDir = ''

  beforeEach(async () => {
    staticDir = await mkdtemp(join(tmpdir(), 'creevey-static-assets-'))
    await Bun.write(join(staticDir, 'index.html'), '<!doctype html><title>ok</title>')
    await Bun.write(join(staticDir, 'index.js'), 'console.log("ok");')
  })

  afterEach(async () => {
    if (staticDir !== '') {
      await rm(staticDir, { recursive: true, force: true })
    }
  })

  function createTestRoutes(): ReturnType<typeof createRoutes> {
    return createRoutes({
      reportData: {
        isRunning: false,
        tests: {},
        browsers: ['chromium'],
        isUpdateMode: false,
        screenshotDir: './screenshots',
      },
      staticDir,
      saveReport: async () => {},
    })
  }

  function expectResponse(response: Response | undefined): Response {
    if (!(response instanceof Response)) {
      throw new Error('Expected route handler to return a Response')
    }

    return response
  }

  test('serves index.html from the resolved static directory', async () => {
    const routes = createTestRoutes()
    const response = expectResponse(await routes['/']!(new Request('http://localhost/'), { upgrade: () => false }))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>ok</title>')
  })

  test('serves dist assets from the resolved static directory', async () => {
    const routes = createTestRoutes()
    const response = expectResponse(await routes['/dist/*']!(new Request('http://localhost/dist/index.js')))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log("ok");')
  })
})
