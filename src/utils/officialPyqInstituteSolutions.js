/**
 * A coaching institute's solutions PDF (Allen, Resonance, FIITJEE…) added to an Official PYQ paper.
 * Read with Mathpix like an answer file; the PDF is kept on the helper beside the original.
 * - The official key wins: an answer printed on the paper, typed by an admin, or edited by hand is
 *   never changed. A different institute answer is noted on the card for the Quality check.
 * - A card with no answer (or only an AI one) takes the institute answer.
 * - A solution is filled only where the card has none, or only an AI one.
 * - Each stem is checked against the institute's copy of the question (no Gemini).
 * Students see these answers and solutions like any other.
 */
import { endKeyAnswerFields } from './printedEndSolutions.js'
import {
  INSTITUTE_NOTE_FIELDS,
  instituteAnswerAgrees,
  instituteAnswerText,
  instituteTextDifference,
  pickInstituteSolutionsText,
  readInstituteSolutions,
} from './instituteSolutionsParse.js'
import { instituteOptionOrder, mapInstituteAnswerLetters, matchInstituteEntries } from './instituteSolutionsMatch.js'
import { getOfficialPyqPendingPaper, isOtherPaper, updateOfficialPyqPendingPaper } from './officialPyqPendingStore.js'
import { officialPyqCardAnswerIsKept } from './officialPyqPendingFill.js'
import { isOfficialPyqPlaceholder } from './officialPyqMissingSlots.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { solutionIsOnlyPrintedKeyLine } from './printedAnswerKey.js'
import { keepMathpixPicturesLocal, mathpixPictureLinksIn } from './mathpixLocalPictures.js'

const ANSWER_FIELDS = [
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'numericalTolerance',
  'numericalAlternatives',
  'correctIndicesAlternatives',
]

/** Solutions the institute's worked solution may replace. */
const REPLACEABLE_SOLUTION_SOURCES = new Set(['hybrid_ai', 'ai_generated', 'draft', 'institute'])

const LINKS_PER_REQUEST = 200

/** @param {unknown} name */
export function cleanInstituteName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** The card's answer is the official key: printed on the paper, typed or edited by an admin. @param {any} q */
function hasOfficialAnswer(q) {
  if (q?.bonusMarksToAll === true || q?.zeroMarksToAll === true) return true
  return officialPyqCardAnswerIsKept(q) && q?.answerSource !== 'institute'
}

