import { describe, expect, test } from 'bun:test'

import { treeifyTests, syncTreeState, collectTestsById, DEFAULT_BROWSER_KEY } from '../src/client/helpers'
import { applyTestBeginEvent, createMutableReportState } from '../src/report-state'
import { TestDataSchema, TestBeginDataSchema, safeParse } from '../src/schemas'
import { resolveBaselineSnapshotPath } from '../src/server/artifact-routes'
import type { TestData } from '../src/types'

// Minimal project shape that satisfies what the reporter reads. `use` carries
// the browser-engine signal that devices spread into it via defaultBrowserType.
type MockProject = {
  name: string
  testDir: string
  snapshotDir: string
  use: { browserName?: string; defaultBrowserType?: string }
}

function makeProject(overrides: Partial<MockProject> = {}): MockProject {
  return {
    name: '',
    testDir: '/tests',
    snapshotDir: '/tests',
    use: {},
    ...overrides,
  }
}

// Reconstruct the onTestBegin payload shape from a mock project, mirroring src/reporter.ts.
// The fallback chain matches the reporter: project.name -> use.browserName -> use.defaultBrowserType -> 'chromium'.
function resolveBrowserLabel(project: MockProject | undefined): string {
  const name = project?.name
  if (name !== undefined && name !== '') return name
  const browserName = project?.use?.browserName
  if (browserName !== undefined && browserName !== '') return browserName
  const defaultBrowserType = project?.use?.defaultBrowserType
  if (defaultBrowserType !== undefined && defaultBrowserType !== '') return defaultBrowserType
  return 'chromium'
}

// Reconstruct the onTestBegin payload shape from a mock project, mirroring src/reporter.ts.
function buildTestBeginPayload(
  project: MockProject | undefined,
  overrides: Partial<TestData> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? 'test-1',
    title: overrides.title ?? 'Test',
    titlePath: overrides.titlePath ?? ['Suite'],
    browser: resolveBrowserLabel(project),
    projectName: project?.name ?? '',
    location: overrides.location ?? { file: '/tests/example.spec.ts', line: 1 },
  }
}

describe('reporter browser-label resolution', () => {
  test('named project: uses project name as browser, raw name as projectName', () => {
    const project = makeProject({ name: 'Mobile Safari', use: { defaultBrowserType: 'webkit' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('Mobile Safari')
    expect(payload.projectName).toBe('Mobile Safari')
  })

  test('default project with explicit browserName: uses browserName as browser label', () => {
    const project = makeProject({ use: { browserName: 'firefox' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('firefox')
    expect(payload.projectName).toBe('')
  })

  test('default project with device spread: uses defaultBrowserType as browser label', () => {
    // devices['Desktop Firefox'] spreads defaultBrowserType: 'firefox' into use
    const project = makeProject({ use: { defaultBrowserType: 'firefox' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('firefox')
    expect(payload.projectName).toBe('')
  })

  test('default project with device spread (webkit): uses defaultBrowserType as browser label', () => {
    const project = makeProject({ use: { defaultBrowserType: 'webkit' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('webkit')
    expect(payload.projectName).toBe('')
  })

  test('bare default project: falls back to chromium', () => {
    const project = makeProject()
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('chromium')
    expect(payload.projectName).toBe('')
  })

  test('project name takes precedence over browserName/defaultBrowserType', () => {
    const project = makeProject({ name: 'regression', use: { browserName: 'firefox', defaultBrowserType: 'firefox' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('regression')
    expect(payload.projectName).toBe('regression')
  })

  test('browserName takes precedence over defaultBrowserType', () => {
    const project = makeProject({ use: { browserName: 'chromium', defaultBrowserType: 'firefox' } })
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).toBe('chromium')
  })

  test('browser label is never empty, even for the implicit default project', () => {
    const project = makeProject()
    const payload = buildTestBeginPayload(project)

    expect(payload.browser).not.toBe('')
    expect(typeof payload.browser).toBe('string')
    expect((payload.browser as string).length).toBeGreaterThan(0)
  })
})

describe('schema backwards-compatibility', () => {
  test('TestBeginDataSchema accepts payloads without projectName (old reporters)', () => {
    const oldPayload = {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: '/tests/example.spec.ts', line: 1 },
    }

    const parsed = safeParse(TestBeginDataSchema, oldPayload)
    expect(parsed).not.toBeNull()
    expect(parsed?.projectName).toBeUndefined()
    expect(parsed?.browser).toBe('chromium')
  })

  test('TestBeginDataSchema accepts payloads with projectName (new reporters)', () => {
    const newPayload = {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: 'firefox',
      projectName: '',
      location: { file: '/tests/example.spec.ts', line: 1 },
    }

    const parsed = safeParse(TestBeginDataSchema, newPayload)
    expect(parsed).not.toBeNull()
    expect(parsed?.browser).toBe('firefox')
    expect(parsed?.projectName).toBe('')
  })

  test('TestDataSchema accepts tests without projectName (old report.json)', () => {
    const oldReport = {
      id: 'test-1',
      titlePath: ['Suite'],
      browser: 'chromium',
      title: 'Test',
    }

    const parsed = safeParse(TestDataSchema, oldReport)
    expect(parsed).not.toBeNull()
    expect(parsed?.projectName).toBeUndefined()
    expect(parsed?.browser).toBe('chromium')
  })
})

describe('applyTestBeginEvent projectName handling', () => {
  test('stores projectName when provided', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: 'firefox',
      projectName: '',
      location: { file: '/tests/example.spec.ts', line: 1 },
    })

    expect(state.reportData.tests['test-1']?.browser).toBe('firefox')
    expect(state.reportData.tests['test-1']?.projectName).toBe('')
  })

  test('named project stores display label in browser and raw name in projectName', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: 'Mobile Safari',
      projectName: 'Mobile Safari',
      location: { file: '/tests/example.spec.ts', line: 1 },
    })

    expect(state.reportData.tests['test-1']?.browser).toBe('Mobile Safari')
    expect(state.reportData.tests['test-1']?.projectName).toBe('Mobile Safari')
  })

  test('falls back to browser when projectName is missing (old reporter data)', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: '/tests/example.spec.ts', line: 1 },
    })

    // Old reporters sent the raw project name in browser; applyTestBeginEvent
    // preserves that value in projectName so approval routing can still
    // resolve baseline paths the way Playwright originally wrote them.
    expect(state.reportData.tests['test-1']?.projectName).toBe('chromium')
    expect(state.reportData.tests['test-1']?.browser).toBe('chromium')
  })

  test('empty browser from old reporter is preserved in projectName', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'Test',
      titlePath: ['Suite'],
      browser: '',
      location: { file: '/tests/example.spec.ts', line: 1 },
    })

    expect(state.reportData.tests['test-1']?.projectName).toBe('')
    expect(state.reportData.tests['test-1']?.browser).toBe('')
  })
})

