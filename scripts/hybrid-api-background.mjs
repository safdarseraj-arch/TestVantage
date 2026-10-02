/**
 * Start TestVantages Hybrid AI (FastAPI) on port 8000 in the background.
 */
import { spawn } from 'child_process'
import http from 'http'
import { existsSync, openSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HYBRID_HOST = '127.0.0.1'
const HYBRID_PORT = 8000

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HYBRID_HOST}:${HYBRID_PORT}/docs`, (res) => {
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
    console.log(`TestVantages Hybrid AI already running at http://${HYBRID_HOST}:${HYBRID_PORT}`)
    process.exit(0)
  }

  const mainPy = join(ROOT, 'main.py')
  if (!existsSync(mainPy)) {
    console.error('main.py not found   Hybrid AI not started')
    process.exit(0)
  }

  const logPath = join(ROOT, '.hybrid-api.log')
  let logFd = 'ignore'
  try {
    logFd = openSync(logPath, 'a')
  } catch {
    logFd = 'ignore'
  }

  const py = process.env.TESTVANTAGE_PYTHON || 'python'
  const child = spawn(
    py,
    ['-m', 'uvicorn', 'main:app', '--host', HYBRID_HOST, '--port', String(HYBRID_PORT)],
    {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
      env: { ...process.env },
    },
  )
  child.unref()

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await ping()) {
      console.log(`TestVantages Hybrid AI ready at http://${HYBRID_HOST}:${HYBRID_PORT}`)
      process.exit(0)
    }
  }

  console.warn(
    'Hybrid AI (uvicorn) did not respond on port 8000   install: pip install -r requirements-hybrid.txt',
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(0)
})
