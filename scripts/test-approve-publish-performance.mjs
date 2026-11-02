/**
 * Approve & Publish must finish a 51-card paper in Node (not freeze at 8%),
 * keep unique numbers 1..51, and still refuse a genuinely short paper.
 */
import assert from 'node:assert/strict'
import { buildRealisticOfficialPyqPaper, PHYSICS_MATCH_SLOTS } from './fixtures/official-pyq-large-paper.mjs'

const CARD_BUDGET_MS = 3000
const CLICK_BUDGET_MS = 20_000

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size
    },
    key: (i) => [...store.keys()][i] ?? null,
  }
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis

localStorage.clear()
sessionStorage.clear()

const { repairOrphanAlignedBody } = await import('../src/utils/wrapBareLatexRuns.js')
const {
  healUploadQuestionCard,
  healOfficialPyqPaperQuestions,
  extendStemFromSource,
  extendOfficialPyqHealCard,
} = await import('../src/utils/extendTruncatedStem.js')
const { assignUniqueOfficialPyqNumbers } = await import('../src/utils/officialPyqMissingSlots.js')
const {
  importQuestionsToOfficialPyqPending,
  approveOfficialPyqPaperAsync,
  validateOfficialPyqForApprove,
  officialPyqHealProgressPercent,
} = await import('../src/utils/officialPyqApproval.js')
const { updateOfficialPyqPendingPaper, getOfficialPyqPendingPaper } = await import(
  '../src/utils/officialPyqPendingStore.js'
)

function withFacts(id) {
  const paper = getOfficialPyqPendingPaper(id)
  if (paper && paper.status === 'pending_review' && !paper.adminFacts?.confirmedAt) {
    updateOfficialPyqPendingPaper(id, { adminFacts: { confirmedAt: Date.now(), confirmedBy: 'test' } })
  }
  return id
}

/** Long leftover aligned rows with no "then" — used to hang heal on ~Q4. */
const POISON_ALIGNED =
  'A particle starts from rest. The coordinates satisfy ' +
  Array.from({ length: 80 }, (_, i) => `& x_{${i}} = ${i} \\\\ & y_{${i}} = ${i}`).join(' ') +
  ' and the speed is closest to'

const poisonStarted = Date.now()
const poisonOut = repairOrphanAlignedBody(POISON_ALIGNED)
const poisonMs = Date.now() - poisonStarted
assert.ok(poisonMs < CARD_BUDGET_MS, `repairOrphanAlignedBody hung (${poisonMs}ms)`)
assert.ok(poisonOut.includes('particle'), 'poison stem must keep its wording')

/** Real JEE Adv 2024 hang: Q17 cut at List-II + 1.6MB notes in officialPyqPaperSourceText. */
const Q17_CUT =
  'Let $f: \\mathbb{R} \\rightarrow \\mathbb{R}$ and $g: \\mathbb{R} \\rightarrow \\mathbb{R}$ be functions. ' +
  'Match each entry in List-I to the correct entry in List-II. List-I ' +
  '(P) If $a=0, b=1, c=0$, and $d=0$, then (Q) If $a=1, b=0, c=0$, and $d=0$, then ' +
  '(R) If $a=0, b=0, c=1$, and $d=0$, then (S) If $a=0, b=0, c=0$, and $d=1$, then List-II'
const Q17_OCR =
  `${'Imported extract padding.\n'.repeat(80_000)}\n${Q17_CUT}\n` +
  'List-II\n(1) $h$ is not continuous at $x=0$\n(2) $h$ is continuous but not differentiable at $x=0$\n' +
  '(3) $h$ is differentiable at $x=0$\nLet k(x) be the next question.'
const q17HangT0 = Date.now()
const q17Extended = extendStemFromSource(Q17_CUT, Q17_OCR)
const q17HangMs = Date.now() - q17HangT0
assert.ok(q17HangMs < 500, `extendStemFromSource Q17 / 1.6MB notes hung (${q17HangMs}ms)`)
assert.match(q17Extended, /not continuous/, 'Q17 List-II must come from OCR')
const q17HealT0 = Date.now()
const q17Healed = extendOfficialPyqHealCard({ text: Q17_CUT, options: ['', '', '', ''] }, Q17_OCR)
const q17HealMs = Date.now() - q17HealT0
assert.ok(q17HealMs < 500, `extendOfficialPyqHealCard Q17 hung (${q17HealMs}ms)`)
assert.match(String(q17Healed.text), /List-I/i)
assert.match(String(q17Healed.text), /List-II/i)

function withPoisonQ4(paper) {
  const questions = paper.questions.map((q, i) =>
    i === 3 ? { ...q, text: `${POISON_ALIGNED}\n\n${q.text}` } : q,
  )
  return { ...paper, questions }
}

function withDupLabels668(paper) {
  const questions = paper.questions.map((q, i) => {
    if (i === 5 || i === 6) {
      return { ...q, questionNumber: 6, pyqSlot: 6, printedNumber: 6 }
    }
    if (i === 7) {
      return { ...q, questionNumber: 8, pyqSlot: 8, printedNumber: 8 }
    }
    if (i === 29 || i === 30) {
      return { ...q, questionNumber: 30, pyqSlot: 30, printedNumber: 30 }
    }
    if (i === 32) {
      return { ...q, questionNumber: 34, pyqSlot: 34, printedNumber: 34 }
    }
    return q
  })
  return { ...paper, questions }
}

function assertUniqueOneToN(questions, n = 51) {
  assert.equal(questions.length, n, `expected ${n} cards, got ${questions.length}`)
  const nums = questions.map((q, i) => Number(q.questionNumber ?? q.pyqSlot ?? i + 1))
  assert.deepEqual(nums, Array.from({ length: n }, (_, i) => i + 1), `question numbers ${nums.join(',')}`)
  assert.equal(new Set(nums).size, n, 'duplicate question numbers in output')
}

