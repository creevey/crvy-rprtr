import { describe, expect, test } from 'bun:test'

import { isBulkApprovalOptimisticSafe, readApproveAllResult, readApproveResult } from '../src/approval-api'

describe('approval api results', () => {
  test('single approve returns success false for non-ok responses and failed bodies', async () => {
    const nonOkResult = await readApproveResult(
      new Response(JSON.stringify({ success: true }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const failedBodyResult = await readApproveResult(
      new Response(JSON.stringify({ success: false, error: 'Test not found' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    expect(nonOkResult.success).toBe(false)
    expect(failedBodyResult.success).toBe(false)
  })

  test('bulk approve is only optimistic-safe when success is true with zero unresolved and failed counts', async () => {
    const partialResult = await readApproveAllResult(
      new Response(JSON.stringify({ success: true, approved: 3, unresolved: 1, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const fullResult = await readApproveAllResult(
      new Response(JSON.stringify({ success: true, approved: 3, unresolved: 0, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    expect(partialResult).toEqual({ success: true, approved: 3, unresolved: 1, failed: 0 })
    expect(isBulkApprovalOptimisticSafe(partialResult)).toBe(false)
    expect(isBulkApprovalOptimisticSafe(fullResult)).toBe(true)
  })
})
