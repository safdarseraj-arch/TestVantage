/**
 * A coaching institute's solutions PDF (Allen, Resonance, FIITJEE…) added to an Official PYQ paper.
 * Read with Mathpix like an answer file; the PDF is kept on the helper beside the original.
 * - The official key wins: an answer printed on the paper, typed by an admin, or edited by hand is
 *   never changed. A different institute answer is noted on the card for the Quality check.
 * - A card with no answer (or only an AI one) takes the institute answer.
 * - On upload, every usable institute solution is kept (Mathpix first; PDF text salvaged when
 *   readable). Hybrid AI / draft solutions are replaced. Unreadable PDF-font junk is skipped.
 * - Each stem is checked against the institute's copy of the question (no Gemini).
 * Students see these answers and solutions like any other.
 */
import { endKeyAnswerFields } from './printedEndSolutions.js'
import {
  INSTITUTE_NOTE_FIELDS,
  cleanInstituteSolutionBody,
  instituteAnswerAgrees,
  instituteAnswerText,
  instituteSolutionDisplayScore,
  instituteSolutionIsUsable,
  instituteSolutionLooksLikeRawPdf,
  instituteSolutionLooksPoorForStudents,
  instituteTextDifference,
  pdfTextIsMathFontJunk,
  pickInstituteSolutionsText,
  readInstituteSolutions,
  salvageInstituteSolutionBody,
} from './instituteSolutionsParse.js'
import { officialPyqStoredOcrTextLocal } from './officialPyqLocalReparse.js'
import { cleanMathpixCardText, preCleanMathpixOcr } from './mathpixCleanPipeline.js'
import { wrapBareLatexRuns } from './wrapBareLatexRuns.js'
import {
  instituteOptionOrder,
  instituteOptionsOf,
  mapInstituteAnswerLetters,
  matchInstituteEntries,
} from './instituteSolutionsMatch.js'
import {
  officialPyqCardAnswerIsKept,
  saveOfficialPyqPaperSource,
} from './officialPyqPendingFill.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPaper,
  isOtherPaper,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import {
  isOfficialPyqPlaceholder,
  listOfficialPyqMissingSlots,
  mergeOfficialPyqQuestionsBySlot,
  officialPyqSlotNumber,
} from './officialPyqMissingSlots.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { solutionIsOnlyPrintedKeyLine } from './printedAnswerKey.js'
import { keepMathpixPicturesLocal, mathpixPictureLinksIn } from './mathpixLocalPictures.js'
import { isOriginalCropUrl, ORIGINAL_CROP_URL_PREFIX } from './mathpixMedia.js'

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

const SOLUTION_FIGURE_RE =
  /\\includegraphics|!\[[^\]]*\]\(|\/api\/official-pyq\/original\/crops\/|cdn\.mathpix\.com/i

/** @param {unknown} name */
export function cleanInstituteName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** True when the solution already shows a picture (Mathpix or a local crop). */
export function instituteSolutionHasFigure(text) {
  return SOLUTION_FIGURE_RE.test(String(text ?? ''))
}

/**
 * Put a local crop URL into a solution that Mathpix left without a drawing.
 * Prefers the empty `$ $ $$` hole FIITJEE leaves where the figure was; otherwise after the
 * first display block, otherwise at the end.
 * @param {unknown} solution @param {string} url
 */
export function injectInstituteSolutionFigure(solution, url) {
  const src = String(url ?? '').trim()
  if (!src || (!isOriginalCropUrl(src) && !src.startsWith(ORIGINAL_CROP_URL_PREFIX) && !/^https?:\/\//i.test(src))) {
    return String(solution ?? '')
  }
  let s = String(solution ?? '')
  if (!s.trim() || instituteSolutionHasFigure(s)) return s
  const fig = `\\includegraphics{${src}}`
  // FIITJEE/Mathpix leave `$ $ $ $$…` (empty dollars then a real display) where the drawing was.
  const withHole = s.replace(/(?:\$\s+){2,}(?=\$\$)/, `\n\n${fig}\n\n`)
  if (withHole !== s) return withHole.trim()
  const display = s.match(/\$\$[\s\S]*?\$\$/)
  if (display && display.index != null) {
    const at = display.index + display[0].length
    return `${s.slice(0, at).trim()}\n\n${fig}\n\n${s.slice(at).trim()}`.trim()
  }
  return `${s.trim()}\n\n${fig}`
}

/**
 * Match crop metadata from the helper to a card (subject + printed number).
 * @param {any} q
 * @param {{ number?: number, subject?: string | null, url?: string }} fig
 */
function figureMatchesCard(q, fig) {
  const n = Number(fig?.number)
  const printed = Number(q?.printedNumber ?? q?.questionNumber)
  if (!n || printed !== n) return false
  const want = String(fig?.subject ?? '')
    .trim()
    .toLowerCase()
  if (!want) return true
  const have = String(q?.subject ?? '')
    .trim()
    .toLowerCase()
  return !have || have === want || have.startsWith(want) || want.startsWith(have)
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
  if (!current || solutionIsOnlyPrintedKeyLine(current)) return true
  // Official paper solution stays; PDF-font junk may still be upgraded by Mathpix.
  if (String(q?.solutionSource ?? '') === 'from_paper' && !instituteSolutionLooksLikeRawPdf(current)) return false
  if (instituteSolutionLooksLikeRawPdf(current)) return true
  return REPLACEABLE_SOLUTION_SOURCES.has(String(q?.solutionSource ?? ''))
}

/**
 * Clear institute / draft solutions that still look like font junk or broken OCR so Hybrid AI
 * can write proper ones. Good Mathpix institute solutions are kept.
 * @param {string} paperId
 * @returns {{ ok: boolean, cleared: number, kept: number, error?: string }}
 */
export function clearPoorInstituteSolutionsForHybrid(paperId) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, cleared: 0, kept: 0, error: 'Paper not found.' }
  if (paper.status === 'published') {
    return { ok: false, cleared: 0, kept: 0, error: 'Unpublish first, then clear poor institute solutions.' }
  }
  let cleared = 0
  let kept = 0
  const questions = (Array.isArray(paper.questions) ? paper.questions : []).map((q) => {
    if (takesNothing(q)) return q
    const src = String(q?.solutionSource ?? '')
    const sol = String(q?.solution ?? '').trim()
    if (!sol) return q
    if (src !== 'institute' && src !== 'draft' && src !== 'ai_generated') {
      kept += 1
      return q
    }
    if (!instituteSolutionLooksPoorForStudents(sol)) {
      kept += 1
      return q
    }
    cleared += 1
    const next = { ...q, solution: '' }
    delete next.solutionSource
    delete next.solutionInstitute
    return next
  })
  if (!cleared) return { ok: true, cleared: 0, kept }
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    allowPublishedQuestionWrite: paper.status === 'approved',
  })
  if (!saved) return { ok: false, cleared: 0, kept, error: 'Could not save.' }
  return { ok: true, cleared, kept }
}

