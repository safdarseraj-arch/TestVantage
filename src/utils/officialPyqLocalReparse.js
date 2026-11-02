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
import { officialPyqContentReviewMessages } from './officialPyqReviewFlags.js'
import { healUploadQuestionCard as healPreviewCard, applyStoredOcrCardFixes } from './uploadQualityGuards.js'
import { enrichMatchListsFromOcr } from './restoreMatchListsOcr.js'
import {
  countMathpixQuestionMarkers,
  paperItemsFromMathpixOcr,
  sanitizeMathpixOcrText,
  shouldRebuildFromMathpixOcr,
  officialPyqCardsNeedMathpixRebuild,
} from './mathpixQuestionSplit.js'
import {
  expectedPyqTargetFromOcrLite,
  quickOcrQuestionCount,
} from './pyqOcrCountLite.js'
import {
  getOfficialPyqPendingPaper,
  updateOfficialPyqPendingPaper,
  officialPyqQuestionsArePublishedLocked,
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
  // preparedText is a cleaned copy. If that clean ate figure URLs, the notes
  // copy still has them. Prefer the copy that still has the drawings.
  if (fromNotes.length >= 80 && mathpixFigureHits(rawNotes) > mathpixFigureHits(rawDedicated)) {
    return fromNotes
  }
  if (dedicated.length >= 80) return dedicated
  return fromNotes
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

const PUBLISHED_LOCK_ERROR =
  'This paper is published. Unpublish it before re-parse or heal can change its questions.'

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
      error: officialPyqQuestionsArePublishedLocked(paper) ? PUBLISHED_LOCK_ERROR : '',
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

function keepAdminEditedCards(next, prev) {
  const prior = Array.isArray(prev) ? prev : []
  const admins = prior.filter((q) => q?.adminEdited === true)
  if (!admins.length) return next
  return (Array.isArray(next) ? next : []).map((q, i) => {
    const old =
      admins.find(
        (a) =>
          Number(a.printedNumber) > 0 &&
          Number(a.printedNumber) === Number(q?.printedNumber) &&
          String(a.subject || '') === String(q?.subject || ''),
      ) || (prior[i]?.adminEdited === true ? prior[i] : null)
    if (!old?.adminEdited) return q
    return {
      ...q,
      text: old.text,
      options: old.options,
      passageText: old.passageText,
      correctIndex: old.correctIndex,
      correctIndices: old.correctIndices,
      correctInteger: old.correctInteger,
      correctNumerical: old.correctNumerical,
      solution: old.solution,
      adminEdited: true,
      adminEditedAt: old.adminEditedAt,
      ...(old.adminApproved === true ? { adminApproved: true, adminApprovedAt: old.adminApprovedAt } : {}),
    }
  })
}

/** @param {unknown[]} canonical @param {unknown[]} prev */
function copyAnswersOntoCanonical(canonical, prev) {
  const byNum = new Map()
  for (const q of prev) {
    const n = Number(q?.questionNumber)
    if (Number.isFinite(n) && n > 0) byNum.set(n, q)
  }
  return canonical.map((q, i) => {
    const old = byNum.get(Number(q.questionNumber)) || prev[i]
    if (!old) return q
    if (old.adminEdited === true) {
      return {
        ...old,
        questionNumber: q.questionNumber,
        pyqSlot: q.pyqSlot ?? q.questionNumber,
        printedNumber: q.printedNumber ?? old.printedNumber,
        subject: q.subject || old.subject,
        questionType: old.questionType || q.questionType,
      }
    }
    return {
      ...q,
      id: q.id || old.id,
      correctIndex: q.correctIndex ?? old.correctIndex,
      correctIndices: q.correctIndices || old.correctIndices,
      correctInteger: q.correctInteger ?? old.correctInteger,
      correctNumerical: q.correctNumerical ?? old.correctNumerical,
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
 * @param {import('./officialPyqPendingStore.js').OfficialPyqPendingPaper | null | undefined} paper
 */
export function reExtractOfficialPyqPendingPaperLocal(paper) {
  if (!paper) {
    return { ok: false, error: 'Paper not found.', questions: [], count: 0, previousCount: 0 }
  }
  if (officialPyqQuestionsArePublishedLocked(paper)) {
    const n = paper.questions?.length ?? 0
    return {
      ok: false,
      error: PUBLISHED_LOCK_ERROR,
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
    const targetCount = markerCount >= minKeep ? markerCount : expected
    questions =
      pickQuestionListCloserToExpected(
        [questions, healedCanonical, canonical],
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
      solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
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
  const updated = updateOfficialPyqPendingPaper(paper.id, {
    ...shaped,
    preparedText,
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
      error: PUBLISHED_LOCK_ERROR,
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
      solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
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
    questions =
      pickQuestionListCloserToExpected(
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
