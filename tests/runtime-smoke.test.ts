import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { join } from 'path'
import { pathToFileURL } from 'url'

interface RunningProcess {
  process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  stdoutPromise: Promise<string>
  stderrPromise: Promise<string>
}

const runningProcesses: RunningProcess[] = []

function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  return stream === null ? Promise.resolve('') : new Response(stream).text()
}

function reservePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to allocate a TCP port'))
        return
      }

      server.close((error) => {
        if (error !== undefined) {
          reject(error)
          return
        }

        resolve(address.port)
      })
    })
  })
}

function spawnProcess(command: string[]): RunningProcess {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )

  const subprocess = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env,
  })
  const runningProcess = {
    process: subprocess,
    stdoutPromise: readStream(subprocess.stdout),
    stderrPromise: readStream(subprocess.stderr),
  }
  runningProcesses.push(runningProcess)
  return runningProcess
}

async function waitForServer(port: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/report`
  let lastError: unknown

  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }

      lastError = new Error(`Unexpected status ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await Bun.sleep(100)
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Server did not start on port ${port}: ${message}`)
}

async function assertUiAssets(port: number): Promise<void> {
  const [rootResponse, scriptResponse] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/`),
    fetch(`http://127.0.0.1:${port}/dist/index.js`),
  ])

  expect(rootResponse.status).toBe(200)
  expect(await rootResponse.text()).toContain('<div id="root"></div>')
  expect(scriptResponse.status).toBe(200)
  expect(await scriptResponse.text()).toContain('mount(')
}

async function waitForServerOrThrow(port: number, runningProcess: RunningProcess): Promise<void> {
  try {
    await waitForServer(port)
    await assertUiAssets(port)
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n${await getFailureOutput(runningProcess)}`,
      { cause: error },
    )
  }
}

async function stopProcess(runningProcess: RunningProcess): Promise<void> {
  runningProcess.process.kill()
  await runningProcess.process.exited
}

async function getFailureOutput(runningProcess: RunningProcess): Promise<string> {
  const [stdout, stderr] = await Promise.all([runningProcess.stdoutPromise, runningProcess.stderrPromise])
  return [stdout.trim(), stderr.trim()].filter((chunk) => chunk !== '').join('\n')
}

afterEach(async () => {
  while (runningProcesses.length > 0) {
    const runningProcess = runningProcesses.pop()
    if (runningProcess !== undefined) {
      await stopProcess(runningProcess)
    }
  }
})

describe('runtime smoke tests', () => {
  test('published CLI starts under Node', async () => {
    expect(existsSync('./dist/cli.js')).toBe(true)

    const port = await reservePort()
    const runningProcess = spawnProcess(['node', './dist/cli.js', '--port', `${port}`])

    await waitForServerOrThrow(port, runningProcess)
  })

  test('published CLI starts under Bun', async () => {
    expect(existsSync('./dist/cli.js')).toBe(true)

    const port = await reservePort()
    const runningProcess = spawnProcess(['bun', './dist/cli.js', '--port', `${port}`])

    await waitForServerOrThrow(port, runningProcess)
  })

  test('programmatic server API starts under Node', async () => {
    expect(existsSync('./dist/server.js')).toBe(true)

    const port = await reservePort()
    const serverModuleUrl = pathToFileURL(join(process.cwd(), 'dist/server.js')).href
    const runningProcess = spawnProcess([
      'node',
      '--input-type=module',
      '--eval',
      `const { startServer } = await import(${JSON.stringify(serverModuleUrl)}); await startServer({ port: ${port} }); await new Promise(() => {});`,
    ])

    await waitForServerOrThrow(port, runningProcess)
  })
})
