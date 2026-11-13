/**
 * Solutions PDFs from coaching institutes (Allen, Resonance, FIITJEE…), as Mathpix reads them:
 * every question is printed again with its options, then "Ans. (B)" / "Answer: 2.25" and
 * "Sol." / "Solution:". Per question number only the answer and the worked solution are taken;
 * the repeated question is kept apart for a text check against the card, never as the solution.
 * No Gemini.
 */
import { endKeyAnswerFields, readAnswerFileSection } from './printedEndSolutions.js'

const SUBJECT_RE =
  /^(?:PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[A-D1-4])\s*[:.\-\u2013\u2014]?\s*)?(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS?|BIOLOGY)\s*(?:[:\-\u2013\u2014(|][^\n]{0,24})?$/i
/** Section instructions and paragraph headings sit between one solution and the next question. */
const SKIP_HEAD_RE =
  /^(?:SECTION\b|Section\s*[-\u2013\u2014:]?\s*(?:[IVX]+|[A-D1-4])\b|PARAGRAPH\b|Paragraph\s+(?:for|\d|[IVX]+\b)|PASSAGE\b|Passage\s+(?:for|\d|[IVX]+\b)|COMPREHENSION\b)/
const QUESTION_START_RE = /^(?:Q(?:ue(?:stion)?)?\s*\.?\s*(?:No\.?\s*)?(\d{1,3})(?!\d)\s*[.):\-]?|(\d{1,3})\s*[.):](?!\d))\s*/i
const ANSWER_RE = /^(?:Ans(?:wer)?s?|Correct\s+(?:answer|option))(?![a-z])\s*(?:is\b\s*)?([.:\-=)\]]*)\s*([\s\S]*)$/i
const SOLUTION_RE =
  /^(?:Sol(?:ution)?s?|Soln|Explanation|Hints?)(?:\s*(?:\$|\\\()?\s*\^\s*\{?\s*n\s*\}?\s*(?:\$|\\\))?)?\s*(?:[.:\-\u2013]+|$)\s*/i
const BARE_SOL_RE = /^Soln?\b\s*/i
const SOL_IN_LINE_RE = /\s(?:Sol(?:ution)?s?|Soln)\s*(?:[.:\-\u2013]|\^\s*\{?\s*n)/i
const OPTION_LINE_RE = /^(?:\(\s*(?:[A-Da-d]|[1-4])\s*\)|[A-D]\s*[.)]\s)/
const OPTION_BLOCK_RE = /^\s*(?:\\item\b|\\begin\{(?:enumerate|itemize)\})/

const FURNITURE_RE =
  /www\.|https?:\/\/(?!cdn\.mathpix\.com)|toll\s*free|corporate\s+office|regd?\.?\s+office|registered\s+office|\bCIN\s*[:\-]|e-?mail\s*:|website\s*:|^\s*page\s*\d+(?:\s*of\s*\d+)?\s*$|^\s*\d+\s*\|\s*page\s*$/i
const LATEX_SHELL_RE =
  /^\\(?:title|author|date|footnotetext|thanks)\{|^\\(?:maketitle|newpage|clearpage|documentclass|usepackage)\b|^\\(?:begin|end)\{document\}/
const SOLUTION_WORDS_RE = /\b(?:correct|option|answer|hence|therefore|thus)\b/i
const GENERIC_NAME_WORDS = new Set(['institute', 'career', 'classes', 'academy', 'limited', 'private', 'coaching', 'centre', 'center'])

/** Card fields an institute file writes; a re-parse of the paper carries them over. */
export const INSTITUTE_CARD_FIELDS = ['answerInstitute', 'solutionInstitute', 'instituteAnswerDisagrees', 'instituteQuestionText']

/** @param {any} card */
export function instituteFieldsOf(card) {
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of INSTITUTE_CARD_FIELDS) {
    if (card && card[key] != null && card[key] !== '') out[key] = card[key]
  }
  return out
}

