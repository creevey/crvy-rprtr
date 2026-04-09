import { createServerApp, type ServerOptions } from './server/app.ts'
import { startBunServer } from './server/bun-adapter.ts'
import { startNodeServer } from './server/node-adapter.ts'

export type { ServerOptions } from './server/app.ts'

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const app = await createServerApp(options)

  if (typeof Bun !== 'undefined' && typeof Bun.serve === 'function') {
    startBunServer(app)
    return
  }

  await startNodeServer(app)
}
