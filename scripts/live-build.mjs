/**
 * Production frontend build — ensures .env.production exists (VITE_PLATFORM_SCALE=1).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const prodEnv = join(ROOT, '.env.production')
const prodExample = join(ROOT, '.env.production.example')

if (!existsSync(prodEnv) && existsSync(prodExample)) {
  console.log('Creating .env.production from example (edit passwords before public go-live).')
  copyFileSync(prodExample, prodEnv)
}

if (!existsSync(prodEnv)) {
  console.error('Missing .env.production — copy .env.production.example first.')
  process.exit(1)
}

const onOneDrive = /OneDrive/i.test(ROOT)
if (onOneDrive) {
  console.log(
    'OneDrive folder detected — Vite cache uses %TEMP%. Production build may take 5–15 min; wait for "built in".',
  )
}

const result = spawnSync('npx', ['vite', 'build', '--mode', 'production', '--logLevel', 'info'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)