function subjectName(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (/^math/.test(s)) return 'mathematics'
  return ['physics', 'chemistry', 'biology'].includes(s) ? s : ''
}

/** The line as its markers read: no \section*{…} or \textbf{…} wrapper, "\item[1.]" as "1.". @param {string} line */
function probeOf(line) {
  let s = String(line).trim()
  const sec = s.match(/^\\(?:sub)*section\*?\{([\s\S]*)\}$/)
  if (sec) s = sec[1].trim()
  s = s.replace(/^\\item\s*\[([^\]]*)\]\s*/, '$1 ').replace(/^\\item\b\s*/, '')
  return s.replace(/\\textbf\{([^{}]*)\}/g, '$1').replace(/^\*\*([^*]+)\*\*/, '$1').trim()
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isMarker(probe) {
  return Boolean(answerLine(probe)) || SOLUTION_RE.test(probe)
}

function questionNumberOf(probe) {
  const m = probe.match(QUESTION_START_RE)
  return m ? Number(m[1] || m[2]) : 0
}

/** Page headers and footers the institute prints on every page. @param {string} raw @param {string} [institute] */
function cleanLines(raw, institute = '') {
  const lines = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({ raw: line.replace(/\s+$/, ''), probe: probeOf(line) }))
  const nameWords = String(institute)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w))
  const nameRe = nameWords.length ? new RegExp(`\\b(?:${nameWords.map(escapeRe).join('|')})\\b`, 'i') : null
  const counts = new Map()
  for (const l of lines) if (l.probe) counts.set(l.probe, (counts.get(l.probe) || 0) + 1)
  const structural = (p) => questionNumberOf(p) > 0 || isMarker(p) || SUBJECT_RE.test(p) || SKIP_HEAD_RE.test(p)
  const plainText = (p) => !/[\\$&]/.test(p)
  return lines.filter(({ raw: line, probe }) => {
    if (!probe) return true
    if (LATEX_SHELL_RE.test(line.trim()) || FURNITURE_RE.test(probe)) return false
    if (structural(probe) || !plainText(probe)) return true
    if ((probe.match(/\|/g) || []).length >= 2) return false
    if (
      nameRe?.test(probe) &&
      probe.length <= 160 &&
      (/\||\bJEE\b|\bPaper\b|\bAdvanced\b|\bMain\b|\b(?:19|20)\d{2}\b/i.test(probe) || probe === probe.toUpperCase())
    ) {
      return false
    }
    return !(counts.get(probe) >= 3 && probe.length >= 10 && !SOLUTION_WORDS_RE.test(probe))
  })
}

/** "Ans. (B)", "Answer: 2.25", "Ans (A, C) Sol. …": the printed value and what follows "Sol." on the same line. */
function answerLine(probe) {
  const m = String(probe).match(ANSWER_RE)
  if (!m) return null
  const cut = m[2].search(SOL_IN_LINE_RE)
  const value = (cut >= 0 ? m[2].slice(0, cut) : m[2]).trim()
  const tail = cut >= 0 ? m[2].slice(cut).trim() : ''
  if (!m[1] && value && !normalizeInstituteAnswer(value)) return null
  return { value, tail }
}

/**
 * A printed answer as the key reader takes it: "A, C", "2.25", "[2.2 to 2.3]", "0.5 OR 0.75".
 * '' for a bonus, a matching grid, or anything unreadable.
 * @param {unknown} raw
 */
