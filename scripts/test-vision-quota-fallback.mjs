/**
 * Regression: 429 → retry → local fallback (not empty Error);
 * duplicate Convert AI upgrade blocked; Gemini not overwritten by heavy polish.
 */
import assert from 'node:assert/strict'
import {
  isVisionQuotaError,
  localFallbackNoteAfterCloudFail,
  shouldAttemptCloudUpgradeAfterLocal,
  visionRetryDelayMs,
  ocrEngineBadgeLabel,
} from '../src/utils/cloudVisionClient.js'
import { friendlyUploadError } from '../src/utils/uploadFriendlyErrors.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { resolveImageQueueOcrStatus } from '../src/utils/imageUploadQueue.js'
import { mcqLaterOptionsLookTruncated } from '../src/utils/mcqOptionCompleteness.js'

// —— Quota detection + retry delay ——
assert.equal(isVisionQuotaError(429, 'whatever'), true)
assert.equal(isVisionQuotaError(500, 'RESOURCE_EXHAUSTED'), true)
assert.equal(isVisionQuotaError(500, 'quota exceeded'), true)
assert.equal(isVisionQuotaError(500, 'rate-limit'), true)
assert.equal(isVisionQuotaError(400, 'bad request'), false)

assert.equal(visionRetryDelayMs('Please retry in 2.5s.'), 2500)
assert.equal(visionRetryDelayMs('retry in 0.1s'), 1500, 'floor 1.5s')
assert.equal(visionRetryDelayMs('retry in 90s'), 25000, 'cap 25s')
assert.equal(visionRetryDelayMs('no hint'), 4000)

// —— Local fallback note (never empty Error when Local text exists) ——
const quotaErr = Object.assign(new Error('AI extract failed (HTTP 429): quota'), {
  code: 'VISION_QUOTA',
})
const note = localFallbackNoteAfterCloudFail(quotaErr)
assert.match(note, /rate limit/i)
assert.match(note, /Local OCR backup/i)
assert.doesNotMatch(note, /^$/)

const otherErr = Object.assign(new Error('model blew up'), { code: 'VISION_EXTRACT_FAILED' })
assert.match(localFallbackNoteAfterCloudFail(otherErr), /backup Local OCR/i)

const friendly = friendlyUploadError(quotaErr)
assert.match(friendly, /rate limit/i)
assert.match(friendly, /Backup Local OCR/i)

assert.equal(
  resolveImageQueueOcrStatus({
    hasContent: true,
    cloudNote: note,
  }).status,
  'needs_review',
  '429 fallback with local text must be needs_review, not empty error',
)
assert.equal(
  resolveImageQueueOcrStatus({
    hasContent: false,
    errorMessage: 'No text',
  }).status,
  'error',
)

// —— Duplicate Convert AI call blocked after quota ——
assert.equal(
  shouldAttemptCloudUpgradeAfterLocal({
    cloudAttempted: true,
    cloudHardError: quotaErr,
    cloudCandidate: null,
  }),
  false,
  'must not bill a second AI call after 429',
)
// Empty AI response — one retry after local is OK
const emptyErr = Object.assign(new Error('empty'), { code: 'VISION_EMPTY' })
assert.equal(
  shouldAttemptCloudUpgradeAfterLocal({
    cloudAttempted: true,
    cloudHardError: emptyErr,
    cloudCandidate: null,
    cloudEmptyRetryUsed: false,
  }),
  true,
  'empty AI response should allow one retry after local OCR',
)
assert.equal(
  shouldAttemptCloudUpgradeAfterLocal({
    cloudAttempted: true,
    cloudHardError: emptyErr,
    cloudCandidate: null,
    cloudEmptyRetryUsed: true,
  }),
  false,
  'only one empty-retry per Convert',
)
assert.equal(
  shouldAttemptCloudUpgradeAfterLocal({
    cloudAttempted: true,
    cloudCandidate: { text: 'weak' },
  }),
  false,
)
assert.equal(
  shouldAttemptCloudUpgradeAfterLocal({
    cloudAttempted: false,
    cloudHardError: null,
    cloudCandidate: null,
  }),
  true,
  'upgrade allowed only when cloud was never tried',
)