/** Mathpix-style clean so students see drawn maths, not raw commands (same idea as Official PYQ stems). */
function prepareInstituteSolutionForStore(raw) {
  // Prefer salvaged readable wording over clearing — maximize institute solutions on upload.
  const salvaged = salvageInstituteSolutionBody(raw)
  const cleaned = salvaged || cleanInstituteSolutionBody(raw)
  if (!cleaned) return ''
  if (instituteSolutionLooksLikeRawPdf(cleaned)) return ''
  try {
    const pre = preCleanMathpixOcr(cleaned)
    const formatted = cleanMathpixCardText(pre).trim() || pre.trim() || cleaned
    return wrapBareLatexRuns(formatted).trim() || formatted
  } catch {
    return cleaned
  }
}

/**
 * Put an institute solutions file on a Pending or Approved Official PYQ paper.
 * @param {string} paperId
 * @param {string} text Mathpix text of the institute file
 * @param {{ institute: string, fileName?: string, pdfStored?: boolean, read?: ReturnType<typeof readInstituteSolutions> }} opts
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
  const read =
    opts?.read?.entries?.size > 0 ? opts.read : readInstituteSolutions(text, { institute })
  if (!read?.entries?.size) {
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
      // True unsure (no number agreement): do not fill a blank / Hybrid AI card — only upgrade
      // unreadable PDF-font junk. Number-agreed fuzzy wording is promoted in the matcher instead.
      const upgrade = prepareInstituteSolutionForStore(guess.entry?.solution)
      const current = String(q.solution ?? '').trim()
      if (
        upgrade &&
        instituteSolutionIsUsable(upgrade) &&
        instituteSolutionLooksLikeRawPdf(current) &&
        instituteSolutionDisplayScore(upgrade) > instituteSolutionDisplayScore(current) + 4
      ) {
        next.solution = upgrade
        next.solutionSource = 'institute'
        next.solutionInstitute = institute
        solutions += 1
      } else if (instituteSolutionLooksLikeRawPdf(current) && !instituteSolutionIsUsable(current)) {
        next.solution = ''
        delete next.solutionSource
        delete next.solutionInstitute
      }
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
    let answerDisagrees = false
    if (fields && hasOfficialAnswer(q)) {
      if (!instituteAnswerAgrees(q, fields)) {
        answerDisagrees = true
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
    // Options that do not line up block the letter answer only — the worked solution is still useful.
    const blockSolution =
      answerDisagrees || (shuffled && NAMES_OPTION_RE.test(String(entry.solution || '')))
    if (entry.solution && !blockSolution) {
      const solution = prepareInstituteSolutionForStore(entry.solution)
      const current = String(q.solution ?? '').trim()
      const fromPaper =
        String(q.solutionSource ?? '') === 'from_paper' &&
        !instituteSolutionLooksLikeRawPdf(current) &&
        instituteSolutionIsUsable(current)
      // On institute upload: keep every usable institute solution (replace Hybrid AI / junk).
      const better =
        solution &&
        instituteSolutionIsUsable(solution) &&
        !fromPaper &&
        (solutionIsReplaceable(q) ||
          !current ||
          instituteSolutionLooksLikeRawPdf(current) ||
          instituteSolutionDisplayScore(solution) > instituteSolutionDisplayScore(current) + 2)
      if (better) {
        if (current !== solution || q.solutionSource !== 'institute') solutions += 1
        next.solution = solution
        next.solutionSource = 'institute'
        next.solutionInstitute = institute
      } else if (
        instituteSolutionLooksLikeRawPdf(current) &&
        !instituteSolutionIsUsable(current) &&
        !fromPaper
      ) {
        // Drop unreadable PDF-font junk only — never wipe a usable Hybrid AI fill here.
        next.solution = ''
        delete next.solutionSource
        delete next.solutionInstitute
      }
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
  // Keep every card on the paper's own name (Hybrid AI must not leave mixed Paper 1 / Paper 2).
  if (saved.status === 'approved' || saved.status === 'pending_review') {
    saveOfficialPyqPaperSource(saved.id)
  }
  const latest = getOfficialPyqPendingPaper(saved.id) || saved
  return { ok: true, paper: latest, answers, solutions, disagreements, notFound, textDiffers, noAnswer, layout: read.layout, ...counts }
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
  if (info.textSource === 'merged') {
    parts.push('Mathpix maths and the PDF’s own text were combined (drawn maths preferred; PDF filled gaps).')
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
 * Cut vector solution diagrams from the stored institute PDF (when Mathpix omitted pictures).
 * @param {string} paperId
 * @returns {Promise<{ ok: true, figures: Array<{ number: number, subject?: string, url: string }>, count: number } | { ok: false, error: string, figures: [], count: 0 }>}
 */
