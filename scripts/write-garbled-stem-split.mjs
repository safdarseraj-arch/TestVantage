import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const helper = `/**
 * Generic Convert heal: OCR dumped A–D into the stem as ® © Ww / then: soup.
 * Unknown questions still get four option slots instead of one garbled preview.
 */

const STEM_TAIL_RE =
  /\\b(?:then\\s*:|must be same as\\s*:|is equal to\\s*:|equals\\s*:)\\s*/i

/** Unlabeled OCR marks used as sequential A–D separators (not ®) with a paren). */
const UNLABELED_MARK_RE = /(?:^|\\s)(?:Ww\\b|[®©℗])(?!\\s*\\))/g

/**
 * True when option letters were destroyed and the A–D band leaked into the stem.
 * @param {string} text
 */
export function looksLikeLeakedOptionBand(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  const labeled = (t.match(/\\(\\s*[A-D]\\s*\\)/gi) ?? []).length
  if (labeled >= 2) return false
  const unlabeled = (t.match(UNLABELED_MARK_RE) ?? []).length
  if (unlabeled < 2) return false
  if (STEM_TAIL_RE.test(t)) return true
  if (
    unlabeled >= 3 &&
    /(?:\\\\int|\\bdx\\b|g\\s*\\(\\s*x\\s*\\)|passing through|curve\\s+g)/i.test(t)
  ) {
    return true
  }
  return false
}

/**
 * Map sequential Ww / ® / © marks onto (A)–(D) so the normal MCQ parser can split.
 * @param {string} text
 */
export function relabelSequentialOcrOptionMarks(text) {
  const raw = String(text ?? '')
  if (!looksLikeLeakedOptionBand(raw)) return raw
  const letters = ['A', 'B', 'C', 'D']
  let i = 0
  return raw.replace(UNLABELED_MARK_RE, () => {
    if (i >= 4) return ' '
    const letter = letters[i]
    i += 1
    return \`\\n(\${letter}) \`
  })
}

/**
 * @param {string} band
 * @returns {string[]}
 */
function splitOptionBand(band) {
  const s = String(band ?? '').trim()
  const out = ['', '', '', '']
  if (!s) return out

  const labeled = s
    .replace(/[Ⓐⓐ]/g, '\\n§A§')
    .replace(/[Ⓑⓑ]/g, '\\n§B§')
    .replace(/[Ⓒⓒ]/g, '\\n§C§')
    .replace(/[Ⓓⓓ]/g, '\\n§D§')
    .replace(/\\(\\s*([A-D])\\s*\\)/gi, '\\n§$1§')

  if (/§[A-D]§/.test(labeled)) {
    const re = /§([A-D])§\\s*([^§]*)/gi
    let m
    while ((m = re.exec(labeled)) !== null) {
      const idx = m[1].toUpperCase().charCodeAt(0) - 65
      if (idx >= 0 && idx < 4) out[idx] = String(m[2] ?? '').trim()
    }
    return out
  }

  const parts = s
    .split(/(?:^|\\s)(?:Ww\\b|[®©℗])\\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (let i = 0; i < Math.min(4, parts.length); i += 1) out[i] = parts[i]
  return out
}

/**
 * Cut stem at then: / must be same as: and fill up to four A–D slots from OCR junk.
 * @param {string} text
 * @returns {{ stem: string, options: string[] } | null}
 */
export function splitStemAndGarbledOptions(text) {
  const raw = String(text ?? '').replace(/\\r\\n/g, '\\n').trim()
  if (!raw || !looksLikeLeakedOptionBand(raw)) return null

  const relabeled = relabelSequentialOcrOptionMarks(raw)
  const cut = relabeled.search(STEM_TAIL_RE)
  let stem = relabeled
  let band = ''
  if (cut >= 0) {
    const m = relabeled.slice(cut).match(STEM_TAIL_RE)
    const idx = cut + (m?.[0].length ?? 0)
    stem = relabeled.slice(0, idx).trim()
    band = relabeled.slice(idx).trim()
  } else {
    const firstMark = relabeled.search(/\\(\\s*A\\s*\\)|(?:^|\\s)(?:Ww\\b|[®©℗])/i)
    if (firstMark > 24) {
      stem = relabeled.slice(0, firstMark).trim()
      band = relabeled.slice(firstMark).trim()
    }
  }
  if (!band || band.length < 2) return null

  const options = splitOptionBand(band)
  if (options.filter(Boolean).length < 2) return null
  return { stem, options }
}

/**
 * Drop the leaked A–D soup from a stem; keep the prompt ending (then:).
 * @param {string} text
 */
export function stripLeakedOptionBandFromStem(text) {
  const split = splitStemAndGarbledOptions(text)
  return split?.stem ?? String(text ?? '')
}

/**
 * Fill empty / Option A–D slots from a leaked stem (or raw OCR sidecar).
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean, multi?: boolean, _ocrSource?: string }} parsed
 */
export function repairGarbledStemOptionsParse(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.multi) return parsed
  const stem = String(parsed.text ?? '')
  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  const placeholderN = opts.filter((o) => /^Option\\s+[A-D]$/i.test(String(o ?? '').trim())).length
  const filled = opts.filter((o) => {
    const t = String(o ?? '').trim()
    return t && !/^Option\\s+[A-D]$/i.test(t)
  }).length
  const need =
    filled < 2 || placeholderN >= 2 || looksLikeLeakedOptionBand(stem)
  if (!need) return parsed

  const blob = \`\${stem}\\n\${opts.join('\\n')}\\n\${parsed._ocrSource ?? ''}\`
  const split =
    splitStemAndGarbledOptions(stem) ||
    splitStemAndGarbledOptions(blob) ||
    splitStemAndGarbledOptions(String(parsed._ocrSource ?? ''))
  if (!split) return parsed

  if (looksLikeLeakedOptionBand(stem) || !stem.trim()) {
    parsed.text = split.stem
  }
  for (let i = 0; i < 4; i += 1) {
    const cur = String(opts[i] ?? '').trim()
    if (!cur || /^Option\\s+[A-D]$/i.test(cur)) {
      if (split.options[i]) opts[i] = split.options[i]
    }
  }
  parsed.options = opts
  parsed.optionsFound = opts.filter((o) => String(o ?? '').trim()).length
  if (parsed.optionsFound >= 4) parsed.complete = true
  return parsed
}
`

