/**
 * Mathpix server client: missing keys fail clearly; mock HTTP for image OCR.
 * No live Mathpix calls.
 */
import assert from 'node:assert/strict'

const {
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

setMathpixFetch(fetch)
if (savedId) process.env.MATHPIX_APP_ID = savedId
else delete process.env.MATHPIX_APP_ID
if (savedKey) process.env.MATHPIX_APP_KEY = savedKey
else delete process.env.MATHPIX_APP_KEY

console.log('test-mathpix-client: missing key fails clearly; mock image+pdf OCR ok')