/** A worked solution that names options by letter reads wrong once the options are in another order. */
const NAMES_OPTION_RE = /\(\s*[A-D]\s*\)|\b(?:option|choice)s?\s*\(?\s*[A-D]\b/i

/** @param {any} q */
function takesNothing(q) {
  return !q || typeof q !== 'object' || isOfficialPyqPlaceholder(q) || !String(q.text ?? q.stem ?? '').trim()
}

/** @param {any} q */
function hasOptions(q) {
  return (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length >= 2
}

/** @param {any} q */
function solutionIsReplaceable(q) {
  const current = String(q?.solution ?? '').trim()
  return !current || solutionIsOnlyPrintedKeyLine(current) || REPLACEABLE_SOLUTION_SOURCES.has(String(q?.solutionSource ?? ''))
}

/**
 * Put an institute solutions file on a Pending or Approved Official PYQ paper.
 * @param {string} paperId
 * @param {string} text Mathpix text of the institute file
 * @param {{ institute: string, fileName?: string, pdfStored?: boolean }} opts
 */
export function applyInstituteSolutionsToOfficialPyqPaper(paperId, text, opts) {
  const institute = cleanInstituteName(opts?.institute)
  if (!institute) return { ok: false, error: 'Type the institute name first (for example Allen or Resonance).' }
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (isOtherPaper(paper)) return { ok: false, error: 'Institute solutions are for Official PYQ papers.' }
  if (paper.status === 'published') {
    return { ok: false, error: 'This paper is published. Press Unpublish first, then add the institute solutions.' }
  }
  if (paper.status === 'rejected') return { ok: false, error: 'This paper is in Rejected. Move it back to Pending first.' }
  const cards = Array.isArray(paper.questions) ? paper.questions : []
  if (!cards.length) return { ok: false, error: 'This paper has no questions yet. Upload the paper first.' }
  const read = readInstituteSolutions(text, { institute })
  if (!read) {
    return {
      ok: false,
      error:
        'No answers or solutions were found in this file. Each question must start with its number, then "Ans. (B)" or "Sol. …".',
    }
  }

  // Cards split without a printed number are matched by their place in the paper.
  const numbered = cards.map((q, i) =>
    Number(q?.printedNumber ?? q?.questionNumber) > 0 ? q : { ...q, printedNumber: Number(q?.pyqSlot) || i + 1 },
  )
  const plan = matchInstituteEntries(numbered, read, { skip: takesNothing })
  let answers = 0
  let solutions = 0
  /** @type {Array<{ n: number, institute: string, official: string }>} */
  const disagreements = []
  /** @type {number[]} */
  const notFound = []
  /** @type {number[]} */
  const textDiffers = []
  /** @type {number[]} */
  const noAnswer = []
  /** @type {number[]} */
  const reordered = []
  /** @type {number[]} */
  const optionsUnmatched = []
  /** @type {Array<{ n: number, label: string, answer: string }>} */
  const unsure = []
  const unsureOf = new Map(plan.unsure.map((u) => [u.card, u]))

  const questions = cards.map((q, i) => {
    if (takesNothing(q)) return q
    const next = { ...q }
    for (const key of INSTITUTE_NOTE_FIELDS) delete next[key]
    const guess = unsureOf.get(i)
    if (guess) {
      next.instituteUnsureMatch = { label: guess.label, answer: guess.entry.answer || '' }
      unsure.push({ n: i + 1, label: guess.label, answer: guess.entry.answer || '' })
      return next
    }
    const match = plan.matches[i]
    if (!match) {
      notFound.push(i + 1)
      return next
    }
    const entry = match.entry
    let answer = entry.answer
    let shuffled = false
    if (answer && entry.question && hasOptions(q) && !isMatrixGridCard(q) && /^(?:[A-H](?:, [A-H])*|[1-4])$/.test(answer)) {
      const order = instituteOptionOrder(entry.question, q.options)
      const mapped = order && 'order' in order ? mapInstituteAnswerLetters(answer, order.order) : answer
      if (!order || !mapped) {
        next.instituteOptionsUnmatched = answer
        optionsUnmatched.push(i + 1)
        answer = ''
      } else if ('order' in order) {
        shuffled = true
        reordered.push(i + 1)
        answer = mapped
      }
    }
    const fields = answer && !isMatrixGridCard(q) ? endKeyAnswerFields(answer, q) : null
    let disagrees = Boolean(next.instituteOptionsUnmatched)
    if (fields && hasOfficialAnswer(q)) {
      if (!instituteAnswerAgrees(q, fields)) {
        disagrees = true
        next.instituteAnswerDisagrees = instituteAnswerText(fields)
        disagreements.push({ n: i + 1, institute: next.instituteAnswerDisagrees, official: instituteAnswerText(q) })
      }
    } else if (fields && q.adminEdited !== true) {
      const before = instituteAnswerText(q)
      for (const key of ANSWER_FIELDS) delete next[key]
      Object.assign(next, fields, { answerSource: 'institute', answerInstitute: institute })
      delete next.answerKeyReleased
      delete next.hybridAnswerDisagrees
      if (q.answerSource !== 'institute' || before !== instituteAnswerText(next)) answers += 1
    }
    if (entry.solution && !disagrees && !(shuffled && NAMES_OPTION_RE.test(entry.solution)) && solutionIsReplaceable(q)) {
      if (String(q.solution ?? '').trim() !== entry.solution.trim() || q.solutionSource !== 'institute') solutions += 1
      next.solution = entry.solution
      next.solutionSource = 'institute'
      next.solutionInstitute = institute
    }
    if (entry.question && instituteTextDifference(q, entry.question)?.differs) {
      next.instituteQuestionText = entry.question
      textDiffers.push(i + 1)
    }
    if (!instituteAnswerText(next) && !isMatrixGridCard(next)) noAnswer.push(i + 1)
    return next
  })

  if (!plan.byContent && !plan.byNumber && !unsure.length) {
    return {
      ok: false,
      error:
        'The file was read, but none of its questions matched a question on this paper (by wording or by number). Nothing was changed.',
    }
  }
  const counts = {
    byContent: plan.byContent,
    byNumber: plan.byNumber,
    unmatched: plan.unmatched,
    unsure,
    reordered,
    optionsUnmatched,
  }
  const summary = {
    institute,
    fileName: String(opts?.fileName || '').trim() || undefined,
    at: Date.now(),
    pdfStored: opts?.pdfStored === true,
    layout: read.layout,
    answers,
    solutions,
    disagreements: disagreements.map((d) => d.n),
    notFound,
    textDiffers,
    byContent: plan.byContent,
    byNumber: plan.byNumber,
    unmatched: plan.unmatched.length,
    unsure: unsure.map((u) => u.n),
    optionsUnmatched,
  }
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    allowPublishedQuestionWrite: paper.status === 'approved',
    instituteSolutions: summary,
  })
  if (!saved) return { ok: false, error: 'Could not save the institute answers. Nothing was changed.' }
  return { ok: true, paper: saved, answers, solutions, disagreements, notFound, textDiffers, noAnswer, layout: read.layout, ...counts }
}

