/**
 * Read-only sweep of an exported Official PYQ store (the browser key
 * testvantage-official-pyq-pending saved to a JSON file). Runs the local
 * quality check plus one detector per known error class and prints counts.
 *
 *   node scripts/sweep-official-pyq-store.mjs <store.json> [--details]
 */
import fs from 'node:fs'

const file = process.argv[2]
const details = process.argv.includes('--details')
if (!file) {
  console.error('usage: node scripts/sweep-official-pyq-store.mjs <store.json> [--details]')
  process.exit(2)
}

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (i) => [...store.keys()][i] ?? null,
}
globalThis.sessionStorage = globalThis.localStorage
store.set('testvantage-official-pyq-pending', fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))

const { loadOfficialPyqPendingPapers } = await import('../src/utils/officialPyqPendingStore.js')
const { localOfficialPyqQualityCheck } = await import('../src/utils/officialPyqLocalQuality.js')
const { officialPyqDrawnRawCode, officialPyqDrawnText } = await import('../src/utils/officialPyqOriginalCompare.js')
const { officialPyqFigureMarkupProblem } = await import('../src/utils/officialPyqCardEdit.js')
const { prepareTextForMathTextDisplay } = await import('../src/utils/prepareMathForRender.js')
const { looksLikeMatchingListStem, parseMatchingListForDisplay } = await import('../src/utils/parseMatchingListDisplay.js')
const { LATEX_FENCE } = await import('../src/utils/latexTabularDisplay.js')
const { mathDrawFailure } = await import('../src/utils/mathDrawCheck.js')

const SMASH = new RegExp(String.raw`\\left\s*${LATEX_FENCE}\s*\$|\$\$\s*\\right\b`)
const filled = (opts) => (Array.isArray(opts) ? opts : []).map((o) => String(o ?? '').trim()).filter(Boolean)
const norm = (s) =>
  String(s ?? '')
    .replace(/^\(?[A-D]\)\s*/, '')
    .split(/(<smiles>[\s\S]*?<\/smiles>|\$[^$]*\$)/i)
    .map((part, i) => (i % 2 ? part : part.toLowerCase()))
    .join('')
    .replace(/\s+/g, '')
const isNumeric = (q) => /integer|numerical|numeric|nat|decimal/i.test(String(q?.questionType ?? ''))
const parts = (q) => [q?.passageText, q?.text, ...(Array.isArray(q?.options) ? q.options : [])].map((p) => String(p ?? ''))

/** @param {any} q */
function matchListProblem(q) {
  const text = String(q?.text ?? '')
  if (!looksLikeMatchingListStem(text)) return ''
  let parsed
  try {
    parsed = parseMatchingListForDisplay(text, q.options)
  } catch {
    return 'match list does not parse'
  }
  const listI = parsed?.listI || []
  const listII = parsed?.listII || []
  if (!listI.length || !listII.length) return 'match list has an empty column'
  const unlabelled = [...listI, ...listII].filter((r) => !String(r?.label ?? '').trim())
  if (unlabelled.length) return 'a match-list row has no label'
  const optionText = filled(q.options).join(' ')
  const labelsII = new Set(listII.map((r) => String(r.label).replace(/[()\s]/g, '')))
  const labelsI = new Set(listI.map((r) => String(r.label).replace(/[()\s]/g, '')))
  const wanted = [...optionText.matchAll(/\(\s*([A-Z]|[IVX]{1,4}|\d)\s*\)|\b([PQRST]|[IVX]{1,4}|\d)\s*(?:→|->|\\rightarrow)/g)]
    .map((m) => m[1] || m[2])
  const missing = [...new Set(wanted)].filter((l) => !labelsII.has(l) && !labelsI.has(l))
  if (missing.length) return `options name rows the lists do not have: ${missing.join(', ')}`
  const emptyRow = [...listI, ...listII].find((r) => !String(r?.text ?? r?.body ?? '').trim() && !r?.figure)
  if (emptyRow) return `match-list row ${emptyRow.label} is empty`
  return ''
}

/** Printed numbers should run +1 inside a subject (restart) or across the paper (continuous). */
function printedNumberJumps(questions) {
  const bad = []
  let prev = null
  questions.forEach((q, i) => {
    if (!q || q.placeholder) return
    const n = Number(q.printedNumber ?? q.questionNumber ?? q.pyqSlot)
    if (!Number.isFinite(n) || n <= 0) return
    const subject = String(q.subject ?? '')
    if (prev && prev.subject === subject && n !== prev.n + 1) bad.push(i + 1)
    if (prev && prev.subject !== subject && n !== 1 && n !== prev.n + 1) bad.push(i + 1)
    prev = { n, subject }
  })
  return bad
}

const papers = loadOfficialPyqPendingPapers()
const summary = []
for (const paper of papers) {
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const hits = {
    quality: [],
    rawOnScreen: [],
    leftDollarSmash: [],
    cutPicture: [],
    duplicateOptions: [],
    matchList: [],
    numericWithOptions: [],
    printedNumber: printedNumberJumps(questions),
  }
  const why = {}
  let quality = null
  try {
    quality = localOfficialPyqQualityCheck(paper)
    hits.quality = quality.failedGoTo || []
  } catch (err) {
    hits.quality = ['error: ' + err.message]
  }
  questions.forEach((q, i) => {
    if (!q || q.placeholder) return
    const n = i + 1
    const note = (k, msg) => {
      hits[k].push(n)
      if (msg) why[`${k} Q${n}`] = msg
    }
    const shownParts = parts(q).map((p) => {
      try {
        return prepareTextForMathTextDisplay(p)
      } catch {
        return p
      }
    })
    const raw = officialPyqDrawnRawCode(shownParts.map((p) => officialPyqDrawnText(p)).join('\n'))
    const draw = parts(q).map((p) => mathDrawFailure(p)).find(Boolean)
    if (raw.length || draw) note('rawOnScreen', raw[0] || draw)
    const smashAt = [...parts(q), ...shownParts].find((p) => SMASH.test(p))
    if (smashAt) note('leftDollarSmash', smashAt.match(SMASH)?.[0])
    const pic = parts(q).map((p) => officialPyqFigureMarkupProblem(p)).find(Boolean)
    if (pic) note('cutPicture', pic)
    const opts = filled(q.options)
    const keys = opts.map(norm)
    if (!isNumeric(q) && new Set(keys).size < keys.length) note('duplicateOptions', opts.join(' | ').slice(0, 160))
    const ml = matchListProblem(q)
    if (ml) note('matchList', ml)
    if (isNumeric(q) && opts.length) note('numericWithOptions', `${q.questionType} with ${opts.length} options`)
  })
  const edited = questions.filter((q) => q?.adminEdited).length
  summary.push({
    paper: `${paper.year} ${paper.session}`,
    id: paper.id,
    status: paper.status,
    cards: questions.length,
    edited,
    facts: paper.adminFacts?.totalQuestions ?? paper.paperFacts?.totalQuestions ?? '',
    ...Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length])),
  })
  if (details) {
    console.log(`\n=== ${paper.year} ${paper.session} (${paper.status}) ${paper.id}`)
    for (const [k, v] of Object.entries(hits)) if (v.length) console.log(`  ${k}: Q ${v.join(', ')}`)
    for (const [k, v] of Object.entries(why)) console.log(`    ${k}: ${v}`)
    if (quality?.lines?.length) for (const line of quality.lines) console.log(`    quality: ${line}`)
  }
}
console.table(summary)
