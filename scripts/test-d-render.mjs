import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

function splitParts(text) {
  const parts = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const next = text.indexOf('$', i)
    parts.push(text.slice(i, next === -1 ? text.length : next))
    i = next === -1 ? text.length : next
  }
  return parts.filter(Boolean)
}

function check(label, text) {
  const out = prepareTextForMathTextDisplay(text)
  console.log(`\n=== ${label} ===`)
  console.log(out)
  let hasRaw = false
  for (const p of splitParts(out)) {
    if (p.startsWith('$') && p.endsWith('$')) {
      try {
        katex.renderToString(p.slice(1, -1), { throwOnError: true })
        console.log('  OK math:', p.slice(0, 50))
      } catch (_e) {
        console.log('  FAIL math:', p)
        hasRaw = true
      }
    } else if (/\\(?:hat|frac|sqrt|vec)\{/.test(p)) {
      console.log('  RAW LATEX:', p.slice(0, 60))
      hasRaw = true
    }
  }
  console.log(hasRaw ? '  => HAS RAW' : '  => all rendered')
}

check(
  'projection broken',
  '(D) projection of $\\hat{i}+\\hat{j}+$\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+$\\hat{k}$ is $\\frac{1}{3}$',
)
check(
  'no dollar frac tail',
  'projection of \\hat{i}+\\hat{j}+\\hat{k} on -2\\hat{i}+2\\hat{j}+\\hat{k} is \\frac{1}{3}',
)
check('D = 0', '0')
check('bare frac', '\\frac{1}{3}')
