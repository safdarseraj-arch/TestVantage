/**
 * The Official PYQ card exactly as the review page draws it: display heal,
 * passage decision and figure. Shared by the preview and by per-question
 * Approve, which saves this view so the approved card never changes.
 */

import { healUploadQuestionCard } from './uploadQualityGuards.js'
import { extractMathpixImageUrls } from './mathpixMedia.js'
import { officialPyqCardAllowsPassage, peelOfficialPyqCardForDisplay } from './passage.js'

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
  const sourceText = q?.adminEdited === true ? '' : String(rawSourceText ?? '')
  let healed
  try {
    healed = peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, sourceText), sourceText)
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
