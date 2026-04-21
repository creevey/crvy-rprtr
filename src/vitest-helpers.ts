import { basename, dirname, join, relative } from 'path'

import type { TestCase } from 'vitest/node'

type TestCaseArtifact = ReturnType<TestCase['artifacts']>[number]
export type VisualRegressionArtifact = Extract<TestCaseArtifact, { type: 'internal:toMatchScreenshot' }>
export type VitestStatus = 'passed' | 'failed' | 'skipped'

export interface ParsedVitestImagePaths {
  imageName: string
  actualPath?: string
  diffPath?: string
  referencePath?: string
}

const ANSI_ESCAPE = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g')

export function getTitlePath(testCase: TestCase): string[] {
  const titlePath: string[] = []
  let parent = testCase.parent

  while (parent.type !== 'module') {
    titlePath.unshift(parent.name)
    parent = parent.parent
  }

  return titlePath
}

export function getBrowserName(testCase: TestCase): string {
  const projectName = testCase.project.name
  if (projectName !== '') return projectName

  const browserName = testCase.project.config.browser.instances?.[0]?.browser
  return browserName ?? 'browser'
}

export function getImageNameFromPath(filePath: string, browser: string): string {
  let imageName = basename(filePath).replace(/\.[^.]+$/, '')

  const suffix = `-${browser}-${process.platform}`
  if (imageName.endsWith(suffix)) {
    imageName = imageName.slice(0, -suffix.length)
  }

  imageName = imageName.replace(/-(actual|diff)$/, '')
  return imageName
}

export function buildReferencePath(
  root: string,
  referenceDir: string,
  testFile: string,
  imageName: string,
  browser: string,
): string {
  const relativeTestFile = relative(root, testFile)
  const testFileDirectory = dirname(relativeTestFile)
  const testFileName = basename(testFile)

  return join(root, testFileDirectory, referenceDir, testFileName, `${imageName}-${browser}-${process.platform}.png`)
}

export function buildAttachmentPath(
  root: string,
  attachmentsDir: string,
  testFile: string,
  imageName: string,
  browser: string,
  role: 'actual' | 'diff',
): string {
  const relativeTestFile = relative(root, testFile)
  const testFileDirectory = dirname(relativeTestFile)
  const testFileName = basename(testFile)

  return join(
    root,
    attachmentsDir,
    testFileDirectory,
    testFileName,
    `${imageName}-${browser}-${process.platform}-${role}.png`,
  )
}

export function isVisualRegressionArtifact(artifact: TestCaseArtifact): artifact is VisualRegressionArtifact {
  return artifact.type === 'internal:toMatchScreenshot'
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '')
}

export function parseVitestScreenshotError(error: string | undefined, browser: string): ParsedVitestImagePaths[] {
  if (error === undefined) return []

  const cleanError = stripAnsi(error)
  const references = Array.from(cleanError.matchAll(/Reference screenshot:\s*\n\s*(.+)/g))
  if (references.length === 0) return []

  const actuals = Array.from(cleanError.matchAll(/Actual screenshot:\s*\n\s*(.+)/g))
  const diffs = Array.from(cleanError.matchAll(/Diff image:\s*\n\s*(.+)/g))

  return references.map((referenceMatch, index) => {
    const referencePath = referenceMatch[1]?.trim()
    const actualPath = actuals[index]?.[1]?.trim()
    const diffPath = diffs[index]?.[1]?.trim()
    const imageName = getImageNameFromPath(actualPath ?? diffPath ?? referencePath ?? '', browser)

    return {
      imageName,
      referencePath,
      actualPath,
      diffPath,
    }
  })
}

export function mapVitestStatus(state: ReturnType<TestCase['result']>['state']): VitestStatus {
  switch (state) {
    case 'pending':
      return 'skipped'
    case 'passed':
      return 'passed'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'skipped'
    default:
      return 'skipped'
  }
}
