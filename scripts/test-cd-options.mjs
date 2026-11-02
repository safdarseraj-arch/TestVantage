import { prepareMathForRender } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

function renderMathText(text) {
  const prepared = prepareMathForRender(text ?? '')
  const parts = []
  let i = 0
  while (i < prepared.length) {
    if (prepared.startsWith('$$', i)) {
      const end = prepared.indexOf('$$', i + 2)
      if (end !== -1) {
        parts.push(prepared.slice(i, end + 2))
        i = end + 2
        continue
      }
    }
    if (prepared[i] === '$') {
      const end = prepared.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(prepared.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    i++
  }
  return { prepared, parts }
}

const cases = [
  '$0$',
  '$\\frac{4}{9}$',
  '0',
  '(C) $\\frac{4}{9}$',
]

for (const c of cases) {
  console.log('\nINPUT:', c)
  const { prepared, parts } = renderMathText(c)
  console.log('prepare:', prepared)
  console.log('parts:', parts)
  for (const p of parts) {
    if (p.startsWith('$') && p.endsWith('$') && p.length >= 3 && !p.startsWith('$$')) {
      try {
        katex.renderToString(p.slice(1, -1), { throwOnError: true })
        console.log('  katex OK:', p)
      } catch (e) {
        console.log('  katex FAIL:', p, e.message)
      }
    }
  }
}
