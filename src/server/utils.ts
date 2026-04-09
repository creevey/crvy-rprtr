import type { RuntimeWebSocket } from './ws.ts'

export function broadcastToBrowsers(wsClients: Set<RuntimeWebSocket>, msg: object): void {
  const payload = JSON.stringify(msg)
  wsClients.forEach((ws) => {
    ws.send(payload)
  })
}
