import { attachmentsToImages, mapStatus } from './report-utils.ts'
import type { TestBeginData, TestEndData } from './schemas.ts'
import type { Images, TestData } from './types.ts'

export interface MutableReportData {
  isRunning: boolean
  tests: Record<string, TestData>
  browsers: string[]
  isUpdateMode: boolean
  screenshotDir: string
}

export interface MutableReportState {
  reportData: MutableReportData
  currentRunIds: Set<string>
}

export interface ApplyTestEndResult {
  test: TestData
  diffCount: number
}

function hasReviewablePassingImages(images: Partial<Record<string, Images>>): boolean {
  return Object.values(images).some(
    (img) =>
      img !== null && img !== undefined && img.actual !== null && img.actual !== undefined && img.diff === undefined,
  )
}

function preservePreviousPassingImages(
  test: TestData,
  status: TestEndData['status'],
  images: Partial<Record<string, Images>>,
): Partial<Record<string, Images>> {
  if (status !== 'passed' || Object.keys(images).length > 0) {
    return images
  }

  const previousImages = test.results?.[0]?.images ?? {}
  return hasReviewablePassingImages(previousImages) ? previousImages : images
}

function countDiffImages(images: Partial<Record<string, Images>>): number {
  return Object.values(images).filter((img) => img?.diff !== null && img?.diff !== undefined).length
}

export function createMutableReportState(screenshotDir = './screenshots'): MutableReportState {
  return {
    reportData: {
      isRunning: false,
      tests: {},
      browsers: ['chromium'],
      isUpdateMode: false,
      screenshotDir,
    },
    currentRunIds: new Set<string>(),
  }
}

export function applyTestBeginEvent(state: MutableReportState, data: TestBeginData): TestData {
  const { id, title, titlePath, browser, location } = data
  state.currentRunIds.add(id)
  state.reportData.tests[id] ??= {
    id,
    titlePath: titlePath ?? [],
    browser: browser ?? '',
    title: title ?? '',
    location,
    status: 'running',
  }

  return state.reportData.tests[id]
}

export function applyTestEndEvent(
  state: MutableReportState,
  data: TestEndData,
  options: { screenshotsBaseUrl?: string } = {},
): ApplyTestEndResult | null {
  const test = state.reportData.tests[data.id]
  if (test === undefined) {
    return null
  }

  test.status = mapStatus(data.status)
  const images = preservePreviousPassingImages(
    test,
    data.status,
    attachmentsToImages(data.attachments, options.screenshotsBaseUrl),
  )

  // New failure with diff images invalidates any prior approval.
  const diffCount = countDiffImages(images)
  const hasDiffs = diffCount > 0
  if (hasDiffs) {
    test.approved = null
  }

  test.results = [
    {
      status: data.status === 'passed' ? 'success' : 'failed',
      retries: 0,
      images,
      error: data.error,
      duration: data.duration,
    },
  ]

  return {
    test,
    diffCount,
  }
}

export function finalizeRunEvent(state: MutableReportState): { passed: number; failed: number; pending: number } {
  state.reportData.isRunning = false
  state.reportData.tests = Object.fromEntries(
    Object.entries(state.reportData.tests).filter(([id]) => state.currentRunIds.has(id)),
  )
  state.currentRunIds.clear()

  const runTests = Object.values(state.reportData.tests).filter((test): test is TestData => test !== undefined)
  return {
    passed: runTests.filter((test) => test.status === 'success').length,
    failed: runTests.filter((test) => test.status === 'failed').length,
    pending: runTests.filter((test) => test.status === 'pending').length,
  }
}
