import { mount } from 'svelte'

import App from './client/App.svelte'
import { treeifyTests } from './client/helpers'
import { ReportApiResponseSchema, safeParse } from './schemas'
import type { CreeveySuite } from './types'

interface InitialState {
  tests: CreeveySuite
  isReport: boolean
  isUpdateMode: boolean
}

async function loadReportData(): Promise<InitialState> {
  const response = await fetch('/api/report')
  const data: unknown = await response.json()

  const parsed = safeParse(ReportApiResponseSchema, data)
  if (parsed === null) {
    throw new Error('Invalid API response format')
  }

  return {
    tests: treeifyTests(parsed.tests),
    isReport: true,
    isUpdateMode: parsed.isUpdateMode ?? false,
  }
}

const handleApprove = async (id: string, retry: number, image: string): Promise<void> => {
  await fetch('/api/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, retry, image }),
  })
}

const handleApproveAll = async (): Promise<void> => {
  await fetch('/api/approve-all', { method: 'POST' })
}

const root = document.getElementById('root')!
root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#808080;font-size:14px">Loading\u2026</div>`

const initialState = await loadReportData()

root.innerHTML = ''
mount(App, {
  target: root,
  props: {
    initialTests: initialState.tests,
    isReport: initialState.isReport,
    isUpdateMode: initialState.isUpdateMode,
    onApprove: handleApprove,
    onApproveAll: handleApproveAll,
  },
})
