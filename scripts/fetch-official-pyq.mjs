/**
 * Probe curated official PYQ portals and print source slots.
 * Does NOT scrape coaching sites. Does NOT invent paper content.
 *
 * Live NTA PDF URLs change often — this script:
 * 1. Lists curated official archive / portal URLs
 * 2. Probes reachability (HEAD)
 * 3. Optionally writes a manifest JSON for the app / API
 *
 * Run: node scripts/fetch-official-pyq.mjs
 *      node scripts/fetch-official-pyq.mjs --exam=jee-advanced
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OFFICIAL_PYQ_PORTALS,
  OFFICIAL_PYQ_SOURCE_SLOTS,
  listOfficialPyqSourceSlots,
} from '../src/data/officialPyqSources.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'src', 'data', 'officialPyq')
const outFile = path.join(outDir, 'manifest.json')

const args = process.argv.slice(2)
const examArg = args.find((a) => a.startsWith('--exam='))?.slice('--exam='.length)

/** @param {string} url */
async function probe(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return { reachable: res.ok || res.status < 500, status: res.status }
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const slots = examArg
  ? listOfficialPyqSourceSlots(/** @type {any} */ (examArg))
  : OFFICIAL_PYQ_SOURCE_SLOTS

console.log('fetch-official-pyq: curated official sources only (no coaching scrapes)')
console.log(`  slots: ${slots.length}${examArg ? ` (exam=${examArg})` : ''}`)

/** @type {Record<string, { reachable: boolean, status?: number, error?: string }>} */
const portalProbe = {}
for (const p of OFFICIAL_PYQ_PORTALS) {
  portalProbe[p.id] = await probe(p.url)
  const st = portalProbe[p.id]
  console.log(
    `  portal ${p.id}: ${st.reachable ? 'ok' : 'offline'}${st.status != null ? ` (${st.status})` : ''}${st.error ? ` — ${st.error}` : ''}`,
  )
}

const slotRows = []
for (const s of slots) {
  const st = await probe(s.sourceUrl)
  slotRows.push({
    ...s,
    probe: st,
  })
  console.log(
    `  ${s.exam} ${s.year} · ${s.paperLabel}: ${st.reachable ? 'portal reachable' : 'portal offline'} — ${s.liveFetch ? 'liveFetch' : 'manual download + upload'}`,
  )
}

const manifest = {
  version: 1,
  pulledAt: Date.now(),
  note:
    'Official PYQ source index. Prefer NTA / JEE Advanced archives. Upload official PDFs into the pending bank — never auto-publish. Do not scrape coaching sites.',
  portals: OFFICIAL_PYQ_PORTALS,
  portalProbe,
  slots: slotRows,
  liveFetchAvailable: slotRows.filter((s) => s.liveFetch && s.probe?.reachable).length,
}

await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(outFile, JSON.stringify(manifest, null, 2), 'utf8')
console.log(`fetch-official-pyq: wrote ${path.relative(root, outFile)}`)
console.log(
  'Next: open Official PYQ (Pending) in the app, pick a year, upload the official PDF, then Approve & publish.',
)
