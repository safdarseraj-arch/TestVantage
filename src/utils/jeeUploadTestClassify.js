import { polishExtractedText } from './ocrExtractPolish.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { classifyUploadFromOcr, inferUploadQuestionType } from './classifyUploadFromOcr.js'

/**
 * @param {string} rawText
 * @param {string} expectedTypeId
 */
export function classifyOcrUpload(rawText, expectedTypeId) {
  const raw = String(rawText ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const routed = classifyUploadFromOcr(raw, { engine: 'builtin' })
  const polished = routed.polished ?? polishExtractedText(raw, 'builtin')
  /** @type {Record<string, unknown>} */
  const details = { ...(routed.details ?? {}), textLen: raw.length }

  if (!raw || raw.length < 12) {
    return { detectedType: 'none', expectedTypeId, ok: false, polished, details }
  }

  if (routed.detectedType === 'matrix_match') {
    const ok = expectedTypeId === 'matrix_match' && (details.rows ?? 0) >= 2
    return {
      detectedType: 'matrix_match',
      expectedTypeId,
      ok,
      polished,
      details,
      matrixParsed: routed.matrixParsed }
  }

  if (routed.detectedType === 'passage_integer' || routed.detectedType === 'passage_scq') {
    const detectedType = routed.detectedType
    const ok =
      (details.subCount ?? 0) >= 2 &&
      (expectedTypeId === detectedType ||
        (expectedTypeId === 'passage_scq' && detectedType === 'passage_scq') ||
        (expectedTypeId === 'passage_integer' && detectedType === 'passage_integer'))
    return { detectedType, expectedTypeId, ok, polished, details, passageParsed: routed.passageParsed }
  }

  const parsed = routed.parsed ?? parseSingleQuestionUpload(polished, raw)
  const found =
    parsed.optionsFound ?? (parsed.options ?? []).filter((o) => String(o ?? '').trim()).length
  details.found = found
  details.stemLen = String(parsed.text ?? '').trim().length

  const detectedType = inferUploadQuestionType({
    suggestedQuestionType: parsed.suggestedQuestionType,
    found,
    stem: parsed.text,
    options: parsed.options,
    rawOcr: raw })

  const ok =
    detectedType === expectedTypeId ||
    (expectedTypeId === 'single_correct' && detectedType === 'single_correct' && found >= 2) ||
    (expectedTypeId === 'multiple_correct' && found >= 2) ||
    (expectedTypeId === 'integer' && details.stemLen >= 20) ||
    (expectedTypeId === 'numerical' && details.stemLen >= 20)

  return { detectedType, expectedTypeId, ok, polished, details, parsed }
}
