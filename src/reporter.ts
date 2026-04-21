import { join } from 'path'

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter'

import { buildImagesFromAttachments } from './images.ts'
import { CreeveyTransport, type CreeveyTransportOptions, type SavedAttachment } from './transport.ts'

function extractScreenshotNames(steps: TestStep[]): string[] {
  const names: string[] = []
  for (const step of steps) {
    const match = step.title.match(/toHaveScreenshot\((.+?)\)/)
    if (match?.[1] !== undefined && match[1] !== '') names.push(match[1])
    if (step.steps.length) names.push(...extractScreenshotNames(step.steps))
  }
  return names
}

function getTitlePath(test: TestCase): string[] {
  const titlePath: string[] = []
  let suite: Suite | undefined = test.parent

  while (suite && suite.type === 'describe') {
    titlePath.unshift(suite.title)
    suite = suite.parent
  }

  return titlePath
}

export interface CreeveyReporterOptions extends CreeveyTransportOptions {}

export class CreeveyReporter implements Reporter {
  private readonly transport: CreeveyTransport

  constructor(options: CreeveyReporterOptions = {}) {
    this.transport = new CreeveyTransport(options)
  }

  async onBegin(_config: FullConfig, suite: Suite): Promise<void> {
    console.log(`[CreeveyReporter] Starting run with ${suite.allTests().length} tests`)
    await this.transport.start()
  }

  onTestBegin(test: TestCase): void {
    this.transport.send({
      type: 'test-begin',
      data: {
        id: test.id,
        title: test.title,
        titlePath: getTitlePath(test),
        browser: test.parent.project()?.name ?? 'chromium',
        provider: 'playwright',
        location: {
          file: test.location.file,
          line: test.location.line,
        },
      },
    })
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const savedAttachments = await this.saveResultAttachments(test.id, result)
    const { attachments: baselineAttachments, approvalTargets } = await this.copySnapshotBaselines(test, result)
    const attachments = [...savedAttachments, ...baselineAttachments]
    const localPathByAttachment = new Map(attachments.map((attachment) => [attachment.path, attachment.localPath]))
    const images = buildImagesFromAttachments(attachments, {
      approvalTargets,
      resolveAttachmentPath: (attachmentPath) => localPathByAttachment.get(attachmentPath) ?? attachmentPath,
    })

    this.transport.send({
      type: 'test-end',
      data: {
        id: test.id,
        title: test.title,
        location: {
          file: test.location.file,
          line: test.location.line,
        },
        status: result.status,
        attachments,
        images,
        error: result.errors.length > 0 ? result.errors[0]?.message : undefined,
        duration: result.duration,
      },
    })
  }

  async onEnd(result: FullResult): Promise<void> {
    await this.transport.finish({
      status: result.status,
    })
  }

  private saveResultAttachments(testId: string, result: TestResult): Promise<SavedAttachment[]> {
    return this.transport.saveArtifacts(
      testId,
      result.attachments
        .filter(
          (attachment): attachment is typeof attachment & { path: string } =>
            attachment.contentType === 'image/png' && attachment.path !== undefined,
        )
        .map((attachment) => ({
          name: attachment.name,
          sourcePath: attachment.path,
          contentType: attachment.contentType,
        })),
    )
  }

  private async copySnapshotBaselines(
    test: TestCase,
    result: TestResult,
  ): Promise<{ attachments: SavedAttachment[]; approvalTargets: Partial<Record<string, string>> }> {
    if (result.status !== 'passed') {
      return { attachments: [], approvalTargets: {} }
    }

    const snapshotNames = extractScreenshotNames(result.steps)
    if (snapshotNames.length === 0) {
      return { attachments: [], approvalTargets: {} }
    }

    const projectName = test.parent.project()?.name ?? 'chromium'
    const snapshotDir = `${test.location.file}-snapshots`
    const approvalTargets: Partial<Record<string, string>> = {}
    const artifacts = snapshotNames.map((name) => {
      const baseName = name.replace(/\.png$/, '')
      const snapshotPath = join(snapshotDir, `${baseName}-${projectName}-${process.platform}.png`)
      approvalTargets[baseName] = snapshotPath

      return {
        name: `${baseName}-expected.png`,
        sourcePath: snapshotPath,
        contentType: 'image/png',
      }
    })

    const attachments = await this.transport.saveArtifacts(test.id, artifacts)
    return { attachments, approvalTargets }
  }
}

export default CreeveyReporter
