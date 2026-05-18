import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import { resolveBaselineTargets } from '../src/snapshot-path-resolver'

const TEST_DIR = join(process.cwd(), 'tests')
const TEST_FILE = join(TEST_DIR, 'example.spec.ts')
const REPORTER_TITLE_PATH = ['', 'chromium', 'example.spec.ts', 'Suite', 'visual pass']

describe('resolveBaselineTargets', () => {
  test('resolves a named screenshot with the default Playwright screenshot layout', () => {
    const targets = resolveBaselineTargets({
      testFile: TEST_FILE,
      reporterTitlePath: REPORTER_TITLE_PATH,
      declarations: [
        {
          visualName: 'header',
          kind: 'named',
          declaredName: 'header',
          occurrenceIndex: 1,
        },
      ],
      config: {
        configDir: process.cwd(),
        testDir: TEST_DIR,
        snapshotDir: TEST_DIR,
        projectName: 'chromium',
        snapshotSuffix: process.platform,
      },
    })

    expect(targets).toEqual([
      {
        visualName: 'header',
        attachmentBaseName: 'header',
        artifactBaseName: 'header',
        snapshotPath: join(TEST_DIR, 'example.spec.ts-snapshots', `header-chromium-${process.platform}.png`),
      },
    ])
  })

  test('resolves a named screenshot with an explicit toHaveScreenshot path template', () => {
    const targets = resolveBaselineTargets({
      testFile: TEST_FILE,
      reporterTitlePath: REPORTER_TITLE_PATH,
      declarations: [
        {
          visualName: 'header',
          kind: 'named',
          declaredName: 'header',
          occurrenceIndex: 1,
        },
      ],
      config: {
        configDir: process.cwd(),
        testDir: TEST_DIR,
        snapshotDir: join(TEST_DIR, 'custom-snapshots'),
        projectName: 'chromium',
        snapshotSuffix: process.platform,
        toHaveScreenshotPathTemplate: '{snapshotDir}/{projectName}/{testFilePath}/{arg}{ext}',
      },
    })

    expect(targets).toEqual([
      {
        visualName: 'header',
        attachmentBaseName: 'header',
        artifactBaseName: 'header',
        snapshotPath: join(TEST_DIR, 'custom-snapshots', 'chromium', 'example.spec.ts', 'header.png'),
      },
    ])
  })

  test('keeps stable visual and attachment names while exposing a filesystem-safe artifact base', () => {
    const targets = resolveBaselineTargets({
      testFile: TEST_FILE,
      reporterTitlePath: REPORTER_TITLE_PATH,
      declarations: [
        {
          visualName: 'dir/header:mobile',
          kind: 'named',
          declaredName: 'dir/header:mobile',
          occurrenceIndex: 1,
        },
      ],
      config: {
        configDir: process.cwd(),
        testDir: TEST_DIR,
        snapshotDir: TEST_DIR,
        projectName: 'chromium',
        snapshotSuffix: process.platform,
      },
    })

    expect(targets).toEqual([
      {
        visualName: 'dir/header:mobile',
        attachmentBaseName: 'dir/header:mobile',
        artifactBaseName: 'dir-header-mobile',
        snapshotPath: join(
          TEST_DIR,
          'example.spec.ts-snapshots',
          'dir',
          `header-mobile-chromium-${process.platform}.png`,
        ),
      },
    ])
  })
})