export async function fetchInstituteSolutionFigures(paperId) {
  try {
    const res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/institute/solution-figures`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error: String(data?.detail?.message || `Could not cut solution figures (${res.status}).`),
        figures: [],
        count: 0,
      }
    }
    const figures = Array.isArray(data?.figures) ? data.figures : []
    return { ok: true, figures, count: Number(data?.count) || figures.length }
  } catch {
    return { ok: false, error: 'Hybrid AI (port 8000) is not running.', figures: [], count: 0 }
  }
}

/**
 * Put recovered institute PDF diagrams onto institute solutions that still have no picture.
 * @param {string} paperId
 * @param {Array<{ number?: number, subject?: string | null, url?: string }>} [figures]
 */
export async function applyInstituteSolutionFiguresToPaper(paperId, figures) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.', added: 0 }
  if (paper.status === 'published' || paper.status === 'rejected' || isOtherPaper(paper)) {
    return { ok: false, error: 'Institute solution figures are for Pending or Approved papers.', added: 0 }
  }
  let list = Array.isArray(figures) ? figures : []
  if (!list.length) {
    const fetched = await fetchInstituteSolutionFigures(paperId)
    if (!fetched.ok) return { ok: false, error: fetched.error, added: 0 }
    list = fetched.figures
  }
  if (!list.length) return { ok: true, paper, added: 0 }
  let added = 0
  const questions = (Array.isArray(paper.questions) ? paper.questions : []).map((q) => {
    if (takesNothing(q) || String(q?.solutionSource ?? '') !== 'institute') return q
    if (instituteSolutionHasFigure(q?.solution)) return q
    const fig = list.find((f) => figureMatchesCard(q, f) && String(f?.url ?? '').trim())
    if (!fig) return q
    const nextSol = injectInstituteSolutionFigure(q.solution, String(fig.url))
    if (nextSol === String(q.solution ?? '')) return q
    added += 1
    return { ...q, solution: nextSol }
  })
  if (!added) return { ok: true, paper, added: 0 }
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    allowPublishedQuestionWrite: paper.status === 'approved',
  })
  if (!saved) return { ok: false, error: 'Could not save the solution figures.', added: 0 }
  return { ok: true, paper: getOfficialPyqPendingPaper(saved.id) || saved, added }
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
/**
 * Prefer the helper's PyMuPDF text of a stored institute PDF (browser PDF.js often drops FIITJEE pages).
 * @param {string} paperId
 */
export async function fetchStoredInstitutePdfText(paperId) {
  try {
    const res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/institute/text`)
    if (!res.ok) return ''
    const data = await res.json().catch(() => null)
    return String(data?.text ?? '').trim()
  } catch {
    return ''
  }
}

