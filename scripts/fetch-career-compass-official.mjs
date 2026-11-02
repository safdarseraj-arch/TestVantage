/**
 * Build / refresh Career Compass official snapshot from curated benchmarks.
 *
 * Live scrape of NTA / JoSAA / CSAB is intentionally limited (no stable public API).
 * This script:
 * 1. Merges baseline catalog + marks history with official source tags
 * 2. Writes JSON snapshot for server/API
 * 3. Optionally probes JoSAA archive URL (reachability only)
 *
 * Run: node scripts/fetch-career-compass-official.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOfficialCareerCompassBundle } from '../src/utils/careerCompassOfficialMerge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'src', 'data', 'careerCompassOfficial')
const outFile = path.join(outDir, 'snapshot.json')

async function probeOfficialPortals() {
  const urls = [
    { id: 'josaa', url: 'https://josaa.nic.in' },
    { id: 'csab', url: 'https://csab.nic.in' },
    { id: 'nta', url: 'https://nta.ac.in' },
    { id: 'mcc', url: 'https://mcc.nic.in' },
  ]
  const status = {}
  for (const { id, url } of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
      status[id] = { reachable: res.ok || res.status < 500, status: res.status }
    } catch (e) {
      status[id] = { reachable: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  return status
}

const portalStatus = await probeOfficialPortals()
const bundle = buildOfficialCareerCompassBundle({
  pulledAt: Date.now(),
  note:
    'Generated from curated NTA / JoSAA / CSAB / MCC benchmarks (2024–2026). Portal probe: ' +
    Object.entries(portalStatus)
      .map(([k, v]) => `${k}=${v.reachable ? 'ok' : 'offline'}`)
      .join(', '),
})

bundle.portalProbe = portalStatus

await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(outFile, JSON.stringify(bundle, null, 2), 'utf8')

console.log(
  `fetch-career-compass-official: wrote ${bundle.collegeCount} colleges, ${bundle.branchCount} branches → ${path.relative(root, outFile)}`,
)
console.log(`  sources: ${bundle.sourcesUsed.join(' / ')}`)
console.log(`  dataQuality: ${bundle.dataQuality}`)
