/**
 * Start TestVantages Hybrid AI (FastAPI) on port 8000 in the background.
 */
import { spawn } from 'child_process'
import http from 'http'
import { existsSync, openSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { freePort } from './dev-server-utils.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HYBRID_HOST = '127.0.0.1'
const HYBRID_PORT = 8000

function pingPath(pathname, { collectBody = false } = {}) {
  return new Promise((resolve) => {
    const req = http.get(`http://${HYBRID_HOST}:${HYBRID_PORT}${pathname}`, (res) => {
      if (!collectBody) {
        res.resume()
        resolve(Boolean(res.statusCode && res.statusCode < 500))
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({ ok: Boolean(res.statusCode && res.statusCode < 500), status: res.statusCode, body })
      })
    })
    req.on('error', () => resolve(collectBody ? { ok: false, status: 0, body: '' } : false))
    req.setTimeout(8000, () => {
      req.destroy()
      resolve(collectBody ? { ok: false, status: 0, body: '' } : false)
    })
  })
}

/** Must match UI pingBankApi (/api/health → ok: true). Stale uvicorn without this route stays "offline". */
async function isHybridApiHealthy() {
  const health = await pingPath('/api/health', { collectBody: true })
  if (!health.ok || health.status === 404) return false
  try {
    const data = JSON.parse(health.body)
    if (data?.ok !== true) return false
  } catch {
    return false
  }
  const poolOk = await pingPath('/api/questions/pool?limit=1&approved_only=false')
  return poolOk
}

async function main() {
  if (await isHybridApiHealthy()) {
    console.log(`TestVantages Hybrid AI already running at http://${HYBRID_HOST}:${HYBRID_PORT}`)
    process.exit(0)
  }

  const mainPy = join(ROOT, 'main.py')
  if (!existsSync(mainPy)) {
    console.error('main.py not found — Hybrid AI not started')
    process.exit(0)
  }

  freePort(HYBRID_PORT)

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
    if (await isHybridApiHealthy()) {
      console.log(`TestVantages Hybrid AI ready at http://${HYBRID_HOST}:${HYBRID_PORT}`)
      process.exit(0)
    }
  }

  console.warn(
    'Hybrid AI (uvicorn) did not respond on port 8000 — run: pip install -r requirements-hybrid.txt',
  )
  try {
    const { readFileSync } = await import('fs')
    const tail = readFileSync(logPath, 'utf8').slice(-2500)
    if (/python-multipart/i.test(tail)) {
      console.warn('  Fix: pip install python-multipart   (or pip install -r requirements-hybrid.txt)')
    } else if (tail.trim()) {
      const lines = tail.trim().split(/\r?\n/).slice(-6)
      console.warn('  Last Hybrid AI log lines:\n', lines.join('\n'))
    }
  } catch {
    /* no log yet */
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(0)
})
