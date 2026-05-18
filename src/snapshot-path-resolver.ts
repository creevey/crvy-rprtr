import { createHash } from 'crypto'
import { basename, dirname, extname, join, parse, relative, resolve } from 'path'

import type { ScreenshotDeclaration } from './reporter-utils.ts'

const DEFAULT_SCREENSHOT_TEMPLATE =
  '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}'
const WINDOWS_FILESYSTEM_FRIENDLY_LENGTH = 60

export interface SnapshotResolverConfig {
  readonly configDir: string
  readonly testDir: string
  readonly snapshotDir: string
  readonly projectName: string
  readonly snapshotSuffix: string
  readonly snapshotPathTemplate?: string
  readonly toHaveScreenshotPathTemplate?: string
}

export interface NamedScreenshotDeclaration extends Pick<ScreenshotDeclaration, 'visualName'> {
  readonly kind: 'named'
  readonly declaredName: string
  readonly occurrenceIndex: number
}

export interface SnapshotResolverInput {
  readonly testFile: string
  readonly reporterTitlePath: readonly string[]
  readonly declarations: readonly NamedScreenshotDeclaration[]
  readonly config: SnapshotResolverConfig
  readonly snapshotPathExists?: (snapshotPath: string) => boolean
}

export interface ResolvedBaselineTarget {
  readonly visualName: string
  readonly attachmentBaseName: string
  readonly artifactBaseName: string
  readonly snapshotPath: string
}

function isUnsafeFilePathCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0)

  return (
    codePoint !== undefined &&
    (codePoint <= 0x2c ||
      (codePoint >= 0x2e && codePoint <= 0x2f) ||
      (codePoint >= 0x3a && codePoint <= 0x40) ||
      (codePoint >= 0x5b && codePoint <= 0x60) ||
      (codePoint >= 0x7b && codePoint <= 0x7f))
  )
}

function sanitizeForFilePath(value: string): string {
  return Array.from(value).reduce(
    (state, character) => {
      const unsafeCharacter = isUnsafeFilePathCharacter(character)

      return unsafeCharacter
        ? state.previousCharacterWasUnsafe
          ? state
          : {
              value: `${state.value}-`,
              previousCharacterWasUnsafe: true,
            }
        : {
            value: `${state.value}${character}`,
            previousCharacterWasUnsafe: false,
          }
    },
    {
      value: '',
      previousCharacterWasUnsafe: false,
    },
  ).value
}

function trimLongString(value: string, length = WINDOWS_FILESYSTEM_FRIENDLY_LENGTH): string {
  if (value.length <= length) {
    return value
  }

  const hash = createHash('sha1').update(value).digest('hex')
  const middle = `-${hash.slice(0, 5)}-`
  const start = Math.floor((length - middle.length) / 2)
  const end = length - middle.length - start

  return value.slice(0, start) + middle + value.slice(-end)
}

function sanitizeFilePathBeforeExtension(filePath: string, extension = extname(filePath)): string {
  const base = filePath.slice(0, filePath.length - extension.length)
  return sanitizeForFilePath(base) + extension
}

function addSuffixToFilePath(filePath: string, suffix: string): string {
  const extension = extname(filePath)
  return filePath.slice(0, filePath.length - extension.length) + suffix + extension
}

function normalizedSnapshotDir(config: SnapshotResolverConfig): string {
  return resolve(config.configDir, config.snapshotDir)
}

function templateValue(template: string, token: string, value: string): string {
  return template.replace(new RegExp(`\\{(.)?${token}\\}`, 'g'), (_, prefix: string | undefined) =>
    value === '' ? '' : `${prefix ?? ''}${value}`,
  )
}