export function normalizeInstituteAnswer(raw) {
  let s = String(raw ?? '')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$/g, ' ')
    .replace(/\\(?:mathrm|mathbf|text|textbf|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:quad|qquad)|\\[,;: ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^(?:(?:is|option|options|correct)\b\s*|[:\-=]\s*)+/i, '').replace(/[.;,]+$/, '').trim()
  if (!s || /^(?:bonus|marks?\s+to\s+all|zero\s+marks|dropped|no\s+option)/i.test(s)) return ''
  const letters = s.replace(/\band\b/gi, ',')
  if (/^[\s(),&;A-Da-d]+$/.test(letters) && /[A-Da-d]/.test(letters)) {
    return [...new Set(letters.toUpperCase().match(/[A-D]/g))].sort().join(', ')
  }
  const one = (part) => {
    const p = part.trim().replace(/^\((.*)\)$/, '$1').trim()
    const band = p.match(/^\[?\s*(-?\d+(?:\.\d+)?)\s*(?:to|\u2013|\u2014|-|,)\s*(-?\d+(?:\.\d+)?)\s*\]?$/i)
    if (band && Number(band[2]) > Number(band[1])) return `[${band[1]} to ${band[2]}]`
    const num = p.match(/^\[?\s*(-?\d+(?:\.\d+)?)\s*\]?(?:\s*[A-Za-z/^{}\-\\ ]{0,12})?$/)
    return num ? num[1] : ''
  }
  const parts = s.split(/\s+or\s+/i).map(one)
  if (parts.some((p) => !p)) return ''
  return parts.join(' OR ')
}

/** "4.0 to 4.4" written by Mathpix without its brackets, or a cut-off line: the value from the next line. */
function answerFromNextLine(lines, k) {
  for (let j = k + 1; j < lines.length; j += 1) {
    if (!lines[j].probe) continue
    return normalizeInstituteAnswer(lines[j].probe) ? j : -1
  }
  return -1
}

/** The part before "Ans." / "Sol." is the repeated question; the answer and the working follow. */
function readBlock(lines) {
  const at = lines.findIndex((l) => isMarker(l.probe))
  const question = (at < 0 ? lines : lines.slice(0, at)).map((l) => l.raw).join('\n').trim()
  if (at < 0) return { question, answer: '', solution: '' }
  let answer = ''
  let solMarked = false
  /** @type {string[]} */
  const rest = []
  for (let k = at; k < lines.length; k += 1) {
    const { raw, probe } = lines[k]
    const line = !answer ? answerLine(probe) : null
    if (line) {
      let value = normalizeInstituteAnswer(line.value)
      if (!line.value && !line.tail) {
        const next = answerFromNextLine(lines, k)
        if (next > 0) {
          value = normalizeInstituteAnswer(lines[next].probe)
          k = next
        }
      }
      if (value) {
        answer = value
        if (line.tail) rest.push(line.tail)
        continue
      }
    }
    if (!solMarked && SOLUTION_RE.test(probe)) {
      solMarked = true
      const after = probe.replace(SOLUTION_RE, '')
      if (after) rest.push(after)
      continue
    }
    rest.push(raw)
  }
  let solution = rest
    .join('\n')
    .replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!solMarked) solution = solution.replace(SOLUTION_RE, '').replace(BARE_SOL_RE, '').trim()
  return { question, answer, solution }
}

/**
 * Read an institute solutions file. Each question starts with its printed number; a number counts
 * as the next question only once the one before reached its "Ans." / "Sol.", and only when an
 * "Ans." / "Sol." follows before the next number — so numbered steps in a solution and numbered
 * statements in a question are not new questions. A subject line (or a long run) restarts the numbering.
 * Same shape as the end-of-paper key, with the repeated question as `question`.
 * A file that prints only answers and solutions ("1. (B)", "Q.1 Sol. …") is read as an answer file.
 * @param {unknown} raw Mathpix text
 * @param {{ institute?: string }} [opts]
 * @returns {{ entries: Map<string, { answer: string, solution: string, question: string }>, subjects: string[], layout: 'repeated_questions' | 'answers_only', sectionText: string } | null}
 */
