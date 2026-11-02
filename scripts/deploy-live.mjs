/**
 * Build production bundle + start Docker live stack.
 * Run from onlinetest folder on your cloud server.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, shell: true, stdio: 'inherit', ...opts })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const prodEnv = join(ROOT, '.env.production')
const prodExample = join(ROOT, '.env.production.example')

if (!existsSync(prodEnv) && existsSync(prodExample)) {
  console.log('Creating .env.production from example…')
  copyFileSync(prodExample, prodEnv)
}

console.log('\n0/3 — Deploy pre-flight…\n')
run('node', ['scripts/deploy-preflight.mjs'])

console.log('\n1/3 — Production build (VITE_PLATFORM_SCALE=1)…\n')
run('npm', ['run', 'live:build'])

console.log('\n2/3 — Starting Docker stack (Postgres + Redis + Pix2Text + API + nginx)…\n')
run('npm', ['run', 'stack:up'])

console.log('\n3/3 — Live platform ready at http://localhost:8080')
console.log(
  'Next: set VITE_PUBLIC_SITE_URL=https://www.testvantages.com, TESTVANTAGE_CORS_ORIGIN (comma list), + HTTPS (deploy/nginx-ssl.conf.example).',
)
console.log('Health: http://localhost:8080/api/health  ·  Admin login at /login\n')
