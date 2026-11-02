/**
 * Stop the Vite dev server on port 5173 and the background monitor.
 */
import { PORT, log, stopManagedServer } from './dev-server-utils.mjs'

await stopManagedServer()
log(`stop-dev: port ${PORT} freed (server stopped)`)
