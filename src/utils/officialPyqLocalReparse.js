/**
 * Lightweight official-PYQ heal + local Mathpix re-parse.
 * Avoids pulling pyqGeminiExtract / Gemini until optional background step.
 */

import {
  healOfficialPyqPaperQuestions,
  officialPyqPaperSourceText,
  pickQuestionListCloserToExpected,
  matchQuestionMissingListI,
  restoreMissingListIFromSource,
} from './extendTruncatedStem.js'
import { stripEmptyFigureShells, stripEmptyImageMarkdown } from './mathpixMedia.js'
import { LOCAL_QUALITY_REVISION } from './officialPyqLocalQuality.js'
import { buildPaperFacts } from './officialPyqPaperFacts.js'
import { adminFactsToPaperFacts, applyAdminFactsToQuestions } from './officialPyqAdminFacts.js'

/** Confirmed admin facts re-shape the re-parsed cards; otherwise read facts from the OCR. */
function shapeWithPaperFacts(paper, questions, preparedText) {
  if (paper?.adminFacts?.confirmedAt) {
    const applied = applyAdminFactsToQuestions(questions, paper.adminFacts, preparedText)
    if (applied.facts) {
      return {
        questions: applied.questions,
        expectedQuestionCount: applied.facts.expectedQuestionCount,
        paperFacts: applied.facts,
      }
    }
  }
  const facts = buildPaperFacts(preparedText)
  return {
    questions,
    expectedQuestionCount: facts.known ? facts.expectedQuestionCount : undefined,
    paperFacts: facts,
  }
}
import { officialPyqContentReviewMessages, officialPyqMissingListMessage } from './officialPyqReviewFlags.js'
import { healUploadQuestionCard as healPreviewCard, applyStoredOcrCardFixes } from './uploadQualityGuards.js'
import { enrichMatchListsFromOcr } from './restoreMatchListsOcr.js'
import {
  countMathpixQuestionMarkers,
  paperItemsFromMathpixOcr,
  sanitizeMathpixOcrText,
  shouldRebuildFromMathpixOcr,
  officialPyqCardsNeedMathpixRebuild,
} from './mathpixQuestionSplit.js'
import { storedEndAnswerSectionText } from './printedEndSolutions.js'
import {
  expectedPyqTargetFromOcrLite,
  quickOcrQuestionCount,
} from './pyqOcrCountLite.js'
import {
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
  officialPyqQuestionsArePublishedLocked,
  officialPyqWordingLockedMessage,
} from './officialPyqPendingStore.js'
import { splitOcrInWorker, rememberOfficialPyqSplitKeep } from './officialPyqSplitWorker.js'
import {
  officialPyqQuestionsHaveMistakenPassages,
  peelOfficialPyqCardForDisplay,
  stripMistakenOfficialPyqPassages,
} from './passage.js'
import {
  isOfficialPyqPlaceholder,
  mergeOfficialPyqQuestionsBySlot,
  dedupeUploadQuestionSlots,
} from './officialPyqMissingSlots.js'
import { stripAnswersFromQuestionCards } from './stripAnswerFromQuestionStem.js'
import { gridFieldsOf, isMatrixGridCard } from './matrixGridPyq.js'

const PYQ_PREPARED_OCR_MARKER = '--- prepared-ocr ---'
const PYQ_VISION_TEXT_MARKER = '--- vision-ocr ---'

/** @param {string} raw @param {string} marker */
function sliceNotesAfterMarker(raw, marker) {
  const re = new RegExp(`\\n${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`, 'i')
  const m = raw.search(re)
  if (m < 0) return ''
  let body = raw.slice(m + `\n${marker}\n`.length)
  const next = body.search(/\n--- (?:prepared-ocr|pdf-text|vision-ocr) ---\n/i)
  if (next >= 0) body = body.slice(0, next)
  return body.trim()
}

/** @param {string | undefined | null} notes */
function extractPreparedTextFromPaperNotes(notes) {
  const raw = String(notes ?? '').trim()
  if (!raw) return ''
  const vision = sliceNotesAfterMarker(raw, PYQ_VISION_TEXT_MARKER)
  if (vision.length >= 80) return vision
  const prepared = sliceNotesAfterMarker(raw, PYQ_PREPARED_OCR_MARKER)
  if (prepared.length >= 80) return prepared
  const ocrMark = raw.search(new RegExp(`\\n${PYQ_PREPARED_OCR_MARKER}\\n`, 'i'))
  if (ocrMark >= 0) {
    return raw.slice(ocrMark + `\n${PYQ_PREPARED_OCR_MARKER}\n`.length).trim()
  }
  const marker = /^Imported from [^\n]+\n\n/im
  const m = raw.match(marker)
  let body = m ? raw.slice(m.index + m[0].length).trim() : raw
  body = body.replace(/^Extract summary:[^\n]+\s*/im, '').trim()
  if (body.length > 400 && !/^Imported from /i.test(body.slice(0, 80))) return body
  return body
}

/** @param {import('./officialPyqPendingStore.js').OfficialPyqPendingPaper | null | undefined} paper */
function mathpixFigureHits(text) {
  return (String(text ?? '').match(/cdn\.mathpix\.com/gi) || []).length
}

