import { describe, expect, test } from 'bun:test'

import { hasScreenshots } from '../src/client/helpers'
import type { CrvyRprtrTest } from '../src/types'

describe('status helpers', () => {
  test('treats declared-only visual entries as visible screenshots', () => {
    const testData: CrvyRprtrTest = {
      id: 'test-1',
      title: 'visual pass',
      titlePath: [],
      browser: 'chromium',
      checked: false,
      status: 'success',
      results: [
        {
          status: 'success',
          retries: 0,
          images: {
            header: { source: 'declared-only' },
          },
        },
      ],
    }

    expect(hasScreenshots(testData)).toBe(true)
  })
})