export function readInstituteSolutions(raw, opts = {}) {
  const lines = cleanLines(raw, opts.institute)
  const starts = lines.map((l) => questionNumberOf(l.probe))
  const marks = lines.map((l, i) => {
    if (isMarker(l.probe)) return true
    return starts[i] > 0 && isMarker(l.probe.replace(QUESTION_START_RE, ''))
  })
  const stops = lines.map((l) => (SUBJECT_RE.test(l.probe) && l.probe.length <= 48) || SKIP_HEAD_RE.test(l.probe))
  const answeredAhead = (i, n) => {
    if (marks[i]) return true
    for (let j = i + 1; j < lines.length; j += 1) {
      if (stops[j]) return false
      const m = starts[j]
      if (m && (m === n || (m > n && m <= n + 3))) return false
      if (marks[j]) return true
    }
    return false
  }

  /** @type {Array<{ n: number, subject: string, segment: number, lines: Array<{ raw: string, probe: string }>, marked: boolean }>} */
  const blocks = []
  /** @type {null | { n: number, subject: string, segment: number, lines: Array<{ raw: string, probe: string }>, marked: boolean }} */
  let cur = null
  let last = 0
  let subject = ''
  let fresh = false
  let segment = 0
  const close = () => {
    if (cur) blocks.push(cur)
    cur = null
  }
  lines.forEach((l, i) => {
    const subj = l.probe.length <= 48 ? l.probe.match(SUBJECT_RE) : null
    if (subj) {
      close()
      subject = subjectName(subj[1])
      fresh = true
      return
    }
    if (SKIP_HEAD_RE.test(l.probe)) {
      close()
      return
    }
    const n = starts[i]
    if (n) {
      const inSequence = last === 0 || (n > last && n <= last + 3) || (n === 1 && (fresh || last >= 8))
      // A question whose "Ans." Mathpix lost still ends at the next number, unless that number counts solution steps.
      const ahead = answeredAhead(i, n)
      const stepRun = Boolean(cur?.lines.some((c) => questionNumberOf(c.probe) === n - 1))
      const nextQuestion = !cur
        ? ahead
        : cur.marked
          ? ahead || (n === last + 1 && !stepRun)
          : n === last + 1 && ahead
      if (inSequence && nextQuestion) {
        close()
        if (!subject && last > 0 && n <= last) segment += 1
        cur = { n, subject, segment, lines: [], marked: false }
        last = n
        fresh = false
        const rest = l.raw.trim().replace(/^\\(?:sub)*section\*?\{\s*/, '').replace(/^\\item\s*\[[^\]]*\]\s*/, '')
        const own = rest.replace(QUESTION_START_RE, '').replace(/^\}\s*/, '')
        if (own.trim()) {
          const line = { raw: own, probe: probeOf(own) }
          cur.lines.push(line)
          if (isMarker(line.probe)) cur.marked = true
        }
        return
      }
    }
    if (!cur) return
    cur.lines.push(l)
    if (marks[i]) cur.marked = true
  })
  close()

  /** @type {Map<string, { answer: string, solution: string, question: string }>} */
  const entries = new Map()
  /** @type {string[]} */
  const subjects = []
  for (const b of blocks) {
    const read = readBlock(b.lines)
    if (!read.answer && !read.solution) continue
    if (b.subject && !subjects.includes(b.subject)) subjects.push(b.subject)
    const key = `${b.subject || `#${b.segment}`}:${b.n}`
    if (!entries.has(key)) entries.set(key, read)
  }
  if (entries.size >= 2) return { entries, subjects, layout: 'repeated_questions', sectionText: '' }
  const plain = readAnswerFileSection(raw)
  if (plain?.entries?.size) {
    /** @type {Map<string, { answer: string, solution: string, question: string }>} */
    const asRead = new Map()
    for (const [key, e] of plain.entries) asRead.set(key, { answer: e.answer || '', solution: e.solution || '', question: '' })
    return { entries: asRead, subjects: plain.subjects, layout: 'answers_only', sectionText: plain.sectionText }
  }
  return entries.size ? { entries, subjects, layout: 'repeated_questions', sectionText: '' } : null
}

