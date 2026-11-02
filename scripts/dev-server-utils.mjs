/**
 * Shared helpers for TestVantages dev server (port 5173).
 */
import { spawn, exec, execSync } from 'child_process'
import http from 'http'
import { existsSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
export const PORT = 5173
export const HOST = '127.0.0.1'
export const BASE_URL = `http://${HOST}:${PORT}/`
export const LOCALHOST_URL = `http://localhost:${PORT}/`
export const LOCK_FILE = join(ROOT, '.dev-server.lock')
export const LOG_FILE = join(ROOT, '.dev-server.log')

export function log(msg) {
  console.log(msg)
}

export function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(Boolean(res.statusCode && res.statusCode < 500))
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function isRunning() {
  return (await ping(BASE_URL)) || (await ping(LOCALHOST_URL))
}

export function waitForServer(maxMs = 90000) {
  const deadline = Date.now() + maxMs
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      if (await isRunning()) {
        resolve()
        return
      }
      if (Date.now() > deadline) {
        reject(new Error(`Server did not start within ${maxMs / 1000}s`))
        return
      }
      setTimeout(tryOnce, 400)
    }
    tryOnce()
  })
}

/** Stop any process already listening on PORT. */
export function freePort(port = PORT) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        windowsHide: true,
      })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && /^\d+$/.test(pid)) pids.add(pid)
      }
      for (const pid of pids) {
        if (pid === String(process.pid)) continue
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true })
          log(`Freed port ${port} (stopped PID ${pid})`)
        } catch {
          /* already gone */
        }
      }
      return
    }
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, {
      shell: true,
      stdio: 'ignore',
    })
  } catch {
    /* port likely free */
  }
}

function isPidAlive(pid) {
  if (!pid) return false
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: 'utf8',
        windowsHide: true,
      })
      return out.includes(String(pid))
    }
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readLock() {
  if (!existsSync(LOCK_FILE)) return null
  try {
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'))
  } catch {
    return null
  }
}

export function writeLock(data) {
  writeFileSync(LOCK_FILE, JSON.stringify({ ...data, updatedAt: Date.now() }, null, 2))
}

export function clearLock() {
  if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE)
}

export function killPid(pid) {
  if (!pid || pid === process.pid) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', windowsHide: true })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    /* already gone */
  }
}

export async function stopManagedServer() {
  const lock = readLock()
  if (lock?.monitorPid) killPid(lock.monitorPid)
  if (lock?.vitePid) killPid(lock.vitePid)
  clearLock()
  freePort(PORT)
}

export function ensureNodeModules() {
  if (existsSync(join(ROOT, 'node_modules', 'vite'))) return Promise.resolve()
  log('Installing dependencies (first run or after sync) — may take 1–2 minutes…')
  return new Promise((resolve, reject) => {
    const install = spawn('npm', ['install'], {
      cwd: ROOT,
      shell: true,
      stdio: 'inherit',
      windowsHide: true,
    })
    install.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('npm install failed — run npm install in onlinetest')),
    )
  })
}

function viteSpawnArgs() {
  const args = ['--host', HOST, '--port', String(PORT), '--strictPort']
  if (existsSync(VITE_BIN)) {
    return { command: process.execPath, args: [VITE_BIN, ...args] }
  }
  return { command: 'npx', args: ['vite', ...args] }
}

export function spawnDetachedVite() {
  const logFd = openSync(LOG_FILE, 'a')
  const { command, args } = viteSpawnArgs()
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    shell: command === 'npx',
    env: { ...process.env, BROWSER: 'none' },
    windowsHide: true,
  })
  child.unref()
  return child.pid
}

export function spawnDetachedMonitor() {
  const script = join(ROOT, 'scripts', 'dev-monitor.mjs')
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return child.pid
}

export async function startBackgroundService({ wait = true, maxMs = 90000 } = {}) {
  if (await isRunning()) {
    log(`Dev server already running at ${BASE_URL}`)
    return
  }

  await ensureNodeModules()

  const lock = readLock()
  if (lock?.monitorPid && isPidAlive(lock.monitorPid)) {
    if (wait) await waitForServer(maxMs)
    return
  }

  const monitorPid = spawnDetachedMonitor()
  writeLock({ monitorPid, vitePid: null, mode: 'background' })

  if (wait) {
    await waitForServer(maxMs)
    log(`Dev server ready at ${BASE_URL}`)
  }
}

export async function ensureManagedServer({ wait = true, maxMs = 90000 } = {}) {
  if (await isRunning()) return true

  const lock = readLock()
  if (lock?.monitorPid && isPidAlive(lock.monitorPid)) {
    if (wait) await waitForServer(maxMs)
    return true
  }

  await startBackgroundService({ wait, maxMs })
  return true
}

export function openBrowser(path = '/home') {
  const target = `http://${HOST}:${PORT}${path}`
  log(`Opening ${target}`)
  if (process.platform === 'win32') {
    exec(`start "" "${target}"`, { shell: true })
  } else if (process.platform === 'darwin') {
    exec(`open "${target}"`)
  } else {
    exec(`xdg-open "${target}"`)
  }
}

function runStackScript(scriptName, { wait = false, stdio = 'ignore' } = {}) {
  const script = join(ROOT, 'scripts', scriptName)
  const child = spawn(process.execPath, [script], {
    cwd: ROOT,
    stdio,
    detached: !wait,
    windowsHide: true,
  })
  if (!wait) {
    child.unref()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    child.on('exit', () => resolve())
  })
}

/** Node API (:3001), Hybrid FastAPI (:8000), Pix2Text — even when Vite is already up. */
export async function ensureStackServices({
  waitForHybrid = true,
  hybridScript = 'hybrid-api-background.mjs',
} = {}) {
  const script = hybridScript || 'hybrid-api-background.mjs'
  if (waitForHybrid) {
    await runStackScript(script, { wait: true, stdio: 'inherit' })
  } else {
    await runStackScript(script, { wait: false })
  }
  await runStackScript('api-background.mjs', { wait: false })
  await runStackScript('pix2text-background.mjs', { wait: false })
}
