/**
 * Local quality check for Official PYQ pending papers.
 * Uses the same display heal and the same raw-code / cut-off checks as review.
 * Does not approve, publish, or invent missing text.
 */

import { peelPrintedAnswerFromStem } from './answerProvenance.js'
import { closedChemReactionDisplays } from './healTruncatedLatex.js'
import { healUploadQuestionCard, ocrQuestionBodyForCard, storedMatchOptionsAreCutOff } from './extendTruncatedStem.js'
import { healUploadQuestionCard as healPreviewCard, applyStoredOcrCardFixes, storedCardMissesOcrFix } from './uploadQualityGuards.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  listOfficialPyqPendingSummaries,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { peelOfficialPyqCardForDisplay } from './passage.js'
import { stemLooksIncompleteOnDisplay } from './sanitizeStemForDisplay.js'
import { visibleLatexSourceHits } from './visibleLatexSource.js'
import { givenLineDroppedUnit, inlineSingleSymbolDisplayMath, restoreDroppedMsOnGivenLine } from './mathpixCleanPipeline.js'
import { officialPyqContentReviewMessages, officialPyqMissingListMessage } from './officialPyqReviewFlags.js'
import { reviewOfficialPyqCards } from './officialPyqUnifiedCheck.js'
import { enforceAdminFactsOnQuestions, factsForPaper } from './officialPyqAdminFacts.js'

export const LOCAL_QUALITY_REVISION = 7
const MAX_QUALITY_PASSES = 4
const SAME_CHECK = 'banner-v4'
const RECHECK_ONCE = new Set([
  'opyq-1788581709443-7e3iujw',
  'opyq-1790052685142-omn46m0',
  'opyq-1791275733435-im15vmg',
  'opyq-1791275953834-rjvwr9i',
  'opyq-1791275032248-aynozfl',
])

function qualityIsCurrent(paper) {
  const quality = paper?.localQuality
  if (!quality || quality.revision !== LOCAL_QUALITY_REVISION) return false
  if (RECHECK_ONCE.has(paper.id) && quality.sameCheck !== SAME_CHECK) return false
  return true
}

const CHECKER_NOTE =
  /Raw LaTeX is still showing|Not inventing|Math looks cut off|Extraction incomplete|missing List-I{1,2}/i

const ANSWER_IN_STEM =
  /(?:^|\n)\s*(?:(?:Official\s+)?(?:Ans(?:wer)?s?\.?|Key)|Correct\s+(?:option|answer))\s*[:.\-=]\s*(?:is\s+)?(?!\s*the\b)\S/i

/**
 * @param {object | null | undefined} quality
 */
export function localQualityListMark(quality) {
  if (!quality || quality.revision !== LOCAL_QUALITY_REVISION) return ''
  if (quality.passed) return 'Quality checked by local AI — passed'
  const lines = Array.isArray(quality.lines) ? quality.lines.filter(Boolean) : []
  if (lines.length) return `Quality checked by local AI — not passed. ${lines.join(' ')}`
  const nums = Array.isArray(quality.failedGoTo) ? quality.failedGoTo : []
  const shown = nums.slice(0, 24).join(', ')
  const more = nums.length > 24 ? ` and ${nums.length - 24} more` : ''
  return `Quality checked by local AI — not passed${shown ? ` · Go to Q ${shown}${more}` : ''}`
}

function proseWords(text) {
  return String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 3)
}

function stemMissingFromOcr(text, ocr) {
  const sourceWords = new Set(proseWords(ocr).map((word) => word.toLowerCase()))
  if (sourceWords.size < 30) return false
  const words = proseWords(text).slice(0, 8)
  if (words.length < 8) return false
  const found = words.filter((word) => sourceWords.has(word.toLowerCase())).length
  return found < 4
}

function inventedProse(text, ocr) {
  const sourceWords = new Set(proseWords(ocr).map((word) => word.toLowerCase()))
  if (sourceWords.size < 30) return false
  return proseWords(text).some((word) => word.length > 5 && !sourceWords.has(word.toLowerCase()))
}

