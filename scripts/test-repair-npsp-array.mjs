import assert from 'node:assert/strict'
import { repairNpSpPassageArray } from '../src/utils/repairNpSpPassageArray.js'
import { persistPassageBundleFields } from '../src/utils/persistUpload.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'

const broken = `Consider such that $N_{p}$ row terms : $$\\begin{array}{ccccc} \\mathrm{I}^{\\text {st }} \\text { row } & & \\frac{1}{3^{2}+3} & & \\\\ \\mathrm{II}^{\\text {nd }} \\text { row } & & \\frac{1}{4^{2}+4} & \\frac{1}{5^{2}+5} & \\frac{1}{6^{2}+6} \\\\ & & \\frac{1}{8^{2}+8} & \\frac{1}{9^{2}+9} & \\frac{1}{10^{2}+10} \\end{array} $$`

const repaired = repairNpSpPassageArray(broken)
assert.match(repaired, /\\frac\{1\}\{7\^\{?2\}?\+7\}/, 'row III must include 1/(7²+7)')
assert.match(repaired, /\\frac\{1\}\{11\^\{?2\}?\+11\}/, 'row III must include 1/(11²+11)')
assert.match(repaired, /\\mathrm\{III\}/, 'row III label should be added')
assert.ok(!/6\^2\+6\}[^\\]*\\\\[^\\]*\\frac\{1\}\{8/.test(repaired), 'no gap between 6 and 8')

const fracs = [...repaired.matchAll(/\\frac\{1\}\{(\d+)\^\{?2\}?\+\d+\}/g)].map((m) => Number(m[1]))
assert.deepEqual(fracs, [3, 4, 5, 6, 7, 8, 9, 10, 11], 'full denominator sequence 3–11')

const saved = persistPassageBundleFields({ passageText: broken }).passageText
assert.match(saved, /7\^\{?2\}?\+7/)

const display = prepareTextForMathTextDisplay(broken)
assert.match(display, /7\^\{?2\}?\+7/)

const threeRow = `Consider $N_{p}$ terms $$\\begin{array}{ccccc} \\mathrm{I}^{\\text {st }} \\text { row } & & \\frac{1}{3^{2}+3} & & \\\\ \\mathrm{II}^{\\text {nd }} \\text { row } & & \\frac{1}{4^{2}+4} & \\frac{1}{5^{2}+5} & \\frac{1}{6^{2}+6} \\\\ \\mathrm{III}^{\\text {rd }} \\text { row } & & \\frac{1}{7^{2}+7} & \\frac{1}{8^{2}+8} & \\frac{1}{9^{2}+9} & \\frac{1}{10^{2}+10} & \\frac{1}{11^{2}+11} \\end{array}$$`
const savedThreeRow = finalizeStemForBank(threeRow)
assert.equal((savedThreeRow.match(/\\\\/g) || []).length, 2, 'three passage rows must keep two \\\\ breaks on save')

const collapsed = threeRow.replace(/\\\\/g, ' ')
const healed = finalizeStemForBank(collapsed)
assert.equal((healed.match(/\\\\/g) || []).length, 2, 'flattened passage must regain row breaks on reload')
assert.match(healed, /\\mathrm\{III\}/)

console.log('test-repair-npsp-array: ok')