const fixture = withPoisonQ4(withDupLabels668(buildRealisticOfficialPyqPaper(51)))
assert.equal(fixture.questions.length, 51)

const cardTimes = []
for (let i = 0; i < fixture.questions.length; i += 1) {
  const t0 = Date.now()
  healUploadQuestionCard(fixture.questions[i], fixture.preparedText)
  const ms = Date.now() - t0
  cardTimes.push(ms)
  assert.ok(
    ms < CARD_BUDGET_MS,
    `card ${i + 1} exceeded ${CARD_BUDGET_MS}ms budget (${ms}ms)`,
  )
}

const paperHealT0 = Date.now()
const paperHealed = healOfficialPyqPaperQuestions(fixture)
const paperHealMs = Date.now() - paperHealT0
assert.ok(paperHealMs < CLICK_BUDGET_MS, `paper heal ${paperHealMs}ms`)
assertUniqueOneToN(paperHealed, 51)

const poisonPending = importQuestionsToOfficialPyqPending({ ...fixture, year: 2022 })
const poisonCheckT0 = Date.now()
const poisonCheck = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(withFacts(poisonPending.id)))
assert.ok(Date.now() - poisonCheckT0 < CLICK_BUDGET_MS, 'approve check on the poison paper hung')
assert.equal(poisonCheck.ok, false, 'leftover aligned rows on Q4 must block approve')
assert.match(poisonCheck.errors.join(' '), /Go to Q 4\b/)

const pending = importQuestionsToOfficialPyqPending(withDupLabels668(buildRealisticOfficialPyqPaper(51)))
updateOfficialPyqPendingPaper(pending.id, { expectedQuestionCount: 51 })
const ticks = []
const clickT0 = Date.now()
const result = await approveOfficialPyqPaperAsync(withFacts(pending.id), {
  skipBank: true,
  onProgress: (pct, label) => {
    ticks.push({ pct, label, ms: Date.now() - clickT0 })
  },
  yieldFn: () => Promise.resolve(),
})
const clickMs = Date.now() - clickT0
assert.equal(result.ok, true, `approve failed: ${(result.errors || []).join(' | ')}`)
assert.equal(result.pyqCount, 51)
assert.ok(clickMs < CLICK_BUDGET_MS, `whole Approve click ${clickMs}ms (budget ${CLICK_BUDGET_MS})`)
assert.ok(
  ticks.some((t) => t.pct > 8 && t.pct < 100),
  `progress never left 8%: ${JSON.stringify(ticks)}`,
)
assert.ok(
  ticks.some((t) => /question \d+ of \d+/i.test(String(t.label ?? ''))),
  `progress must name the card being healed: ${[...new Set(ticks.map((t) => t.label))].slice(0, 6).join(' / ')}`,
)
const q17Tick = ticks.find((t) => /question 17 of \d+/i.test(String(t.label ?? '')))
assert.ok(q17Tick, 'must report question 17')
assert.equal(officialPyqHealProgressPercent(17, 51), 33, '17/51 must read 33%, not 19%')
assert.ok(
  q17Tick.pct >= 30 && q17Tick.pct <= 36,
  `question 17 of 51 showed ${q17Tick.pct}% (want ~33%)`,
)
assert.ok(
  ticks.every((t, i) => i === 0 || t.pct >= ticks[i - 1].pct),
  'percent must not jump backwards after heal',
)
assert.ok(ticks.some((t) => t.pct >= 100) || result.ok, 'must reach done')

const published = getOfficialPyqPendingPaper(pending.id)
assert.equal(published.status, 'approved')

for (const slot of PHYSICS_MATCH_SLOTS) {
  const q = paperHealed[slot - 1]
  assert.ok(q, `missing physics match Q${slot}`)
  assert.match(String(q.text), /List-I/i, `Q${slot} must keep List-I`)
  assert.match(String(q.text), /List-II/i, `Q${slot} must keep List-II`)
  assert.doesNotMatch(String(q.text), /<smiles>/i, `Q${slot} physics List-II must not get chemistry SMILES`)
}

const fifty = {
  ...buildRealisticOfficialPyqPaper(50),
  year: 2023,
  paperLabel: 'JEE Advanced 2023 Paper 1 (perf fixture, 50 questions)',
}
const short = importQuestionsToOfficialPyqPending(fifty)
updateOfficialPyqPendingPaper(short.id, { expectedQuestionCount: 51 })
const shortQs = getOfficialPyqPendingPaper(short.id).questions
assert.equal(shortQs.length, 50)
const blank51 = [
  ...shortQs,
  {
    text: '',
    options: ['', '', '', ''],
    placeholder: true,
    questionNumber: 51,
    pyqSlot: 51,
    printedNumber: 51,
  },
]
updateOfficialPyqPendingPaper(short.id, { questions: blank51, expectedQuestionCount: 51 })
const blankCheck = validateOfficialPyqForApprove(getOfficialPyqPendingPaper(short.id))
assert.equal(blankCheck.ok, false, '50 filled + blank 51st must not approve')
assert.match(blankCheck.errors.join(' '), /50|51|reserved|filled|do not approve/i)

const relabelled = assignUniqueOfficialPyqNumbers(withDupLabels668(buildRealisticOfficialPyqPaper(51)).questions)
assertUniqueOneToN(relabelled, 51)

console.log(
  `test-approve-publish-performance: ok paperHeal=${paperHealMs}ms click=${clickMs}ms maxCard=${Math.max(...cardTimes)}ms poison=${poisonMs}ms ticks=${ticks.length}`,
)
