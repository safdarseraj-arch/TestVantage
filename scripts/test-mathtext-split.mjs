function splitMathSegments(text) {
  const normalized = text.replace(/\$\$([^$\n]+?)\$(?!\$)/g, (_, inner) => `$${inner.trim()}$`)
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

const cases = [
  'If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:$',
  'If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is: $',
  '$10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:',
]

for (const c of cases) {
  const parts = splitMathSegments(c)
  console.log('---', c.slice(0, 50))
  parts.forEach((p, i) => {
    console.log(i, p.startsWith('$') ? 'MATH' : 'TXT', JSON.stringify(p.slice(0, 70)))
  })
}