export async function readInstituteSolutionsFileText(file, institute, onProgress, opts = {}) {
  const name = cleanInstituteName(institute)
  const isPdf = /\.pdf$/i.test(file?.name || '') || file?.type === 'application/pdf'
  /** @type {string} */
  let pdfText = ''
  /** @type {string} */
  let mathpixText = ''
  const paperId = String(opts?.paperId || '').trim()
  if (paperId) {
    onProgress?.(3)
    pdfText = await fetchStoredInstitutePdfText(paperId)
  }
  if (isPdf && !String(pdfText).trim()) {
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
  } else if (String(pdfText).trim()) {
    onProgress?.(35)
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
/**
 * Re-read the institute PDF already stored on the helper (Mathpix + PyMuPDF text), then apply.
 * Used after Quality finds raw PDF-font solutions, and from “Add institute solutions”.
 * @param {string} paperId @param {string} [institute] @param {(pct: number) => void} [onProgress]
 */
/**
 * JEE Main subject from printed number (1–30 Math, 31–60 Physics, 61–90 Chemistry).
 * @param {number} n
 */
function jeeMainSubjectForNumber(n) {
  if (n >= 1 && n <= 30) return 'mathematics'
  if (n >= 31 && n <= 60) return 'physics'
  if (n >= 61 && n <= 90) return 'chemistry'
  return ''
}

/** JEE Main Section-B numerical slots. @param {number} n */
function jeeMainIsNumerical(n) {
  return (n >= 21 && n <= 30) || (n >= 51 && n <= 60) || (n >= 81 && n <= 90)
}

/**
 * Stem without the leading number and without the option block / trailing chrome.
 * Assertion (A) / Reason (R) / Statement (I)/(II) stay in one flowing paragraph (no forced
 * line breaks before each label — that looked like an alignment bug in review).
 * @param {unknown} questionText @param {string[] | null} options
 */
function instituteStemOnlyText(questionText, options) {
  let text = String(questionText ?? '')
    .replace(/^\*{0,2}\s*\d{1,3}\s*[.):\-]?\s*/, '')
    .trim()
  // Cut option blocks even when peel failed — still drop bare "Options." / (1)–(4) / itemize tails.
  let cutAt = -1
  const cutCandidates = [
    text.search(/\\begin\{(?:itemize|enumerate)\}/i),
    text.search(/(?:^|\n)[ \t]*\\item\s*\[\s*\(\s*[1-4A-D]\s*\)\s*\]/i),
    text.search(/\n[ \t]*Options\.?[ \t]*(?=\n|$)/i),
  ]
  if (options?.length) {
    // Cut at line-start MCQ "(1)" / "(A) …" — never at mid-line "Assertion (A):".
    for (const m of text.matchAll(/(?:^|\n)[ \t]*\(\s*([1-4A-D])\s*\)[ \t]*/gi)) {
      if (m.index == null) continue
      const before = text.slice(Math.max(0, m.index - 28), m.index)
      if (/Assertion\s*$/i.test(before) || /Reason\s*$/i.test(before) || /Statement\s*$/i.test(before)) {
        continue
      }
      cutCandidates.push(m.index)
      break
    }
  }
  for (const at of cutCandidates) {
    if (at >= 0) cutAt = cutAt < 0 ? at : Math.min(cutAt, at)
  }
  if (cutAt >= 0) text = text.slice(0, cutAt).trim()
  text = text
    .replace(/\\end\{(?:itemize|enumerate)\}/gi, ' ')
    .replace(/\\begin\{(?:itemize|enumerate)\}/gi, ' ')
    .replace(/(?:\n|^)[ \t]*Options\.?[ \t]*$/i, '')
    .trim()
  // One flowing stem: "… Reason (R). Assertion (A): … Reason (R): … In the light…"
  text = text
    .replace(/\n+[ \t]*(Assertion\s*\(\s*A\s*\)\s*:)/gi, ' $1')
    .replace(/\n+[ \t]*(Reason\s*\(\s*R\s*\)\s*:)/gi, ' $1')
    .replace(/\n+[ \t]*(Statement\s*\(\s*[IVX]+\s*\)\s*:)/gi, ' $1')
    .replace(/\n+[ \t]*(In the light of the above statements)/gi, ' $1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return text
}

/**
 * True when OCR looks like an institute solutions booklet (dense Ans./Sol.), not a bare paper.
 * Used to auto-rebuild after a mistaken “paper” upload of FIITJEE / Allen / Resonance booklets.
 * @param {unknown} ocr
 */
export function ocrLooksLikeInstituteSolutionsBooklet(ocr) {
  const s = String(ocr ?? '')
  if (s.length < 400) return false
  const ans = (s.match(/\bAns\.?\b/gi) || []).length
  const sol = (s.match(/\bSol(?:ution)?\.?\b/gi) || []).length
  return ans >= 20 && sol >= 15
}

/**
 * If a pending paper has too few cards but stored OCR is clearly an institute solutions booklet,
 * rebuild questions from Ans./Sol. blocks. Safe no-op when OCR is a normal paper.
 * @param {string} paperId
 * @param {{ institute?: string, minCount?: number }} [opts]
 * @returns {{ ok: boolean, rebuilt: boolean, paper?: any, built?: number, withSol?: number, withAns?: number, error?: string }}
 */
/**
 * When the paper original is the solutions booklet, cut Sol. Mathpix pictures from that PDF
 * so students still see the drawings after CDN links die.
 * @param {string} paperId
 */
export async function keepBookletSolutionPicturesLocal(paperId) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, saved: 0, error: 'Paper not found.' }
  const { mathpixPictureLinksIn, saveLocalCopiesOfMathpixPictures, keepMathpixPicturesLocal } = await import(
    './mathpixLocalPictures.js'
  )
  const links = mathpixPictureLinksIn(
    (Array.isArray(paper.questions) ? paper.questions : []).map((q) =>
      String(q?.solutionSource ?? '') === 'institute' ? q?.solution : '',
    ),
  )
  if (!links.length) return { ok: true, saved: 0 }
  const fromPdf = await saveLocalCopiesOfMathpixPictures(paperId, links)
  if (fromPdf.ok) return { ok: true, saved: fromPdf.saved, skipped: fromPdf.skipped }
  const downloaded = await keepMathpixPicturesLocal(links)
  return {
    ok: downloaded.ok,
    saved: downloaded.saved || 0,
    failed: downloaded.failed || 0,
    error: downloaded.error || fromPdf.error,
  }
}

