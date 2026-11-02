import { dedupeRepeatedStemPhrase } from '../src/utils/dedupeStemText.js'

const stem =
  'A box contains $15$ green and $10$ yellow balls. If $10$ balls are randomly drawn one by one with replacement, then the variance of the number of green balls drawn is:'

console.log('in:', stem)
console.log('out:', dedupeRepeatedStemPhrase(stem))

// inline probe simulation
let out = stem.replace(/\s+/g, ' ').trim()
const maxProbe = Math.min(100, Math.floor(out.length * 0.5))
for (let probeLen = maxProbe; probeLen >= 40; probeLen -= 4) {
  const head = out.slice(0, probeLen).trim()
  const anchor = head.slice(0, Math.min(36, head.length))
  const pos2 = out.indexOf(anchor, Math.max(anchor.length, 12))
  if (pos2 > 20 && pos2 < out.length - 25) {
    const rest = out.slice(pos2).trim()
    if (rest.startsWith(anchor.slice(0, Math.min(28, anchor.length)))) {
      console.log('PROBE HIT', { probeLen, anchor, pos2, restStart: rest.slice(0, 50) })
      out = out.slice(0, pos2).trim()
      break
    }
  }
}
console.log('after probe only:', out)
