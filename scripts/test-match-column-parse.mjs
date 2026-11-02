import assert from 'node:assert/strict'
import {
  applyParsedMatrixCols,
  mergeMatrixRows,
  matrixColsNeedHeal,
  matrixRowsForUi,
  parseMatchColumnUpload,
  repairIncompleteRowD,
  resolveMatchColumnUpload,
} from '../src/utils/parseMatchColumnUpload.js'
import {
  looksLikePassageMultiMcq,
  resolvePassageUpload,
} from '../src/utils/parsePassageUpload.js'

const sample = `
11. Match the Column
Column-I
(A) If p^th, q^th and r^th terms of a G.P. (common ratio != 1) are in G.P. then p,q,r will be in
(B) If a,b,c,d are non-zero real numbers such that (a^2 + b^2 + c^2)(b^2 + c^2 + d^2) <= (ab + bc + cd)^2 and c(a - b) = a(b - c), then a,b,c,d will be in
(C) If a,b,c,d are four different positive numbers in G.P. then fraction terms will be in
(D) If a_1, a_2, a_3 are in A.P., a_2, a_3, a_4 are in G.P. and a_3, a_4, a_5 are in H.P. then a_1, a_3, a_5 are always in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) A progression, whose all the terms are identical
`

const p = parseMatchColumnUpload(sample)
console.log('--- structured ---')
console.log('rows', p.matrixRows.map((r) => r.slice(0, 55)))
console.log('cols', p.matrixCols)

/** OCR order: P before B — causes bleed in old parser */
const falseC = `
Column-I
(A) First row here with enough text for testing
(©) tiny false marker
(B) Second row with inequality and numbers here for test
(C) If a,b,c,d are four different positive numbers in G.P. then fraction logs
(D) Fourth row with AP GP HP sequence always in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) All terms identical
`
const p3 = resolveMatchColumnUpload(falseC)
console.log('--- false © (C) ---')
console.log('C row', p3?.matrixRows?.[2]?.slice(0, 70) || '(empty)')

const interleaved = `
Column-I
(A) If p^th, q^th and r^th terms of a G.P. (common ratio != 1) are in G.P. then p,q,r will be in
Column-II
(P) Arithmetic progression in G.P. then p,q,r will be in
(B) If a,b,c,d are non-zero real numbers such that inequality holds then a,b,c,d will be in
(Q) Geometric progression
(C) If a,b,c,d are four different positive numbers in G.P. then logs
(R) Harmonic progression
(D) If a_1, a_2, a_3 are in A.P. then a_1, a_3, a_5 are always in
(S) Not a harmonic progression
(T) A progression, whose all the terms are identical
`

const p2 = resolveMatchColumnUpload(interleaved)
console.log('--- interleaved ---')
console.log('rows', p2.matrixRows.map((r) => (r ? r.slice(0, 50) : '(empty)')))
console.log('cols', p2.matrixCols)

/** Mathpix-style: (C) without leading "If" */
const mathpixC = `
Column-I
(A) If $p^{\\text {th }}, q^{\\text {th }}$ and $r^{\\text {th }}$
(B) If $a, b, c, d$ are non-zero real numbers such that inequality holds then a,b,c,d will be in
(C) $a, b, c, d$ are four different positive numbers in G.P. then $\\frac{a(2 \\log a + \\log b)}{b}$
(D) If $\\mathrm{a}_{1}, \\mathrm{a}_{2}, \\mathrm{a}_{3}$ are in A.P.
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) A progression, whose all the terms are identical
`
const p4 = resolveMatchColumnUpload(mathpixC)
console.log('--- mathpix (C) no If ---')
console.log('C row', p4?.matrixRows?.[2]?.slice(0, 80) || '(empty)')

/** No (C) label between B and D */
const noLabelC = `
Column-I
(A) If p^th terms G.P. then p,q,r will be in
(B) If a,b,c,d are non-zero real numbers such that inequality then a,b,c,d will be in
If a,b,c,d are four different positive numbers in G.P. then fraction logs will be in
(D) If a_1, a_2, a_3 are in A.P. then a_1, a_3, a_5 are always in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) All terms identical
`
const p5 = resolveMatchColumnUpload(noLabelC)
console.log('--- no (C) label ---')
console.log('C row', p5?.matrixRows?.[2]?.slice(0, 80) || '(empty)')

const truncatedD = `
Column-I
(A) If p^th terms G.P. then p,q,r will be in
(B) If a,b,c,d are non-zero real numbers such that inequality then a,b,c,d will be in
(C) If a,b,c,d are four different positive numbers in G.P. then fraction logs will be in
(D) If a_1, a_2, a_3 are in A.P., a_2, a_3, a_4 are in G.P. and a_3, a_4, a_5 are in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) All terms identical
`
const p6 = resolveMatchColumnUpload(truncatedD)
assert.match(p6?.matrixRows?.[3] ?? '', /H\.P/i, 'row D must include H.P. when OCR truncates')
assert.match(p6?.matrixRows?.[3] ?? '', /will be in/i, 'row D must end with will be in')
assert.equal(
  repairIncompleteRowD('If a_1, a_2, a_3 are in A.P., a_2, a_3, a_4 are in G.P. and a_3, a_4, a_5 are in'),
  'If a_1, a_2, a_3 are in A.P., a_2, a_3, a_4 are in G.P. and a_3, a_4, a_5 are in H.P. then a_1, a_2, a_3, a_4, a_5 will be in',
)

