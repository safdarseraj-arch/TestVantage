/**
 * The Official PYQ card exactly as the review page draws it: display heal,
 * passage decision and figure. Shared by the preview and by per-question
 * Approve, which saves this view so the approved card never changes.
 */

import { applyStoredOcrCardFixes, healUploadQuestionCard } from './uploadQualityGuards.js'
import { extractMathpixImageUrls, hasOriginalPageCrop } from './mathpixMedia.js'
import { officialPyqCardAllowsPassage, peelOfficialPyqCardForDisplay } from './passage.js'
import { restoreMissingFiguresFromSource } from './extendTruncatedStem.js'
import { restoreLabelledFigureOptions } from './labelledFigureOptions.js'

/**
 * @param {any} q
 * @param {string} [rawSourceText]
 * @returns {{ healed: any, text: string, options: string[], passage: string, questionImage: string | undefined, healError: string }}
 */
export function officialPyqCardAsShown(q, rawSourceText = '') {
  if (q?.adminApproved === true) {
    const text = String(q.text ?? q.stem ?? '')
    return {
      healed: q,
      text,
      options: Array.isArray(q.options) ? q.options.map((opt) => String(opt ?? '')) : [],
      passage: String(q.passageText ?? '').trim(),
      questionImage: extractMathpixImageUrls(text).length ? undefined : String(q.questionImage ?? '').trim() || undefined,
      healError: '',
    }
  }
  // Admin edits must not wipe OCR figure restore (Q73 compound drawing, Q59 circuit).
  // Still heal options / assertion stems / PART banners from OCR — Compare crops and
  // truncated Assertion (A) text are not intentional admin wording.
  const sourceText = String(rawSourceText ?? '')
  let healed
  try {
    if (q?.adminEdited === true) {
      healed = peelOfficialPyqCardForDisplay(q, '')
      const stemHasCrop = hasOriginalPageCrop(healed?.text ?? q?.text)
      const optionFigs = (Array.isArray(healed?.options) ? healed.options : []).filter((o) =>
        /\\includegraphics|!\[[^\]]*\]\(|<smiles>/i.test(String(o ?? '')),
      ).length
      // When options already hold the drawings (Q75 bond-line crops), do not pull a neighbouring
      // OCR figure into the stem — that pasted the wrong reaction scheme above the options.
      // When the stem already has the page crop (Q78 A–D halides), skip OCR figure restore
      // and SMILES prefer — those replaced the full drawing with one benzyl SMILES.
      if (!stemHasCrop && optionFigs < 2) {
        const printed = Number(q?.printedNumber ?? q?.questionNumber)
        const nextText = restoreMissingFiguresFromSource(healed?.text ?? q?.text, sourceText, printed)
        if (nextText !== String(healed?.text ?? '')) {
          healed = { ...healed, text: nextText }
        }
      }
      // Figure restore can copy option drawings into the stem; peel when options already hold them.
      healed = restoreLabelledFigureOptions(healed, sourceText)
      // Still apply OCR option/assertion fixes. Stem SMILES-prefer no longer replaces a
      // good wide A–D crop (Q78); keep applyStoredOcrCardFixes for option heals.
      if (sourceText.length >= 40) {
        healed = applyStoredOcrCardFixes(healed, sourceText)
      }
    } else {
      healed = peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, sourceText), sourceText)
    }
  } catch (err) {
    console.error('Official PYQ preview heal failed', err)
    healed = {
      ...(q && typeof q === 'object' ? q : {}),
      text: String(q?.text ?? q?.stem ?? ''),
      options: Array.isArray(q?.options) ? q.options : [],
      _previewHealError: err instanceof Error ? err.message : String(err),
    }
  }
  const options = Array.isArray(healed?.options) ? healed.options : []
  const text = String(healed?.text ?? healed?.stem ?? '')
  const adminPassage = q?.passageSource === 'admin_facts' || q?.passageSource === 'admin_edit'
  const storedPass = String((adminPassage ? q?.passageText : healed?.passageText) ?? '').trim()
  const passage = adminPassage || officialPyqCardAllowsPassage(healed, sourceText)
    ? storedPass
    : sourceText.length < 40
      ? storedPass
      : ''
  const questionImage = extractMathpixImageUrls(text).length
    ? undefined
    : String(healed?.questionImage ?? q?.questionImage ?? '').trim() || undefined
  return {
    healed,
    text,
    options,
    passage,
    questionImage,
    healError: String(healed?._previewHealError ?? '').trim(),
  }
}
