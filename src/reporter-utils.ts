import type { TestStep } from '@playwright/test/reporter'

const NAMED_SCREENSHOT_STEP_TITLE = /toHaveScreenshot\((.+?)\)/
const UNNAMED_SCREENSHOT_STEP_TITLE = /^Expect "toHaveScreenshot"(?:\s|$)/
const SYNTHETIC_SCREENSHOT_PREFIX = '__unnamed-screenshot-'

export interface ScreenshotDeclaration {
  visualName: string
  snapshotBaseName?: string
}

export interface AttachmentData {
  name: string
  path: string
  contentType: string
}

interface ExtractionState {
  readonly declarations: ScreenshotDeclaration[]
  readonly seenVisualNames: Set<string>
  nextUnnamedIndex: number
}

function normalizeNamedScreenshot(titleMatch: string): ScreenshotDeclaration | null {
  const unquotedName = titleMatch.trim().replace(/^['"`]|['"`]$/g, '')

  if (unquotedName === '') {
    return null
  }

  const normalizedPath = unquotedName.replace(/\\/g, '/')
  const normalizedName = normalizedPath.replace(/\.png$/, '')

  if (normalizedName === '') {
    return null
  }

  return {
    visualName: normalizedName,
    snapshotBaseName: normalizedName,
  }
}

function appendDeclaration(state: ExtractionState, declaration: ScreenshotDeclaration): void {
  if (state.seenVisualNames.has(declaration.visualName)) {
    return
  }

  state.seenVisualNames.add(declaration.visualName)
  state.declarations.push(declaration)
}

function visitStep(step: TestStep, state: ExtractionState): boolean {
  const declarationsBeforeChildren = state.declarations.length

  for (const nestedStep of step.steps) {
    visitStep(nestedStep, state)
  }

  const namedMatch = step.title.match(NAMED_SCREENSHOT_STEP_TITLE)
  if (namedMatch?.[1] !== undefined) {
    const declaration = normalizeNamedScreenshot(namedMatch[1])
    if (declaration !== null) {
      appendDeclaration(state, declaration)
      return true
    }
  }

  const hasNestedScreenshotDeclaration = state.declarations.length > declarationsBeforeChildren

  if (UNNAMED_SCREENSHOT_STEP_TITLE.test(step.title) && !hasNestedScreenshotDeclaration) {
    appendDeclaration(state, {
      visualName: `${SYNTHETIC_SCREENSHOT_PREFIX}${state.nextUnnamedIndex}`,
    })
    state.nextUnnamedIndex += 1
    return true
  }

  return hasNestedScreenshotDeclaration
}

export function extractScreenshotDeclarations(steps: readonly TestStep[]): ScreenshotDeclaration[] {
  const state: ExtractionState = {
    declarations: [],
    seenVisualNames: new Set<string>(),
    nextUnnamedIndex: 1,
  }

  for (const step of steps) {
    visitStep(step, state)
  }

  return state.declarations
}

export function extractScreenshotNames(steps: readonly TestStep[]): string[] {
  return extractScreenshotDeclarations(steps).map(({ visualName }) => visualName)
}