export function officialPyqStoredOcrTextLocal(paper) {
  const rawDedicated = String(paper?.preparedText ?? '')
  const rawNotes = extractPreparedTextFromPaperNotes(paper?.notes)
  const dedicated = sanitizeMathpixOcrText(rawDedicated)
  const fromNotes = sanitizeMathpixOcrText(rawNotes)
  // The clean cuts the answers / solutions printed after the paper; the split reads them again.
  const endSection = storedEndAnswerSectionText(rawDedicated) || storedEndAnswerSectionText(rawNotes)
  // preparedText is a cleaned copy. If that clean ate figure URLs, the notes
  // copy still has them. Prefer the copy that still has the drawings.
  if (fromNotes.length >= 80 && mathpixFigureHits(rawNotes) > mathpixFigureHits(rawDedicated)) {
    return fromNotes + endSection
  }
  if (dedicated.length >= 80) return dedicated + endSection
  return fromNotes + endSection
}

/** @param {'jee-main' | 'jee-advanced' | 'neet'} exam */
function pyqExtractLowCountThreshold(exam) {
  if (exam === 'jee-advanced') return 40
  if (exam === 'jee-main') return 20
  if (exam === 'neet') return 30
  return 8
}

/** @param {string} exam @param {string} [session] @param {string} [ocrText] */
function expectedPyqPaperQuestionTarget(exam, session, ocrText) {
  void session
  return expectedPyqTargetFromOcrLite(exam, ocrText)
}

/** Fast gate — marker count only; skips inferOcr / full split. */
export function officialPyqNeedsAutoResplit(paper) {
  if (!paper?.id || !['pending_review', 'rejected'].includes(String(paper.status))) return false
  if (paper.returnedFromPublished === true) return false
  const ocr = officialPyqStoredOcrTextLocal(paper)
  if (ocr.length < 80) return false
  const existing = Array.isArray(paper.questions) ? paper.questions.length : 0
  const confirmed = adminFactsToPaperFacts(paper.adminFacts?.confirmedAt ? paper.adminFacts : null)
  if (confirmed && confirmed.expectedQuestionCount === existing) return false
  const markers = countMathpixQuestionMarkers(ocr)
  const minKeep = pyqExtractLowCountThreshold(paper.exam)
  const expected = expectedPyqTargetFromOcrLite(paper.exam, ocr)
  if (officialPyqQuestionsHaveMistakenPassages(paper.questions, ocr)) return true
  if (shouldRebuildFromMathpixOcr(ocr, existing, expected)) return true
  if (existing >= minKeep && markers > existing && markers - existing <= 2) return true
  if (expected >= 40 && existing < expected && existing >= minKeep) return true
  return false
}

function healOfficialPyqPaperQuestionsEnriched(paper, opts) {
  const source = officialPyqPaperSourceText(paper)
  return healOfficialPyqPaperQuestions(paper, opts).map((q) =>
    applyStoredOcrCardFixes(enrichMatchListsFromOcr(healPreviewCard(q, source), source), source),
  )
}

/**
 * Heal fragment cards (53 → ~51) and persist when safe.
 * @param {import('./officialPyqPendingStore.js').OfficialPyqPendingPaper | null | undefined} paper
 */