const garbledTest = `import assert from 'node:assert/strict'
import {
  looksLikeLeakedOptionBand,
  relabelSequentialOcrOptionMarks,
  splitStemAndGarbledOptions,
  stripLeakedOptionBandFromStem,
  repairGarbledStemOptionsParse,
} from '../src/utils/splitStemAndGarbledOptions.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { shouldPreserveVisionStructuredFill, visionQuestionToMcqParse } from '../src/utils/cloudVisionParse.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const UNKNOWN =
  'If f(x) = x^2 + 1 then: Ww 12 ® 24 © 36 ® 48 leftover'

assert.equal(looksLikeLeakedOptionBand(UNKNOWN), true, 'detects Ww/®/© option soup')
const relabeled = relabelSequentialOcrOptionMarks(UNKNOWN)
assert.match(relabeled, /\\(\\s*A\\s*\\)/)
assert.match(relabeled, /\\(\\s*D\\s*\\)/)

const split = splitStemAndGarbledOptions(UNKNOWN)
assert.ok(split, 'splits unknown then: soup')
assert.match(split.stem, /then\\s*:/i)
assert.doesNotMatch(split.stem, /Ww|®|©/)
assert.equal(split.options.filter(Boolean).length, 4)
assert.match(split.options[0], /12/)
assert.match(split.options[3], /48/)

const parsedUnknown = parseQuestionText(UNKNOWN)
assert.ok(parsedUnknown.optionsFound >= 4, 'parser fills four slots from soup')
assert.doesNotMatch(parsedUnknown.text, /Ww\\s+12|®\\s*24/)
assert.ok(countRealMcqOptions(parsedUnknown.text, parsedUnknown.options) >= 2)

const plugin = repairGarbledStemOptionsParse({
  text: UNKNOWN,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.ok((plugin.options ?? []).filter(Boolean).length >= 4)
assert.doesNotMatch(plugin.text, /Ww/)

const stripped = stripLeakedOptionBandFromStem(UNKNOWN)
assert.match(stripped, /then\\s*:/i)
assert.doesNotMatch(stripped, /Ww|®/)

const clean =
  'Then g(2) is (A) (e^2+e^{-2})/2 (B) e^2 (C) (e^2-e^{-2})/2 (D) e^{-2}'
assert.equal(looksLikeLeakedOptionBand(clean), false, 'does not treat real (A)–(D) as soup')
assert.equal(splitStemAndGarbledOptions(clean), null)
assert.equal(parseQuestionText(clean).optionsFound, 4)

const placeholders = visionQuestionToMcqParse({
  text: 'A curve $g(x) = \\\\int x^{27}(1+x+x^2)^6(6x^2+5x+4)\\\\,dx$ is passing through origin, then:',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
})
assert.equal(placeholders.optionsFound, 0)
assert.equal(
  shouldPreserveVisionStructuredFill(placeholders, 'cloud-vision'),
  false,
  'placeholder A–D is not a complete Gemini fill',
)

const leakedSeed = visionQuestionToMcqParse({
  text: UNKNOWN,
  options: ['', '', '', ''],
})
assert.equal(shouldPreserveVisionStructuredFill(leakedSeed, 'cloud-vision'), false)

console.log('test-garbled-stem-options: ok')
`

