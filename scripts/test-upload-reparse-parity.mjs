import assert from 'node:assert/strict'
import { reparseMcqUpload, processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { UPLOAD_SMOKE_FIXTURES } from '../src/utils/uploadRegressionContracts.js'

for (const [name, fx] of Object.entries(UPLOAD_SMOKE_FIXTURES)) {
  const direct = processMcqUploadExtract(fx.raw)
  const manual = reparseMcqUpload(fx.raw)
  assert.equal(
    direct.found,
    manual.found,
    `${name}: reparse parity found ${manual.found} vs ${direct.found}`,
  )
  if (fx.mustStemMatch) {
    assert.ok(
      fx.mustStemMatch.test(manual.parsed.text ?? ''),
      `${name}: reparse stem mismatch`,
    )
  }
}

const locus = UPLOAD_SMOKE_FIXTURES.triangleLocusScq.raw
const manual = reparseMcqUpload(locus)
assert.match(manual.parsed.text ?? '', /\\frac\{3\}\{2\}/, 'reparse restores triangle area')
assert.equal(manual.found, 4, 'reparse finds 4 locus options')

// Idempotent re-runs: same OCR twice → same stem/options (no cascade / reshuffle)
for (const [name, fx] of Object.entries(UPLOAD_SMOKE_FIXTURES)) {
  const a = processMcqUploadExtract(fx.raw)
  const b = processMcqUploadExtract(fx.raw)
  assert.equal(a.found, b.found, `${name}: idempotent found`)
  assert.equal(
    String(a.parsed?.text ?? ''),
    String(b.parsed?.text ?? ''),
    `${name}: idempotent stem`,
  )
  assert.deepEqual(
    (a.parsed?.options ?? []).map((o) => String(o ?? '').trim()),
    (b.parsed?.options ?? []).map((o) => String(o ?? '').trim()),
    `${name}: idempotent options`,
  )
}

console.log('test-upload-reparse-parity: ok')
