/**
 * Start production Docker stack with .env.production (creates from example if missing).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const prodEnv = join(ROOT, '.env.production')
const prodExample = join(ROOT, '.env.production.example')
const compose = join(ROOT, 'deploy', 'docker-compose.yml')

if (!existsSync(prodEnv) && existsSync(prodExample)) {
  console.log('Creating .env.production from example — edit passwords before public go-live.')
  copyFileSync(prodExample, prodEnv)
}

if (!existsSync(prodEnv)) {
  console.error('Missing .env.production — copy .env.production.example first.')
  process.exit(1)
}

const args = process.argv.slice(2)
const sub = args[0] || 'up'
const extra = args.slice(1)

/** @type {string[]} */
let cmd
if (sub === 'down') {
  cmd = ['compose', '--env-file', prodEnv, '-f', compose, 'down', ...extra]
} else if (sub === 'logs') {
  cmd = ['compose', '--env-file', prodEnv, '-f', compose, 'logs', '-f', ...extra]
} else {
  cmd = ['compose', '--env-file', prodEnv, '-f', compose, 'up', '-d', '--build', ...extra]
}

const result = spawnSync('docker', cmd, { cwd: ROOT, stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
