import { createServer, type IncomingMessage, type ServerResponse } from 'http'

import { WebSocketServer, type RawData, type WebSocket } from 'ws'

import type { ServerApp } from './app.ts'
import { LIVE_UPDATES_WEBSOCKET_PATH } from './routes.ts'

function toHeaders(headersObject: IncomingMessage['headers']): Headers {
  const headers = new Headers()

  for (const [key, value] of Object.entries(headersObject)) {
    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        headers.append(key, entry)
      })
    } else {
      headers.set(key, value)
    }
  }

  return headers
}

async function readRequestBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    const chunkValue: unknown = chunk
    if (typeof chunkValue === 'string') {
      chunks.push(Buffer.from(chunkValue))
      continue
    }

    if (chunkValue instanceof Uint8Array) {
      chunks.push(chunkValue)
      continue
    }

    throw new TypeError('Unexpected request body chunk type')
  }

  return Buffer.concat(chunks)
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = toHeaders(req.headers)
  const protocol = headers.get('x-forwarded-proto') ?? 'http'
  const host = headers.get('host') ?? 'localhost'
  const url = new URL(req.url ?? '/', `${protocol}://${host}`)
  const method = req.method ?? 'GET'

  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }

  const body = await readRequestBody(req)
  return new Request(url, {
    method,
    headers,
    body: Buffer.from(body),
  })
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  res.statusMessage = response.statusText

  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (response.body === null) {
    res.end()
    return
  }

  const body = Buffer.from(await response.arrayBuffer())
  res.end(body)
}

function logRequestError(error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error('Error handling HTTP request:', errorMsg)
}

function logWebSocketError(error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error('Error handling WebSocket message:', errorMsg)
}

async function handleNodeRequest(app: ServerApp, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const request = await toRequest(req)
    const response = await app.handleRequest(request)
    await writeResponse(res, response)
  } catch (error) {
    logRequestError(error)
    if (res.headersSent) {
      res.end()
      return
    }

    res.statusCode = 500
    res.end('Internal Server Error')
  }
}

function rawDataToString(message: RawData): string {
  if (typeof message === 'string') {
    return message
  }

  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString()
  }

  if (Array.isArray(message)) {
    return Buffer.concat(message.map((part) => Buffer.from(part))).toString()
  }

  return Buffer.from(message).toString()
}

function attachWebSocketServer(server: ReturnType<typeof createServer>, app: ServerApp): void {
  const wsServer = new WebSocketServer({ noServer: true })
  wsServer.on('error', (error: Error) => {
    logWebSocketError(error)
  })

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (pathname !== LIVE_UPDATES_WEBSOCKET_PATH) {
      socket.destroy()
      return
    }

    wsServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      app.wsClients.add(ws)
      ws.on('message', (message: RawData) => {
        app.handleWebSocketMessage(rawDataToString(message)).catch((error: unknown) => {
          logWebSocketError(error)
        })
      })
      ws.on('error', (error: Error) => {
        app.wsClients.delete(ws)
        logWebSocketError(error)
      })
      ws.on('close', () => {
        app.wsClients.delete(ws)
      })
    })
  })
}

async function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('error', onError)
      reject(error)
    }

    server.on('error', onError)
    server.listen(port, () => {
      server.off('error', onError)
      resolve()
    })
  })
}

export async function startNodeServer(app: ServerApp): Promise<void> {
  const server = createServer((req, res): void => {
    void handleNodeRequest(app, req, res)
  })

  attachWebSocketServer(server, app)
  await listen(server, app.port)
  console.log(`Crvy Rprtr started at http://localhost:${app.port}`)
}
