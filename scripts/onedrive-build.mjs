/**
 * Production build off OneDrive — Vite hangs on "transforming…" when node_modules
 * lives on synced folders. Syncs to LOCALAPPDATA, builds there, copies dist/ back.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL =
  process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
const BUILD_ROOT = join(LOCAL, 'testvantage-build')
const STAMP = join(BUILD_ROOT, '.package-lock-hash')

/** @param {string} rel */
function copyIntoBuild(rel) {
  const src = join(ROOT, rel)
  if (!existsSync(src)) return
  cpSync(src, join(BUILD_ROOT, rel), { recursive: true, force: true })
}

function lockHash() {
  const lock = join(ROOT, 'package-lock.json')
  if (!existsSync(lock)) return 'no-lock'
  return createHash('sha256')
    .update(readFileSync(lock))
    .digest('hex')
    .slice(0, 16)
}

function syncNodeModules() {
  const hash = lockHash()
  const nm = join(BUILD_ROOT, 'node_modules')
  const prev = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : ''
  if (existsSync(nm) && prev === hash) return

  console.log(
    'First build (or package-lock changed): copying node_modules to local disk — may take 5–10 min…',
  )
  if (existsSync(nm)) rmSync(nm, { recursive: true, force: true })

  const srcNm = join(ROOT, 'node_modules')
  if (!existsSync(srcNm)) {
    console.error('Missing node_modules — run npm install in the project folder first.')
    process.exit(1)
  }

  const result = spawnSync(
    'robocopy',
    [
      srcNm,
      nm,
      '/E',
      '/MT:8',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/nc',
      '/ns',
      '/np',
      '/R:2',
      '/W:2',
    ],
    { stdio: 'inherit', shell: true },
  )
  const code = result.status ?? 1
  if (code >= 8) {
    console.error('robocopy node_modules failed with code', code)
    process.exit(1)
  }
  writeFileSync(STAMP, hash)
}

function syncSources() {
  mkdirSync(BUILD_ROOT, { recursive: true })
  for (const rel of [
    'src',
    'public',
    'server',
    'index.html',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    '.env.production',
  ]) {
    copyIntoBuild(rel)
  }
  syncNodeModules()
}

function runBuild() {
  const env = { ...process.env, VITE_CACHE_DIR: join(tmpdir(), 'testvantage-vite-cache') }
  delete env.DEBUG
  console.log('Building in', BUILD_ROOT, '(first run ~15–25 min on Windows)')
  const result = spawnSync(
    'npx',
    ['vite', 'build', '--mode', 'production', '--logLevel', 'info'],
    { cwd: BUILD_ROOT, stdio: 'inherit', shell: true, env },
  )
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
}

function copyDistBack() {
  const srcDist = join(BUILD_ROOT, 'dist')
  const destDist = join(ROOT, 'dist')
  if (!existsSync(srcDist)) {
    console.error('Build finished but dist/ missing in', BUILD_ROOT)
    process.exit(1)
  }
  rmSync(destDist, { recursive: true, force: true })
  cpSync(srcDist, destDist, { recursive: true })
  console.log('dist/ copied back to project folder.')
}

syncSources()
runBuild()
copyDistBack()
