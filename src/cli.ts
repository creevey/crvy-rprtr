#!/usr/bin/env bun
import { dirname, join } from 'path'
import { parseArgs } from 'util'

import { startServer, type ServerOptions } from './server.ts'

const DEFAULT_PORT = 3000
const DEFAULT_SCREENSHOT_DIR = './screenshots'
const DEFAULT_REPORT_PATH = './report.json'

interface ResolvedCliOptions extends ServerOptions {
  port: number
  screenshotDir: string
  reportPath: string
  offlineReportDir: string
}

export function resolveCliOptions(args: string[]): ResolvedCliOptions {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p', default: `${DEFAULT_PORT}` },
      'screenshot-dir': { type: 'string', short: 's' },
      'report-path': { type: 'string', short: 'r' },
      'offline-report-dir': { type: 'string' },
    },
  })

  if (positionals.length > 1) {
    throw new TypeError(`Expected at most one artifact directory, received ${positionals.length}`)
  }

  const artifactDir = positionals[0]
  const reportPath =
    values['report-path'] ?? (artifactDir === undefined ? DEFAULT_REPORT_PATH : join(artifactDir, 'report.json'))
  const screenshotDir =
    values['screenshot-dir'] ?? (artifactDir === undefined ? DEFAULT_SCREENSHOT_DIR : join(artifactDir, 'screenshots'))

  return {
    port: parseInt(values.port ?? `${DEFAULT_PORT}`, 10),
    screenshotDir,
    reportPath,
    offlineReportDir: values['offline-report-dir'] ?? dirname(reportPath),
  }
}

if (import.meta.main) {
  await startServer(resolveCliOptions(process.argv.slice(2)))
}