/**
 * Plain result note for the admin.
 * @param {{
 *   answers: number, solutions: number, disagreements: Array<{ n: number, institute: string, official: string }>,
 *   notFound: number[], textDiffers: number[], noAnswer?: number[], byContent?: number, byNumber?: number,
 *   unmatched?: string[], unsure?: Array<{ n: number, label: string }>, reordered?: number[], optionsUnmatched?: number[],
 * }} result
 * @param {{ institute: string, fileName?: string, pictures?: { kept: number, failed: number }, pdfStored?: boolean, textSource?: string }} info
 */
export function instituteResultNote(result, info) {
  const list = (nums) => `Q ${nums.slice(0, 15).join(', ')}${nums.length > 15 ? ' …' : ''}`
  const labels = (names) => `${names.slice(0, 15).join(', ')}${names.length > 15 ? ' …' : ''}`
  const unmatched = result.unmatched ?? []
  const unsure = result.unsure ?? []
  const parts = [
    `Read ${info.institute} solutions${info.fileName ? ` (“${info.fileName}”)` : ''}: ${result.answers} answer(s) filled, ${result.solutions} solution(s) filled.`,
    `Matched ${result.byContent ?? 0} question(s) by wording and ${result.byNumber ?? 0} by number; ${unmatched.length} institute question(s) not matched; ${unsure.length} not sure.`,
  ]
  if (info.textSource === 'pdf' || info.textSource === 'pdf-only') {
    parts.push('Read from the PDF’s own text (clearer than the scan for this file).')
  }
  if (unsure.length) {
    const shown = unsure
      .slice(0, 6)
      .map((u) => `institute ${u.label} looks like official Q ${u.n}`)
      .join('; ')
    parts.push(`Not sure, so not used — check: ${shown}${unsure.length > 6 ? '; …' : ''}.`)
  }
  if (unmatched.length) parts.push(`Not matched to any question here: institute ${labels(unmatched)}.`)
  if (result.reordered?.length) {
    parts.push(`The institute prints the options in another order on ${list(result.reordered)}; its answers were moved to the matching options.`)
  }
  if (result.optionsUnmatched?.length) {
    parts.push(`The institute's options could not be matched on ${list(result.optionsUnmatched)} — those answers were not used; the Quality check lists them.`)
  }
  if (result.disagreements.length) {
    const shown = result.disagreements
      .slice(0, 6)
      .map((d) => `Q${d.n}: institute ${d.institute}, official ${d.official}`)
      .join('; ')
    parts.push(
      `${result.disagreements.length} answer(s) differ from the official key — the official answer is kept and the Quality check lists them (${shown}${result.disagreements.length > 6 ? '; …' : ''}).`,
    )
  } else {
    parts.push('No answer differs from the official key.')
  }
  parts.push(result.notFound.length ? `Not found in the file: ${list(result.notFound)}.` : 'Every question was found in the file.')
  parts.push(
    result.textDiffers.length
      ? `Question text differs from the institute copy on ${list(result.textDiffers)} — check against the original.`
      : 'Question text matches the institute copy.',
  )
  if (result.noAnswer?.length) parts.push(`Still no answer: ${list(result.noAnswer)}.`)
  if (info.pictures && (info.pictures.kept || info.pictures.failed)) {
    parts.push(
      `${info.pictures.kept} solution picture(s) kept on this computer${info.pictures.failed ? `, ${info.pictures.failed} could not be kept` : ''}.`,
    )
  }
  if (info.pdfStored === false) parts.push('The PDF itself could not be stored (is Hybrid AI on port 8000 running?).')
  return parts.join(' ')
}

