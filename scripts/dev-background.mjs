/**
 * Start TestVantage dev server in the background (survives closing Cursor terminals).
 * Used by Cursor/VS Code auto-start task and npm run server:start.
 */
import { ensurePackageJson } from './ensure-package-json.mjs'
import {
  BASE_URL,
  ensureManagedServer,
  freePort,
  isRunning,
  log,
  PORT,
  stopManagedServer,
} from './dev-server-utils.mjs'

async function main() {
  ensurePackageJson()

  if (await isRunning()) {
    log(`TestVantage dev server already running at ${BASE_URL}`)
    process.exit(0)
  }

  log('')
  log('  TestVantage — starting background dev server')
  log('  This keeps running even if you close the terminal panel.')
  log(`  URL: ${BASE_URL}`)
  log('')

  await stopManagedServer()
  freePort(PORT)

  try {
    await ensureManagedServer({ wait: true, maxMs: 180_000 })
  } catch (err) {
    console.error('')
    console.error('  Server did not start in time.')
    console.error('  Try: npm run server:stop   then   press F5 (or npm run dev)')
    console.error('  Log file: onlinetest/.dev-server.log')
    console.error('')
    throw err
  }

  const { spawn } = await import('child_process')
  const { dirname, join } = await import('path')
  const { fileURLToPath } = await import('url')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const apiScript = join(root, 'scripts', 'api-background.mjs')
  spawn(process.execPath, [apiScript], { cwd: root, stdio: 'ignore', detached: true, windowsHide: true })

  const hybridScript = join(root, 'scripts', 'hybrid-api-background.mjs')
  spawn(process.execPath, [hybridScript], { cwd: root, stdio: 'ignore', detached: true, windowsHide: true })

  const pix2Script = join(root, 'scripts', 'pix2text-background.mjs')
  spawn(process.execPath, [pix2Script], { cwd: root, stdio: 'ignore', detached: true, windowsHide: true })

  process.exit(0)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
