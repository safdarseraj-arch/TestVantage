import { sanitizeMathDelimiters } from '../src/utils/sanitizeMathDelimiters.js'
import { prepareMathForRender, normalizeMcqOptionForRender } from '../src/utils/prepareMathForRender.js'
import katex from 'katex'

const raw =
  '(D) projection of $\\hat{i}+\\hat{j}+$\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+$\\hat{k}$ is $\\frac{1}{3}$'

const expected =
  'projection of $\\hat{i}+\\hat{j}+\\hat{k}$ on $-2 \\hat{i}+2 \\hat{j}+\\hat{k}$ is $\\frac{1}{3}$'

function pipeline(text) {
  return normalizeMcqOptionForRender(prepareMathForRender(sanitizeMathDelimiters(text)))
}

const out = pipeline(raw)
console.log('INPUT: ', raw)
console.log('OUTPUT:', out)
console.log('EXPECTED:', expected)
console.log('MATCH:', out === expected)

for (const p of out.match(/\$[^$]+\$/g) ?? []) {
  try {
    katex.renderToString(p.slice(1, -1), { throwOnError: true })
    console.log('OK:', p)
  } catch (e) {
    console.log('FAIL:', p, e.message.slice(0, 70))
  }
}
