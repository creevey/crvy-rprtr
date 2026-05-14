import { describe, expect, test } from 'bun:test'

import { applyTestBeginEvent, applyTestEndEvent, createMutableReportState } from '../src/report-state'

describe('report-state visual classification', () => {
  test('keeps skipped test and result statuses consistent', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-skipped',
      title: 'skipped test',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 20 },
    })

    applyTestEndEvent(state, {
      id: 'test-skipped',
      status: 'skipped',
      attachments: [],
      visualNames: [],
      duration: 5,
    })

    const testData = state.reportData.tests['test-skipped']

    expect(testData?.status).toBe('pending')
    expect(testData?.results?.[0]?.status).toBe('pending')
  })

  test('marks baseline-only and declared-only screenshot assertions explicitly', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'visual pass',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 10 },
    })

    applyTestEndEvent(
      state,
      {
        id: 'test-1',
        status: 'passed',
        attachments: [
          {
            name: 'header-expected',
            path: 'test-1/header-expected',
            contentType: 'image/png',
          },
        ],
        visualNames: ['header', 'footer'],
      },
      { screenshotsBaseUrl: '/screenshots/' },
    )

    const images = state.reportData.tests['test-1']?.results?.[0]?.images ?? {}

    expect(images['header']?.source).toBe('baseline-only')
    expect(images['header']?.expect).toBe('/screenshots/test-1/header-expected')
    expect(images['footer']?.source).toBe('declared-only')
  })

  test('keeps carry-forward only for image names still present in a later passing run', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'visual pass',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 10 },
    })

    applyTestEndEvent(
      state,
      {
        id: 'test-1',
        status: 'passed',
        attachments: [
          {
            name: 'header-expected',
            path: 'test-1/header-expected',
            contentType: 'image/png',
          },
          {
            name: 'footer-expected',
            path: 'test-1/footer-expected',
            contentType: 'image/png',
          },
        ],
        visualNames: ['header', 'footer'],
      },
      { screenshotsBaseUrl: '/screenshots/' },
    )

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'visual pass',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 10 },
    })

    applyTestEndEvent(
      state,
      {
        id: 'test-1',
        status: 'passed',
        attachments: [],
        visualNames: ['header'],
      },
      { screenshotsBaseUrl: '/screenshots/' },
    )

    const images = state.reportData.tests['test-1']?.results?.[0]?.images ?? {}

    expect(images['header']?.source).toBe('baseline-only')
    expect(images['header']?.expect).toBe('/screenshots/test-1/header-expected')
    expect(images['footer']).toBeUndefined()
  })
})
