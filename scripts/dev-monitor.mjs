/**
 * Background watchdog — keeps Vite on port 5173 alive (detached from Cursor terminals).
 */
import {
  BASE_URL,
  LOG_FILE,
  clearLock,
  ensureNodeModules,
  isRunning,
  killPid,
  readLock,
  spawnDetachedVite,
  waitForServer,
  writeLock,
} from './dev-server-utils.mjs'
import { appendFileSync } from 'fs'

const CHECK_MS = 12_000
const RESTART_COOLDOWN_MS = 4000
const MAX_RAPID_RESTARTS = 8

let rapidRestarts = 0
let lastRestartAt = 0

function note(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    appendFileSync(LOG_FILE, line)
  } catch {
    /* ignore */
  }
}

async function ensureVite() {
  if (await isRunning()) {
    rapidRestarts = 0
    return
  }

  const now = Date.now()
  if (now - lastRestartAt < RESTART_COOLDOWN_MS) return
  lastRestartAt = now
  rapidRestarts += 1

  if (rapidRestarts > MAX_RAPID_RESTARTS) {
    note('dev-monitor: too many rapid restarts — waiting before retry')
    rapidRestarts = 0
    return
  }

  note('dev-monitor: server down — starting Vite')
  try {
    await ensureNodeModules()
  } catch (err) {
    note(`dev-monitor: npm install failed — ${err?.message || err}`)
    return
  }
  const vitePid = spawnDetachedVite()
  const lock = readLock() || {}
  writeLock({ ...lock, vitePid, mode: 'background' })
  try {
    await waitForServer(45_000)
    note('dev-monitor: Vite ready')
  } catch {
    note('dev-monitor: Vite did not respond in 45s — check .dev-server.log')
    if (lock.vitePid) killPid(lock.vitePid)
  }
}

async function loop() {
  note(`dev-monitor: watching ${BASE_URL}`)
  for (;;) {
    try {
      await ensureVite()
    } catch (err) {
      note(`dev-monitor: error ${err?.message || err}`)
    }
    await new Promise((r) => setTimeout(r, CHECK_MS))
  }
}

process.on('SIGINT', () => {
  clearLock()
  process.exit(0)
})

process.on('SIGTERM', () => {
  clearLock()
  process.exit(0)
})

loop()
