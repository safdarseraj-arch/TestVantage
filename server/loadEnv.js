/**
 * Load onlinetest/.env into process.env (GEMINI_API_KEY, etc.).
 * Import this before reading process.env in any server module.
 */
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = join(ROOT_DIR, '.env')
const PROD_ENV_PATH = join(ROOT_DIR, '.env.production')

function tryLoad(path) {
  if (existsSync(path) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(path)
    } catch {
      /* missing/unreadable is fine */
    }
  }
}

tryLoad(ENV_PATH)
tryLoad(join(ROOT_DIR, '.env.local'))
// Local `npm run api` must not load Docker hostnames (postgres/redis) from
// .env.production — that made startup hang on getaddrinfo ENOTFOUND postgres.
if (process.env.NODE_ENV === 'production') {
  tryLoad(PROD_ENV_PATH)
}
