/**
 * Hybrid AI replica papers for Official PYQ.
 * Child ids use the existing clone scheme: parent id + C + number.
 * Example: MAM00001I -> MAM00001IC1, MAM00001A2024 -> MAM00001A2024C1.
 */
import {
  mapHybridExamLabelToSlug,
  mapHybridPoolQuestionTypeToBankId,
  mapHybridSubjectLabelToSlug,
} from './hybridMetadata.js'
import { findDuplicateQuestions, normalizeStemForDuplicate } from './detectDuplicateQuestion.js'
import { assignAiSimilarChildId, parseSimilarVariantIndex } from './questionFamily.js'
import { hasStableOfficialPyqQuestionId } from './officialPyqPublishedMeta.js'
import { loadQuestionBank } from './questionBank.js'
import { isMatrixGridCard, parseMatrixGridAnswer } from './matrixGridPyq.js'

/** Default similar-paper run: easier, same, then the two harder papers. */
export const REPLICA_DIFFICULTY_ORDER = [-1, 0, 1, 2]

const DIFFICULTY_CHILD_SLOT = { '-1': 1, 0: 2, 1: 3, 2: 4 }

/** Similar-paper suffix: S = Similar, then Easy / Same / Harder. */
const REPLICA_NAME_SUFFIX = { '-1': 'SE1', 0: 'SS', 1: 'SH1', 2: 'SH2' }

/**
 * JEE Advanced short code: JA + year + P + paper number. Paper 1 in 2024 is JA2024P1.
 * @param {{ exam?: string, year?: number, session?: string, paperLabel?: string, paperId?: string }} paper
 */
export function officialPyqShortCode(paper) {
  const exam = String(paper?.exam || '')
  const label = [paper?.paperLabel, paper?.session].filter(Boolean).join(' ')
  const advanced = exam === 'jee-advanced' || /jee\s*advanced/i.test(label)
  if (!advanced) return ''
  const year = Number(paper?.year)
  if (!Number.isFinite(year)) return ''
  const blob = [paper?.session, paper?.paperLabel, paper?.paperId].filter(Boolean).join(' ')
  const match = blob.match(/paper\s*(\d+)/i)
  const paperNo = match ? String(Number(match[1])) : '1'
  return `JA${year}P${paperNo}`
}

/** @param {number|string} offset */
export function replicaDifficultySuffix(offset) {
  return REPLICA_NAME_SUFFIX[String(Number(offset))] || ''
}

/**
 * Full similar-paper name, for example JA2024P1SE1.
 * @param {{ exam?: string, year?: number, session?: string, paperLabel?: string, paperId?: string }} paper
 * @param {number|string} offset
 */
export function replicaPaperName(paper, offset) {
  const base = officialPyqShortCode(paper)
  const suffix = replicaDifficultySuffix(offset)
  if (!base || !suffix) return ''
  return base + suffix
}

/**
 * True when this parent already has a replica at this difficulty.
 * Rejected rows do not count, so a removed paper can be created again.
 * @param {Array<{ replicaParentPaperId?: string, replicaDifficultyOffset?: number, paperId?: string, paperLabel?: string, status?: string, aiReplicaPaper?: boolean }>} papers
 * @param {string} parentPaperId
 * @param {number|string} offset
 * @param {string} [name]
 */
export function replicaAlreadyStored(papers, parentPaperId, offset, name) {
  const parent = String(parentPaperId || '').trim()
  const wanted = Number(offset)
  const code = String(name || '').trim()
  return (Array.isArray(papers) ? papers : []).some((row) => {
    if (!row || row.status === 'rejected') return false
    const sameParent = String(row.replicaParentPaperId || '').trim() === parent
    const sameOffset = Number(row.replicaDifficultyOffset) === wanted
    if (sameParent && sameOffset) return true
    if (!code) return false
    return String(row.paperId || '') === code || String(row.paperLabel || '') === code
  })
}

function keptText(next, current) {
  const text = String(next ?? '').trim()
  if (text) return text
  return current == null ? '' : String(current)
}

/**
 * @param {{ id?: string, parentQuestionId?: string, similarToId?: string, seedPyqId?: string }} question
 * @param {Array<{ id?: string }|string>} [peers]
 */
function peerId(row) {
  return String(typeof row === 'string' ? row : row?.id || '').trim()
}

