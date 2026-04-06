#!/usr/bin/env bun
import { parseArgs } from 'util'

import { startServer } from './server.ts'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', short: 'p', default: '3000' },
    'screenshot-dir': { type: 'string', short: 's', default: './screenshots' },
    'report-path': { type: 'string', short: 'r', default: './report.json' },
  },
})

await startServer({
  port: parseInt(values.port ?? '3000', 10),
  screenshotDir: values['screenshot-dir'] ?? './screenshots',
  reportPath: values['report-path'] ?? './report.json',
})
