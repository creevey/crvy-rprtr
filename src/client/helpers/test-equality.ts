import type { ScreenshotDeclaration } from '../../reporter-utils'
import {
  type TestData,
  type TestResult,
  type Images,
  type Attachment,
  type Location,
  type CrvyRprtrTest,
} from '../../types'

export function isTestDataEqual(a: TestData, b: TestData): boolean {
  if (a === b) return true
  if (a.id !== b.id) return false
  if (a.title !== b.title) return false
  if (a.browser !== b.browser) return false
  if (a.skip !== b.skip) return false
  if (a.status !== b.status) return false
  if (a.retries !== b.retries) return false
  if (!arraysShallowEqual(a.titlePath, b.titlePath ?? [])) return false
  if (!approvedEqual(a.approved, b.approved)) return false
  if (!resultsEqual(a.results, b.results)) return false
  if (!attachmentsEqual(a.attachments, b.attachments)) return false
  if (!locationsEqual(a.location, b.location)) return false
  return true
}

function arraysShallowEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function approvedEqual(
  a: Partial<Record<string, number>> | null | undefined,
  b: Partial<Record<string, number>> | null | undefined,
): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function resultsEqual(a: TestData['results'], b: TestData['results']): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (ai === bi) continue
    if (ai === undefined || bi === undefined) return false
    if (!resultEqual(ai, bi)) return false
  }
  return true
}

function resultEqual(a: TestResult, b: TestResult): boolean {
  if (a === b) return true
  if (a.status !== b.status) return false
  if (a.retries !== b.retries) return false
  if (a.error !== b.error) return false
  if (a.duration !== b.duration) return false
  if (!imagesEqual(a.images, b.images)) return false
  if (!visualDeclarationsEqual(a.visualDeclarations, b.visualDeclarations)) return false
  return true
}

function imagesEqual(
  a: Partial<Record<string, Images>> | undefined,
  b: Partial<Record<string, Images>> | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const ai = a[key]
    const bi = b[key]
    if (ai === bi) continue
    if (ai === undefined || bi === undefined) return false
    if (ai.actual !== bi.actual) return false
    if (ai.expect !== bi.expect) return false
    if (ai.diff !== bi.diff) return false
    if (ai.error !== bi.error) return false
    if (ai.source !== bi.source) return false
  }
  return true
}

function visualDeclarationsEqual(
  a: readonly ScreenshotDeclaration[] | undefined,
  b: readonly ScreenshotDeclaration[] | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (ai === bi) continue
    if (ai === undefined || bi === undefined) return false
    if (ai.visualName !== bi.visualName) return false
    if (ai.kind !== bi.kind) return false
    if (ai.kind === 'named') {
      if (bi.kind !== 'named') return false
      if (ai.declaredName !== bi.declaredName) return false
      if (ai.snapshotBaseName !== bi.snapshotBaseName) return false
    }
    if (ai.occurrenceIndex !== bi.occurrenceIndex) return false
  }
  return true
}

function attachmentsEqual(a: Attachment[] | undefined, b: Attachment[] | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (ai === bi) continue
    if (ai === undefined || bi === undefined) return false
    if (ai.name !== bi.name) return false
    if (ai.path !== bi.path) return false
    if (ai.contentType !== bi.contentType) return false
  }
  return true
}

function locationsEqual(a: Location | undefined, b: Location | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.file === b.file && a.line === b.line
}

export function copyMutableFields(target: CrvyRprtrTest, source: TestData): void {
  if (target.status !== source.status) target.status = source.status
  if (target.skip !== source.skip) target.skip = source.skip
  if (target.retries !== source.retries) target.retries = source.retries
  if (!approvedEqual(target.approved, source.approved)) target.approved = source.approved
  if (!resultsEqual(target.results, source.results)) target.results = source.results
  if (!attachmentsEqual(target.attachments, source.attachments)) target.attachments = source.attachments
  if (!locationsEqual(target.location, source.location)) target.location = source.location
}