/** The institute's question without its options (the suggestion an admin may take by hand). @param {unknown} text */
export function instituteStemOnly(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    if (OPTION_BLOCK_RE.test(line) || OPTION_LINE_RE.test(probeOf(line))) break
    out.push(line)
  }
  return out.join('\n').trim()
}

function plainOf(text) {
  return String(text ?? '')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g, ' ')
    .replace(/\[[^\]\n]{0,40}\b(?:JEE|AIEEE|IIT|NEET)\b[^\]\n]{0,40}\]|\((?:JEE|AIEEE|IIT|NEET)\b[^)\n]{0,40}\)/gi, ' ')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, ' ')
    .replace(/\(\s*(?:[A-Da-d]|[1-4])\s*\)/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
}

function tokensOf(text) {
  const plain = plainOf(text)
  return {
    words: plain.toLowerCase().match(/[a-z]{4,}/g) || [],
    numbers: (plain.match(/\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n))),
  }
}

/**
 * How far the card's text is from the institute's copy of the same question (words and numbers,
 * LaTeX and pictures ignored). Null when the institute copy is too short to judge.
 * `differs`: words or numbers of the institute copy are missing on the card, or the card is cut short.
 * @param {any} card @param {unknown} instituteText
 */
export function instituteTextDifference(card, instituteText) {
  const inst = tokensOf(instituteText)
  const instWords = new Set(inst.words)
  if (instWords.size < 5) return null
  const own = tokensOf(
    [
      card?.text ?? card?.stem,
      card?.passageText,
      ...(Array.isArray(card?.options) ? card.options : []),
      ...(Array.isArray(card?.matrixRows) ? card.matrixRows : []),
      ...(Array.isArray(card?.matrixCols) ? card.matrixCols : []),
    ]
      .map((part) => String(part ?? ''))
      .join('\n'),
  )
  const ownWords = new Set(own.words)
  const ownNumbers = new Set(own.numbers)
  const missingWords = [...instWords].filter((w) => !ownWords.has(w))
  const missingNumbers = [...new Set(inst.numbers)].filter((n) => !ownNumbers.has(n))
  const coverage = 1 - missingWords.length / instWords.size
  const bigNumberMissing = missingNumbers.some((n) => n.replace('-', '').length >= 2 || n.includes('.'))
  const cutShort = own.words.length < inst.words.length * 0.6
  return {
    differs: coverage < 0.75 || missingNumbers.length >= 2 || bigNumberMissing || (cutShort && coverage < 0.9),
    coverage: Number(coverage.toFixed(3)),
    missingWords: missingWords.slice(0, 8),
    missingNumbers: missingNumbers.slice(0, 8),
  }
}

const LETTERS = 'ABCDEFGH'

function letterSet(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b).join(',')
}

function lettersOf(fields) {
  if (Array.isArray(fields?.correctIndices) && fields.correctIndices.length) return letterSet(fields.correctIndices)
  if (fields?.correctIndex != null && fields.correctIndex !== '') return letterSet([fields.correctIndex])
  return ''
}

function numberOf(fields) {
  const v = fields?.correctNumerical ?? fields?.correctInteger
  if (v == null || v === '' || !Number.isFinite(Number(v))) return null
  return { value: Number(v), tolerance: Number(fields?.numericalTolerance) || 0 }
}

/** "C", "A, C", "2.25", "2.2 to 2.3", "0.5 OR 0.75" for answer fields ('' when none). @param {any} fields */
export function instituteAnswerText(fields) {
  if (fields?.bonusMarksToAll === true) return 'Bonus (marks to all)'
  if (fields?.zeroMarksToAll === true) return 'Zero marks to all'
  const letters = lettersOf(fields)
  if (letters) return letters.split(',').map((i) => LETTERS[Number(i)] ?? '?').join(', ')
  const main = numberOf(fields)
  if (!main) return ''
  const alternatives = (Array.isArray(fields?.numericalAlternatives) ? fields.numericalAlternatives : [])
    .map((a) => numberOf({ correctNumerical: a?.value, numericalTolerance: a?.tolerance }))
    .filter(Boolean)
  const show = (c) => (c.tolerance ? `${Number((c.value - c.tolerance).toFixed(6))} to ${Number((c.value + c.tolerance).toFixed(6))}` : String(c.value))
  return [main, ...alternatives].map(show).join(' OR ')
}

