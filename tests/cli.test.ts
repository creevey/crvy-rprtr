import { describe, expect, test } from 'bun:test'
import { dirname, join } from 'path'

import { resolveCliOptions } from '../src/cli'

describe('resolveCliOptions', () => {
  test('keeps the current defaults without an artifact directory', () => {
    expect(resolveCliOptions([])).toEqual({
      port: 3000,
      screenshotDir: './screenshots',
      reportPath: './report.json',
      offlineReportDir: dirname('./report.json'),
    })
  })

  test('derives report and screenshot paths from a positional artifact directory', () => {
    const artifactDir = './artifacts'

    expect(resolveCliOptions([artifactDir])).toEqual({
      port: 3000,
      screenshotDir: join(artifactDir, 'screenshots'),
      reportPath: join(artifactDir, 'report.json'),
      offlineReportDir: dirname(join(artifactDir, 'report.json')),
    })
  })

  test('lets an explicit report path drive the default offline report directory', () => {
    const artifactDir = './artifacts'
    const reportPath = './custom/report.json'

    expect(resolveCliOptions([artifactDir, '--report-path', reportPath])).toEqual({
      port: 3000,
      screenshotDir: join(artifactDir, 'screenshots'),
      reportPath,
      offlineReportDir: dirname(reportPath),
    })
  })

  test('lets explicit flags override positional defaults', () => {
    expect(
      resolveCliOptions([
        './artifacts',
        '--port',
        '4100',
        '--report-path',
        './custom/report.json',
        '--screenshot-dir',
        './custom/screenshots',
        '--offline-report-dir',
        './custom/offline',
      ]),
    ).toEqual({
      port: 4100,
      screenshotDir: './custom/screenshots',
      reportPath: './custom/report.json',
      offlineReportDir: './custom/offline',
    })
  })

  test('rejects more than one positional artifact directory', () => {
    expect(() => resolveCliOptions(['./artifacts', './other'])).toThrow('Expected at most one artifact directory')
  })
})
