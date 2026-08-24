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
if (process.env.NODE_ENV === 'production' || existsSync(PROD_ENV_PATH)) {
  tryLoad(PROD_ENV_PATH)
}
