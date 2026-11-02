/**
 * Start TestVantages API in the background (port 3001).
 */
import { spawn } from 'child_process'
import http from 'http'
import { existsSync, openSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API_PORT = 3001
const API_HOST = '127.0.0.1'
const _LOCK = join(ROOT, '.api-server.lock')

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://${API_HOST}:${API_PORT}/api/health`, (res) => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode < 500))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function main() {
  if (await ping()) {
    console.log(`TestVantages API already running at http://${API_HOST}:${API_PORT}`)
    process.exit(0)
  }

  const entry = join(ROOT, 'server', 'index.js')
  if (!existsSync(entry)) {
    console.error('server/index.js not found')
    process.exit(1)
  }

  const logPath = join(ROOT, '.api-server.log')
  let logFd = 'ignore'
  try {
    logFd = openSync(logPath, 'a')
  } catch {
    logFd = 'ignore'
  }
  const child = spawn(process.execPath, [entry], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  })
  child.unref()

  const pix2Script = join(ROOT, 'scripts', 'pix2text-background.mjs')
  if (existsSync(pix2Script)) {
    spawn(process.execPath, [pix2Script], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
  }

  const hybridScript = join(ROOT, 'scripts', 'hybrid-api-background.mjs')
  if (existsSync(hybridScript)) {
    spawn(process.execPath, [hybridScript], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
  }

  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await ping()) {
      console.log(`TestVantages API ready at http://${API_HOST}:${API_PORT}`)
      process.exit(0)
    }
  }

  console.error('API did not start in time — keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5 or run: npm run api')
  process.exit(1)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
