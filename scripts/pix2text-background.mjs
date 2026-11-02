/**
 * Start Pix2Text Docker sidecar in background (local dev / optional).
 * Skips silently if Docker is not installed or image build fails.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPOSE = join(ROOT, 'deploy', 'docker-compose.pix2text.local.yml')

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

async function pingPix2Text() {
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch('http://127.0.0.1:8503/docs', { signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  if (process.env.PIX2TEXT_ENABLED === '0' || process.env.PIX2TEXT_ENABLED === 'false') {
    process.exit(0)
  }
  if (await pingPix2Text()) {
    console.log('Pix2Text already running at http://127.0.0.1:8503')
    process.exit(0)
  }
  if (!existsSync(COMPOSE)) {
    process.exit(0)
  }

  const ok = await run('docker', [
    'compose',
    '-f',
    COMPOSE,
    'up',
    '-d',
    '--build',
  ])
  if (!ok) {
    console.warn('Pix2Text Docker not started (Docker missing or build failed). Run: npm run pix2text:up')
    process.exit(0)
  }

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    if (await pingPix2Text()) {
      console.log('Pix2Text sidecar ready at http://127.0.0.1:8503')
      process.exit(0)
    }
  }
  console.warn('Pix2Text container started but not ready yet — first model download can take 5–10 min.')
  process.exit(0)
}

main().catch(() => process.exit(0))
