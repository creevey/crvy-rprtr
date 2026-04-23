import { join } from 'path'

import type { Attachment, Images } from './types.ts'

export type ImageRole = 'actual' | 'expected' | 'diff'

export interface BuildImagesOptions {
  approvalTargets?: Partial<Record<string, string>>
  resolveAttachmentPath?: (attachmentPath: string) => string
}

function isImageRole(role: string): role is ImageRole {
  return role === 'actual' || role === 'expected' || role === 'diff'
}

export function parseImageAttachmentName(name: string): { imageName: string; role: ImageRole } | null {
  const match = name.match(/^(.+?)-(actual|expected|diff)(?:\.png)?$/)
  const imageName = match?.[1]
  const role = match?.[2]
  if (imageName === undefined || role === undefined || !isImageRole(role)) return null

  return {
    imageName,
    role,
  }
}

export function getScreenshotUrl(path: string): string {
  return `/screenshots/${path}`
}

export function resolveSavedAttachmentPath(screenshotDir: string, attachmentPath: string): string {
  return join(screenshotDir, attachmentPath)
}

function applyApprovalMetadata(
  image: Images,
  role: ImageRole,
  approvalTarget: string | undefined,
  resolvedPath: string,
): void {
  if (approvalTarget === undefined) return

  if (role === 'actual') {
    image.approveFromPath = resolvedPath
    image.approveToPath = approvalTarget
    return
  }

  if (role === 'expected') {
    image.approveFromPath ??= resolvedPath
    image.approveToPath = approvalTarget
  }
}

function applyAttachmentToImage(
  image: Images,
  attachment: Attachment,
  role: ImageRole,
  approvalTarget: string | undefined,
  resolvedPath: string,
): void {
  const url = getScreenshotUrl(attachment.path)

  if (role === 'actual') {
    image.actual = url
  } else if (role === 'expected') {
    image.expect = url
  } else {
    image.diff = url
  }

  applyApprovalMetadata(image, role, approvalTarget, resolvedPath)
}

function normalizePassingImages(images: Partial<Record<string, Images>>): void {
  for (const image of Object.values(images)) {
    if (
      image?.actual !== null &&
      image?.actual !== undefined &&
      image?.expect !== null &&
      image?.expect !== undefined &&
      image?.diff === undefined
    ) {
      delete image.expect
    }
  }
}

export function buildImagesFromAttachments(
  attachments: Attachment[],
  { approvalTargets = {}, resolveAttachmentPath = (attachmentPath) => attachmentPath }: BuildImagesOptions = {},
): Partial<Record<string, Images>> {
  const images: Partial<Record<string, Images>> = {}

  for (const attachment of attachments) {
    if (attachment.contentType !== 'image/png') continue

    const parsedName = parseImageAttachmentName(attachment.name)
    if (parsedName === null) continue

    const { imageName, role } = parsedName
    const approvalTarget = approvalTargets[imageName]
    const resolvedPath = resolveAttachmentPath(attachment.path)

    images[imageName] ??= {}
    const image = images[imageName]
    if (image === null || image === undefined) continue
    applyAttachmentToImage(image, attachment, role, approvalTarget, resolvedPath)
  }

  normalizePassingImages(images)
  return images
}