describe('resolveBaselineSnapshotPath uses projectName', () => {
  // The routing config carries everything snapshot-path resolution needs
  // except projectName, which comes from the test itself. This test verifies
  // the resolver uses projectName (not browser) so snapshot paths match what
  // Playwright itself wrote.
  const routing = {
    configDir: '/project',
    playwrightTestDir: '/tests',
    playwrightSnapshotDir: '/tests',
  } as const

  const suffix = `-${process.platform}`
  const baseDir = '/tests/example.spec.ts-snapshots'

  function makeTest(overrides: Partial<TestData> = {}): TestData {
    return {
      id: 'test-1',
      titlePath: [],
      browser: 'firefox',
      projectName: '',
      title: 'my test',
      location: { file: '/tests/example.spec.ts', line: 1 },
      results: [
        {
          status: 'success',
          retries: 0,
          visualDeclarations: [
            {
              visualName: 'screenshot',
              kind: 'named',
              declaredName: 'screenshot',
              snapshotBaseName: 'screenshot',
              occurrenceIndex: 1,
            },
          ],
        },
      ],
      ...overrides,
    }
  }

  test('prefers projectName over browser for snapshot path resolution', () => {
    // browser is 'firefox' but projectName is '' (default project). The
    // resolved path must NOT carry a '-firefox' suffix because Playwright
    // stored the baseline without one.
    const path = resolveBaselineSnapshotPath(routing, makeTest(), 0, 'screenshot')

    expect(path).not.toBeNull()
    expect(path).toBe(`${baseDir}/screenshot${suffix}.png`)
    expect(path).not.toContain('-firefox')
  })

  test('falls back to browser when projectName is undefined (old data)', () => {
    const testData = makeTest({ browser: 'chromium', projectName: undefined })
    const path = resolveBaselineSnapshotPath(routing, testData, 0, 'screenshot')

    expect(path).not.toBeNull()
    expect(path).toBe(`${baseDir}/screenshot-chromium${suffix}.png`)
  })

  test('named project uses projectName for suffix', () => {
    const testData = makeTest({ browser: 'Mobile Safari', projectName: 'Mobile Safari' })
    const path = resolveBaselineSnapshotPath(routing, testData, 0, 'screenshot')

    expect(path).not.toBeNull()
    // Sanitized form of "Mobile Safari" is "Mobile-Safari"
    expect(path).toBe(`${baseDir}/screenshot-Mobile-Safari${suffix}.png`)
  })
})