const gxTest = `import assert from 'node:assert/strict'
import {
  looksLikeGxIntegralOriginMcq,
  repairGxIntegralOriginMcqParse,
  repairGxIntegralOriginStemOcr,
  GX_INTEGRAL_ORIGIN_STEM,
  GX_INTEGRAL_ORIGIN_OPTIONS,
} from '../src/utils/repairGxIntegralOriginMcqOcr.js'
import { polishCloudVisionText } from '../src/utils/ocrExtractPolish.js'
import { applyMcqParseRepairs } from '../src/utils/repairRegistry.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { countRealMcqOptions } from '../src/utils/stemDiagramDetect.js'

const garbled =
  'A curve g(x) = [+ (l+x+ x? 6 (6x^2 + 5x + 4 ) dx is passing through origin, then: Ww w=t ® ew=i © en-l ® een=i gV=5 8975 £7075 SREY'

assert.ok(looksLikeGxIntegralOriginMcq(garbled), 'detect g(x) origin MCQ')

const repairedStem = repairGxIntegralOriginStemOcr(garbled)
assert.match(repairedStem, /\\\\int\\s*x\\^\\{27\\}/)
assert.doesNotMatch(repairedStem, /Ww|SREY|\\[\\+/)

const polished = polishCloudVisionText(garbled)
assert.match(polished, /\\\\int/)
assert.doesNotMatch(polished, /Ww\\s+w=t/)

const fromParse = parseQuestionText(garbled)
assert.ok(fromParse.optionsFound >= 2, 'generic split recovers option slots')
assert.doesNotMatch(fromParse.text, /Ww\\s+w=t/)

const parsed = applyMcqParseRepairs(
  { text: garbled, options: ['', '', '', ''], optionsFound: 0 },
  garbled,
  { passes: 2 },
)
assert.equal(parsed.text.trim(), GX_INTEGRAL_ORIGIN_STEM.trim())
assert.deepEqual(parsed.options, GX_INTEGRAL_ORIGIN_OPTIONS)
assert.equal(parsed.questionType, 'multiple_correct')
assert.deepEqual(parsed.correctIndices, [0, 2])
assert.equal(countRealMcqOptions(parsed.text, parsed.options), 4)

const pipe = processMcqUploadExtract(garbled)
assert.match(pipe.parsed?.text ?? '', /\\\\int\\s*x\\^\\{27\\}/)
assert.deepEqual(pipe.parsed?.options, GX_INTEGRAL_ORIGIN_OPTIONS)
assert.equal(pipe.parsed?.questionType, 'multiple_correct')

const pluginDirect = repairGxIntegralOriginMcqParse({
  text: garbled,
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  optionsFound: 4,
})
assert.deepEqual(pluginDirect.options, GX_INTEGRAL_ORIGIN_OPTIONS)

console.log('test-gx-integral-origin-ocr: ok')
`

fs.writeFileSync(path.join(root, 'src/utils/splitStemAndGarbledOptions.js'), helper, 'utf8')
fs.writeFileSync(path.join(root, 'scripts/test-garbled-stem-options.mjs'), garbledTest, 'utf8')
fs.writeFileSync(path.join(root, 'scripts/test-gx-integral-origin-ocr.mjs'), gxTest, 'utf8')
console.log('wrote splitter + tests')
