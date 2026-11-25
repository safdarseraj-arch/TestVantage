/**
 * Run vite build off OneDrive (AppData mirror) and write log + exit code.
 * Avoids PowerShell redirection / OneDrive lock issues on the project folder.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
const BUILD_ROOT = join(LOCAL, 'testvantage-build')
const OUT = join(ROOT, 'vite-build-out.txt')

if (!existsSync(join(BUILD_ROOT, 'node_modules', 'vite'))) {
  console.error('Missing local build mirror — run: node scripts/onedrive-build.mjs once first')
  process.exit(1)
}

mkdirSync(BUILD_ROOT, { recursive: true })
for (const rel of [
  'vite.config.js',
  'index.html',
  'package.json',
  join('src', 'utils', 'attemptHistory.js'),
]) {
  const src = join(ROOT, rel)
  const dest = join(BUILD_ROOT, rel)
  if (!existsSync(src)) continue
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
}

// Sync full src tree so analytics changes are included
spawnSync(
  'robocopy',
  [join(ROOT, 'src'), join(BUILD_ROOT, 'src'), '/E', '/XO', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np', '/R:1', '/W:1'],
  { stdio: 'ignore', shell: true },
)

const result = spawnSync('npx', ['vite', 'build', '--logLevel', 'error'], {
  cwd: BUILD_ROOT,
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, VITE_CACHE_DIR: join(LOCAL, 'Temp', 'testvantage-vite-cache') },
  maxBuffer: 20 * 1024 * 1024,
})

const body = [result.stdout || '', result.stderr || ''].join('')
const code = result.status ?? 1
writeFileSync(
  OUT,
  `${body}${body && !body.endsWith('\n') ? '\n' : ''}EXIT=${code}\n`,
  'utf8',
)
process.exit(code)