export function healAndPersistOfficialPyqPaper(paper, opts = {}) {
  const status = String(paper?.status ?? '')
  if (officialPyqQuestionsArePublishedLocked(paper) || paper?.returnedFromPublished === true) {
    const n = paper?.questions?.length ?? 0
    return {
      ok: false,
      changed: false,
      count: n,
      previousCount: n,
      questions: paper?.questions ?? [],
      error: officialPyqQuestionsArePublishedLocked(paper) ? officialPyqWordingLockedMessage(paper) : '',
    }
  }
  if (!paper?.id || !['pending_review', 'rejected'].includes(status)) {
    const n = paper?.questions?.length ?? 0
    return { ok: false, changed: false, count: n, previousCount: n, questions: paper?.questions ?? [] }
  }
  if (
    paper.localQuality?.passed === true &&
    (paper.localQuality?.sameCheck === 'banner-v1' ||
      paper.localQuality?.sameCheck === 'banner-v2' ||
      paper.localQuality?.sameCheck === 'banner-v3') &&
    paper.localQuality?.revision === LOCAL_QUALITY_REVISION
  ) {
    const n = paper.questions?.length ?? 0
    return { ok: true, changed: false, count: n, previousCount: n, questions: paper.questions ?? [] }
  }
  const previousCount = paper.questions?.length ?? 0
  const ocr = officialPyqStoredOcrTextLocal(paper)
  const ready = ocr.length >= 80 && ocr !== String(paper.preparedText ?? '')
    ? { ...paper, preparedText: ocr }
    : paper
  const healed = keepAdminEditedCards(
    stripAnswersFromQuestionCards(healOfficialPyqPaperQuestionsEnriched(ready, opts)),
    paper.questions,
  )
  if (!healed.length) {
    return {
      ok: false,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  const minKeep = pyqExtractLowCountThreshold(paper.exam)
  if (previousCount >= minKeep && healed.length < minKeep) {
    return {
      ok: true,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  const preparedText = officialPyqStoredOcrTextLocal(paper)
  const expected = expectedPyqPaperQuestionTarget(paper.exam, paper.session, preparedText)
  const prevFilled = (paper.questions ?? []).filter((q) => q?.placeholder !== true).length
  const healFilled = healed.filter((q) => q?.placeholder !== true).length
  // Keep a full sitting (51→50) but allow dropping leftover extras (53→51).
  if (expected >= 40 && prevFilled <= expected && healFilled === prevFilled - 1) {
    return {
      ok: true,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  if (healed.length < previousCount && previousCount >= minKeep) {
    const prevDist = expected > 0 ? Math.abs(previousCount - expected) : 0
    const healDist = expected > 0 ? Math.abs(healed.length - expected) : previousCount
    if (expected > 0 && healDist > prevDist) {
      return {
        ok: true,
        changed: false,
        count: previousCount,
        previousCount,
        questions: paper.questions ?? [],
      }
    }
  }
  const shrinkFloor = Math.max(minKeep, expected > 0 ? expected - 6 : minKeep)
  if (
    healed.length < previousCount &&
    previousCount >= 30 &&
    healed.length < shrinkFloor
  ) {
    return {
      ok: true,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  const changed =
    healed.length !== previousCount ||
    healed.some((q, i) => {
      const prev = paper.questions[i]
      return (
        String(q?.text ?? '') !== String(prev?.text ?? '') ||
        JSON.stringify(q?.options ?? []) !== JSON.stringify(prev?.options ?? []) ||
        String(q?.passageText ?? '') !== String(prev?.passageText ?? '') ||
        String(q?.passageId ?? '') !== String(prev?.passageId ?? '')
      )
    })
  if (!changed) {
    return { ok: true, changed: false, count: healed.length, previousCount, questions: healed }
  }
  const prepared = officialPyqStoredOcrTextLocal(paper)
  const bannerCount = (questions) => {
    const shown = (Array.isArray(questions) ? questions : []).map((q) => {
      try {
        return peelOfficialPyqCardForDisplay(healPreviewCard(q, prepared), prepared)
      } catch {
        return q
      }
    })
    return officialPyqContentReviewMessages(shown).length
  }
  if (bannerCount(healed) > bannerCount(paper.questions)) {
    return {
      ok: true,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  const updated = updateOfficialPyqPendingPaper(paper.id, { questions: healed })
  if (!updated) {
    return {
      ok: false,
      changed: false,
      count: previousCount,
      previousCount,
      questions: paper.questions ?? [],
    }
  }
  return { ok: true, changed: true, count: healed.length, previousCount, questions: healed }
}

/**
 * Places where printed numbers do not run 1, 2, 3… (restarting at 1 per subject).
 * A question with no "Q." marker in the scan makes the marker count one short, so the
 * count alone would keep an old list that skips a number.
 */
function printedNumberBreaks(questions) {
  const pn = (Array.isArray(questions) ? questions : []).map((q) => Number(q?.printedNumber) || 0)
  return pn.filter((n, i) => i > 0 && n !== pn[i - 1] + 1 && n !== 1).length
}

/** Ordered word pairs of text + options, so matrix-match cards sharing one stem still differ. */
function cardWordPairs(card) {
  const options = Array.isArray(card?.options) ? card.options : []
  const words = String([card?.text ?? '', ...options].join(' ')).toLowerCase().match(/[a-z0-9]+/g) || []
  const pairs = new Set()
  for (let i = 1; i < words.length; i += 1) pairs.add(`${words[i - 1]} ${words[i]}`)
  if (words.length === 1) pairs.add(words[0])
  return pairs
}

function pairOverlap(a, b) {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const p of a) if (b.has(p)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

const SAME_CARD_MIN_OVERLAP = 0.6

/**
 * Card numbers shift when the splitter improves, so an edited card goes to the
 * new card holding the same question (edited or scanned wording), not the same number.
 */
function placeAdminEditedCards(cards, prior, admins) {
  const nextPairs = cards.map(cardWordPairs)
  const printedOf = (q) => Number(q?.printedNumber) || 0
  // A stored card can carry the wrong subject (an old split put Chemistry Q21–39 under Physics),
  // so when every printed number is used once the number alone finds the card.
  const printedUnique = new Set(cards.map(printedOf).filter((n) => n > 0)).size === cards.length
  const scored = []
  admins.forEach((a, ai) => {
    // A machine fix can rewrite a slot into another question; its old wording names the slot it
    // was wrongly made in, so its current wording places it whenever that wording finds a card.
    const current = cardWordPairs(a)
    const currentFinds = isMachineFix(a) && nextPairs.some((pairs) => pairOverlap(current, pairs) >= SAME_CARD_MIN_OVERLAP)
    const history = Array.isArray(a.editHistory) && !currentFinds ? a.editHistory : []
    const versions = [a, ...history.map((h) => h?.card).filter(Boolean)].map(cardWordPairs)
    nextPairs.forEach((pairs, qi) => {
      const subject = String(cards[qi]?.subject || '')
      const score = Math.max(...versions.map((v) => pairOverlap(v, pairs)))
      if (a.subject && subject && String(a.subject) !== subject && !(printedUnique && score >= 0.85)) return
      if (score >= SAME_CARD_MIN_OVERLAP) scored.push({ ai, qi, score })
    })
  })
  scored.sort((x, y) => y.score - x.score)
  /** @type {Map<number, any>} */
  const byNext = new Map()
  const placed = new Set()
  for (const { ai, qi } of scored) {
    if (placed.has(ai) || byNext.has(qi)) continue
    byNext.set(qi, admins[ai])
    placed.add(ai)
  }
  admins.forEach((a, ai) => {
    // A machine fix that matches no question by wording is a duplicate or a mis-split; a number
    // or position fallback would paste it over a different question.
    if (placed.has(ai) || isMachineFix(a)) return
    let at = cards.findIndex(
      (q, i) =>
        !byNext.has(i) &&
        Number(a.printedNumber) > 0 &&
        Number(a.printedNumber) === Number(q?.printedNumber) &&
        (printedUnique || String(a.subject || '') === String(q?.subject || '')),
    )
    if (at < 0) at = prior.indexOf(a)
    if (at >= 0 && at < cards.length && !byNext.has(at)) byNext.set(at, a)
  })
  return byNext
}

/** Two edited cards with the same text and options are one question kept twice; keep the labelled one. */
function uniqueAdminCards(admins) {
  const best = new Map()
  for (const a of admins) {
    const key = JSON.stringify([a.text ?? '', a.options ?? []])
    const have = best.get(key)
    if (!have || (!have.editSource && a.editSource)) best.set(key, a)
  }
  return [...best.values()]
}

/**
 * An unapproved auto-compare card (a machine fix, not the admin's) that still misses a
 * match list gives way when the fresh parse of the same slot has both lists.
 */
function isMachineFix(q) {
  return q?.editSource === 'auto_compare' && q?.adminApproved !== true
}

const filledOptionCount = (q) => (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length

/** Options on a number-answer question, or fewer A–D choices than the scan prints. */
function optionShapeDisagrees(old, fresh) {
  const had = filledOptionCount(old)
  const scan = filledOptionCount(fresh)
  if (!scan && had && /^(?:integer|numerical)$/.test(String(fresh?.questionType || ''))) return true
  return scan >= 4 && had < scan
}

/** The scan's card shows a structure or picture in its stem and the machine fix shows none. */
function lostScanDrawing(old, fresh) {
  const drawing = /<smiles>|\\includegraphics|!\[[^\]]*\]\(/i
  return drawing.test(String(fresh?.text ?? '')) && !drawing.test(String(old?.text ?? ''))
}

function autoFixLostToFreshParse(old, fresh, paper) {
  if (!isMachineFix(old) || !fresh) return false
  if (isMatrixGridCard(fresh) && !isMatrixGridCard(old)) return true
  /** "58." above the lists or "31. The product X is": the fix kept the printed question number. */
  const ownNumber = (q) => {
    const m = String(q?.text ?? '').match(/^\s*(\d{1,3})\s*[.)](?:[ \t]*(?:\n|$)|[ \t]+(?=[A-Za-z$\\]))/)
    return Boolean(m) && (/\n|^\s*\d{1,3}\s*[.)]\s*$/.test(m[0]) || Number(m[1]) === Number(fresh?.printedNumber ?? q?.printedNumber))
  }
  if (ownNumber(old) && !ownNumber(fresh)) return true
  /** List-I pictures the scan prints in the stem sit on the fix's A–D. */
  const stemPics = scanPicturesOf({ text: fresh?.text, passageText: fresh?.passageText })
  const freshOptPics = scanPicturesOf({ options: fresh?.options })
  if (
    (Array.isArray(old?.options) ? old.options : []).some((o) =>
      (String(o ?? '').match(SCAN_PICTURE_RE) || []).some((u) => stemPics.has(u) && !freshOptPics.has(u)),
    )
  ) {
    return true
  }
  /** The fix kept the section instructions as its paragraph. */
  if (/This section contains/i.test(String(old?.passageText ?? '')) && !/This section contains/i.test(String(fresh?.passageText ?? ''))) return true
  if (optionShapeDisagrees(old, fresh)) return true
  if (lostScanDrawing(old, fresh)) return true
  if (carriesOtherQuestionsScanPicture(old, fresh, paper)) return true
  return Boolean(officialPyqMissingListMessage([old])) && !officialPyqMissingListMessage([fresh])
}

const SCAN_PICTURE_RE = /https?:\/\/cdn\.mathpix\.com\/[^\s)}"'\]]+/gi

function scanPicturesOf(q) {
  const parts = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])]
  return new Set(parts.flatMap((p) => String(p ?? '').match(SCAN_PICTURE_RE) || []))
}

/** The old card shows a scan picture that the fresh parse places under a different question. */
function carriesOtherQuestionsScanPicture(old, fresh, paper) {
  const mine = scanPicturesOf(fresh)
  const extra = [...scanPicturesOf(old)].filter((u) => !mine.has(u))
  if (!extra.length || !Array.isArray(paper)) return false
  const elsewhere = new Set(paper.filter((q) => q && q !== fresh).flatMap((q) => [...scanPicturesOf(q)]))
  return extra.some((u) => elsewhere.has(u))
}

/** Old card indexes the store may replace because the fresh parse fixed the same slot. */
function releasedAutoFixIndexes(prev, next) {
  const fresh = Array.isArray(next) ? next : []
  const out = []
  ;(Array.isArray(prev) ? prev : []).forEach((old, i) => {
    if (old?.editSource !== 'auto_compare') return
    // Placement left this machine fix out (it matched no question by wording, or a duplicate
    // card with the same id won), so the store must not paste it back onto its old slot.
    if (isMachineFix(old) && !fresh.some((q) => old.id && q?.id === old.id && String(q?.text ?? '') === String(old.text ?? ''))) {
      out.push(i)
      return
    }
    const slot = Number(old?.pyqSlot ?? old?.questionNumber)
    const now =
      fresh.find((q) => old?.id && q?.id === old.id) ||
      fresh.find((q) => Number(q?.pyqSlot ?? q?.questionNumber) === slot)
    if (!now) return
    if (now.adminEdited !== true && autoFixLostToFreshParse(old, now, fresh)) out.push(i)
    else if (old.adminApproved !== true && carriesOtherQuestionsScanPicture(old, now, fresh)) out.push(i)
    // A machine fix saved without any answer must not wipe the printed key now on the card.
    else if (isMachineFix(old) && now.answerSource === 'from_paper' && !hasAnyAnswer(old) && hasAnyAnswer(now)) out.push(i)
  })
  return out
}

function hasAnyAnswer(q) {
  return (
    [q?.correctIndex, q?.correctInteger, q?.correctNumerical].some((v) => v != null && v !== '') ||
    (Array.isArray(q?.correctIndices) && q.correctIndices.length > 0)
  )
}

export function keepAdminEditedCards(next, prev) {
  const prior = Array.isArray(prev) ? prev : []
  const cards = Array.isArray(next) ? next : []
  const admins = uniqueAdminCards(prior.filter((q) => q?.adminEdited === true))
  if (!admins.length) return next
  const byNext = placeAdminEditedCards(cards, prior, admins)
  return cards.map((q, i) => {
    const old = byNext.get(i)
    if (!old?.adminEdited || autoFixLostToFreshParse(old, q, cards)) return q
    return {
      ...q,
      id: old.id || q.id,
      ...(old.editSource ? { editSource: old.editSource } : {}),
      ...(old.autoFix ? { autoFix: old.autoFix } : {}),
      text: old.text,
      options: old.options,
      passageText: old.passageText,
      correctIndex: old.correctIndex,
      correctIndices: old.correctIndices,
      correctInteger: old.correctInteger,
      correctNumerical: old.correctNumerical,
      numericalTolerance: old.numericalTolerance,
      numericalAlternatives: old.numericalAlternatives,
      correctIndicesAlternatives: old.correctIndicesAlternatives,
      bonusMarksToAll: old.bonusMarksToAll,
      ...gridFieldsOf(old),
      solution: old.solution,
      adminEdited: true,
      adminEditedAt: old.adminEditedAt,
      ...(old.adminApproved === true ? { adminApproved: true, adminApprovedAt: old.adminApprovedAt } : {}),
      ...(Array.isArray(old.editHistory) ? { editHistory: old.editHistory } : {}),
    }
  })
}

/** @param {unknown[]} canonical @param {unknown[]} prev */
export function copyAnswersOntoCanonical(canonical, prev) {
  const byNum = new Map()
  for (const q of prev) {
    const n = Number(q?.questionNumber)
    if (Number.isFinite(n) && n > 0) byNum.set(n, q)
  }
  const admins = uniqueAdminCards(prev.filter((q) => q?.adminEdited === true))
  const adminAt = admins.length ? placeAdminEditedCards(canonical, prev, admins) : new Map()
  return canonical.map((q, i) => {
    const placed = adminAt.get(i)
    let old = placed || byNum.get(Number(q.questionNumber)) || prev[i]
    if (!placed && old?.adminEdited === true) old = null
    if (!old) return q
    if (old.adminEdited === true && !autoFixLostToFreshParse(old, q, canonical)) {
      const printedKey =
        isMachineFix(old) && q.answerSource === 'from_paper'
          ? {
              correctIndex: q.correctIndex,
              correctIndices: q.correctIndices,
              correctInteger: q.correctInteger,
              correctNumerical: q.correctNumerical,
              answerSource: 'from_paper',
            }
          : {}
      return {
        ...old,
        ...printedKey,
        questionNumber: q.questionNumber,
        pyqSlot: q.pyqSlot ?? q.questionNumber,
        printedNumber: q.printedNumber ?? old.printedNumber,
        subject: q.subject || old.subject,
        questionType: isMachineFix(old) ? q.questionType || old.questionType : old.questionType || q.questionType,
      }
    }
    if (isMatrixGridCard(q)) {
      const keepOldKey = !q.matrixAnswerKey && isMatrixGridCard(old) && old.matrixAnswerKey
      return {
        ...q,
        id: q.id || old.id,
        ...(keepOldKey
          ? {
              matrixAnswerKey: old.matrixAnswerKey,
              ...(old.matrixAnswerAlternates ? { matrixAnswerAlternates: old.matrixAnswerAlternates } : {}),
              answerSource: old.answerSource,
            }
          : {}),
        solution: stripEmptyFigureShells(
          stripEmptyImageMarkdown(String(old.solution ?? '').trim() ? old.solution : q.solution || ''),
        ),
        solutionSource: old.solutionSource || q.solutionSource,
      }
    }
    /** A key printed in the scan replaces the old answer whole; mixing kept a stale "A" beside "A, C" (2025 P2). */
    const printed =
      q.answerSource === 'from_paper' &&
      old.answerSource !== 'admin_edit' &&
      (q.bonusMarksToAll === true ||
        [q.correctIndex, q.correctInteger, q.correctNumerical].some((v) => v != null) ||
        (Array.isArray(q.correctIndices) && q.correctIndices.length > 0))
    return {
      ...q,
      id: q.id || old.id,
      correctIndex: printed ? q.correctIndex : q.correctIndex ?? old.correctIndex,
      correctIndices: printed ? q.correctIndices : q.correctIndices || old.correctIndices,
      correctInteger: printed ? q.correctInteger : q.correctInteger ?? old.correctInteger,
      correctNumerical: printed ? q.correctNumerical : q.correctNumerical ?? old.correctNumerical,
      numericalTolerance: printed || q.correctNumerical != null ? q.numericalTolerance : old.numericalTolerance,
      numericalAlternatives: printed || q.correctNumerical != null ? q.numericalAlternatives : old.numericalAlternatives,
      correctIndicesAlternatives: printed || q.correctIndices?.length ? q.correctIndicesAlternatives : old.correctIndicesAlternatives,
      bonusMarksToAll: printed ? q.bonusMarksToAll : q.bonusMarksToAll ?? old.bonusMarksToAll,
      solution: stripEmptyFigureShells(
        stripEmptyImageMarkdown(
          String(old.solution ?? '').trim() ? old.solution : q.solution || '',
        ),
      ),
      answerSource:
        old.answerSource === 'from_paper' || q.answerSource === 'from_paper'
          ? 'from_paper'
          : old.answerSource || q.answerSource,
      solutionSource: old.solutionSource || q.solutionSource,
    }
  })
}

/**
 * Mathpix-only re-parse from stored OCR — no Gemini import.
 * `requireCount`: save only when the rebuilt paper has exactly this many questions and keeps
 * every admin-edited card; otherwise the stored cards stay untouched.
 * @param {import('./officialPyqPendingStore.js').OfficialPyqPendingPaper | null | undefined} paper
 * @param {{ requireCount?: number }} [opts]
 */
export function reExtractOfficialPyqPendingPaperLocal(paper, opts = {}) {
  const required = Number(opts?.requireCount) || 0
  if (!paper) {
    return { ok: false, error: 'Paper not found.', questions: [], count: 0, previousCount: 0 }
  }
  if (officialPyqQuestionsArePublishedLocked(paper)) {
    const n = paper.questions?.length ?? 0
    return {
      ok: false,
      error: officialPyqWordingLockedMessage(paper),
      questions: paper.questions ?? [],
      count: n,
      previousCount: n,
    }
  }
  const preparedText = officialPyqStoredOcrTextLocal(paper)
  if (!preparedText || preparedText.length < 80) {
    return {
      ok: false,
      error: 'No stored OCR text on this paper — upload the PDF again.',
      questions: [],
      count: 0,
      previousCount: paper.questions?.length ?? 0,
    }
  }
  const existingQuestionCount = Array.isArray(paper.questions) ? paper.questions.length : 0
  const expected = expectedPyqPaperQuestionTarget(paper.exam, paper.session, preparedText)
  const minKeep = pyqExtractLowCountThreshold(paper.exam)

  /** @type {unknown[]} */
  let questions = []
  const markerCount = countMathpixQuestionMarkers(preparedText)
  const ocrTarget = quickOcrQuestionCount(preparedText)
  // An explicit re-parse always splits the stored OCR again.
  const mustRebuild =
    true ||
    shouldRebuildFromMathpixOcr(preparedText, existingQuestionCount, expected) ||
    officialPyqCardsNeedMathpixRebuild(paper.questions, preparedText) ||
    officialPyqQuestionsHaveMistakenPassages(paper.questions, preparedText) ||
    (existingQuestionCount >= minKeep &&
      ocrTarget > existingQuestionCount &&
      markerCount >= existingQuestionCount) ||
    (existingQuestionCount >= minKeep &&
      markerCount > existingQuestionCount &&
      markerCount - existingQuestionCount <= 2)
  if (mustRebuild) {
    const canonical = paperItemsFromMathpixOcr(preparedText, {
      paperMeta: {
        exam: paper.exam,
        year: paper.year,
        session: paper.session,
        paperLabel: paper.paperLabel,
        sourceLabel: paper.sourceLabel,
      },
    })
    questions = copyAnswersOntoCanonical(canonical, paper.questions ?? [])
    if (markerCount > questions.length && questions.length <= existingQuestionCount) {
      const healedStored = healOfficialPyqPaperQuestionsEnriched(paper)
      if (healedStored.length > questions.length) {
        questions = healedStored
      }
    }
    const healedCanonical = healOfficialPyqPaperQuestionsEnriched({ ...paper, preparedText, questions })
    const targetCount = required || (markerCount >= minKeep ? markerCount : expected)
    questions =
      pickQuestionListCloserToExpected(
        [questions, healedCanonical, canonical, ...(required ? [healOfficialPyqPaperQuestionsEnriched(paper)] : [])],
        targetCount,
        minKeep,
      ) || questions
  } else {
    questions = healOfficialPyqPaperQuestionsEnriched({ ...paper, preparedText })
  }

  questions = (questions ?? [])
    .map((q, i) => ({
      ...q,
      answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
      solutionSource: q.solutionSource || (q.solution ? 'unknown' : undefined),
      provenance:
        q.provenance ||
        `${paper.sourceLabel}${paper.sourceUrl ? ` · ${paper.sourceUrl}` : ''}`,
      pyqSlot: q.pyqSlot ?? i + 1,
    }))
    .filter((q) => isOfficialPyqPlaceholder(q) || String(q?.text ?? '').trim())
  // Full OCR rebuild already re-slotted cards — merging by old slot re-corrupts.
  const rebuiltClean =
    mustRebuild &&
    questions.length >= Math.min(markerCount, expected || markerCount) - 2 &&
    !officialPyqCardsNeedMathpixRebuild(questions, preparedText)
  questions = stripAnswersFromQuestionCards(
    stripMistakenOfficialPyqPassages(
      rebuiltClean
        ? questions
        : mergeOfficialPyqQuestionsBySlot(paper.questions ?? [], questions, expected),
      preparedText,
    ),
  )

  if (questions.length < minKeep && existingQuestionCount >= minKeep) {
    const healedOnly = healOfficialPyqPaperQuestionsEnriched(paper)
    if (healedOnly.length >= minKeep && healedOnly.length <= existingQuestionCount) {
      questions = healedOnly.map((q, i) => ({
        ...q,
        pyqSlot: q.pyqSlot ?? i + 1,
      }))
    } else {
      return {
        ok: false,
        error: `Re-parse found only ${questions.length} question(s); keeping the existing ${existingQuestionCount} cards. Re-upload the official PDF if the stored OCR is incomplete.`,
        questions: paper.questions ?? [],
        count: existingQuestionCount,
        previousCount: existingQuestionCount,
      }
    }
  }

  if (!questions.length) {
    return {
      ok: false,
      error: 'Re-parse found no questions in stored OCR.',
      questions: [],
      count: 0,
      previousCount: existingQuestionCount,
    }
  }

  const shaped = shapeWithPaperFacts(paper, questions, preparedText)
  questions = shaped.questions
  if (required) {
    const filled = questions.filter((q) => !isOfficialPyqPlaceholder(q)).length
    const ids = new Set(questions.map((q) => q?.id).filter(Boolean))
    const sameCard = (q) => JSON.stringify([q?.text ?? '', q?.options ?? []])
    const kept = new Set(questions.map(sameCard))
    const adminLost = (paper.questions ?? []).some(
      (q) => q?.adminEdited === true && !isMachineFix(q) && !(q.id && ids.has(q.id)) && !kept.has(sameCard(q)),
    )
    if (filled !== required || adminLost) {
      return {
        ok: false,
        error: adminLost
          ? 'Re-parse would drop a card you edited; keeping the stored cards.'
          : `Re-parse found ${filled} question(s), not ${required}; keeping the stored cards.`,
        questions: paper.questions ?? [],
        count: existingQuestionCount,
        previousCount: existingQuestionCount,
      }
    }
  }
  const updated = updateOfficialPyqPendingPaper(paper.id, {
    ...shaped,
    preparedText,
    releaseAdminEditIndexes: releasedAutoFixIndexes(paper.questions, questions),
  })
  if (!updated) {
    return {
      ok: false,
      error: 'Could not save re-parsed questions.',
      questions: [],
      count: 0,
      previousCount: existingQuestionCount,
    }
  }

  const healResult = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
  const finalPaper = getOfficialPyqPendingPaper(paper.id)
  const finalQs = healResult.questions?.length
    ? healResult.questions
    : finalPaper?.questions ?? questions

  return {
    ok: true,
    questions: finalQs,
    count: finalQs.length,
    previousCount: existingQuestionCount,
    usedLocalOnly: true,
  }
}

/** @param {(() => void | Promise<void>) | undefined} yieldFn */
async function yieldBetweenPhases(yieldFn) {
  if (typeof yieldFn === 'function') {
    await yieldFn()
    return
  }
  await new Promise((resolve) => {
    setTimeout(resolve, 16)
  })
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

function restoreMatchListIFromOcrLight(questions, source) {
  const src = String(source ?? '')
  const list = Array.isArray(questions) ? questions : []
  if (src.length < 40) return list
  return list.map((q) => {
    if (!q || q.placeholder === true) return q
    if (!matchQuestionMissingListI(q)) return q
    const text = restoreMissingListIFromSource(q.text, q.options, src)
    if (text === q.text) return q
    return { ...q, text }
  })
}

/**
 * Mathpix-only re-parse with yields between heavy phases so the UI stays clickable.
 * After the worker split, never run paperItemsFromMathpixOcr or a full heal on the UI thread.
 * @param {import('./officialPyqPendingStore.js').OfficialPyqPendingPaper | null | undefined} paper
 * @param {{ yieldFn?: () => void | Promise<void>, onProgress?: (pct: number, label?: string) => void, signal?: AbortSignal }} [opts]
 */
export async function reExtractOfficialPyqPendingPaperLocalAsync(paper, { yieldFn, onProgress, signal } = {}) {
  if (!paper) {
    return { ok: false, error: 'Paper not found.', questions: [], count: 0, previousCount: 0 }
  }
  if (officialPyqQuestionsArePublishedLocked(paper)) {
    const n = paper.questions?.length ?? 0
    return {
      ok: false,
      error: officialPyqWordingLockedMessage(paper),
      questions: paper.questions ?? [],
      count: n,
      previousCount: n,
    }
  }

  await yieldBetweenPhases(yieldFn)
  throwIfAborted(signal)
  onProgress?.(12, 'Reading stored OCR…')

  const preparedText = officialPyqStoredOcrTextLocal(paper)
  if (!preparedText || preparedText.length < 80) {
    return {
      ok: false,
      error: 'No stored OCR text on this paper — upload the PDF again.',
      questions: [],
      count: 0,
      previousCount: paper.questions?.length ?? 0,
    }
  }

  const existingQuestionCount = Array.isArray(paper.questions) ? paper.questions.length : 0
  const expected = expectedPyqPaperQuestionTarget(paper.exam, paper.session, preparedText)
  const minKeep = pyqExtractLowCountThreshold(paper.exam)
  const markerCount = countMathpixQuestionMarkers(preparedText)
  const ocrTarget = quickOcrQuestionCount(preparedText)
  // An explicit re-parse always splits the stored OCR again.
  const mustRebuild =
    true ||
    shouldRebuildFromMathpixOcr(preparedText, existingQuestionCount, expected) ||
    officialPyqCardsNeedMathpixRebuild(paper.questions, preparedText) ||
    officialPyqQuestionsHaveMistakenPassages(paper.questions, preparedText) ||
    (existingQuestionCount >= minKeep &&
      ocrTarget > existingQuestionCount &&
      markerCount >= existingQuestionCount) ||
    (existingQuestionCount >= minKeep &&
      markerCount > existingQuestionCount &&
      markerCount - existingQuestionCount <= 2)

  /** @type {unknown[]} */
  let questions = []

  await yieldBetweenPhases(yieldFn)
  throwIfAborted(signal)
  onProgress?.(28, 'Splitting stored OCR…')

  if (mustRebuild) {
    const paperMeta = {
      exam: paper.exam,
      year: paper.year,
      session: paper.session,
      paperLabel: paper.paperLabel,
      sourceLabel: paper.sourceLabel,
    }
    /** @type {unknown[]} */
    let canonical = []
    try {
      canonical = await splitOcrInWorker(preparedText, paperMeta, { signal })
    } catch (workerErr) {
      if (workerErr instanceof DOMException && workerErr.name === 'AbortError') {
        throw workerErr
      }
      onProgress?.(42, 'Splitting stored OCR on this page…')
      canonical = paperItemsFromMathpixOcr(preparedText, { paperMeta })
    }
    if (canonical.length) {
      onProgress?.(62, 'Copying answers…')
      await yieldBetweenPhases(yieldFn)
      throwIfAborted(signal)
      questions = copyAnswersOntoCanonical(canonical, paper.questions ?? [])
      rememberOfficialPyqSplitKeep(paper.id, questions)
    }
  } else {
    questions = Array.isArray(paper.questions) ? paper.questions.slice() : []
  }

  await yieldBetweenPhases(yieldFn)
  throwIfAborted(signal)
  onProgress?.(68, 'Saving cards…')

  questions = (questions ?? [])
    .map((q, i) => ({
      ...q,
      answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
      solutionSource: q.solutionSource || (q.solution ? 'unknown' : undefined),
      provenance:
        q.provenance ||
        `${paper.sourceLabel}${paper.sourceUrl ? ` · ${paper.sourceUrl}` : ''}`,
      pyqSlot: q.pyqSlot ?? i + 1,
    }))
    .filter((q) => isOfficialPyqPlaceholder(q) || String(q?.text ?? '').trim())

  const targetCount = markerCount >= minKeep ? markerCount : expected
  if (mustRebuild) {
    const rebuiltQs = questions
    const leakedStored = officialPyqQuestionsHaveMistakenPassages(paper.questions, preparedText)
    const cleanerRun =
      rebuiltQs.length >= minKeep && printedNumberBreaks(rebuiltQs) < printedNumberBreaks(paper.questions)
    questions = cleanerRun
      ? rebuiltQs
      : pickQuestionListCloserToExpected(
          leakedStored ? [rebuiltQs] : [rebuiltQs, paper.questions ?? []],
          targetCount,
          minKeep,
        ) || rebuiltQs
  } else {
    questions = restoreMatchListIFromOcrLight(questions, preparedText)
  }
  questions = stripAnswersFromQuestionCards(
    stripMistakenOfficialPyqPassages(dedupeUploadQuestionSlots(questions), preparedText),
  )
  rememberOfficialPyqSplitKeep(paper.id, questions)

  if (questions.length < minKeep && existingQuestionCount >= minKeep) {
    rememberOfficialPyqSplitKeep(paper.id, paper.questions ?? [])
    return {
      ok: false,
      error: `Re-parse found only ${questions.length} question(s); keeping the existing ${existingQuestionCount} cards. Re-upload the official PDF if the stored OCR is incomplete.`,
      questions: paper.questions ?? [],
      count: existingQuestionCount,
      previousCount: existingQuestionCount,
    }
  }

  if (!questions.length) {
    return {
      ok: false,
      error: 'Re-parse found no questions in stored OCR.',
      questions: [],
      count: 0,
      previousCount: existingQuestionCount,
    }
  }

  await yieldBetweenPhases(yieldFn)
  throwIfAborted(signal)
  onProgress?.(72, 'Saving re-parsed questions…')

  const shaped = shapeWithPaperFacts(paper, questions, preparedText)
  questions = shaped.questions
  const updated = updateOfficialPyqPendingPaper(paper.id, {
    ...shaped,
    preparedText,
    localQuality: undefined,
    releaseAdminEditIndexes: releasedAutoFixIndexes(paper.questions, questions),
  })
  if (!updated) {
    return {
      ok: false,
      error: 'Could not save re-parsed questions.',
      questions: [],
      count: 0,
      previousCount: existingQuestionCount,
    }
  }

  rememberOfficialPyqSplitKeep(paper.id, questions)
  await yieldBetweenPhases(yieldFn)
  onProgress?.(95, 'Cleaning cards…')

  const healResult = healAndPersistOfficialPyqPaper(getOfficialPyqPendingPaper(paper.id))
  const finalPaper = getOfficialPyqPendingPaper(paper.id)
  const finalQs = healResult.questions?.length
    ? healResult.questions
    : finalPaper?.questions ?? questions
  onProgress?.(100, 'Done')

  return {
    ok: true,
    questions: finalQs,
    count: finalQs.length,
    previousCount: existingQuestionCount,
    usedLocalOnly: true,
  }
}
