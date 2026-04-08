import type { ServerWebSocket } from 'bun'

export function broadcastToBrowsers(wsClients: Set<ServerWebSocket>, msg: object): void {
  const payload = JSON.stringify(msg)
  wsClients.forEach((ws) => {
    ws.send(payload)
  })
}
