/**
 * Start TestVantages dev server in the background (survives closing Cursor terminals).
 * Used by Cursor/VS Code auto-start task and npm run server:start.
 */
import { ensurePackageJson } from './ensure-package-json.mjs'
import {
  BASE_URL,
  ensureManagedServer,
  ensureStackServices,
  freePort,
  isRunning,
  log,
  PORT,
  stopManagedServer,
} from './dev-server-utils.mjs'

async function main() {
  ensurePackageJson()

  if (await isRunning()) {
    log(`TestVantages dev server already running at ${BASE_URL}`)
    log('Ensuring Hybrid AI (port 8000) and helper services…')
    await ensureStackServices({ waitForHybrid: true, hybridScript: 'hybrid-api-background.mjs' })
    process.exit(0)
  }

  log('')
  log('  TestVantages — starting background dev server')
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

  log('Starting Hybrid AI (port 8000) and helper services…')
  await ensureStackServices({ waitForHybrid: true, hybridScript: 'hybrid-api-background.mjs' })

  process.exit(0)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