function stripCheckerSentences(text) {
  return String(text ?? '')
    .replace(
      /(?:^|\n)\s*(?:Raw LaTeX is still showing as code\.?|Math looks cut off\.?|Extraction incomplete\.?|Not inventing[^\n]*|missing List-I{1,2}[^\n]*)/gi,
      '\n',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cardFailsLocalQuality(card, ocr) {
  const text = String(card?.text ?? '')
  const passage = String(card?.passageText ?? '')
  const options = Array.isArray(card?.options) ? card.options.map((o) => String(o ?? '')) : []
  const parts = [text, passage, ...options]
  if (parts.some((part) => CHECKER_NOTE.test(part))) return true
  const drawn =
    closedChemReactionDisplays(text) || closedChemReactionDisplays(passage)
  if (!drawn) {
    if (stemLooksIncompleteOnDisplay(text, options) || stemLooksIncompleteOnDisplay(passage)) return true
    if (parts.some((part) => visibleLatexSourceHits(part).length > 0)) return true
  }
  if (ANSWER_IN_STEM.test(text) && peelPrintedAnswerFromStem(text) !== text) return true
  if (/\(\s*P\s*\)\s*\(\s*P\s*\)/.test(text)) return true
  if (/Chemical structure\./.test(text)) return true
  if (storedMatchOptionsAreCutOff(options)) return true
  if (storedCardMissesOcrFix(card, ocr)) return true
  if (givenLineDroppedUnit(text) || givenLineDroppedUnit(passage)) return true
  if (stemMissingFromOcr(text, ocr)) return true
  return false
}

/** The per-card display checks and the unified check both count; neither result is dropped. */
function mergeQualityResults(localFailed, review) {
  const extra = localFailed.filter((n) => !review.failedGoTo.includes(n))
  const failedGoTo = [...new Set([...review.failedGoTo, ...localFailed])].sort((a, b) => a - b)
  const lines = extra.length
    ? [...review.messages, `Go to Q ${extra.join(', ')}. The local display check found a problem on this card.`]
    : review.messages
  return { passed: review.passed && extra.length === 0, failedGoTo, lines }
}

/**
 * @param {object} paper
 */
export function localOfficialPyqQualityCheck(paper) {
  const questions = Array.isArray(paper?.questions) ? paper.questions : []
  const ocr = String(paper?.preparedText ?? '')
  /** @type {number[]} */
  const failedGoTo = []
  questions.forEach((q, index) => {
    if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
    const rawBits = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
    if (rawBits.some((part) => CHECKER_NOTE.test(String(part ?? '')))) {
      failedGoTo.push(index + 1)
      return
    }
    let healed = q
    try {
      healed = healPreviewCard(q, ocr)
    } catch {
      healed = q
    }
    if (givenLineDroppedUnit(healed?.text) || givenLineDroppedUnit(healed?.passageText)) {
      failedGoTo.push(index + 1)
      return
    }
    let shown = healed
    try {
      shown = peelOfficialPyqCardForDisplay(healed, ocr)
    } catch {
      shown = healed
    }
    if (
      officialPyqContentReviewMessages([shown], undefined, ocr).length ||
      officialPyqMissingListMessage([shown]) ||
      cardFailsLocalQuality(shown, ocr)
    ) {
      failedGoTo.push(index + 1)
    }
  })
  const review = reviewOfficialPyqCards(
    questions.map((q, index) => {
      try {
        return peelOfficialPyqCardForDisplay(healPreviewCard(q, ocr), ocr)
      } catch {
        return q
      }
    }),
    ocr,
    factsForPaper(paper),
    { cardsOnly: paper?.officialPyq === false },
  )
  return {
    ...mergeQualityResults(failedGoTo, review),
    revision: LOCAL_QUALITY_REVISION,
    checkedAt: Date.now(),
    by: 'local',
    questionCount: questions.length,
    sameCheck: SAME_CHECK,
  }
}

function cardSignature(q) {
  return JSON.stringify({
    text: q?.text ?? '',
    passageText: q?.passageText ?? '',
    options: q?.options ?? [],
  })
}

function repairFailingCard(q, ocr) {
  if (q?.adminEdited === true) return q
  let next = { ...applyStoredOcrCardFixes(q, ocr) }
  const peeled = peelPrintedAnswerFromStem(stripCheckerSentences(String(q?.text ?? '')))
  if (peeled !== String(q?.text ?? '')) next.text = peeled
  const passage = stripCheckerSentences(String(q?.passageText ?? ''))
  if (q?.passageText && passage !== String(q.passageText)) next.passageText = passage
  try {
    const shown = peelOfficialPyqCardForDisplay(healUploadQuestionCard(next, ocr), ocr)
    const options =
      Array.isArray(shown?.options) &&
      (!Array.isArray(q?.options) || shown.options.length >= q.options.length)
        ? shown.options
        : next.options
    const text = String(shown?.text ?? next.text ?? '')
    if (
      shown &&
      !cardFailsLocalQuality({ ...shown, text, options }, ocr) &&
      !inventedProse(text, ocr) &&
      !inventedProse(options?.join(' ') ?? '', ocr)
    ) {
      next = {
        ...next,
        text,
        options,
        passageText: shown.passageText ?? next.passageText,
      }
    }
  } catch {
    /* keep the peeled card */
  }
  const body = ocrQuestionBodyForCard(next.text ?? q?.text, ocr)
  if (body && body !== String(next.text ?? '')) {
    const storedOpts = Array.isArray(q?.options) ? q.options.map((opt) => String(opt ?? '')) : []
    const optionsBroken =
      storedMatchOptionsAreCutOff(storedOpts) ||
      storedOpts.some((opt) => /\\\\\s*$/.test(opt) || visibleLatexSourceHits(opt).length > 0)
    const keyRows = []
    const keyTable = body.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi) || []
    for (const tab of keyTable) {
      if (!/\(\s*A\s*\)/.test(tab)) continue
      for (const line of tab.split(/\\hline/)) {
        const letter = line.match(/\(\s*([A-D])\s*\)/)
        if (!letter) continue
        const rest = line
          .replace(/\(\s*[A-D]\s*\)\s*&?/, '')
          .replace(/\\\\/g, ' ')
          .replace(/&/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (rest) keyRows.push(rest)
      }
      if (keyRows.length >= 2) break
      keyRows.length = 0
    }
    const useRows = optionsBroken && keyRows.length >= storedOpts.filter((opt) => opt.trim()).length
    const stemBody = body
      .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, (tab) =>
        /\(\s*A\s*\)/.test(tab) && keyRows.length >= 2 ? '' : tab,
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    try {
      const trial = peelOfficialPyqCardForDisplay(
        healUploadQuestionCard(
          {
            ...next,
            text: stemBody,
            options: useRows ? keyRows.slice(0, 4) : storedOpts,
          },
          ocr,
        ),
        ocr,
      )
      const trialOpts = Array.isArray(trial?.options) ? trial.options.map((opt) => String(opt ?? '')) : []
      const filled = (opts) => opts.filter((opt) => String(opt ?? '').trim()).length
      let text = String(trial?.text ?? '')
      if (filled(trialOpts) >= 2) {
        text = text
          .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/gi, (tab) =>
            /\(\s*A\s*\)/.test(tab) && /\(\s*[PQRS]\s*\)/.test(tab) ? '' : tab,
          )
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      }
      if (
        trial &&
        filled(trialOpts) >= filled(storedOpts) &&
        !cardFailsLocalQuality({ ...trial, text, options: trialOpts }, ocr) &&
        !inventedProse(text, ocr) &&
        !inventedProse(trialOpts.join(' '), ocr)
      ) {
        next = {
          ...next,
          text,
          options: trialOpts,
          passageText: trial.passageText ?? next.passageText,
        }
      }
    } catch {
      /* keep the card; the scan slice did not display cleanly */
    }
  }
  return cardSignature(next) === cardSignature(q) ? q : next
}

function cleanCard(q, ocr) {
  try {
    return peelOfficialPyqCardForDisplay(healPreviewCard(q, ocr), ocr)
  } catch {
    return q
  }
}

function adoptKnownFixes(q, shown, ocr) {
  let next = q
  const unwrapped = String(q?.text ?? '').replace(/\$\$\s*(?=\\includegraphics\b)/g, '')
  if (unwrapped !== String(q?.text ?? '')) next = { ...next, text: unwrapped }
  const text = inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.text ?? '')))
  const passage = inlineSingleSymbolDisplayMath(restoreDroppedMsOnGivenLine(String(next.passageText ?? '')))
  if (text !== String(next.text ?? '')) next = { ...next, text }
  if (next.passageText != null && passage !== String(next.passageText)) {
    next = { ...next, passageText: passage }
  }
  if (
    storedMatchOptionsAreCutOff(q?.options) &&
    Array.isArray(shown?.options) &&
    shown.options.filter((opt) => String(opt ?? '').trim()).length >= 2 &&
    !storedMatchOptionsAreCutOff(shown.options) &&
    !inventedProse(shown.options.join('\n'), ocr)
  ) {
    next = { ...next, options: shown.options.map((opt) => String(opt ?? '')) }
  }
  const fixed = applyStoredOcrCardFixes(next, ocr)
  return fixed === next ? next : fixed
}

