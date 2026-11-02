/**
 * Open TestVantages in the browser. Start the background dev server first if needed.
 * Usage: node scripts/open-or-start.mjs [path]
 * Example: node scripts/open-or-start.mjs /home
 */
import { ensurePackageJson } from './ensure-package-json.mjs'
import {
  BASE_URL,
  ensureManagedServer,
  isRunning,
  log,
  openBrowser,
} from './dev-server-utils.mjs'

const OPEN_PATH = process.argv[2] || '/home'

async function main() {
  ensurePackageJson()

  if (await isRunning()) {
    openBrowser(OPEN_PATH)
    return
  }

  log('Dev server not running — starting in the background…')
  log('It will keep running even if you close this terminal.')
  log(`Logs: TestVantage/onlinetest/.dev-server.log`)
  log('')

  const ok = await ensureManagedServer({ wait: true, maxMs: 120_000 }).then(
    () => true,
    (err) => {
      console.error(err.message || err)
      return false
    },
  )

  if (!ok) {
    console.error(`Server did not start. Check ${BASE_URL} and .dev-server.log for errors.`)
    process.exit(1)
  }

  openBrowser(OPEN_PATH)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
