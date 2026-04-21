import { describe, expect, test } from 'bun:test'

import { buildImagesFromAttachments } from '../src/images'

describe('buildImagesFromAttachments', () => {
  test('maps attachments into Creevey images with approval metadata', () => {
    const images = buildImagesFromAttachments(
      [
        { name: 'hero-actual.png', path: 'case/hero-actual.png', contentType: 'image/png' },
        { name: 'hero-expected.png', path: 'case/hero-expected.png', contentType: 'image/png' },
        { name: 'hero-diff.png', path: 'case/hero-diff.png', contentType: 'image/png' },
      ],
      {
        approvalTargets: { hero: '/tmp/hero-reference.png' },
        resolveAttachmentPath: (path) => `/screenshots/${path}`,
      },
    )

    expect(images.hero).toEqual({
      actual: '/screenshots/case/hero-actual.png',
      expect: '/screenshots/case/hero-expected.png',
      diff: '/screenshots/case/hero-diff.png',
      approveFromPath: '/screenshots/case/hero-actual.png',
      approveToPath: '/tmp/hero-reference.png',
    })
  })

  test('falls back to expected image as approval source when actual is missing', () => {
    const images = buildImagesFromAttachments(
      [{ name: 'hero-expected.png', path: 'case/hero-expected.png', contentType: 'image/png' }],
      {
        approvalTargets: { hero: '/tmp/hero-reference.png' },
        resolveAttachmentPath: (path) => `/screenshots/${path}`,
      },
    )

    expect(images.hero).toEqual({
      expect: '/screenshots/case/hero-expected.png',
      approveFromPath: '/screenshots/case/hero-expected.png',
      approveToPath: '/tmp/hero-reference.png',
    })
  })
})