// —— Gemini preserve: cloud-vision polish must NOT run heavy builtin ——
const casesStem = `Given
$$
f(x)=\\begin{cases}
x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\
a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2
\\end{cases}
$$
If $f(x)$ is differentiable at $x=1$, then the value of $|a-b|$ is`

const cloudPolished = polishExtractedText(casesStem, 'cloud-vision')
const heavy = polishExtractedText(cloudPolished, 'builtin')
assert.match(cloudPolished, /\$\$/)
assert.match(cloudPolished, /\\begin\{cases\}/)
assert.match(cloudPolished, /\\operatorname\{sgn\}/)
assert.match(cloudPolished, /\\\\/)
// Heavy stack collapses display math — convertSavedImage / reparse must not do this after AI.
assert.notEqual(cloudPolished, heavy, 'builtin overwrite would lose $$ display math')

const primes =
  "The curve $y = f(x)$ which satisfies the condition $f'(x) > 0$ and $f''(x) < 0$ for all real $x$, is :"
const cloudPrimes = polishExtractedText(primes, 'cloud-vision')
const heavyPrimes = polishExtractedText(cloudPrimes, 'builtin')
assert.match(cloudPrimes, /f'\(x\)/)
assert.match(cloudPrimes, /f''\(x\)/)
assert.doesNotMatch(cloudPrimes, /\$\$\$/)
assert.match(heavyPrimes, /\$\$\$/, 'documents the buggy heavy path')
assert.notEqual(cloudPrimes, heavyPrimes)

// Pipeline with engine=cloud-vision keeps cases + sgn
const piped = processMcqUploadExtract(casesStem, { engine: 'cloud-vision' })
assert.match(piped.polished, /\\begin\{cases\}/)
assert.match(piped.polished, /\\operatorname\{sgn\}/)
assert.doesNotMatch(piped.polished, /asgn\s*\(|\$\$\$/)

// Incomplete C/D still flagged
assert.equal(
  mcqLaterOptionsLookTruncated([
    '$f(-\\pi^{+}) = -1$',
    '$f(-\\pi^{-}) = 1$',
    '$\\lim$',
    '',
  ]),
  true,
)

assert.equal(ocrEngineBadgeLabel('cloud-vision'), 'AI')

// —— Live client: 429 once → retry → success (mocked fetch, no API keys) ——
{
  const { extractWithCloudVisionClient, clearCloudVisionStatusCache } = await import(
    '../src/utils/cloudVisionClient.js'
  )
  clearCloudVisionStatusCache()
  let extractHits = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('/vision/status')) {
      return {
        ok: true,
        json: async () => ({
          configured: true,
          ready: true,
          enabled: true,
          providers: ['gemini'],
          preferred: 'gemini',
          model: 'mock',
          message: 'ok',
        }),
      }
    }
    if (u.includes('/vision/extract')) {
      extractHits += 1
      if (extractHits === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: 'Please retry in 0.01s. RESOURCE_EXHAUSTED',
            status: 429,
            code: 'VISION_QUOTA',
          }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          provider: 'gemini',
          model: 'mock',
          parsed: {
            pageKind: 'typed',
            questions: [
              {
                text: 'Let $f(x)=|x+\\pi|$, then :',
                options: ['1', '2', '3', '4'],
                regionTypes: ['stemText', 'optionText'],
              },
            ],
          },
        }),
      }
    }
    return origFetch(url, init)
  }
  try {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'q.png', { type: 'image/png' })
    const result = await extractWithCloudVisionClient(file)
    assert.equal(extractHits, 2, 'must retry once after 429')
    assert.equal(result.engine, 'cloud-vision')
    assert.match(result.text, /\\pi/)
  } finally {
    globalThis.fetch = origFetch
    clearCloudVisionStatusCache()
  }
}