/**
 * Check, repair what the stored OCR can support, and check again.
 * One clean per card. Later passes touch only cards that failed. Stops at 4
 * passes, or as soon as a pass finds nothing left to fix.
 * @param {object} paper
 */
export function repairOfficialPyqUntilQuality(paper) {
  const ocr = String(paper?.preparedText ?? '')
  const stored = Array.isArray(paper?.questions) ? paper.questions : []
  /** Cards saved before a passage-cut fix still lack their shared passage; the facts put it back. */
  const withFacts = enforceAdminFactsOnQuestions(stored, paper?.adminFacts, ocr)
  const questions = withFacts.map((q) => ({ ...q }))
  /** @type {Array<object | null>} */
  const shown = questions.map(() => null)
  const cleaned = new Set()
  let questionsChanged =
    withFacts !== stored &&
    withFacts.some((q, i) => String(q?.passageText ?? '') !== String(stored[i]?.passageText ?? ''))

  function prepare(index) {
    if (cleaned.has(index)) return shown[index]
    const view = cleanCard(questions[index], ocr)
    const adopted = questions[index]?.adminApproved === true ? questions[index] : adoptKnownFixes(questions[index], view, ocr)
    if (adopted !== questions[index]) {
      questions[index] = adopted
      questionsChanged = true
      shown[index] = cleanCard(adopted, ocr)
    } else {
      shown[index] = view
    }
    cleaned.add(index)
    return shown[index]
  }

  function failedNow() {
    /** @type {number[]} */
    const failed = []
    questions.forEach((q, index) => {
      if (!q || isOfficialPyqPlaceholder(q) || q.adminApproved === true) return
      const rawBits = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
      if (rawBits.some((part) => CHECKER_NOTE.test(String(part ?? '')))) {
        failed.push(index + 1)
        return
      }
      const shown = prepare(index)
      const current = questions[index]
      if (
        givenLineDroppedUnit(current?.text) ||
        givenLineDroppedUnit(current?.passageText) ||
        storedMatchOptionsAreCutOff(current?.options) ||
        storedCardMissesOcrFix(current, ocr) ||
        officialPyqContentReviewMessages([shown]).length ||
        officialPyqMissingListMessage([shown]) ||
        cardFailsLocalQuality(shown, ocr)
      ) {
        failed.push(index + 1)
      }
    })
    return failed
  }

  let failedGoTo = failedNow()
  for (let pass = 0; pass < MAX_QUALITY_PASSES && failedGoTo.length; pass += 1) {
    let changed = false
    for (const go of failedGoTo) {
      const index = go - 1
      const repaired = repairFailingCard(questions[index], ocr)
      if (repaired !== questions[index]) {
        questions[index] = repaired
        cleaned.delete(index)
        changed = true
        questionsChanged = true
      }
    }
    if (!changed) break
    failedGoTo = failedNow()
  }
  const review = reviewOfficialPyqCards(
    questions.map((q, index) => prepare(index) || q),
    ocr,
    factsForPaper(paper),
    { cardsOnly: paper?.officialPyq === false },
  )
  return {
    paper: { ...paper, questions },
    quality: {
      ...mergeQualityResults(failedGoTo, review),
      revision: LOCAL_QUALITY_REVISION,
      checkedAt: Date.now(),
      by: 'local',
      questionCount: questions.length,
      sameCheck: SAME_CHECK,
    },
    questionsChanged,
  }
}