export function officialPyqReplicaChildId(question, peers = []) {
  const parent = String(question?.parentQuestionId || question?.similarToId || question?.seedPyqId || '').trim()
  const current = String(question?.id || '').trim()
  if (!parent) return current
  if (current.startsWith(`${parent}C`) && parseSimilarVariantIndex(current) != null) return current
  const list = Array.isArray(peers) ? peers : []
  const offset = question?.replicaDifficultyOffset
  const hasOffset = offset != null && offset !== '' && Number.isFinite(Number(offset))
  if (hasOffset) {
    const wanted = Number(offset)
    const prior = list.find((row) => {
      if (!row || typeof row === 'string') return false
      const id = peerId(row)
      const rowParent = String(row.parentQuestionId || row.similarToId || row.seedPyqId || '').trim()
      return (
        rowParent === parent &&
        Number(row.replicaDifficultyOffset) === wanted &&
        id.startsWith(`${parent}C`) &&
        parseSimilarVariantIndex(id) != null
      )
    })
    if (prior) return peerId(prior)
    const slot = DIFFICULTY_CHILD_SLOT[String(wanted)]
    if (slot) {
      const taken = new Set(list.map((row) => peerId(row)).filter(Boolean))
      for (let n = slot; n < slot + 30; n += 1) {
        const candidate = `${parent}C${n}`
        if (!taken.has(candidate)) return candidate
      }
    }
  }
  const others = list.filter((row) => peerId(row) !== current)
  return assignAiSimilarChildId(parent, 1, others)
}

/**
 * True when this stem copies the parent, another difficulty, or a bank question.
 * Uses the same whole-bank duplicate compare.
 * @param {string} text
 * @param {Array<{ text?: string, stem?: string }|string>} peers
 */
export function replicaQuestionIsDuplicate(text, peers) {
  const mine = String(text || '').trim()
  if (!mine) return true
  const mineNorm = normalizeStemForDuplicate(mine)
  const list = (Array.isArray(peers) ? peers : [])
    .map((row, index) => ({
      id: 'peer-' + index,
      text: String(typeof row === 'string' ? row : row?.text || row?.stem || '').trim(),
    }))
    .filter((row) => row.text)
  for (const row of list) {
    if (normalizeStemForDuplicate(row.text) === mineNorm) return true
  }
  return findDuplicateQuestions({ text: mine }, list).length > 0
}

/**
 * Stable parent id for one published question. Prefers the paper id, then the bank row.
 * @param {{ paperId?: string }} paper
 * @param {{ id?: string, pyqSlot?: number }} question
 * @param {number} index
 */
export function replicaParentQuestionId(paper, question, index) {
  const current = String(question?.id || '').trim()
  if (hasStableOfficialPyqQuestionId(current)) return current
  const slot = Number(question?.pyqSlot || index + 1)
  const paperId = String(paper?.paperId || '')
  const bank = loadQuestionBank()?.questions || []
  const hit = bank.find((row) => {
    if (!hasStableOfficialPyqQuestionId(row?.id)) return false
    if (paperId && String(row.paperId || '') !== paperId) return false
    return Number(row.pyqSlot) === slot
  })
  return hit ? String(hit.id) : current
}

/**
 * Map a Hybrid AI correct_answer string onto the stored answer fields.
 * @param {string} correctAnswer
 */
export function answerFieldsFromHybrid(correctAnswer) {
  const raw = String(correctAnswer || '').trim()
  if (!raw) return {}
  const letters = raw.toUpperCase().match(/[A-D]/g) || []
  if (letters.length > 1 && !/\d/.test(raw)) {
    return { correctIndices: letters.map((ch) => ch.charCodeAt(0) - 65) }
  }
  if (letters.length === 1 && raw.length <= 3) {
    return { correctIndex: letters[0].charCodeAt(0) - 65 }
  }
  if (/^-?\d+\.\d+$/.test(raw)) return { correctNumerical: Number(raw) }
  if (/^-?\d+$/.test(raw)) return { correctInteger: Number(raw) }
  return {}
}

/**
 * Tags, answer, and solution only. Stem, options, and figures are not in this patch.
 * A blank Hybrid field keeps the stored value. A new solution replaces a hint or story.
 * @param {object} question
 * @param {object} filled
 */
