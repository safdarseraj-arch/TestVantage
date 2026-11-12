/**
 * Mathpix server client: missing keys fail clearly; mock HTTP for image OCR.
 * No live Mathpix calls.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const savedDataDir = process.env.TESTVANTAGE_BANK_DATA_DIR
const jobsDir = mkdtempSync(join(tmpdir(), 'tv-mathpix-jobs-'))
process.env.TESTVANTAGE_BANK_DATA_DIR = jobsDir

const {
  setMathpixRetryDelays,
  isMathpixNetworkError,
  getMathpixStatus,
  getMathpixEnv,
  extractWithMathpix,
  setMathpixFetch,
  pickMathpixTextResult,
  normalizeMathpixLatex,
  MATHPIX_MISSING_MESSAGE,
} = await import('../server/mathpix.js')

const savedId = process.env.MATHPIX_APP_ID
const savedKey = process.env.MATHPIX_APP_KEY

delete process.env.MATHPIX_APP_ID
delete process.env.MATHPIX_APP_KEY
delete process.env.MATHPIX_APPID
delete process.env.MATHPIX_APPKEY

const missing = getMathpixStatus()
assert.equal(missing.configured, false)
assert.equal(missing.ready, false)
assert.match(missing.message, /not loaded/)
assert.match(missing.message, /F5/)
assert.equal(missing.message, MATHPIX_MISSING_MESSAGE)

await assert.rejects(
  () => extractWithMathpix({ imageBase64: 'a'.repeat(80), mimeType: 'image/png' }),
  (err) => {
    assert.equal(err.code, 'MATHPIX_NOT_CONFIGURED')
    assert.match(String(err.message), /not loaded/)
    return true
  },
)

process.env.MATHPIX_APP_ID = 'test-app-id'
process.env.MATHPIX_APP_KEY = 'test-app-key'
assert.equal(getMathpixEnv().appId, 'test-app-id')
assert.equal(getMathpixStatus().configured, true)

const picked = pickMathpixTextResult({
  latex_styled: '$$1$',
  mmd: '(A) 1 (B) 2',
  text: 'plain',
})
assert.equal(picked.source, 'mmd')
assert.equal(normalizeMathpixLatex('\\(x^2\\)'), '$x^2$')

const calls = []
setMathpixFetch(async (url, init) => {
  calls.push({ url: String(url), method: init?.method || 'GET', headers: init?.headers })
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        latex_styled: '$x^{2}$',
        latex: 'x^{2}',
        mmd: '$x^{2}$',
        text: 'x^2',
      })
    },
  }
})

const image = await extractWithMathpix({
  imageBase64: 'a'.repeat(120),
  mimeType: 'image/png',
  fileName: 'q.png',
  format: 'latex',
})
assert.equal(image.ok, true)
assert.equal(image.engine, 'mathpix')
assert.match(image.text, /x/)
assert.equal(calls.length, 1)
assert.match(calls[0].url, /\/v3\/text$/)
assert.equal(calls[0].headers.app_id, 'test-app-id')
assert.equal(calls[0].headers.app_key, 'test-app-key')

const pdfCalls = []
setMathpixFetch(async (url) => {
  const u = String(url)
  pdfCalls.push(u)
  if (u.endsWith('/v3/pdf') && !u.includes('.mmd')) {
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ pdf_id: 'pdf-test-1' })
      },
    }
  }
  if (u.includes('/v3/pdf/pdf-test-1') && !u.includes('.mmd')) {
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ status: 'completed' })
      },
    }
  }
  if (u.endsWith('.mmd')) {
    return {
      ok: true,
      status: 200,
      async text() {
        return 'Q1. The value of $\\int x dx$ is\n(A) 1\n(B) 2\n(C) 3\n(D) 4'
      },
    }
  }
  return { ok: false, status: 404, async text() { return '{}' } }
})

const pdf = await extractWithMathpix({
  pdfBase64: 'a'.repeat(120),
  mimeType: 'application/pdf',
  fileName: 'paper.pdf',
  format: 'latex',
})
assert.equal(pdf.ok, true)
assert.match(pdf.text, /\\int/)
assert.ok(pdfCalls.some((u) => u.endsWith('/v3/pdf')))
assert.ok(pdfCalls.some((u) => u.includes('pdf-test-1')))

// 2017 P2: one dropped connection while waiting on Mathpix lost the whole upload as "fetch failed".
setMathpixRetryDelays([0, 0, 0])
const netDrop = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
assert.equal(isMathpixNetworkError(netDrop()), true)
assert.equal(isMathpixNetworkError(Object.assign(new Error('network busy'), { code: 'MATHPIX_EXTRACT_FAILED' })), false)

function pdfMock({ pollDrops = 0, submitDrops = 0, pdfId = 'pdf-net-1' } = {}) {
  const seen = { submits: 0, polls: 0 }
  let pollsLeftToDrop = pollDrops
  let submitsLeftToDrop = submitDrops
  setMathpixFetch(async (url, init) => {
    const u = String(url)
    if (u.endsWith('/v3/pdf') && init?.method === 'POST') {
      seen.submits += 1
      if (submitsLeftToDrop-- > 0) throw netDrop()
      return { ok: true, status: 200, async text() { return JSON.stringify({ pdf_id: pdfId }) } }
    }
    if (u.endsWith('.mmd')) {
      return { ok: true, status: 200, async text() { return 'Q1. Find $x$\n(A) 1\n(B) 2\n(C) 3\n(D) 4' } }
    }
    if (u.includes(`/v3/pdf/${pdfId}`)) {
      seen.polls += 1
      if (pollsLeftToDrop-- > 0) throw netDrop()
      return { ok: true, status: 200, async text() { return JSON.stringify({ status: 'completed' }) } }
    }
    return { ok: false, status: 404, async text() { return '{}' } }
  })
  return seen
}

const paperA = { pdfBase64: 'b'.repeat(160), mimeType: 'application/pdf', fileName: '2017_2.pdf', format: 'latex' }
let seen = pdfMock({ pollDrops: 2 })
const recovered = await extractWithMathpix(paperA)
assert.equal(recovered.ok, true, 'a short internet drop while waiting is retried')
assert.equal(seen.submits, 1)

const paperB = { ...paperA, pdfBase64: 'c'.repeat(160) }
seen = pdfMock({ pollDrops: 99, pdfId: 'pdf-net-2' })
await assert.rejects(
  () => extractWithMathpix(paperB),
  (err) => {
    assert.equal(err.code, 'MATHPIX_NETWORK')
    assert.equal(err.pdfId, 'pdf-net-2')
    assert.doesNotMatch(err.message, /^fetch failed$/)
    assert.match(err.message, /nothing was saved/i)
    assert.match(err.message, /Pending approval/)
    assert.match(err.message, /not charged again/)
    return true
  },
)
assert.equal(seen.submits, 1)
seen = pdfMock({ pdfId: 'pdf-net-2' })
const retried = await extractWithMathpix(paperB)
assert.equal(retried.ok, true)
assert.equal(retried.pdfId, 'pdf-net-2')
assert.equal(seen.submits, 0, 'uploading the same file again reuses the finished Mathpix read')

seen = pdfMock({ submitDrops: 1, pdfId: 'pdf-net-3' })
await assert.rejects(
  () => extractWithMathpix({ ...paperA, pdfBase64: 'd'.repeat(160) }),
  (err) => err.code === 'MATHPIX_NETWORK' && !err.pdfId,
)
assert.equal(seen.submits, 1, 'a send that may have reached Mathpix is never sent twice')
setMathpixRetryDelays(null)

setMathpixFetch(fetch)
if (savedId) process.env.MATHPIX_APP_ID = savedId
else delete process.env.MATHPIX_APP_ID
if (savedKey) process.env.MATHPIX_APP_KEY = savedKey
else delete process.env.MATHPIX_APP_KEY
if (savedDataDir) process.env.TESTVANTAGE_BANK_DATA_DIR = savedDataDir
else delete process.env.TESTVANTAGE_BANK_DATA_DIR
rmSync(jobsDir, { recursive: true, force: true })

console.log('test-mathpix-client: missing key fails clearly; mock image+pdf OCR ok; dropped connection retried, re-upload not billed twice')