/**
 * Store the institute PDF on the helper, beside the original paper.
 * @param {string} paperId @param {File | Blob} file @param {string} institute
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function storeInstitutePdf(paperId, file, institute) {
  const form = new FormData()
  form.append('file', file, /** @type {File} */ (file).name || 'institute.pdf')
  form.append('institute', cleanInstituteName(institute))
  try {
    const res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/institute`, { method: 'POST', body: form })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    return { ok: false, error: String(data?.detail?.message || `Could not store the institute PDF (${res.status}).`) }
  } catch {
    return { ok: false, error: 'Hybrid AI (port 8000) is not running.' }
  }
}

/**
 * Local copies of the pictures in the institute solutions: cut from the stored institute PDF,
 * or downloaded while the Mathpix links still load.
 * @param {string} paperId @param {string[]} links @param {{ pdfStored?: boolean }} [opts]
 */
export async function keepInstitutePicturesLocal(paperId, links, opts = {}) {
  let kept = 0
  /** @type {string[]} */
  let left = [...new Set(links)]
  if (opts.pdfStored && left.length) {
    /** @type {string[]} */
    const skipped = []
    for (let i = 0; i < left.length; i += LINKS_PER_REQUEST) {
      const part = left.slice(i, i + LINKS_PER_REQUEST)
      try {
        const res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/institute/mathpix-crops`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: part }),
        })
        const data = res.ok ? await res.json().catch(() => null) : null
        if (!data) {
          skipped.push(...part)
          continue
        }
        kept += Object.keys(data.crops ?? {}).length
        skipped.push(...(Array.isArray(data.skipped) ? data.skipped : []))
      } catch {
        skipped.push(...part)
      }
    }
    left = skipped
  }
  if (!left.length) return { kept, failed: 0 }
  const downloaded = await keepMathpixPicturesLocal(left)
  return { kept: kept + downloaded.saved + downloaded.kept, failed: downloaded.ok ? downloaded.failed : left.length }
}

/**
 * Read an institute PDF: Mathpix for maths clarity, plus the PDF's own text when the file is
 * digital (FIITJEE / Allen print PDFs). The scan that yields more answers is used, so a thin
 * Mathpix read of a long solutions booklet does not drop most questions.
 * @param {File} file @param {string} institute @param {(pct: number) => void} [onProgress]
 */
export async function readInstituteSolutionsFileText(file, institute, onProgress) {
  const name = cleanInstituteName(institute)
  const isPdf = /\.pdf$/i.test(file?.name || '') || file?.type === 'application/pdf'
  /** @type {string} */
  let pdfText = ''
  /** @type {string} */
  let mathpixText = ''
  if (isPdf) {
    try {
      onProgress?.(4)
      const { extractTextFromPdf } = await import('./extractDocument.js')
      pdfText = await extractTextFromPdf(file, (p) => onProgress?.(Math.min(35, 4 + Math.round(Number(p) * 0.3))), undefined, {
        textLayerOnly: true,
        maxPages: 120,
      })
    } catch {
      pdfText = ''
    }
  }
  try {
    const { readAnswerFileText } = await import('./officialPyqAnswerFile.js')
    mathpixText = await readAnswerFileText(file, (p) => onProgress?.(Math.min(92, 40 + Math.round(Number(p) * 0.5))))
  } catch (e) {
    if (!String(pdfText).trim()) throw e
    mathpixText = ''
  }
  const picked = pickInstituteSolutionsText(mathpixText, pdfText, { institute: name })
  onProgress?.(95)
  return picked
}

/**
 * Whole upload: store the PDF, read it (Mathpix and/or the PDF text), cut its pictures, then put
 * it on the paper. Pictures are cut before the cards are saved, so a background sweep never cuts
 * them from the original.
 * @param {string} paperId @param {File} file @param {string} institute @param {(pct: number) => void} [onProgress]
 */
export async function addInstituteSolutionsToOfficialPyqPaper(paperId, file, institute, onProgress) {
  const name = cleanInstituteName(institute)
  if (!name) return { ok: false, error: 'Type the institute name first (for example Allen or Resonance).' }
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status === 'published' || paper.status === 'rejected' || isOtherPaper(paper)) {
    return applyInstituteSolutionsToOfficialPyqPaper(paperId, '', { institute: name })
  }
  const stored = await storeInstitutePdf(paperId, file, name)
  const picked = await readInstituteSolutionsFileText(file, name, onProgress)
  const text = picked.text
  const read = picked.read || readInstituteSolutions(text, { institute: name })
  const links = read ? mathpixPictureLinksIn([...read.entries.values()].map((e) => [e.solution, e.question])) : []
  const pictures = links.length ? await keepInstitutePicturesLocal(paperId, links, { pdfStored: stored.ok }) : { kept: 0, failed: 0 }
  const result = applyInstituteSolutionsToOfficialPyqPaper(paperId, text, { institute: name, fileName: file.name, pdfStored: stored.ok })
  if (!result.ok) return result
  return {
    ...result,
    pictures,
    pdfStored: stored.ok,
    textSource: picked.source,
    note: instituteResultNote(result, { institute: name, fileName: file.name, pictures, pdfStored: stored.ok, textSource: picked.source }),
  }
}
