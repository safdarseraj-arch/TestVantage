/**
 * Vite-only: serve the small SCQ trial live file and start the API sidecar.
 * Manage meta can watch last/current generation even while port 3001 is coming up.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonFileUtf8OrUtf16 } from './readJsonFile.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE_PATH = join(ROOT, 'data', 'gemini-scq-trial-live.json')
const LOCK_PATH = join(ROOT, 'data', 'gemini-scq-trial.lock')

function isPidAlive(pid) {
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (e) {
    return Boolean(e && e.code === 'EPERM')
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readLivePayload() {
  const lock = readJsonFileUtf8OrUtf16(LOCK_PATH)
  const scriptRunning = isPidAlive(lock?.pid)
  const live = readJsonFileUtf8OrUtf16(LIVE_PATH)
  const base = live && typeof live === 'object' ? live : {}
  return {
    ok: true,
    scriptRunning,
    ...base,
  }
}

function readReqBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim()
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function kickApiSidecar() {
  const script = join(ROOT, 'scripts', 'api-background.mjs')
  if (!existsSync(script)) return
  spawn(process.execPath, [script], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref()
}

export function scqTrialDevPlugin() {
  return {
    name: 'testvantage-scq-trial-dev',
    apply: 'serve',
    configureServer(server) {
      kickApiSidecar()
      server.middlewares.use(async (req, res, next) => {
        const url = String(req.url || '').split('?')[0]
        if (!url.startsWith('/api/vision/scq-trial/')) return next()
        try {
          if (req.method === 'GET' && url === '/api/vision/scq-trial/live') {
            sendJson(res, 200, readLivePayload())
            return
          }
          if (req.method === 'GET' && url === '/api/vision/scq-trial/status') {
            sendJson(res, 200, { ok: true, live: readLivePayload() })
            return
          }
          if (req.method === 'POST' && url === '/api/vision/scq-trial/start') {
            const body = await readReqBody(req)
            const { startTrialScript } = await import('./scqTrialLive.js')
            const result = startTrialScript({
              smoke: Boolean(body.smoke),
              full: body.full !== false && !body.smoke,
            })
            sendJson(res, result.ok ? 200 : 500, result)
            return
          }
          if (req.method === 'POST' && url === '/api/vision/scq-trial/heartbeat') {
            const body = await readReqBody(req)
            const { mergeTrialHeartbeat } = await import('./scqTrialLive.js')
            const live = mergeTrialHeartbeat(body)
            sendJson(res, 200, { ok: true, live })
            return
          }
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'Could not read the trial live log.',
          })
          return
        }
        next()
      })
    },
  }
}