function applyTemplate(input: SnapshotResolverInput, nameArgument: string, extension: string): string {
  const template =
    input.config.toHaveScreenshotPathTemplate ?? input.config.snapshotPathTemplate ?? DEFAULT_SCREENSHOT_TEMPLATE
  const relativeTestFilePath = relative(input.config.testDir, input.testFile)
  const parsed = parse(relativeTestFilePath)

  const tokens: ReadonlyArray<readonly [string, string]> = [
    ['testDir', input.config.testDir],
    ['snapshotDir', normalizedSnapshotDir(input.config)],
    ['snapshotSuffix', input.config.snapshotSuffix],
    ['testFileDir', parsed.dir],
    ['platform', process.platform],
    ['projectName', sanitizeForFilePath(input.config.projectName)],
    ['testName', ''],
    ['testFileName', parsed.base],
    ['testFilePath', relativeTestFilePath],
    ['arg', nameArgument],
    ['ext', extension],
  ]

  const snapshotPath = tokens.reduce(
    (currentTemplate, [token, value]) => templateValue(currentTemplate, token, value),
    template,
  )

  return resolve(input.config.configDir, snapshotPath)
}

function removeExtension(filePath: string, extension = extname(filePath)): string {
  return filePath.slice(0, filePath.length - extension.length)
}

function snapshotNameParts(declaredName: string): { readonly extension: string; readonly filePath: string } {
  const extension = extname(declaredName) || '.png'
  return {
    extension,
    filePath: extname(declaredName) === '' ? `${declaredName}${extension}` : declaredName,
  }
}

function createResolvedBaselineTarget(
  input: SnapshotResolverInput,
  declaration: NamedScreenshotDeclaration,
  nameArgument: string,
  extension: string,
): ResolvedBaselineTarget {
  return {
    visualName: declaration.visualName,
    attachmentBaseName: declaration.visualName,
    artifactBaseName: sanitizeForFilePath(declaration.visualName),
    snapshotPath: applyTemplate(input, nameArgument, extension),
  }
}

function resolveStringCallTarget(
  input: SnapshotResolverInput,
  declaration: NamedScreenshotDeclaration,
): ResolvedBaselineTarget {
  const { extension, filePath } = snapshotNameParts(declaration.declaredName)
  const sanitizedNameWithExtension = sanitizeFilePathBeforeExtension(filePath, extension)
  const nameArgument = removeExtension(sanitizedNameWithExtension, extension)

  return createResolvedBaselineTarget(input, declaration, nameArgument, extension)
}

function resolveArrayCallTarget(
  input: SnapshotResolverInput,
  declaration: NamedScreenshotDeclaration,
): ResolvedBaselineTarget {
  const { extension, filePath } = snapshotNameParts(declaration.declaredName)
  const nameArgument = join(dirname(filePath), basename(filePath, extension))

  return createResolvedBaselineTarget(input, declaration, nameArgument, extension)
}

function resolveNamedTarget(
  input: SnapshotResolverInput,
  declaration: NamedScreenshotDeclaration,
): ResolvedBaselineTarget | undefined {
  if (!declaration.declaredName.includes('/')) {
    return resolveStringCallTarget(input, declaration)
  }

  const stringCallTarget = resolveStringCallTarget(input, declaration)
  const arrayCallTarget = resolveArrayCallTarget(input, declaration)

  if (stringCallTarget.snapshotPath === arrayCallTarget.snapshotPath) {
    return stringCallTarget
  }

  if (input.snapshotPathExists === undefined) {
    return undefined
  }

  const stringCallTargetExists = input.snapshotPathExists(stringCallTarget.snapshotPath)
  const arrayCallTargetExists = input.snapshotPathExists(arrayCallTarget.snapshotPath)

  if (stringCallTargetExists === arrayCallTargetExists) {
    return undefined
  }

  return stringCallTargetExists ? stringCallTarget : arrayCallTarget
}

export function resolveBaselineTargets(input: SnapshotResolverInput): ResolvedBaselineTarget[] {
  return input.declarations.flatMap((declaration) => {
    const resolvedTarget = resolveNamedTarget(input, declaration)
    return resolvedTarget === undefined ? [] : [resolvedTarget]
  })
}

export { sanitizeForFilePath, trimLongString, sanitizeFilePathBeforeExtension, addSuffixToFilePath }