export function publishedMetaPatchFromHybridFill(question, filled) {
  const q = question && typeof question === 'object' ? question : {}
  const f = filled && typeof filled === 'object' ? filled : {}
  const options = Array.isArray(q.options) ? q.options : []
  const subject = keptText(f.subject ? mapHybridSubjectLabelToSlug(f.subject) : '', q.subject)
  const section = keptText(f.unit || f.section, q.section || q.unit)
  const chapter = keptText(f.chapter, q.chapter)
  const topic = keptText(f.topic, q.topic)
  const typeRaw = String(f.question_type || '').trim()
  const questionType = typeRaw ? mapHybridPoolQuestionTypeToBankId(typeRaw, options) : String(q.questionType || '')
  const examRaw = String(f.exam || '').trim()
  const examIds = examRaw
    ? [mapHybridExamLabelToSlug(examRaw)]
    : Array.isArray(q.examIds)
      ? q.examIds.map(String)
      : []
  const toughnessLevel = keptText(f.toughness_level, q.toughnessLevel)
  const source = keptText(f.source, q.source)
  const solution = String(f.step_by_step_solution || '').trim() || String(q.solution || '')
  if (isMatrixGridCard(q)) {
    const key = String(f.correct_answer || '').trim() ? parseMatrixGridAnswer(f.correct_answer, q) : null
    return {
      questionId: q.id,
      expectText: String(q.text ?? q.stem ?? ''),
      subject,
      section,
      chapter,
      topic,
      questionType: String(q.questionType || ''),
      examIds,
      toughnessLevel,
      source,
      solution,
      correctIndex: '',
      correctIndices: [],
      correctInteger: '',
      correctNumerical: '',
      ...(key ? { matrixAnswerKey: key } : {}),
    }
  }
  const mapped = String(f.correct_answer || '').trim() ? answerFieldsFromHybrid(f.correct_answer) : null
  let correctIndex = q.correctIndex ?? ''
  let correctIndices = Array.isArray(q.correctIndices) ? q.correctIndices : []
  let correctInteger = q.correctInteger ?? ''
  let correctNumerical = q.correctNumerical ?? ''
  if (mapped && Array.isArray(mapped.correctIndices)) {
    correctIndices = mapped.correctIndices
    correctIndex = ''
    correctInteger = ''
    correctNumerical = ''
  } else if (mapped && mapped.correctIndex != null) {
    correctIndex = mapped.correctIndex
    correctIndices = []
    correctInteger = ''
    correctNumerical = ''
  } else if (mapped && mapped.correctNumerical != null) {
    correctNumerical = mapped.correctNumerical
    correctIndex = ''
    correctIndices = []
    correctInteger = ''
  } else if (mapped && mapped.correctInteger != null) {
    correctInteger = mapped.correctInteger
    correctIndex = ''
    correctIndices = []
    correctNumerical = ''
  }
  return {
    questionId: q.id,
    expectText: String(q.text ?? q.stem ?? ''),
    subject,
    section,
    chapter,
    topic,
    questionType,
    examIds,
    toughnessLevel,
    source,
    solution,
    correctIndex,
    correctIndices,
    correctInteger,
    correctNumerical,
  }
}

/**
 * Ask Hybrid AI once per question on the paper. Does not save.
 * @param {object[]} questions
 * @param {(question: object, index: number) => Promise<object>} fillOne
 */
export async function collectPaperHybridFills(questions, fillOne) {
  const list = Array.isArray(questions) ? questions : []
  const rows = []
  for (let index = 0; index < list.length; index += 1) {
    const question = list[index]
    if (!String(question?.text || question?.stem || '').trim()) {
      rows.push({ index, skipped: true, question })
      continue
    }
    const filled = await fillOne(question, index)
    rows.push({
      index,
      skipped: false,
      question,
      filled,
      patch: publishedMetaPatchFromHybridFill(question, filled),
    })
  }
  return rows
}

