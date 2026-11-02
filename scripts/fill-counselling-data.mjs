/**
 * Fill / refresh Career Compass counselling DATA via Gemini (placements, round cutoffs, college facts).
 * Rank / AIR prediction stays local - this script does NOT run on every page view.
 *
 *   node scripts/fill-counselling-data.mjs
 *   node scripts/fill-counselling-data.mjs --local-only
 *   node scripts/fill-counselling-data.mjs --limit=6
 *
 * Writes src/data/generated/counsellingFill.js
 * Admin can also run this from Career Compass -> Update data.
 */

import '../server/loadEnv.js'
import { runCounsellingFillUpdate } from '../server/counsellingFillUpdate.js'

const localOnly = process.argv.includes('--local-only')
const resume = !process.argv.includes('--no-resume')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Math.max(1, Number(limitArg.slice('--limit='.length)) || 0) : 0

const result = await runCounsellingFillUpdate({
  localOnly,
  resume,
  limit: LIMIT,
  persistEachBatch: true,
})

console.log(
  `fill-counselling-data: wrote ${result.collegeCount} colleges (${result.source}, ${result.cloudFilled} cloud-tagged) via ${result.engineLabel}`,
)
console.log(`  ${result.hint}`)
