/**
 * Production safety helpers — gate demo seeds and insecure defaults.
 *
 * Live mode is the default (including local F5). Staff can restore demo
 * catalog/seeds only with VITE_ALLOW_DEMO_SEED=1 in .env (never in production).
 */

function readViteEnv() {
  try {
    return import.meta.env ?? {}
  } catch {
    return {}
  }
}

/** True for production Vite builds (npm run build / live:build). */
export function isProductionBuild() {
  return Boolean(readViteEnv().PROD)
}

/**
 * Product is in go-live mode: no fake official PYQ, no auto seed leaderboard.
 * Reversible: set VITE_ALLOW_DEMO_SEED=1 in local .env and restart (F5).
 */
export function isGoLiveMode() {
  return !allowAutoDemoSeed()
}

/**
 * Demo leaderboard / doubts / batch results / sample PYQ catalog may auto-seed
 * only when staff explicitly opt in. Production builds never auto-seed.
 */
export function allowAutoDemoSeed() {
  if (isProductionBuild()) return false
  return readViteEnv().VITE_ALLOW_DEMO_SEED === '1'
}
