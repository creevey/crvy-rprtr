import type { ServerWebSocket } from 'bun'

import { buildImagesFromAttachments } from '../images.ts'
import type { Attachment, Images, TestData } from '../types.ts'

export function attachmentsToImages(attachments: Attachment[]): Partial<Record<string, Images>> {
  return buildImagesFromAttachments(attachments)
}

export function broadcastToBrowsers(wsClients: Set<ServerWebSocket>, msg: object): void {
  const payload = JSON.stringify(msg)
  wsClients.forEach((ws) => {
    ws.send(payload)
  })
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