/**
 * Run the same local check the red banner uses, then save the list mark.
 * Stored OCR only. Does not publish. Does not change a published paper.
 * Auto-fix stops at 4 passes, or as soon as a pass finds nothing to fix.
 * @param {object | null | undefined} paper
 */
export function persistOfficialPyqQualityRun(paper) {
  if (!paper?.id) return null
  const full = getOfficialPyqPendingPaper(paper.id) || paper
  if (String(full?.status ?? '') === 'approved') return full
  const ocr = getOfficialPyqPendingOcrText(paper.id) || String(full?.preparedText ?? '')
  let repaired
  try {
    repaired = repairOfficialPyqUntilQuality({ ...full, preparedText: ocr || full?.preparedText })
  } catch {
    const quality = {
      passed: false,
      failedGoTo: [],
      revision: LOCAL_QUALITY_REVISION,
      checkedAt: Date.now(),
      by: 'local',
      questionCount: Array.isArray(full?.questions) ? full.questions.length : 0,
      sameCheck: SAME_CHECK,
    }
    return updateOfficialPyqPendingPaper(full.id, { localQuality: quality })
  }
  const updates = { localQuality: repaired.quality }
  if (repaired.questionsChanged && Array.isArray(repaired.paper?.questions)) {
    updates.questions = repaired.paper.questions
  }
  const saved = updateOfficialPyqPendingPaper(full.id, updates)
  return saved ? { ...saved, questionsChanged: repaired.questionsChanged } : null
}

/**
 * Check the next pending paper that does not yet have this revision.
 * Returns 'more' when another paper is still waiting, 'done' when finished.
 */
const qualitySaveSkipped = new Set()

export function checkNextPendingPaper() {
  const pending = listOfficialPyqPendingSummaries('pending_review')
  const next = pending.find(
    (paper) =>
      paper?.id && !qualitySaveSkipped.has(paper.id) && !qualityIsCurrent(paper),
  )
  if (!next?.id) return { status: 'done', paperId: '', changed: false }
  const saved = persistOfficialPyqQualityRun(next)
  if (!saved) qualitySaveSkipped.add(next.id)
  const rest = listOfficialPyqPendingSummaries('pending_review')
  const waiting = rest.some(
    (paper) =>
      paper?.id && !qualitySaveSkipped.has(paper.id) && !qualityIsCurrent(paper),
  )
  return {
    status: waiting ? 'more' : 'done',
    paperId: next.id,
    changed: Boolean(saved?.questionsChanged),
  }
}
