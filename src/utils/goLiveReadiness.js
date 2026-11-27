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
      note: 'Score, solutions, Charts → High mistake & High skip (after classmates finish the same paper). Teachers: Classroom → Student Results.',
    },
    {
      id: 'practice-pyq',
      area: 'Student',
      feature: 'Practice & PYQ bank',
      status: 'ready',
      note: 'Shows imported, approved papers only. Empty until staff upload official NTA PDFs — no fake dated catalog.',
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
      status: 'ready',
      note: 'In Docker stack for live deploy — first server start downloads models (~5–10 min). Optional for a small local pilot.',
    },
    {
      id: 'offline-online',
      area: 'Upload',
      feature: 'Offline / Online save + Sync',
      status: 'ready',
      note: 'Browser save works now. On the live server (npm run live:deploy) Sync uses PostgreSQL automatically.',
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
      status: 'ready',
      note: 'Ready for pilot on one school browser; live:deploy syncs schools across devices via PostgreSQL.',
    },
    {
      id: 'teacher-results',
      area: 'Teacher',
      feature: 'View student results',
      status: 'ready',
      note: 'Works from attempts on this browser; live server pulls class attempts from the API.',
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
      status: 'ready',
      note: 'Student register and staff login work in Cursor. Live:deploy switches to server login for all devices.',
    },
    {
      id: 'postgres-redis',
      area: 'Platform',
      feature: 'PostgreSQL + Redis API',
      status: 'ready',
      note: 'Docker compose ready — run npm run live:deploy on the VPS (not on this OneDrive laptop).',
    },
    {
      id: 'cloud-scale',
      area: 'Platform',
      feature: '10 lakh concurrent students',
      status: 'blocked',
      note: 'Later phase (CDN + auto-scale). Does not block a small school pilot.',
    },
    {
      id: 'https',
      area: 'Platform',
      feature: 'HTTPS & custom domain',
      status: 'partial',
      note: 'Last founder step after deploy: point testvantages.com DNS + deploy/nginx-ssl.conf.example.',
    },
    {
      id: 'backup',
      area: 'Platform',
      feature: 'Automated backup & export',
      status: 'ready',
      note: 'Export JSON/full backup from Admin now; live server also exposes GET /api/backup.',
    },
    {
      id: 'brand-hero',
      area: 'Student',
      feature: 'Brand + Home hero (5 slides)',
      status: 'ready',
      note: 'Header shows TestVantages. Home banner is 5 high-value slides (Practice Hub, Mock, PYQ, High mistake/skip, Rank Forecast).',
    },
    {
      id: 'diag-national-peers',
      area: 'Diagnostics',
      feature: 'Live peer bands (Top 1% / Top 500)',
      status: 'partial',
      note: 'Wired: GET /api/diagnostics/peer-stats/:testId. Full capacity after live:deploy when many students sit the same paper.',
    },
    {
      id: 'diag-answer-flips',
      area: 'Diagnostics',
      feature: 'Answer-flip / OMR forensics',
      status: 'ready',
      note: 'New exam sittings log option changes into the diagnostic PDF. OMR bubble events attach when OMR path is used.',
    },
    {
      id: 'diag-adv-dual',
      area: 'Diagnostics',
      feature: 'JEE Advanced P1 + P2 merged report',
      status: 'ready',
      note: 'Link Paper 1 and Paper 2 attempts for one merged diagnostic pack (Result → share report).',
    },
    {
      id: 'diag-full-length',
      area: 'Diagnostics',
      feature: 'Full-length PDF density (75–180 Q)',
      status: 'ready',
      note: 'Report scales with paper size. Use full mocks / Official PYQ — not only the 9-Q sample demo.',
    },
    {
      id: 'diag-auto-after-submit',
      area: 'Diagnostics',
      feature: 'Auto diagnostic after test / practice',
      status: 'ready',
      note: 'Every submit queues the full multi-page report. Result page shows Open / Print when ready. Live:deploy syncs reports to /api/diagnostics/reports.',
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
  if (apiOnline) {
    patch(
      dynamic,
      'diag-national-peers',
      'partial',
      'Peer API online — Top 1% / Top 500 fill automatically as students submit each paper (needs ~50+ for strong bands, 500+ for true Top 500).',
    )
  }
  if (apiOnline && platformScale && storage?.storage?.postgresOk) {
    patch(
      dynamic,
      'diag-national-peers',
      'ready',
      'Live peer stats endpoint active with PostgreSQL attempts — national/school Top 1% / Top 500 unlock with volume.',
    )
    patch(
      dynamic,
      'diag-auto-after-submit',
      'ready',
      'Auto reports generate after submit and sync to /api/diagnostics/reports on the live server.',
    )
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
    /** School pilot ready when only HTTPS (and optional 10-lakh) remain as founder ops */
    goLiveReady: deployBlockers.length === 0 && partial <= 1,
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
