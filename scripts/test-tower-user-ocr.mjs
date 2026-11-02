import assert from 'node:assert/strict'
import { parsePassageWithSubQuestions } from '../src/utils/parsePassageUpload.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { trimPassageBodyText } from '../src/utils/passage.js'

const userOcr = `Two friends A & B playing a game of collision of ball and throwing balls from the top of the tower simultaneously as shown in the figure.

1. If the balls collide in air at point P and point O is treated as origin ($g = 10\\,\\mathrm{m/s}^2$) A ah ad $1^\\circ$ 202m [5 20m! s^8 © S = 3 -

2. If Distance D between the towers 1s x meter, then find =

3. If wind starts blowing horizontally, due to which a horizontal acceleration a = 2 $\\mathrm{m/s}$" to the balls from left to right then co-ordinates of point of collision will be (x,y) then find X+y 100`

const polished = polishExtractedText(userOcr, 'builtin')
assert.ok(!/A\s+ah\s+ad/i.test(polished), 'diagram junk removed from polish')
assert.ok(!/\b1s\s+x\b/i.test(polished), '1s -> is')
assert.match(polished, /\\frac\{x\}\{100\}/, 'Q2 fraction repaired')
assert.match(polished, /\\frac\{x\+y\}\{100\}/, 'Q3 fraction repaired')
assert.match(polished, /m\/s\}\^2/, 'wind acceleration m/s^2')

const parsed = parsePassageWithSubQuestions(userOcr, { allowOptionless: true })
assert.equal(parsed?.subQuestions?.length, 2, 'tower should be passage + 2 PIVQ (setup is not Q1)')

const passage = trimPassageBodyText(parsed?.passageText ?? '')
assert.match(passage, /balls\s+collide/i, 'setup stays in passage')
assert.match(passage, /origin/i, 'origin in passage')
assert.ok(!/A\s+ah\s+ad/i.test(passage), 'no diagram junk in passage')

const q1 = parsed?.subQuestions?.[0]?.text ?? ''
const q2 = parsed?.subQuestions?.[1]?.text ?? ''
assert.match(q1, /Distance\s+D/i, 'Q1 is distance stem')
assert.ok(!/balls\s+collide/i.test(q1), 'Q1 is not collide setup')
assert.match(q2, /wind\s+starts/i, 'Q2 is wind stem')
assert.ok(!/Introduction/i.test(q2), 'no doc tail on wind stem')

console.log('test-tower-user-ocr: ok')
console.log('passage:', passage.slice(0, 120) + '…')
console.log('Q1:', q1)
console.log('Q2:', q2.slice(0, 100) + '…')