const HINT_OR_ESSAY_RE =
  /\b(?:hint|think about|try (?:to|using)|you (?:should|can|need to)|let(?:'s| us) (?:think|consider|start|begin|recall)|first,? we need to understand|in this question,? we)\b/i

/** "Wait, …", "Re-evaluating: …": the working reached one answer and the last line may name another. */
const CHANGES_ITS_MIND_RE = /(?:^|[\s.(])wait\b|\bre-?(?:evaluat|verif|check|consider)(?:e|es|ed|ing|y|ies|ied)?\b|\bon second thought\b/i

/**
 * Why a Hybrid AI solution is not an exam solution yet: '' when it is fine.
 * Official PYQ solutions are short exact working that ends in the result, not a hint or an essay.
 * @param {unknown} text
 */
export function officialPyqSolutionProblem(text) {
  const t = String(text ?? '').trim()
  if (!t) return 'No solution came back.'
  if (HINT_OR_ESSAY_RE.test(t)) return 'The solution reads like a hint, not worked steps.'
  if (CHANGES_ITS_MIND_RE.test(t)) return 'The solution changes its mind, so its answer cannot be trusted.'
  if (t.length > 1800) return 'The solution is an essay. It should be short worked steps.'
  if (t.length < 25) return 'The solution is too short to show the working.'
  return ''
}

/**
 * What the second ask tells Gemini about the first reply ('' when there was no problem). At most 300 characters.
 * @param {unknown} problem
 */
export function hybridFillRetryReason(problem) {
  const said = String(problem ?? '').trim()
  if (!said) return ''
  const official = said.match(/official answer is (.+?)\.?$/i)
  const fix = official
    ? `Recheck the working; the last line must be "Answer: ${official[1]}".`
    : 'Give 3 to 8 short worked steps; the last line must be "Answer: " with the result.'
  return `Your previous reply was not saved: ${said} ${fix}`.slice(0, 300)
}

/** Two questions in flight at a time; each is still its own Gemini request. */
export const HYBRID_FILL_PART_SIZE = 2

/** Paid Gemini replies per question when the reply is weak (hint, essay, off the official answer). */
export const HYBRID_FILL_TRIES = 2

/** Waits before asking again while Hybrid AI or Gemini is not answering; after the last one the run pauses. */
export const HYBRID_FILL_OUTAGE_WAITS_MS = [5_000, 20_000]

const OUTAGE_RE =
  /not running|did not answer in time|failed to fetch|fetch failed|network ?error|resource.?exhausted|quota|rate.?limit|too many requests|\bunavailable\b|overloaded|deadline.?exceeded|try again later|\b(?:429|502|504)\b/i

/**
 * True when the error says Hybrid AI or Gemini is not answering right now (helper restarting,
 * internet drop, Gemini busy or out of quota), not that this question is hard. Asking the next
 * question would fail the same way.
 * @param {unknown} err
 */
export function hybridFillOutage(err) {
  if ([429, 502, 504].includes(Number(/** @type {any} */ (err)?.status))) return true
  return OUTAGE_RE.test(String(/** @type {any} */ (err)?.message || err || ''))
}

function waitUnlessStopped(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(undefined)
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', done)
      resolve(undefined)
    }
    signal?.addEventListener?.('abort', done, { once: true })
  })
}

/** Google list price, USD per 1M tokens (paid tier). Flash doubles from 1 Jan 2027. */
const GEMINI_USD_PER_M = {
  flash: { input: 0.75, output: 3.75 },
  pro: { input: 2, output: 12 },
}
const INR_PER_USD = 88

/**
 * Gemini tokens used by fill replies, summed, with the list-price cost. Each reply carries `usage` from the helper.
 * @param {{ usage?: { input?: number, output?: number, model?: string }[] }[]} rows
 */
export function hybridFillUsage(rows) {
  const total = { requests: 0, input: 0, output: 0, pro: 0, usd: 0, inr: 0 }
  for (const row of rows || []) {
    for (const u of row?.usage || []) {
      const input = Number(u?.input) || 0
      const output = Number(u?.output) || 0
      const pro = /pro/i.test(String(u?.model || ''))
      const price = pro ? GEMINI_USD_PER_M.pro : GEMINI_USD_PER_M.flash
      total.requests += 1
      total.input += input
      total.output += output
      if (pro) total.pro += 1
      total.usd += (input * price.input + output * price.output) / 1e6
    }
  }
  total.inr = total.usd * INR_PER_USD
  return total
}

/**
 * One line for the admin: Gemini replies and their cost at list price.
 * @param {ReturnType<typeof hybridFillUsage> | null | undefined} usage
 */
export function hybridFillUsageNote(usage) {
  if (!usage?.requests) return ''
  const rupees = usage.inr < 1 ? usage.inr.toFixed(2) : usage.inr.toFixed(1)
  const pro = usage.pro ? ` (${usage.pro} on the Pro model for Hard JEE Advanced questions)` : ''
  return ` Gemini use: ${usage.requests} repl${usage.requests === 1 ? 'y' : 'ies'}${pro}, ${usage.input.toLocaleString('en-IN')} tokens sent and ${usage.output.toLocaleString('en-IN')} received — about ₹${rupees} at Google's list price.`
}

/**
 * Hybrid AI fill, part by part: `concurrency` questions at a time (default 1),
 * one request per question, so no request carries a whole paper and times out.
 * A weak reply is asked again once (HYBRID_FILL_TRIES paid replies), then marked for a look.
 * When Hybrid AI or Gemini stops answering, the question waits and is asked again
 * (HYBRID_FILL_OUTAGE_WAITS_MS); if it still does not answer, the run pauses at that question
 * (`row.outage`) instead of running through the rest of the paper with nothing filled.
 * Each finished part is handed to `onApplied` before the next part starts.
 * A `tagsOnly` question asks for metatags only, so its solution is never judged or retried.
 * `answerProblem` judges the reply's answer (e.g. it misses the official one); a problem is retried like a weak solution,
 * and the second ask carries `retryReason` (what was wrong with the first reply).
 * `incomplete` says the question itself cannot be solved (asked with `null` before any request, then with each reply):
 * such a question is not asked, or not asked again, and comes back as `row.incomplete` with nothing to save.
 * @param {object[]} questions
 * @param {(question: object, index: number, attempt: number, retryReason: string) => Promise<object>} fillOne
 * @param {{ onProgress?: Function, onApplied?: Function, isFatal?: (err: Error) => boolean, concurrency?: number, signal?: AbortSignal, skip?: (question: object, index: number) => boolean, tagsOnly?: (question: object, index: number) => boolean, answerProblem?: (question: object, filled: object) => string, incomplete?: (question: object, filled: object | null) => string, outageWaitsMs?: number[] }} [hooks]
 */
