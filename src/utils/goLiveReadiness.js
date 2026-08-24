import { isPlatformScaleEnabled } from '../config/platform.js'
import { pingBankApi } from './bankApi.js'
import { fetchPlatformHealth } from './examApi.js'

/**
 * @typedef {{
 *   id: string,
 *   area: string,
 *   feature: string,
 *   status: 'ready' | 'partial' | 'blocked',
 *   note: string,
 * }} GoLiveItem
 */

/** @returns {GoLiveItem[]} */
export function getGoLiveChecklistStatic() {
  return [
    {
      id: 'mock-exam',
      area: 'Student',
      feature: 'Mock tests, timer, palette, submit',
      status: 'ready',
      note: 'Works in browser — full NTA-style flow.',
    },
    {
      id: 'results',
      area: 'Student',
      feature: 'Result analysis & My Results',
      status: 'ready',
      note: 'Score, subject breakdown, solutions, analytics.',
    },
    {
      id: 'practice-pyq',
      area: 'Student',
      feature: 'Practice & PYQ bank',
      status: 'ready',
      note: 'Topic drills and previous-year papers.',
    },
    {
      id: 'ocr-upload',
      area: 'Upload',
      feature: 'OCR upload (Gemini + Pix2Text + local hybrid)',
      status: 'ready',
      note: '6-layer stack — cloud AI, Pix2Text Docker, local fallback.',
    },
    {
      id: 'pix2text',
      area: 'Upload',
      feature: 'Pix2Text formula OCR sidecar',
      status: 'partial',
      note: 'Included in Docker stack — first start downloads models (~5–10 min).',
    },
    {
      id: 'offline-online',
      area: 'Upload',
      feature: 'Offline / Online save + Sync',
      status: 'partial',
      note: 'Online sync needs API running (npm run api).',
    },
    {
      id: 'question-bank',
      area: 'Upload',
      feature: 'Question bank filters & metadata',
      status: 'ready',
      note: 'Subject, chapter, source, toughness, passage sets.',
    },
    {
      id: 'teacher-school',
      area: 'School',
      feature: 'Schools, classes, assign tests',
      status: 'partial',
      note: 'Works on this browser — not shared across devices yet.',
    },
    {
      id: 'teacher-results',
      area: 'Teacher',
      feature: 'View student results',
      status: 'partial',
      note: 'Shows attempts saved on this browser.',
    },
    {
      id: 'create-test',
      area: 'Teacher',
      feature: 'Create custom test papers',
      status: 'ready',
      note: 'Blueprint from question bank.',
    },
    {
      id: 'auth',
      area: 'Platform',
      feature: 'Login (student / teacher / admin)',
      status: 'partial',
      note: 'Local accounts only — move to server auth before public launch.',
    },
    {
      id: 'postgres-redis',
      area: 'Platform',
      feature: 'PostgreSQL + Redis API',
      status: 'partial',
      note: 'Docker stack ready — run npm run stack:up on server.',
    },
    {
      id: 'cloud-scale',
      area: 'Platform',
      feature: '10 lakh concurrent students',
      status: 'blocked',
      note: 'Needs cloud hosting, CDN, auto-scaling (planned for later).',
    },
    {
      id: 'https',
      area: 'Platform',
      feature: 'HTTPS & custom domain',
      status: 'partial',
      note: 'nginx SSL template ready — deploy/nginx-ssl.conf.example on your server.',
    },
    {
      id: 'backup',
      area: 'Platform',
      feature: 'Automated backup & export',
      status: 'partial',
      note: 'Manual JSON/CSV export available from Admin.',
    },
  ]
}

/**
 * @returns {Promise<{ items: GoLiveItem[], apiOnline: boolean, storage: object | null, platformScale: boolean }>}
 */
export async function evaluateGoLiveReadiness() {
  const items = getGoLiveChecklistStatic()
  const platformScale = isPlatformScaleEnabled()
  let apiOnline = false
  let storage = null

  try {
    apiOnline = await pingBankApi()
    if (apiOnline) storage = await fetchPlatformHealth()
  } catch {
    /* offline dev */
  }

  const dynamic = [...items]

  if (apiOnline && storage?.storage?.postgresOk) {
    patch(dynamic, 'postgres-redis', 'partial', 'PostgreSQL connected on API.')
  }
  if (apiOnline && storage?.storage?.redisOk) {
    patch(dynamic, 'postgres-redis', 'partial', 'PostgreSQL + Redis connected.')
  }
  if (apiOnline && storage?.storage?.postgresOk && platformScale) {
    patch(dynamic, 'postgres-redis', 'ready', 'PostgreSQL + Redis live in production.')
    patch(dynamic, 'pix2text', 'ready', 'Pix2Text sidecar in Docker stack (formula OCR).')
    patch(dynamic, 'offline-online', 'ready', 'Upload push/pull + online save on live server.')
    patch(dynamic, 'teacher-school', 'ready', 'Schools & classes sync to PostgreSQL (/api/org).')
    patch(dynamic, 'teacher-results', 'ready', 'Teacher results load from server attempts.')
    patch(dynamic, 'auth', 'ready', 'Server login at /api/auth/login (admin + students + teachers).')
    patch(dynamic, 'backup', 'ready', 'Live backup at GET /api/backup (admin password).')
  } else if (apiOnline && storage?.storage?.postgresOk) {
    patch(dynamic, 'offline-online', 'partial', 'API + PostgreSQL ready — enable VITE_PLATFORM_SCALE=1 for full sync.')
    patch(dynamic, 'teacher-school', 'partial', 'Org API ready — enable production scale to auto-sync.')
    patch(dynamic, 'teacher-results', 'partial', 'Attempts save to server — enable scale for teacher pull.')
    patch(dynamic, 'auth', 'partial', 'API ready — run live:build for server login.')
    patch(dynamic, 'backup', 'partial', 'Backup API ready — enable live build + admin password.')
  }
  if (apiOnline && storage?.liveBackup && platformScale) {
    patch(dynamic, 'backup', 'ready', 'Download live backup from Admin → Live platform.')
  }
  if (apiOnline && platformScale && storage?.storage?.postgresOk) {
    patch(dynamic, 'https', 'partial', 'Add SSL cert using deploy/nginx-ssl.conf.example on your domain.')
  }
  if (platformScale && !apiOnline) {
    patch(dynamic, 'offline-online', 'partial', 'Production scale on — start API (npm run api / stack:up).')
  }

  const ready = dynamic.filter((i) => i.status === 'ready').length
  const partial = dynamic.filter((i) => i.status === 'partial').length
  const blocked = dynamic.filter((i) => i.status === 'blocked').length
  const deployBlockers = dynamic.filter((i) => i.status === 'blocked' && i.id !== 'cloud-scale')

  return {
    items: dynamic,
    apiOnline,
    storage,
    platformScale,
    summary: { ready, partial, blocked, total: dynamic.length },
    /** VPS Docker deploy (npm run live:deploy) — excludes 10-lakh scale item */
    deployReady: deployBlockers.length === 0,
    /** Public pilot — needs HTTPS + few partial items only */
    goLiveReady: deployBlockers.length === 0 && partial <= 4,
  }
}

/** @param {GoLiveItem[]} items @param {string} id @param {GoLiveItem['status']} status @param {string} note */
function patch(items, id, status, note) {
  const row = items.find((i) => i.id === id)
  if (row) {
    row.status = status
    row.note = note
  }
}

export function statusLabel(status) {
  if (status === 'ready') return 'Ready'
  if (status === 'partial') return 'Partial'
  return 'Before go-live'
}
