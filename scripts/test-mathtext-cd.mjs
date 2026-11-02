import { prepareMathForRender, normalizeMcqOptionForRender } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

function splitMathSegments(text) {
  const normalized = text
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\$\$([^$\n]+?)\$(?!\$)/g, (_, inner) => `$${inner.trim()}$`)

  const parts = []
  let i = 0
  while (i < normalized.length) {
    if (normalized.startsWith('$$', i)) {
      const end = normalized.indexOf('$$', i + 2)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 2))
        i = end + 2
        continue
      }
    }
    if (normalized[i] === '$') {
      const end = normalized.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const nextD = normalized.indexOf('$$', i)
    const nextS = normalized.indexOf('$', i)
    let next = normalized.length
    if (nextD !== -1) next = Math.min(next, nextD)
    if (nextS !== -1) next = Math.min(next, nextS)
    if (next > i) parts.push(normalized.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return parts.filter((p) => p.length > 0)
}

function testCase(c) {
  const prep = normalizeMcqOptionForRender(prepareMathForRender(c))
  const parts = splitMathSegments(prep)
  console.log('\nIN:', JSON.stringify(c))
  console.log('prep:', JSON.stringify(prep), 'parts:', parts.map((p) => JSON.stringify(p)))
  for (const p of parts) {
    const isInline = p.startsWith('$') && p.endsWith('$') && p.length >= 3 && !p.startsWith('$$')
    if (isInline) {
      try {
        katex.renderToString(p.slice(1, -1), { throwOnError: true })
        console.log('  katex OK:', p)
      } catch (e) {
        console.log('  katex FAIL:', p, e.message.slice(0, 60))
      }
    } else if (p.startsWith('$$')) {
      console.log('  display/unclosed:', p)
    }
  }
}

for (const c of [
  '$$\\frac{4}{9}$',
  '$\\frac{4}{9}$',
  '$$1$',
  '0',
  '$0$',
  '\\frac{4}{9}',
  '$\\sqrt{86}$',
  '$$\\frac{1}{2}\\sqrt{84}$',
]) {
  testCase(c)
}