// —— Exhausted 429 → VISION_QUOTA (caller uses local fallback, not blank Error) ——
{
  const { extractWithCloudVisionClient, clearCloudVisionStatusCache } = await import(
    '../src/utils/cloudVisionClient.js'
  )
  clearCloudVisionStatusCache()
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/vision/status')) {
      return {
        ok: true,
        json: async () => ({
          configured: true,
          ready: true,
          enabled: true,
          providers: ['gemini'],
          preferred: 'gemini',
          message: 'ok',
        }),
      }
    }
    return {
      ok: false,
      status: 429,
      json: async () => ({
        error: 'retry in 0.01s quota',
        status: 429,
        code: 'VISION_QUOTA',
      }),
    }
  }
  try {
    const file = new File([new Uint8Array([9, 9])], 'q2.png', { type: 'image/png' })
    await assert.rejects(
      () => extractWithCloudVisionClient(file),
      (err) => {
        assert.equal(err.code, 'VISION_QUOTA')
        assert.match(err.message, /429|quota|rate/i)
        return true
      },
    )
  } finally {
    globalThis.fetch = origFetch
    clearCloudVisionStatusCache()
  }
}

console.log('test-vision-quota-fallback: ok')

// —— 502 transient → retry → success ——
{
  const { extractWithCloudVisionClient, clearCloudVisionStatusCache, isVisionTransientError } =
    await import('../src/utils/cloudVisionClient.js')
  assert.equal(isVisionTransientError(502, 'Bad Gateway'), true)
  clearCloudVisionStatusCache()
  let extractHits = 0
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/vision/status')) {
      return {
        ok: true,
        json: async () => ({
          configured: true,
          ready: true,
          enabled: true,
          providers: ['gemini'],
          preferred: 'gemini',
          message: 'ok',
        }),
      }
    }
    if (u.includes('/vision/extract')) {
      extractHits += 1
      if (extractHits === 1) {
        return {
          ok: false,
          status: 502,
          json: async () => ({ error: 'Bad Gateway', status: 502 }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          provider: 'gemini',
          parsed: {
            questions: [{ text: 'Let $F=q\\vec{E}$', options: ['1', '2', '3', '4'] }],
          },
        }),
      }
    }
    return origFetch(url)
  }
  try {
    const file = new File([new Uint8Array([1, 2])], 'p.png', { type: 'image/png' })
    const result = await extractWithCloudVisionClient(file)
    assert.equal(extractHits, 2, 'must retry once after 502')
    assert.match(result.text, /\\vec\{E\}|F=q/)
  } finally {
    globalThis.fetch = origFetch
    clearCloudVisionStatusCache()
  }
}

// —— Empty 200 → retry → still empty → VISION_EMPTY ——
{
  const { extractWithCloudVisionClient, clearCloudVisionStatusCache } = await import(
    '../src/utils/cloudVisionClient.js'
  )
  clearCloudVisionStatusCache()
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('/vision/status')) {
      return {
        ok: true,
        json: async () => ({
          configured: true,
          ready: true,
          enabled: true,
          providers: ['gemini'],
          preferred: 'gemini',
          message: 'ok',
        }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ parsed: { text: '', questions: [] }, raw: '' }),
    }
  }
  try {
    const file = new File([new Uint8Array([3])], 'e.png', { type: 'image/png' })
    await assert.rejects(
      () => extractWithCloudVisionClient(file),
      (err) => {
        assert.equal(err.code, 'VISION_EMPTY')
        return true
      },
    )
  } finally {
    globalThis.fetch = origFetch
    clearCloudVisionStatusCache()
  }
}

console.log('test-vision-quota-fallback: 5xx+empty ok')
