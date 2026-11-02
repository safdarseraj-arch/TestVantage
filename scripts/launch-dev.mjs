/**
 * Interactive dev server — shows Vite logs in this terminal (for START-HERE.bat).
 * Auto-restarts if Vite crashes. Use dev-background.mjs for Cursor auto-start instead.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { ensurePackageJson } from './ensure-package-json.mjs'
import {
  BASE_URL,
  ensureStackServices,
  HOST,
  PORT,
  ROOT,
  freePort,
  isRunning,
  log,
  openBrowser,
  waitForServer,
} from './dev-server-utils.mjs'

const OPEN_PATH = '/home'
const MAX_RESTARTS = 30
const RESTART_DELAY_MS = 3000

let shuttingDown = false
let restartCount = 0
let browserOpened = false
/** @type {import('child_process').ChildProcess | null} */
let viteProcess = null

function checkNodeModules() {
  if (existsSync(join(ROOT, 'node_modules'))) return Promise.resolve()
  log('First run: installing dependencies (may take 1–2 minutes)...')
  return new Promise((resolve, reject) => {
    const install = spawn('npm', ['install'], { cwd: ROOT, shell: true, stdio: 'inherit' })
    install.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('npm install failed'))))
  })
}

function scheduleBrowserOpen() {
  waitForServer()
    .then(() => {
      if (!browserOpened) {
        browserOpened = true
        openBrowser(OPEN_PATH)
      }
    })
    .catch((err) => {
      console.error(err.message)
    })
}

function startVite() {
  if (shuttingDown) return

  const vite = spawn('npx', ['vite', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, BROWSER: 'none' },
  })

  viteProcess = vite

  if (!browserOpened) {
    setTimeout(scheduleBrowserOpen, 800)
  }

  vite.on('exit', (code) => {
    viteProcess = null
    if (shuttingDown) {
      process.exit(code ?? 0)
      return
    }

    restartCount += 1
    if (restartCount > MAX_RESTARTS) {
      console.error(
        `\nDev server stopped ${MAX_RESTARTS} times. Check errors above, then run: npm run dev\n`,
      )
      process.exit(code ?? 1)
      return
    }

    log('')
    log(`  Dev server stopped (exit ${code ?? 0}). Restarting in ${RESTART_DELAY_MS / 1000}s…`)
    log('  Press Ctrl+C in this window to stop completely.')
    log('')
    setTimeout(startVite, RESTART_DELAY_MS)
  })
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  log('\nStopping dev server…')
  viteProcess?.kill('SIGINT')
  setTimeout(() => viteProcess?.kill('SIGTERM'), 2000)
}

async function main() {
  if (await isRunning()) {
    log(`Dev server already running at ${BASE_URL}`)
    log('Ensuring Hybrid AI (port 8000)…')
    await ensureStackServices({ waitForHybrid: true, hybridScript: 'hybrid-api-background.mjs' })
    log('Opening browser…')
    openBrowser(OPEN_PATH)
    process.exit(0)
  }

  log('')
  log('  TestVantages — dev server (auto-restart enabled)')
  log('  Keep this window open while you use the app.')
  log(`  URL: ${BASE_URL}`)
  log('')

  ensurePackageJson()
  await checkNodeModules()
  freePort(PORT)

  ensureStackServices({ waitForHybrid: false, hybridScript: 'hybrid-api-background.mjs' }).catch((err) => {
    console.error(err?.message || err)
  })

  startVite()

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
