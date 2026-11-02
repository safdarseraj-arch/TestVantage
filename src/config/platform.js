/**
 * Platform scale configuration.
 * Set VITE_PLATFORM_SCALE=1 in production build for server-backed exams.
 */

/** 10 lakh concurrent students — production infrastructure target. */
export const TARGET_CONCURRENT_STUDENTS = 1_000_000

const VITE_ENV = import.meta.env ?? {}

export const API_BASE = VITE_ENV.VITE_API_BASE || '/api'

/** Server-backed exam progress + submit (required at 10L+ scale). */
export function isPlatformScaleEnabled() {
  return VITE_ENV.VITE_PLATFORM_SCALE === '1'
}

/** Autosave interval when platform scale is on (ms). */
export function examAutosaveIntervalMs() {
  const raw = Number(VITE_ENV.VITE_EXAM_AUTOSAVE_MS)
  return Number.isFinite(raw) && raw >= 2000 ? raw : 5000
}

export function platformModeLabel() {
  return isPlatformScaleEnabled() ? 'Production scale' : 'Local development'
}

/** Public site origin for print sheets, watermarks, and meta (production: set in .env.production). */
export function publicSiteUrl() {
  const fromEnv = String(VITE_ENV.VITE_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'https://www.testvantages.com'
}
