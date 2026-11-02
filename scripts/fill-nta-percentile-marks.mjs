/**
 * Re-check Form Forecast year-column marks vs percentile via Gemini
 * against published NTA compiled tables. Does not invent missing years.
 *
 *   node scripts/fill-nta-percentile-marks.mjs
 *   node scripts/fill-nta-percentile-marks.mjs --local-only
 *
 * Writes src/data/generated/ntaPercentileMarksFill.js
 */

import '../server/loadEnv.js'
import { runNtaPercentileFill } from '../server/ntaPercentileFill.js'

const localOnly = process.argv.includes('--local-only')
const result = await runNtaPercentileFill({ localOnly })

console.log(
  `fill-nta-percentile-marks: geminiCalled=${result.geminiCalled} model=${result.model || 'none'} source=${result.source}`,
)
console.log(`  ${result.hint}`)
if (result.yearResults) {
  for (const [year, row] of Object.entries(result.yearResults)) {
    console.log(`  ${year}: ${JSON.stringify(row)}`)
  }
}
