import type { Reporter, TestCase, TestRunEndReason, TestSpecification, TestProject, Vitest } from 'vitest/node'

import { buildImagesFromAttachments } from './images.ts'
import { CreeveyTransport, type CreeveyTransportOptions } from './transport.ts'
import {
  buildAttachmentPath,
  buildReferencePath,
  getBrowserName,
  getImageNameFromPath,
  getTitlePath,
  isVisualRegressionArtifact,
  mapVitestStatus,
  parseVitestScreenshotError,
  type ParsedVitestImagePaths,
  type VisualRegressionArtifact,
} from './vitest-helpers.ts'

export interface CreeveyVitestReporterOptions extends CreeveyTransportOptions {
  attachmentsDir?: string
  referenceDir?: string
}

export class CreeveyVitestReporter implements Reporter {
  private readonly transport: CreeveyTransport
  private readonly referenceDir: string
  private readonly attachmentsDir: string
  private projectRoot = process.cwd()

  constructor(options: CreeveyVitestReporterOptions = {}) {
    this.transport = new CreeveyTransport(options)
    this.referenceDir = options.referenceDir ?? '__screenshots__'
    this.attachmentsDir = options.attachmentsDir ?? '.vitest-attachments'
  }

  onInit(vitest: Vitest): void {
    this.projectRoot = vitest.config.root
  }

  async onBrowserInit(project: TestProject): Promise<void> {
    await this.transport.start()
    console.log(`[CreeveyVitestReporter] Browser project ready: ${project.name || 'browser'}`)
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    console.log(`[CreeveyVitestReporter] Starting run with ${specifications.length} test module(s)`)
  }

  onTestCaseReady(testCase: TestCase): void {
    this.transport.send({
      type: 'test-begin',
      data: {
        id: testCase.id,
        title: testCase.name,
        titlePath: getTitlePath(testCase),
        browser: getBrowserName(testCase),
        provider: 'vitest',
        location: {
          file: testCase.module.moduleId,
          line: testCase.location?.line ?? 1,
        },
      },
    })
  }

  async onTestCaseResult(testCase: TestCase): Promise<void> {
    const result = testCase.result()
    const browser = getBrowserName(testCase)
    const firstError = result.errors?.[0]
    const parsedImagePaths = parseVitestScreenshotError(firstError?.message, browser)
    const { attachments, images } = await this.collectArtifacts(testCase, browser, parsedImagePaths)

    this.transport.send({
      type: 'test-end',
      data: {
        id: testCase.id,
        title: testCase.name,
        location: {
          file: testCase.module.moduleId,
          line: testCase.location?.line ?? 1,
        },
        status: mapVitestStatus(result.state),
        attachments,
        images,
        error: firstError?.message,
        duration: testCase.diagnostic()?.duration,
      },
    })
  }

  async onTestRunEnd(
    _testModules: ReadonlyArray<unknown>,
    _unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ): Promise<void> {
    await this.transport.finish({
      status: reason,
    })
  }

  private resolveArtifactImagePaths(
    testCase: TestCase,
    browser: string,
    artifact: VisualRegressionArtifact,
    parsedImagePaths: ParsedVitestImagePaths[],
  ): { imageName: string; parsedPaths: ParsedVitestImagePaths } | null {
    const parsedFromArtifact = parseVitestScreenshotError(artifact.message, browser)[0]
    const canonicalReferencePath = parsedFromArtifact?.referencePath ?? parsedImagePaths[0]?.referencePath
    const referenceAttachment = artifact.attachments.find((attachment) => attachment.name === 'reference')
    const seedPath =
      canonicalReferencePath ??
      parsedFromArtifact?.actualPath ??
      parsedFromArtifact?.diffPath ??
      parsedImagePaths[0]?.actualPath ??
      parsedImagePaths[0]?.diffPath ??
      referenceAttachment?.path ??
      artifact.attachments.find((attachment) => attachment.path !== undefined)?.path

    if (seedPath === undefined) return null

    const imageName = getImageNameFromPath(seedPath, browser)
    const parsedPathByImageName = new Map(parsedImagePaths.map((image) => [image.imageName, image]))
    const parsedPaths = parsedPathByImageName.get(imageName) ?? parsedFromArtifact ?? { imageName }

    return { imageName, parsedPaths }
  }