export async function fillPaperQuestionByQuestion(questions, fillOne, hooks = {}) {
  const list = Array.isArray(questions) ? questions : []
  const total = list.length
  const rows = []
  const onProgress = hooks.onProgress
  const onApplied = hooks.onApplied
  const isFatal = typeof hooks.isFatal === 'function' ? hooks.isFatal : () => false
  const skip = typeof hooks.skip === 'function' ? hooks.skip : () => false
  const tagsOnlyFor = typeof hooks.tagsOnly === 'function' ? hooks.tagsOnly : () => false
  const answerProblem = typeof hooks.answerProblem === 'function' ? hooks.answerProblem : () => ''
  const incompleteFor = typeof hooks.incomplete === 'function' ? hooks.incomplete : () => ''
  const size = Math.max(1, Math.min(HYBRID_FILL_PART_SIZE, Number(hooks.concurrency) || 1))
  const outageWaits = Array.isArray(hooks.outageWaitsMs) ? hooks.outageWaitsMs : HYBRID_FILL_OUTAGE_WAITS_MS

  async function fillAt(index) {
    const question = list[index]
    if (!String(question?.text || question?.stem || '').trim() || skip(question, index)) {
      return { index, skipped: true, question }
    }
    const tagsOnly = Boolean(tagsOnlyFor(question, index))
    /** @type {object[]} */
    const usage = []
    const missingText = tagsOnly ? '' : incompleteFor(question, null)
    if (missingText) return { index, skipped: false, needsLook: true, incomplete: missingText, question, patch: null, tagsOnly, usage }
    let filled = null
    let problem = ''
    let lastProblem = ''
    let error = ''
    let outage = ''
    let waits = 0
    for (let attempt = 0; attempt < HYBRID_FILL_TRIES; ) {
      if (hooks.signal?.aborted) break
      if (onProgress) onProgress(index, total, attempt)
      try {
        const next = await fillOne(question, index, attempt, hybridFillRetryReason(lastProblem))
        if (next?.usage) usage.push({ ...next.usage, model: next.usage.model || next.model })
        outage = ''
        const cannotSolve = tagsOnly ? '' : incompleteFor(question, next)
        if (cannotSolve) return { index, skipped: false, needsLook: true, incomplete: cannotSolve, question, patch: null, tagsOnly, usage }
        const nextProblem = tagsOnly
          ? ''
          : officialPyqSolutionProblem(next?.step_by_step_solution) || answerProblem(question, next)
        lastProblem = nextProblem
        if (!filled || !nextProblem) {
          filled = next
          problem = nextProblem
        }
        error = ''
        attempt += 1
        if (!problem) break
      } catch (err) {
        error = err instanceof Error ? err.message : String(err || '')
        if (isFatal(err)) throw err
        if (hybridFillOutage(err)) {
          outage = error
          if (waits >= outageWaits.length) break
          await waitUnlessStopped(outageWaits[waits], hooks.signal)
          waits += 1
          continue
        }
        attempt += 1
      }
    }
    if (!filled && outage) return { index, skipped: false, needsLook: false, question, error, outage, patch: null, tagsOnly, usage }
    if (!filled) return { index, skipped: false, needsLook: true, question, error: error || 'Stopped.', patch: null, tagsOnly, usage }
    const patch = publishedMetaPatchFromHybridFill(question, filled)
    return { index, skipped: false, needsLook: Boolean(problem), problem, question, filled, patch, tagsOnly, usage }
  }

  for (let start = 0; start < list.length; start += size) {
    if (hooks.signal?.aborted) break
    const part = []
    for (let index = start; index < Math.min(start + size, list.length); index += 1) part.push(fillAt(index))
    const done = await Promise.all(part)
    for (const row of done) {
      rows.push(row)
      if (onApplied) onApplied(row, rows.slice())
    }
    if (done.some((row) => row.outage)) break
  }
  return rows
}