export function maybeRebuildPendingFromSolutionsOcr(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, rebuilt: false, error: 'Paper not found.' }
  const count = Array.isArray(paper.questions) ? paper.questions.length : 0
  const min =
    opts.minCount != null
      ? Number(opts.minCount)
      : paper.exam === 'jee-main'
        ? 70
        : paper.exam === 'jee-advanced'
          ? 40
          : 40
  if (count >= min) return { ok: true, rebuilt: false, paper }
  const bookletOcr = officialPyqStoredOcrTextLocal(paper) || String(paper.preparedText || '')
  if (!ocrLooksLikeInstituteSolutionsBooklet(bookletOcr)) {
    return { ok: true, rebuilt: false, paper }
  }
  const result = rebuildOfficialPyqFromInstituteSolutionsOcr(paperId, {
    institute: opts.institute || paper.instituteSolutions?.institute || 'Institute',
    ocrText: bookletOcr,
  })
  if (!result.ok) return { ok: false, rebuilt: false, paper, error: result.error }
  return {
    ok: true,
    rebuilt: true,
    paper: result.paper,
    built: result.built,
    withSol: result.withSol,
    withAns: result.withAns,
  }
}

/** @param {any} entry @param {number} n @param {any} paper @param {string} key */
function cardFromInstituteEntry(entry, n, paper, key = '') {
  const numerical = paper.exam === 'jee-main' ? jeeMainIsNumerical(n) : false
  const rawOptions = numerical ? [] : instituteOptionsOf(entry.question) || []
  const options = rawOptions.map((o) =>
    String(o ?? '')
      .replace(/\\end\{(?:itemize|enumerate)\}\s*$/i, '')
      .replace(/\\begin\{(?:itemize|enumerate)\}\s*$/i, '')
      .trim(),
  )
  const filledOpts = options.filter(Boolean).length
  const text = instituteStemOnlyText(entry.question, options)
  if (!String(text).trim()) return null
  const subject =
    (String(key).includes(':') && !key.startsWith('#') ? key.slice(0, key.lastIndexOf(':')) : '') ||
    (paper.exam === 'jee-main' ? jeeMainSubjectForNumber(n) : '')
  /** @type {any} */
  const card = {
    id: `${paper.id}-q${n}`,
    pyqSlot: n,
    printedNumber: n,
    questionNumber: n,
    text,
    subject: subject || undefined,
    subjectSource: subject ? 'institute_ocr' : undefined,
    questionType: numerical ? 'numerical' : filledOpts >= 2 ? 'single_correct' : 'numerical',
    typeSource: 'institute_ocr',
    options: filledOpts >= 2 ? options : undefined,
    officialPyq: true,
    bankSource: 'official_pyq',
  }
  const ans = String(entry.answer || '').trim()
  if (ans) {
    const fields = endKeyAnswerFields(ans, card)
    if (fields) {
      Object.assign(card, fields)
      card.answerSource = 'institute'
      card.answerInstitute = ans
    }
  }
  const solution = prepareInstituteSolutionForStore(entry.solution)
  if (solution) {
    card.solution = solution
    card.solutionSource = 'institute'
    card.solutionInstitute = solution
  }
  return card
}

/**
 * Fill only the missing printed numbers (e.g. 89 of 90 after a FIITJEE rebuild dropped one).
 * Uses stored OCR first; if that still misses slots, the caller can pass PDF text as `ocrText`.
 * @param {string} paperId
 * @param {{ institute?: string, ocrText?: string }} [opts]
 */
export function healMissingOfficialPyqSlotsFromSolutionsOcr(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, added: 0, error: 'Paper not found.' }
  if (paper.status === 'published') {
    return { ok: false, added: 0, error: 'Unpublish first, then heal missing questions.' }
  }
  const expected =
    paper.exam === 'jee-main'
      ? Math.max(Number(paper.expectedQuestionCount) || 0, Number(paper.adminFacts?.totalQuestions) || 0, 90)
      : Number(paper.expectedQuestionCount) || Number(paper.adminFacts?.totalQuestions) || 0
  if (expected < 8) return { ok: true, added: 0, missing: [], paper }
  const questions = Array.isArray(paper.questions) ? paper.questions : []
  const missing = listOfficialPyqMissingSlots(questions, expected)
  if (!missing.length) return { ok: true, added: 0, missing: [], paper }

  const ocr = String(
    opts.ocrText ||
      officialPyqStoredOcrTextLocal(paper) ||
      getOfficialPyqPendingOcrText(paperId) ||
      paper.preparedText ||
      '',
  ).trim()
  if (ocr.length < 400) {
    return { ok: false, added: 0, missing, error: 'No OCR / PDF text available to fill the missing question(s).' }
  }
  // Never heal stems from FIITJEE private-use PDF soup — that creates garbage cards.
  if (opts.ocrText && pdfTextIsMathFontJunk(ocr)) {
    return {
      ok: false,
      added: 0,
      missing,
      error: 'Original PDF text layer is unreadable maths fonts — use Mathpix OCR instead.',
    }
  }
  const name = cleanInstituteName(opts.institute || paper.instituteSolutions?.institute || 'FIITJEE')
  const read = readInstituteSolutions(ocr, { institute: name })
  if (!read?.entries?.size) {
    return { ok: false, added: 0, missing, error: 'Could not parse question / Ans. / Sol. blocks from the text.' }
  }

  /** @type {any[]} */
  const incoming = []
  for (const [key, entry] of read.entries.entries()) {
    const n = Number(String(key).split(':').pop())
    if (!missing.includes(n)) continue
    const card = cardFromInstituteEntry(entry, n, paper, key)
    if (card) incoming.push(card)
  }
  if (!incoming.length) {
    return {
      ok: false,
      added: 0,
      missing,
      error: `Still missing question(s) ${missing.join(', ')} in the solutions text.`,
    }
  }
  const merged = mergeOfficialPyqQuestionsBySlot(questions, incoming, expected).filter(
    (q) => !isOfficialPyqPlaceholder(q) || String(q?.text ?? '').trim(),
  )
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions: merged,
    expectedQuestionCount: expected,
    allowPublishedQuestionWrite: paper.status === 'approved',
    notes: [
      String(paper.notes || '').trim(),
      `Healed missing question(s) ${incoming.map((q) => officialPyqSlotNumber(q)).join(', ')} from solutions text (${name}).`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  })
  if (!saved) return { ok: false, added: 0, missing, error: 'Could not save the healed paper.' }
  return {
    ok: true,
    added: incoming.length,
    missing: listOfficialPyqMissingSlots(saved.questions, expected),
    paper: saved,
  }
}