describe('UI helpers handle empty browser strings (old data compat)', () => {
  function makeTest(overrides: Partial<TestData> = {}): TestData {
    return {
      id: 'test-1',
      titlePath: ['MySuite'],
      title: 'should work',
      browser: '',
      location: { file: 'tests/example.spec.ts', line: 1 },
      status: 'pending',
      results: [],
      ...overrides,
    }
  }

  test('treeifyTests places empty-browser tests under DEFAULT_BROWSER_KEY', () => {
    const tree = treeifyTests({ 'test-1': makeTest() })
    const collected = collectTestsById(tree)

    expect(Object.keys(collected)).toEqual(['test-1'])
    // The test should be reachable via the default sentinel, not dropped.
    expect(collected['test-1']).toBeDefined()
  })

  test('syncTreeState updates status for empty-browser tests', () => {
    // This is the regression test for the original bug: syncTreeState used
    // to bail out with `browser === ''` and silently drop status updates.
    const tree = treeifyTests({ 'test-1': makeTest({ status: 'pending' }) })
    expect(collectTestsById(tree)['test-1']?.status).toBe('pending')

    const changed = syncTreeState(tree, { 'test-1': makeTest({ status: 'failed' }) })
    const after = collectTestsById(tree)

    expect(changed).toBe(true)
    expect(after['test-1']?.status).toBe('failed')
  })

  test('two distinct-title tests with empty browser do not collide', () => {
    // The empty-browser bug used the test title as the browser leaf key,
    // which corrupted the tree depth (title appeared at the browser-key
    // position instead of as an intermediate suite). With different titles
    // and the DEFAULT_BROWSER_KEY fix, both tests coexist at the right depth.
    const tests: Record<string, TestData> = {
      'test-1': makeTest({ id: 'test-1', title: 'should work A' }),
      'test-2': makeTest({ id: 'test-2', title: 'should work B' }),
    }
    const tree = treeifyTests(tests)
    const collected = collectTestsById(tree)

    expect(Object.keys(collected).sort()).toEqual(['test-1', 'test-2'])
  })

  test('empty-browser test sits under a suite named after its title, keyed by DEFAULT_BROWSER_KEY', () => {
    // This verifies the structural fix: before, the test title leaked into
    // the browser-key slot and there was no intermediate title suite. Now the
    // tree has the expected depth: MySuite > should work > default.
    const tree = treeifyTests({ 'test-1': makeTest({ title: 'should work' }) })
    const suite = tree.children?.['MySuite'] as { children?: Record<string, unknown> } | undefined

    expect(suite).toBeDefined()
    // It's a suite, not a test:
    expect('id' in (suite ?? {})).toBe(false)
    const titleSuite = suite?.children?.['should work'] as { children?: Record<string, unknown> } | undefined
    expect(titleSuite).toBeDefined()
    // Still a suite:
    expect('id' in (titleSuite ?? {})).toBe(false)
    const testLeaf = titleSuite?.children?.[DEFAULT_BROWSER_KEY] as Record<string, unknown> | undefined
    expect(testLeaf).toBeDefined()
    // The leaf is the test:
    expect('id' in (testLeaf ?? {})).toBe(true)
  })

  test('DEFAULT_BROWSER_KEY is exported and stable', () => {
    expect(typeof DEFAULT_BROWSER_KEY).toBe('string')
    expect(DEFAULT_BROWSER_KEY.length).toBeGreaterThan(0)
  })
})

describe('reporter onTestBegin emits display label + raw projectName', () => {
  // Exercises the real CrvyRprtr.onTestBegin via a stubbed `send` so we verify
  // resolveBrowserLabel end-to-end through the public surface.
  type SentMessage = { type: string; data: Record<string, unknown> }

  async function captureTestBegin(project: MockProject | undefined): Promise<SentMessage | undefined> {
    const { CrvyRprtr } = await import('../src/reporter')
    const reporter = new CrvyRprtr({ ci: false, screenshotDir: './test-screenshots' })
    const sent: SentMessage[] = []
    type TestReporter = { send: (m: unknown) => void; onTestBegin: (t: object) => void }
    const reporterAny = reporter as unknown as TestReporter
    reporterAny.send = (m: unknown): void => {
      sent.push(m as SentMessage)
    }
    reporterAny.onTestBegin({
      id: 't1',
      title: 'Test',
      location: { file: '/tests/x.spec.ts', line: 1 },
      parent: {
        title: 'Suite',
        type: 'describe',
        project: () => project,
        parent: undefined,
      },
    })
    return sent.find((m) => m.type === 'test-begin')
  }

  test('default project with device (firefox) sends browser=firefox, projectName=""', async () => {
    const project = makeProject({ use: { defaultBrowserType: 'firefox' } })
    const msg = await captureTestBegin(project)
    expect(msg?.data.browser).toBe('firefox')
    expect(msg?.data.projectName).toBe('')
  })

  test('named project sends browser=name, projectName=name', async () => {
    const project = makeProject({ name: 'desktop-chrome' })
    const msg = await captureTestBegin(project)
    expect(msg?.data.browser).toBe('desktop-chrome')
    expect(msg?.data.projectName).toBe('desktop-chrome')
  })

  test('bare default project sends browser=chromium, projectName=""', async () => {
    const project = makeProject()
    const msg = await captureTestBegin(project)
    expect(msg?.data.browser).toBe('chromium')
    expect(msg?.data.projectName).toBe('')
  })

  test('explicit browserName wins over defaultBrowserType', async () => {
    const project = makeProject({ use: { browserName: 'chromium', defaultBrowserType: 'firefox' } })
    const msg = await captureTestBegin(project)
    expect(msg?.data.browser).toBe('chromium')
  })
})
