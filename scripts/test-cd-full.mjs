import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { prepareMathForRender, normalizeMcqOptionForRender } from '../src/utils/prepareMathForRender.js'
import { parseQuestionText } from '../src/utils/parseQuestionText.js'
import katex from 'katex'

function polishMcqOption(option, letter, questionContext = '') {
  const label = String(letter).toUpperCase()
  const combined = `${questionContext}\n(${label}) ${option ?? ''}`.trim()
  const polished = sanitizeMathDelimiters(prepareMathForRender(combined))
  const re = new RegExp(`\\(${label}\\)\\s*([\\s\\S]*?)(?=\\n\\([A-D]\\)|$)`, 'i')
  const m = polished.match(re)
  return m ? m[1].trim() : sanitizeMathDelimiters(prepareMathForRender(option ?? ''))
}

function testRender(label, text) {
  const prepared = normalizeMcqOptionForRender(prepareMathForRender(text))
  try {
    if (prepared.startsWith('$') && prepared.endsWith('$') && !prepared.startsWith('$$')) {
      katex.renderToString(prepared.slice(1, -1), { throwOnError: true })
    }
    return { prepared, ok: true }
  } catch (e) {
    return { prepared, ok: false, err: e.message }
  }
}

const ctx =
  'If $\\vec{a}, \\vec{b}, \\vec{c}$ are three vectors such that $\\vec{a}+2 \\vec{b}+3 \\vec{c}= 0$, then $$\\left[\\begin{matrix}\\vec{a}\\times\\vec{b} & \\vec{b}\\times\\vec{c} & \\vec{c}\\times\\vec{a}\\end{matrix}\\right]$$ is equal to- (A) $\\frac{1}{4}$ (B) $\\frac{49}{4}$'

const ctxStem =
  'If $\\vec{a}, \\vec{b}, \\vec{c}$ are three vectors such that $\\vec{a}+2 \\vec{b}+3 \\vec{c}= 0$, then $$\\left[\\begin{matrix}\\vec{a}\\times\\vec{b} & \\vec{b}\\times\\vec{c} & \\vec{c}\\times\\vec{a}\\end{matrix}\\right]$$ is equal to-'

console.log('=== stem-only context ===')
for (const [L, opt] of [
  ['C', '$$1$'],
  ['D', '$$1$'],
]) {
  const p = polishMcqOption(opt, L, ctxStem)
  console.log(L, JSON.stringify(opt), '->', JSON.stringify(p))
}

console.log('\n=== triangle MCQ ===')
const triCtx =
  'If $\\vec{a}=\\hat{i}-\\hat{j}+\\hat{k}$ and $\\vec{b}=2 \\hat{i}+4 \\hat{j}+3 \\hat{k}$ are one of the sides and medians respectively, of a triangle through the same vertex, then area of triangle is-'
for (const [L, opt] of [
  ['C', '$$1$1$'],
  ['D', '$$1$'],
]) {
  const p = polishMcqOption(opt, L, triCtx)
  console.log(L, JSON.stringify(opt), '->', JSON.stringify(p))
}
for (const [L, opt] of [
  ['C', '$$1$'],
  ['D', '$$1$'],
  ['C', '$\\frac{4}{9}$'],
  ['D', '0'],
]) {
  const p = polishMcqOption(opt, L, ctx)
  const r = testRender(L, p)
  console.log(L, JSON.stringify(opt), '->', JSON.stringify(p), r.ok ? 'OK' : 'FAIL', r.prepared)
}

console.log('\n=== full text broken OCR ===')
const full = `${ctx} (C) $$1$ (D) $$1$`
const norm = sanitizeMathDelimiters(prepareMathForRender(full))
console.log('normalized tail:', norm.slice(-80))
const parsed = parseQuestionText(norm)
console.log('C:', JSON.stringify(parsed.options[2]))
console.log('D:', JSON.stringify(parsed.options[3]))
for (const [L, i] of [
  ['C', 2],
  ['D', 3],
]) {
  const r = testRender(L, parsed.options[i])
  console.log(L, 'render:', r.prepared, r.ok ? 'OK' : r.err)
}