/**
 * The institute's answer is the card's answer: the same option set (any printed either-of set
 * counts), or a number inside the printed band. A bonus or zero-marks card agrees with anything.
 * @param {any} card @param {any} fields from {@link endKeyAnswerFields}
 */
export function instituteAnswerAgrees(card, fields) {
  if (card?.bonusMarksToAll === true || card?.zeroMarksToAll === true) return true
  const instLetters = lettersOf(fields)
  if (instLetters) {
    const sets = [lettersOf(card), ...(Array.isArray(card?.correctIndicesAlternatives) ? card.correctIndicesAlternatives : []).map(letterSet)]
    return sets.filter(Boolean).includes(instLetters)
  }
  const inst = numberOf(fields)
  if (!inst) return true
  const choices = [
    numberOf(card),
    ...(Array.isArray(card?.numericalAlternatives) ? card.numericalAlternatives : []).map((a) =>
      numberOf({ correctNumerical: a?.value, numericalTolerance: a?.tolerance }),
    ),
  ].filter(Boolean)
  return choices.some((c) => Math.abs(c.value - inst.value) <= Math.max(c.tolerance, inst.tolerance, 1e-6))
}

const MAX_ANSWER_LINES = 6

/**
 * What the institute file still flags on this card, worked out from the card as it is now (a fixed
 * card has nothing): its answer against the official key, and its text against the institute copy.
 * @param {any} q
 * @returns {{ answer: { said: string, official: string } | null, text: ReturnType<typeof instituteTextDifference> }}
 */
export function instituteCardNotes(q) {
  const said = String(q?.instituteAnswerDisagrees ?? '').trim()
  const fields = said ? endKeyAnswerFields(said, q) : null
  const copy = String(q?.instituteQuestionText ?? '').trim()
  const text = copy ? instituteTextDifference(q, copy) : null
  return {
    answer: fields && !instituteAnswerAgrees(q, fields) ? { said, official: instituteAnswerText(q) || 'nothing' } : null,
    text: text?.differs ? text : null,
  }
}

/**
 * Quality check lines for an institute file: answers that differ from the official key, and
 * stems that differ from the institute's copy. Cards an admin approved get no alarms.
 * @param {any[]} questions @param {(q: any) => boolean} [isPlaceholder]
 * @returns {string[]}
 */
export function instituteQualityLines(questions, isPlaceholder = () => false) {
  /** @type {Array<{ n: number, said: string, official: string }>} */
  const disagree = []
  /** @type {number[]} */
  const textDiffers = []
  ;(Array.isArray(questions) ? questions : []).forEach((q, i) => {
    if (!q || isPlaceholder(q) || q.adminApproved === true) return
    if (!q.instituteAnswerDisagrees && !q.instituteQuestionText) return
    const notes = instituteCardNotes(q)
    if (notes.answer) disagree.push({ n: i + 1, ...notes.answer })
    if (notes.text) textDiffers.push(i + 1)
  })
  /** @type {string[]} */
  const lines =
    disagree.length > MAX_ANSWER_LINES
      ? [`Go to Q ${disagree.map((d) => d.n).join(', ')}. The institute answer differs from the official key; the official answer is kept — check.`]
      : disagree.map((d) => `Go to Q ${d.n}. Institute says ${d.said}, official key says ${d.official} — check.`)
  if (textDiffers.length) {
    lines.push(`Go to Q ${textDiffers.join(', ')}. Question text differs from the institute copy — check against the original.`)
  }
  return lines
}