const latexRowD =
  'If $a_1, a_2, a_3$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in'
assert.match(repairIncompleteRowD(latexRowD), /H\.P/i, 'LaTeX row D repair')
assert.match(repairIncompleteRowD(latexRowD), /\$a_1.*will be in/i, 'LaTeX row D keeps $a_1$ style')

const latexMtc = `
Match the Column
Column-I
(A) If p,q,r G.P. then p,q,r will be in
(B) If a,b,c,d inequality then a,b,c,d will be in
(C) If a,b,c,d four different in G.P. then logs will be in
(D) If $a_1, a_2, a_3$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) All terms identical
`
const p7 = resolveMatchColumnUpload(latexMtc)
assert.match(p7?.matrixRows?.[3] ?? '', /H\.P/i, 'full MTC parse repairs LaTeX row D')

const stuck = mergeMatrixRows(
  ['', '', '', 'If $a_1, a_2, a_3$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in'],
  ['', '', '', 'If $a_1, a_2, a_3$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in H.P. then $a_1, a_2, a_3, a_4, a_5$ will be in'],
)
assert.match(stuck[3], /will be in/i, 'mergeMatrixRows must upgrade truncated row D')

const ui = matrixRowsForUi([
  'A row',
  'B row',
  'C row',
  'If $a_1, a_2, a_3$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in',
])
assert.match(ui[3], /H\.P.*will be in/i, 'matrixRowsForUi completes row D for preview')

const mathrmTrunc =
  'If $\\mathrm{a}_{1}, \\mathrm{a}_{2}, \\mathrm{a}_{3}$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in'
assert.match(repairIncompleteRowD(mathrmTrunc), /H\.P/i, 'mathrm{a} row D repair')
assert.match(repairIncompleteRowD(mathrmTrunc), /\\mathrm\{a\}_\{5\}/, 'mathrm{a} suffix style')
assert.match(matrixRowsForUi(['', '', '', mathrmTrunc])[3], /will be in/i, 'matrixRowsForUi mathrm row D')

const mathrmMtc = `
Match the Column
Column-I
(A) If p,q,r G.P. then p,q,r will be in
(B) If a,b,c,d inequality then a,b,c,d will be in
(C) If a,b,c,d four different in G.P. then logs will be in
(D) If $\\mathrm{a}_{1}, \\mathrm{a}_{2}, \\mathrm{a}_{3}$ are in A.P., $a_2, a_3, a_4$ are in G.P. and $a_3, a_4, a_5$ are in
Column-II
(P) Arithmetic progression
(Q) Geometric progression
(R) Harmonic progression
(S) Not a harmonic progression
(T) All terms identical
`
const p8 = resolveMatchColumnUpload(mathrmMtc)
assert.match(p8?.matrixRows?.[3] ?? '', /H\.P.*will be in/i, 'full MTC parse repairs mathrm row D')

const staleCols = [
  'Arithmetic progression',
  'Geometric progression',
  'Harmonic progression',
  'Not a harmonic progression',
]
const sparseParse = ['', '', '', '']
const cleared = applyParsedMatrixCols(staleCols, sparseParse)
assert.equal(cleared.cols[0].trim(), '', 'sparse parse must clear stale Column II')
assert.equal(cleared.cols[1].trim(), '', 'sparse parse must clear stale Column II col 2')

const vectorCols = ['0', '1', '2', '3']
const kept = applyParsedMatrixCols(staleCols, vectorCols)
assert.equal(kept.cols[0], '0', 'parsed Column II replaces stale when 2+ filled')

assert.equal(looksLikePassageMultiMcq(sample), false, 'MTC must not route as passage multi-MCQ')
assert.equal(
  resolvePassageUpload(sample, sample, { allowOptionless: true }),
  null,
  'MTC must not split into passage sub-questions',
)

const fnMatch = `Column-I
(A) f_2(3π/10)
(B) f_5(π/28)
(C) f_7(π/60)
Column-II
(P) √3
(Q) √(3+2√2)
(R) √2 - 1
(S) √(7+4√3)`
const fnParsed = resolveMatchColumnUpload(fnMatch)
assert.match(fnParsed?.matrixRows?.[2] ?? '', /f_7.*π\/60|f_7.*\\pi\/60/i, 'row C keeps f_7')
assert.doesNotMatch(fnParsed?.matrixRows?.[2] ?? '', /\(P\)/, 'row C must not bleed Column-II')

const fnGlued =
  '(A) f_2(3pi/10) (B) f_5(pi/28) (C) f_7(pi/60) (P) sqrt3 (Q) sqrt(3+2sqrt2) (R) sqrt2-1 (S) sqrt(7+4sqrt3)'
const fnGluedParsed = resolveMatchColumnUpload(fnGlued)
assert.match(fnGluedParsed?.matrixRows?.[0] ?? '', /f_2/, 'glued layout row A')
assert.match(fnGluedParsed?.matrixCols?.[0] ?? '', /sqrt3|√3/i, 'glued layout col P')

const progressionCols = [
  'Arithmetic progression',
  'Geometric progression',
  'Harmonic progression',
  'Not a harmonic progression',
]
assert.equal(matrixColsNeedHeal(progressionCols), false, 'progression Column II labels are valid')

console.log('test-match-column-parse: ok')
