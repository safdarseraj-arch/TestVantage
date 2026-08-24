/**
 * Pre-flight checks before production deploy.
 * Exit 0 = ready to run npm run live:deploy
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const warnings = []

function req(cond, msg) {
  if (!cond) errors.push(msg)
}

function warn(cond, msg) {
  if (!cond) warnings.push(msg)
}

req(existsSync(join(ROOT, 'deploy', 'docker-compose.yml')), 'Missing deploy/docker-compose.yml')
req(existsSync(join(ROOT, 'deploy', 'Dockerfile.api')), 'Missing deploy/Dockerfile.api')
req(existsSync(join(ROOT, 'deploy', 'nginx.conf')), 'Missing deploy/nginx.conf')
req(existsSync(join(ROOT, 'server', 'index.js')), 'Missing server/index.js')

const prodExample = join(ROOT, '.env.production.example')
const prodEnv = join(ROOT, '.env.production')
req(existsSync(prodExample), 'Missing .env.production.example')
warn(existsSync(prodEnv), 'No .env.production yet — live:deploy will copy from example')

if (existsSync(prodEnv)) {
  const raw = readFileSync(prodEnv, 'utf8')
  warn(!/CHANGE_ME|change-this-strong-password|admin123/i.test(raw), 'Change passwords/secrets in .env.production before public go-live')
  warn(/VITE_PLATFORM_SCALE=1/.test(raw), 'Set VITE_PLATFORM_SCALE=1 in .env.production for live sync')
  warn(/GEMINI_API_KEY=\S+/.test(raw), 'GEMINI_API_KEY not set — cloud OCR/solutions will use local/Pix2Text only')
}

const distIndex = join(ROOT, 'dist', 'index.html')
if (!existsSync(distIndex)) {
  warnings.push('dist/ not built yet — live:deploy runs live:build first')
} else {
  console.log('dist/index.html OK')
}

console.log('Checking JS syntax (may take ~1 min on OneDrive)…')
const syntax = spawnSync(process.execPath, ['scripts/check-src-syntax.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['inherit', 'pipe', 'pipe'],
})
if (syntax.stdout) process.stdout.write(syntax.stdout)
if (syntax.stderr) process.stderr.write(syntax.stderr)
if (syntax.status !== 0) {
  errors.push('Syntax check failed — run npm run test:syntax')
}

if (warnings.length) {
  console.warn('\nWarnings:')
  for (const w of warnings) console.warn('  •', w)
}

if (errors.length) {
  console.error('\nDeploy blocked:')
  for (const e of errors) console.error('  ✗', e)
  process.exit(1)
}

console.log('\ndeploy-preflight: OK — ready for npm run live:deploy')
