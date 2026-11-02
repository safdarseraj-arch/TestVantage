/**
 * Canonical persist pipeline for OCR uploads and the question bank.
 * All saves and migrations must go through these helpers so fixes stay applied.
 *
 * Covers: passage split hygiene, PIVQ/PSCQ rows (IVQ or NVQ per sub via passageSubAnswer.js),
 * \\left/\\right math, "then evaluate:" sums.
 * Matrix stems: finalizeStemForBank() only (never raw text to localStorage).
 * MCQ: healStoredMcqQuestion() re-runs determinant/option repair on load (blank B–D fix).
 * Tests: test-matrix-save-stem.mjs · test-persist-upload.mjs · npm run test:upload-gate
 */

import { normalizePassageQuestionStorage, sanitizePassageBundle } from './passage.js'
import { polishPassageBundle } from './ocrExtractPolish.js'
import { migrateStoredQuestionText } from './migrateStoredQuestions.js'
import { repairNpSpPassageArray } from './repairNpSpPassageArray.js'
import { finalizeStemForBank } from './stemBankGuard.js'
import { slimQuestionImageFields } from './imageQuestion.js'
import { healUploadQuestionCard } from './uploadQualityGuards.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import { latexExtractionIncomplete } from './healTruncatedLatex.js'
import { maybeHealHybridDraftQuestion } from './hybridLatexSanitize.js'
import { parseMatchingListForDisplay } from './parseMatchingListDisplay.js'

function filledMatchRowCount(text) {
  const parsed = parseMatchingListForDisplay(text)
  if (!parsed?.listI?.length) return 0
  return parsed.listI.filter((row) => String(row.text ?? '').trim().length >= 2).length
}

export { normalizeStemForStorage } from './stemStorage.js'
export {
  finalizeStemForBank,
  detectBrokenBankStem,
  stemForLivePreview,
  stemNeedsSourceRepair,
  stemSaveBlockers,
} from './stemBankGuard.js'
export {
  processMcqUploadExtract,
  resolveMcqFromOcr,
  planUploadImageActions,
  polishOcrForBank,
  reparseMcqUpload,
  normalizeRawOcr,
} from './uploadPipeline.js'

export {
  runAiUploadAssist,
  enhanceMatrixParse,
  enhanceMcqFromOcr,
  buildAiUploadReport,
  formatAiUploadSummary,
} from './aiUploadAssist.js'

/**
 * Passage bundle fields before save (split hygiene + stem normalize).
 * @param {{ passageText?: string, subQuestions?: { text?: string, options?: string[] }[] }} bundle
 */
export function persistPassageBundleFields(bundle) {
  const polished = polishPassageBundle(bundle)
  return sanitizePassageBundle({
    ...polished,
    passageText: finalizeStemForBank(repairNpSpPassageArray(polished.passageText ?? '')),
    subQuestions: (polished.subQuestions ?? []).map((sq) => ({
      ...sq,
      text: finalizeStemForBank(sq?.text ?? '', sq?.options ?? []),
      options: (sq.options ?? []).map((o) => finalizeStemForBank(String(o ?? ''))),
    })),
  })
}

/**
 * One bank row after load/save/import (passage normalize + text migrate + figure migrate).
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} [all]
 */
export function persistQuestionForBank(q, all = []) {
  const source = String(
    q?.extractedRaw ?? q?.preparedText ?? q?.ocrText ?? q?.rawOcr ?? '',
  )
  if (!q || typeof q !== 'object' || q.placeholder === true) return q
  const incomingHealed = healUploadQuestionCard(q, source) ?? q
  const incomingText = sanitizeStemForDisplay(incomingHealed.text, incomingHealed.options)
  const base = slimQuestionImageFields(
    migrateStoredQuestionText(
      normalizePassageQuestionStorage({ ...incomingHealed, text: incomingText }, all),
    ),
  )
  const src = source || String(base.extractedRaw ?? base.preparedText ?? '')
  let healed = healUploadQuestionCard(base, src) ?? base
  let text = sanitizeStemForDisplay(healed.text, healed.options)
  const incomingOk = incomingText && !latexExtractionIncomplete(incomingText)
  const persistWorse =
    latexExtractionIncomplete(text) ||
    filledMatchRowCount(incomingText) > filledMatchRowCount(text)
  if (incomingOk && persistWorse) {
    healed = { ...healed, ...incomingHealed }
    text = incomingText
  }
  const row = text === healed.text ? healed : { ...healed, text }
  return maybeHealHybridDraftQuestion(row)
}