/**
 * Heal missing slots using stored OCR, or the original PDF text layer when OCR is thin.
 * @param {string} paperId
 * @param {{ institute?: string }} [opts]
 */
export async function healMissingOfficialPyqSlots(paperId, opts = {}) {
  const first = healMissingOfficialPyqSlotsFromSolutionsOcr(paperId, opts)
  if (first.ok && first.added > 0 && !(first.missing || []).length) return first
  if (first.ok && !(first.missing || []).length) return first

  let pdfText = ''
  try {
    const res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/text`)
    if (res.ok) {
      const body = await res.json()
      pdfText = String(body?.text || '').trim()
    }
  } catch {
    /* helper may be down */
  }
  if (pdfText.length < 400) {
    return first.ok ? first : { ...first, error: first.error || 'Original PDF text was not available.' }
  }
  if (pdfTextIsMathFontJunk(pdfText)) {
    return first.ok
      ? first
      : {
          ...first,
          error:
            first.error ||
            'Original PDF text layer is unreadable maths fonts — keep Mathpix OCR; do not heal from PDF text.',
        }
  }
  return healMissingOfficialPyqSlotsFromSolutionsOcr(paperId, { ...opts, ocrText: pdfText })
}

/**
 * Rebuild a broken Official PYQ paper from stored OCR that is really an institute solutions
 * booklet (e.g. FIITJEE JEE Main with Ans./Sol. for all 90). Used when the paper upload was the
 * solutions PDF and the normal Mathpix split only made a handful of cards.
 * @param {string} paperId
 * @param {{ institute?: string, ocrText?: string }} [opts]
 * @returns {{ ok: boolean, built?: number, withSol?: number, withAns?: number, error?: string, paper?: any }}
 */
export function rebuildOfficialPyqFromInstituteSolutionsOcr(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status === 'published') {
    return { ok: false, error: 'Unpublish first, then rebuild from the institute solutions OCR.' }
  }
  const preferred = String(
    opts.ocrText || officialPyqStoredOcrTextLocal(paper) || paper.preparedText || '',
  ).trim()
  const ocr = preferred
  if (ocr.length < 400) return { ok: false, error: 'This paper has no stored OCR to rebuild from.' }
  if (pdfTextIsMathFontJunk(ocr) && !/\$|\\frac/.test(ocr.slice(0, 12000))) {
    return {
      ok: false,
      error:
        'Stored OCR looks like PDF maths-font junk. Re-read with Mathpix (vision OCR in notes), then rebuild.',
    }
  }
  const name = cleanInstituteName(opts.institute || paper.instituteSolutions?.institute || 'FIITJEE')
  const read = readInstituteSolutions(ocr, { institute: name })
  if (!read?.entries?.size) {
    return { ok: false, error: 'Could not find institute question / Ans. / Sol. blocks in the stored OCR.' }
  }
  /** @type {any[]} */
  const questions = []
  let withSol = 0
  let withAns = 0
  const sorted = [...read.entries.entries()].sort((a, b) => {
    const na = Number(String(a[0]).split(':').pop())
    const nb = Number(String(b[0]).split(':').pop())
    return na - nb
  })
  for (const [key, entry] of sorted) {
    const n = Number(String(key).split(':').pop())
    if (!Number.isFinite(n) || n < 1) continue
    const numerical = paper.exam === 'jee-main' ? jeeMainIsNumerical(n) : false
    const rawOptions = numerical ? [] : instituteOptionsOf(entry.question) || []
    // Keep empty slots so Ans. (2) still maps when Mathpix skipped option (1).
    const options = rawOptions.map((o) =>
      String(o ?? '')
        .replace(/\\end\{(?:itemize|enumerate)\}\s*$/i, '')
        .replace(/\\begin\{(?:itemize|enumerate)\}\s*$/i, '')
        .trim(),
    )
    const filledOpts = options.filter(Boolean).length
    const text = instituteStemOnlyText(entry.question, options)
    if (!String(text).trim()) continue
    const subject =
      (String(key).includes(':') && !key.startsWith('#') ? key.slice(0, key.lastIndexOf(':')) : '') ||
      (paper.exam === 'jee-main' ? jeeMainSubjectForNumber(n) : '')
    /** @type {any} */
    const card = {
      id: `${paper.id}-q${n}`,
      pyqSlot: n,
      printedNumber: n,
      questionNumber: n,
      text,
      subject: subject || undefined,
      subjectSource: subject ? 'institute_ocr' : undefined,
      questionType: numerical ? 'numerical' : filledOpts >= 2 ? 'single_correct' : 'numerical',
      typeSource: 'institute_ocr',
      options: filledOpts >= 2 ? options : undefined,
      officialPyq: true,
      bankSource: 'official_pyq',
    }
    const ans = String(entry.answer || '').trim()
    if (ans) {
      const fields = endKeyAnswerFields(ans, card)
      if (fields) {
        Object.assign(card, fields)
        card.answerSource = 'institute'
        card.answerInstitute = ans
        withAns += 1
      }
    }
    const solution = prepareInstituteSolutionForStore(entry.solution)
    if (solution) {
      card.solution = solution
      card.solutionSource = 'institute'
      card.solutionInstitute = solution
      withSol += 1
    }
    questions.push(card)
  }
  if (questions.length < 8) {
    return {
      ok: false,
      error: `Rebuild found only ${questions.length} usable question(s) — need a clearer institute solutions OCR.`,
      built: questions.length,
    }
  }
  const expected =
    paper.exam === 'jee-main'
      ? Math.max(Number(paper.expectedQuestionCount) || 0, 90)
      : Number(paper.expectedQuestionCount) || questions.length
  const releaseAdminEditIndexes = (Array.isArray(paper.questions) ? paper.questions : []).map((_, i) => i)
  // Keep preparedText aligned with the Mathpix OCR we rebuilt from (never leave PDF font junk).
  const restorePrepared =
    ocr.length >= 400 &&
    (pdfTextIsMathFontJunk(String(paper.preparedText || '')) ||
      String(paper.preparedText || '').trim() !== ocr)
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    expectedQuestionCount: expected,
    allowPublishedQuestionWrite: paper.status === 'approved',
    allowEmptyQuestions: false,
    ...(restorePrepared ? { preparedText: ocr } : {}),
    // Drop prior hand-edit locks — this rebuild replaces the whole card set from OCR.
    releaseAdminEditIndexes,
    instituteSolutions: {
      ...(paper.instituteSolutions && typeof paper.instituteSolutions === 'object' ? paper.instituteSolutions : {}),
      institute: name,
      appliedAt: Date.now(),
      rebuiltFromOcr: true,
      answers: withAns,
      solutions: withSol,
    },
    notes: [
      String(paper.notes || '')
        .replace(/\n*Extract summary:[^\n]*/gi, '')
        .trim(),
      `Extract summary: Rebuilt ${questions.length} questions from institute solutions OCR (${name}) · ${withAns} answers · ${withSol} solutions`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  })
  if (!saved) return { ok: false, error: 'Could not save the rebuilt paper.' }
  return { ok: true, built: questions.length, withAns, withSol, paper: saved }
}

/**
 * When preparedText was overwritten with PDF font junk but notes still hold Mathpix vision OCR,
 * restore preparedText and rebuild institute booklet cards (fixes Shift-2 garbage stems).
 * @param {string} paperId
 * @param {{ institute?: string }} [opts]
 */
export function repairOfficialPyqBookletFromMathpixNotes(paperId, opts = {}) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, repaired: false, error: 'Paper not found.' }
  if (paper.status === 'published') return { ok: true, repaired: false, paper }
  const mathpix = String(officialPyqStoredOcrTextLocal(paper) || '').trim()
  const prepared = String(paper.preparedText || '')
  const needs =
    mathpix.length >= 400 &&
    (pdfTextIsMathFontJunk(prepared) ||
      (instituteSolutionLooksLikeRawPdf(prepared.slice(0, 8000)) && /\$|\\frac/.test(mathpix.slice(0, 12000))))
  if (!needs) return { ok: true, repaired: false, paper }
  if (!ocrLooksLikeInstituteSolutionsBooklet(mathpix) && !paper.instituteSolutions?.rebuiltFromOcr) {
    const saved = updateOfficialPyqPendingPaper(paper.id, { preparedText: mathpix })
    return { ok: true, repaired: Boolean(saved), restoredPrepared: true, paper: saved || paper }
  }
  return {
    ...rebuildOfficialPyqFromInstituteSolutionsOcr(paperId, {
      institute: opts.institute || paper.instituteSolutions?.institute || 'FIITJEE',
      ocrText: mathpix,
    }),
    repaired: true,
    restoredPrepared: true,
  }
}

export async function rereadStoredInstituteSolutions(paperId, institute, onProgress) {
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  const name = cleanInstituteName(institute || paper.instituteSolutions?.institute)
  if (!name) return { ok: false, error: 'Type the institute name first (for example Allen or Resonance).' }
  let res
  try {
    res = await fetch(`/api/official-pyq/original/${encodeURIComponent(paperId)}/institute/file`)
  } catch {
    return { ok: false, error: 'Hybrid AI (port 8000) is not running.' }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    return { ok: false, error: String(data?.detail?.message || 'No institute PDF is stored for this paper.') }
  }
  const blob = await res.blob()
  const fileName = paper.instituteSolutions?.fileName || 'institute.pdf'
  const file = new File([blob], fileName, { type: 'application/pdf' })
  return addInstituteSolutionsToOfficialPyqPaper(paperId, file, name, onProgress)
}

/**
 * Add institute solutions from one PDF, or up to 3 subject-wise parts (Physics / Chemistry / Maths).
 * Parts are OCR’d separately and merged before matching onto the paper.
 * @param {string} paperId
 * @param {File | File[] | FileList} fileOrFiles
 * @param {string} institute
 * @param {(pct: number) => void} [onProgress]
 */
export async function addInstituteSolutionsToOfficialPyqPaper(paperId, fileOrFiles, institute, onProgress) {
  const name = cleanInstituteName(institute)
  if (!name) return { ok: false, error: 'Type the institute name first (for example Allen or Resonance).' }
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status === 'published' || paper.status === 'rejected' || isOtherPaper(paper)) {
    return applyInstituteSolutionsToOfficialPyqPaper(paperId, '', { institute: name })
  }
  const files = (Array.isArray(fileOrFiles) || typeof fileOrFiles?.length === 'number'
    ? [...fileOrFiles]
    : [fileOrFiles]
  )
    .filter(Boolean)
    .slice(0, 3)
  if (!files.length) return { ok: false, error: 'Choose a solutions PDF (or up to 3 subject-wise parts).' }
  const file = files[0]
  const stored = await storeInstitutePdf(paperId, file, name)
  /** @type {string[]} */
  const texts = []
  /** @type {any} */
  let mergedRead = null
  for (let i = 0; i < files.length; i += 1) {
    const part = files[i]
    const picked = await readInstituteSolutionsFileText(
      part,
      name,
      (p) => {
        if (!onProgress) return
        const slice = 100 / files.length
        onProgress(Math.round(i * slice + (Number(p) || 0) * (slice / 100)))
      },
      { paperId: stored.ok && i === 0 ? paperId : '' },
    )
    if (picked?.text) texts.push(String(picked.text))
    if (picked?.read?.entries?.size) {
      if (!mergedRead) mergedRead = picked.read
      else {
        for (const [k, v] of picked.read.entries) mergedRead.entries.set(k, v)
      }
    }
  }
  const { combinePyqPreparedOcrText } = await import('./pyqGeminiExtract.js')
  const text = combinePyqPreparedOcrText(...texts)
  const read = mergedRead?.entries?.size
    ? mergedRead
    : readInstituteSolutions(text, { institute: name })
  const links = read ? mathpixPictureLinksIn([...read.entries.values()].map((e) => [e.solution, e.question])) : []
  const pictures = links.length ? await keepInstitutePicturesLocal(paperId, links, { pdfStored: stored.ok }) : { kept: 0, failed: 0 }
  const fileName = files.length === 1 ? file.name : files.map((f) => f.name).join(' + ')
  let result = applyInstituteSolutionsToOfficialPyqPaper(paperId, text, {
    institute: name,
    fileName,
    pdfStored: stored.ok,
    read,
  })
  if (!result.ok) return result
  /** @type {{ kept?: number, failed?: number, added?: number }} */
  let pictureInfo = pictures
  if (stored.ok) {
    const recovered = await applyInstituteSolutionFiguresToPaper(paperId)
    if (recovered.ok && recovered.added) {
      pictureInfo = { ...pictures, kept: (pictures.kept || 0) + recovered.added, added: recovered.added }
      result = { ...result, paper: recovered.paper || result.paper }
    }
  }
  // Drop still-unreadable institute sols so Hybrid AI can fill only the leftover gap (~5–10%).
  const cleared = clearPoorInstituteSolutionsForHybrid(paperId)
  const afterClear = cleared.ok && cleared.cleared ? getOfficialPyqPendingPaper(paperId) : result.paper
  const clearNote =
    cleared.ok && cleared.cleared
      ? ` Cleared ${cleared.cleared} unreadable institute solution(s) for Hybrid AI to fill later.`
      : ''
  const partsNote = files.length > 1 ? ` Merged ${files.length} subject-wise parts.` : ''
  const textSource = files.length > 1 ? 'merged_parts' : 'mathpix'
  return {
    ...result,
    paper: afterClear || result.paper,
    pictures: pictureInfo,
    pdfStored: stored.ok,
    textSource,
    clearedPoor: cleared.ok ? cleared.cleared : 0,
    note:
      instituteResultNote(
        { ...result, paper: afterClear || result.paper },
        { institute: name, fileName, pictures: pictureInfo, pdfStored: stored.ok, textSource },
      ) +
      partsNote +
      clearNote,
  }
}
