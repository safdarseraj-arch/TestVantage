/**
 * Read-only sweep of an exported Official PYQ store (the browser key
 * testvantage-official-pyq-pending saved to a JSON file). Runs the local
 * quality check plus one detector per known error class and prints counts.
 *
 *   node scripts/sweep-official-pyq-store.mjs <store.json> [--details]
 */
import fs from 'node:fs'

const file = process.argv[2]
const details = process.argv.includes('--details')
if (!file) {
  console.error('usage: node scripts/sweep-official-pyq-store.mjs <store.json> [--details]')
  process.exit(2)
}

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
}
globalThis.sessionStorage = globalThis.localStorage
store.set('testvantage-official-pyq-pending', fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))

const { loadOfficialPyqPendingPapers } = await import('../src/utils/officialPyqPendingStore.js')
const { sweepOfficialPyqPaper } = await import('../src/utils/officialPyqSweepChecks.js')

const summary = []
for (const paper of loadOfficialPyqPendingPapers()) {
  const { summary: row, hits, why, qualityLines } = sweepOfficialPyqPaper(paper)
  summary.push(row)
  if (details) {
    console.log(`\n=== ${paper.year} ${paper.session} (${paper.status}) ${paper.id}`)
    for (const [k, v] of Object.entries(hits)) if (v.length) console.log(`  ${k}: Q ${v.join(', ')}`)
    for (const [k, v] of Object.entries(why)) console.log(`    ${k}: ${v}`)
    for (const line of qualityLines) console.log(`    quality: ${line}`)
  }
}
console.table(summary)