import type { Attachment } from './schemas.ts'
import type { Images, TestData } from './types.ts'

function normalizeScreenshotsBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

export function attachmentsToImages(
  attachments: Attachment[],
  screenshotsBaseUrl = '/screenshots/',
): Partial<Record<string, Images>> {
  const images: Partial<Record<string, Images>> = {}
  const baseUrl = normalizeScreenshotsBaseUrl(screenshotsBaseUrl)

  for (const attachment of attachments) {
    if (attachment.contentType !== 'image/png') continue
    const match = attachment.name.match(/^(.+?)-(actual|expected|diff)(?:\.png)?$/)
    if (match === null) continue
    const baseName = match[1]
    const role = match[2]
    if (baseName === null || baseName === undefined || role === null || role === undefined) continue
    images[baseName] ??= { actual: '' }
    const url = `${baseUrl}${attachment.path}`
    const img = images[baseName]
    if (img !== null && img !== undefined) {
      if (role === 'actual') img.actual = url
      else if (role === 'expected') img.expect = url
      else if (role === 'diff') img.diff = url
    }
  }

  // For passing comparisons (has both actual and expected but no diff), drop the
  // expect — it matched so there is nothing to review, keep only actual.
  // A lone expected (baseline-only, no actual) is kept for display as-is.
  for (const key of Object.keys(images)) {
    const img = images[key]
    if (
      img?.actual !== null &&
      img?.actual !== undefined &&
      img?.expect !== null &&
      img?.expect !== undefined &&
      img?.diff === undefined
    )
      delete img.expect
  }

  return images
}

export function mapStatus(status: 'passed' | 'failed' | 'skipped'): TestData['status'] {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'pending'
    default:
      return 'unknown'
  }
}
