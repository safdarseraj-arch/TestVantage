/**
 * Regression: shared Mathpix post-process on committed 2024 P1/P2 + 2026 P1 fixtures.
 * Fast scan-only (re-run scripts/_ship-both-papers-reparse-scan.mjs to refresh fixtures).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanOfficialPyqPaper } from '../src/utils/officialPyqProcessScan.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadJson(rel) {
  const p = path.join(__dirname, rel)
  assert.ok(fs.existsSync(p), `missing fixture ${rel} — run _ship-both-papers-reparse-scan.mjs`)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const p1 = loadJson('_live-paper1-reparsed.json')
const p2 = loadJson('_live-paper2-reparsed.json')
const s1 = scanOfficialPyqPaper(p1)
const s2 = scanOfficialPyqPaper(p2)

assert.equal(s1.count, 51, '2024 Paper 1 question count')
assert.equal(s2.count, 51, '2024 Paper 2 question count')
assert.equal(s1.hardZeros, true, `2024 P1 scan: ${JSON.stringify(s1.CLASSES)} ${JSON.stringify(s1.details.slice(0, 3))}`)
assert.equal(s2.hardZeros, true, `2024 P2 scan: ${JSON.stringify(s2.CLASSES)}`)

const p2026Path = path.join(__dirname, '_live-paper2026-p1-reparsed.json')
if (fs.existsSync(p2026Path)) {
  const p26 = JSON.parse(fs.readFileSync(p2026Path, 'utf8'))
  const s26 = scanOfficialPyqPaper(p26)
  assert.equal(s26.count, 48, `2026 P1 is 48 questions in the OCR, not 51 or 56 (got ${s26.count})`)
  assert.equal(Number(p26.expectedQuestionCount) || s26.count, 48, '2026 expected count must stay the OCR count')
  assert.equal(s26.hardZeros, true, `2026 P1 scan: ${JSON.stringify(s26.CLASSES)} ${JSON.stringify(s26.details.slice(0, 3))}`)
}

console.log('test-official-pyq-live-reparse: ok')