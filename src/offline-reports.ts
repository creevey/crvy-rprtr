import { readdir } from 'fs/promises'
import { join } from 'path'

import { applyTestBeginEvent, applyTestEndEvent, createMutableReportState, finalizeRunEvent } from './report-state.ts'
import {
  OfflineReportSchema,
  TestBeginDataSchema,
  TestEndDataSchema,
  safeParse,
  type OfflineReport as ParsedOfflineReport,
} from './schemas.ts'
import type { TestData } from './types.ts'

const OFFLINE_REPORT_FILE_PATTERN = /^creevey-offline-report(?:-\d+)?\.json$/

export async function findOfflineReportPaths(searchDir: string): Promise<string[]> {
  try {
    const entries = await readdir(searchDir)
    return entries
      .filter((entry) => OFFLINE_REPORT_FILE_PATTERN.test(entry))
      .sort((left, right) => left.localeCompare(right))
      .map((entry) => join(searchDir, entry))
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export function parseOfflineReport(value: unknown): ParsedOfflineReport | null {
  const parsed = safeParse(OfflineReportSchema, value)
  if (parsed === null || parsed.version !== 1 || !Array.isArray(parsed.events)) {
    return null
  }

  return parsed
}

export function mergeOfflineReportsIntoTests(
  existingTests: Record<string, TestData>,
  offlineReports: ParsedOfflineReport[],
  options: { screenshotDir?: string; screenshotsBaseUrl?: string } = {},
): Record<string, TestData> {
  const state = createMutableReportState(options.screenshotDir)
  let shouldFinalize = false

  for (const report of offlineReports) {
    for (const event of report.events) {
      switch (event.type) {
        case 'test-begin': {
          const parsed = safeParse(TestBeginDataSchema, event.data)
          if (parsed !== null) {
            applyTestBeginEvent(state, parsed)
          }
          break
        }
        case 'test-end': {
          const parsed = safeParse(TestEndDataSchema, event.data)
          if (parsed !== null) {
            applyTestEndEvent(state, parsed, { screenshotsBaseUrl: options.screenshotsBaseUrl })
          }
          break
        }
        case 'run-end':
          shouldFinalize = true
          break
      }
    }
  }

  if (shouldFinalize) {
    finalizeRunEvent(state)
  }

  return {
    ...existingTests,
    ...state.reportData.tests,
  }
}