  private getSourcePath(
    testCase: TestCase,
    browser: string,
    imageName: string,
    role: 'actual' | 'expected' | 'diff',
    attachmentPath: string | undefined,
    parsedPaths: ParsedVitestImagePaths,
  ): string {
    const parsedPath =
      role === 'expected'
        ? parsedPaths.referencePath
        : role === 'actual'
          ? parsedPaths.actualPath
          : parsedPaths.diffPath

    if (parsedPath !== undefined) return parsedPath
    if (attachmentPath !== undefined) return attachmentPath

    return role === 'expected'
      ? buildReferencePath(this.projectRoot, this.referenceDir, testCase.module.moduleId, imageName, browser)
      : buildAttachmentPath(this.projectRoot, this.attachmentsDir, testCase.module.moduleId, imageName, browser, role)
  }

  private collectArtifactCopies(
    testCase: TestCase,
    browser: string,
    artifact: VisualRegressionArtifact,
    parsedImagePaths: ParsedVitestImagePaths[],
  ): {
    artifactsToCopy: Array<{ name: string; sourcePath: string; contentType: string }>
    imageName: string
    referencePath: string
  } | null {
    const resolved = this.resolveArtifactImagePaths(testCase, browser, artifact, parsedImagePaths)
    if (resolved === null) return null

    const { imageName, parsedPaths } = resolved
    const referenceAttachment = artifact.attachments.find((attachment) => attachment.name === 'reference')
    const referencePath =
      parsedPaths.referencePath ??
      referenceAttachment?.path ??
      buildReferencePath(this.projectRoot, this.referenceDir, testCase.module.moduleId, imageName, browser)

    const artifactsToCopy = artifact.attachments.flatMap((attachment) => {
      const role = attachment.name === 'reference' ? 'expected' : attachment.name
      if (role !== 'actual' && role !== 'expected' && role !== 'diff') return []

      return [
        {
          name: `${imageName}-${role}.png`,
          sourcePath: this.getSourcePath(testCase, browser, imageName, role, attachment.path, parsedPaths),
          contentType: attachment.contentType ?? 'image/png',
        },
      ]
    })

    return { artifactsToCopy, imageName, referencePath }
  }

  private async collectArtifacts(
    testCase: TestCase,
    browser: string,
    parsedImagePaths: ParsedVitestImagePaths[],
  ): Promise<{
    attachments: Array<{ name: string; path: string; contentType: string }>
    images: ReturnType<typeof buildImagesFromAttachments>
  }> {
    const approvalTargets: Partial<Record<string, string>> = {}
    const artifactsToCopy: Array<{ name: string; sourcePath: string; contentType: string }> = []

    for (const artifact of testCase.artifacts()) {
      if (!isVisualRegressionArtifact(artifact)) continue

      const artifactCopies = this.collectArtifactCopies(testCase, browser, artifact, parsedImagePaths)
      if (artifactCopies === null) continue

      approvalTargets[artifactCopies.imageName] = artifactCopies.referencePath
      artifactsToCopy.push(...artifactCopies.artifactsToCopy)
    }

    const savedAttachments = await this.transport.saveArtifacts(testCase.id, artifactsToCopy)
    const attachmentMap = new Map(savedAttachments.map((attachment) => [attachment.path, attachment.localPath]))
    const attachments = savedAttachments.map(({ localPath: _localPath, ...attachment }) => attachment)
    const images = buildImagesFromAttachments(attachments, {
      approvalTargets,
      resolveAttachmentPath: (attachmentPath) => attachmentMap.get(attachmentPath) ?? attachmentPath,
    })

    return { attachments, images }
  }
}

export default CreeveyVitestReporter
