/**
 * Answers and solutions printed in a separate file (an answer-key PDF or a solutions booklet).
 * Read with the same reader as the answer / solution part printed after a paper, then put on
 * the cards by printed question number, as printed on the paper. An admin's edit stays.
 */
import {
  applyEndAnswerSection,
  readAnswerFileSection,
  readEndAnswerSection,
  stripEndAnswerSection,
} from './printedEndSolutions.js'
import { getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } from './officialPyqPendingStore.js'

const ANSWER_FIELDS = [
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'numericalAlternatives',
  'correctIndicesAlternatives',
  'matrixAnswerKey',
  'bonusMarksToAll',
  'zeroMarksToAll',
]

/** @param {Record<string, any>} q */
function hasAnswer(q) {
  return ANSWER_FIELDS.some((k) => {
    const v = q?.[k]
    return Array.isArray(v) ? v.length > 0 : v != null && v !== ''
  })
}

/** @param {Record<string, any>} a @param {Record<string, any>} b */
function sameAnswer(a, b) {
  return ANSWER_FIELDS.every((k) => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null))
}

/**
 * Text of the answer file: Mathpix for a PDF or a picture, the Word reader for .docx, as is for .txt.
 * @param {File} file
 * @param {(pct: number) => void} [onProgress]
 */
export async function readAnswerFileText(file, onProgress) {
  const name = String(file?.name || '').toLowerCase()
  if (/\.(txt|tex|md)$/.test(name)) return file.text()
  const { isWordFile, extractTextFromWord } = await import('./extractDocument.js')
  if (isWordFile(file)) return extractTextFromWord(file)
  const { recognizeWithMathpix } = await import('./mathpixOcr.js')
  return recognizeWithMathpix(file, onProgress, { format: 'latex' })
}

/**
 * Put the answers and solutions read from a separate file on a Pending or Approved paper.
 * @param {string} paperId
 * @param {string} text the answer file's text
 * @param {{ fileName?: string }} [opts]
 */
export function applyAnswerFileToOfficialPyqPaper(paperId, text, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status === 'published') {
    return { ok: false, error: 'This paper is published. Press Unpublish first, then add the answer file.' }
  }
  if (paper.status === 'rejected') {
    return { ok: false, error: 'This paper is in Rejected. Move it back to Pending first.' }
  }
  const cards = Array.isArray(paper.questions) ? paper.questions : []
  if (!cards.length) return { ok: false, error: 'This paper has no questions yet. Upload the paper first.' }
  const end = readAnswerFileSection(text)
  if (!end) {
    return {
      ok: false,
      error:
        'No answers or solutions were found in this file. Each one must start with its question number, for example "1. (B)" or "Q.1 Sol. …".',
    }
  }

  // Cards split without a printed number are matched by their place in the paper.
  const numbered = cards.map((q, i) =>
    Number(q?.printedNumber ?? q?.questionNumber) > 0
      ? q
      : { ...q, printedNumber: Number(q?.pyqSlot) || i + 1, slotNumbered: true },
  )
  const applied = applyEndAnswerSection(numbered, end).map((q) => {
    if (!q?.slotNumbered) return q
    const { slotNumbered: _s, printedNumber: _n, ...rest } = q
    return rest
  })

  let answers = 0
  let solutions = 0
  /** @type {number[]} */
  const noAnswer = []
  applied.forEach((q, i) => {
    const before = cards[i]
    if (q.answerSource === 'from_paper' && hasAnswer(q) && (before.answerSource !== 'from_paper' || !sameAnswer(q, before))) {
      answers += 1
    }
    if (String(q.solution ?? '') !== String(before.solution ?? '')) solutions += 1
    if (String(q.text ?? '').trim() && !hasAnswer(q) && q.bonusMarksToAll !== true && q.zeroMarksToAll !== true) noAnswer.push(i + 1)
  })
  if (!answers && !solutions) {
    const blank = numbered.map((q) => {
      const next = { ...q, adminEdited: false, answerSource: 'unknown', solution: '', solutionSource: undefined }
      for (const k of ANSWER_FIELDS) delete next[k]
      return next
    })
    const matched = applyEndAnswerSection(blank, end).some((q) => hasAnswer(q) || String(q.solution ?? '').trim())
    return matched
      ? { ok: true, paper, answers: 0, solutions: 0, noAnswer, unchanged: true }
      : {
          ok: false,
          error: 'The file was read, but none of its question numbers matched a question on this paper. Nothing was changed.',
        }
  }

  /** @type {Record<string, any>} */
  const patch = {
    questions: applied,
    allowPublishedQuestionWrite: paper.status === 'approved',
    answerFileName: String(opts.fileName || '').trim() || undefined,
  }
  // Kept after the paper, so a re-parse of the stored text reads the same answers again.
  const prepared = String(paper.preparedText ?? '')
  if (prepared.trim()) {
    const withKey = `${prepared.trimEnd()}\n\n${end.sectionText}\n`
    if (readEndAnswerSection(withKey) && stripEndAnswerSection(withKey).trim() === stripEndAnswerSection(prepared).trim()) {
      patch.preparedText = withKey
    }
  }
  const saved = updateOfficialPyqPendingPaper(paper.id, patch)
  if (!saved) return { ok: false, error: 'Could not save the answers. Nothing was changed.' }
  return { ok: true, paper: saved, answers, solutions, noAnswer }
}
