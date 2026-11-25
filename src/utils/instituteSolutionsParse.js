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
  /^(?:SECTION\b|Section\s*[-\u2013\u2014:^]?\s*(?:[IVX]+|[A-D1-4])\b|PARAGRAPH\b|Paragraph\s+(?:for|\d|[IVX]+\b)|PASSAGE\b|Passage\s+(?:for|\d|[IVX]+\b)|COMPREHENSION\b|.*\bMaximum\s+Marks\b)/i
/** Marking-scheme / next-section chrome that Mathpix sometimes leaves after Sol. */
const SOLUTION_TAIL_CHROME_RE =
  /(?:^|\n)\s*(?:\\(?:sub)*section\*?\{)?\s*SECTION[\s^]*\d|\\(?:sub)*section\*?\{[^}\n]*SECTION[\s^]*\d|\\(?:sub)*section\*?\{(?:PHYSICS|CHEMISTRY|MATHEMATICS|MATHS?|BIOLOGY)\}|(?:^|\n)\s*(?:\\(?:sub)*section\*?\{\s*)?PART\s*[-–—]?\s*[A-D]\b|(?:^|\n)\s*\([A-D]\)(?:\s*,\s*\([A-D]\))*(?:\s+and\s+\([A-D]\))?\.?\s*(?:ONE OR MORE|ONLY three options|ONLY ONE)|(?:^|\n)\s*ONE OR MORE THAN ONE of these four|(?:^|\n)\s*ONLY ONE of these four|(?:^|\n)\s*Answer to each question will be evaluated|(?:^|\n)\s*For each question,\s*choose the option|(?:^|\n)\s*\\item\[-\]\s*(?:This section|Answer to each|For each question)|(?:^|\n)\s*(?:Full Marks|Maximum\s+Marks)\s*:|(?:^|\n)\s*[^\n]{0,40}marking scheme/i
/** A later question marker left inside a solution ("*Q.3", "\item[] *Q. 4", "*Q^7."). */
const MERGED_Q_IN_SOL_RE =
  /(?:^|\n)\s*(?:\\item\s*\[[^\]]*\]\s*)?\*{0,2}\s*Q\s*(?:\^\s*\{?\s*|\.?\s*)?\d{1,3}\s*\}?\s*[.):]?(?=\s|$|[A-Z\\$])/im
const SMASHED_DELTA_RE =
  /(?:\\\\\s*Delta\s*\\mathrm\{ORT\}|(?:\\mathrm\{)?Delta\}?\s*\\mathrm\{ORT\}|(?<![A-Za-z\\])Delta\s*\\mathrm\{ORT\}|(?<![A-Za-z\\])Delta(?=\s*(?:ORT|\()))/i
/**
 * Question starts as institutes print them: "Q.1", "Q 1", "1.", and FIITJEE's class-XI mark
 * "*Q.3" / "*Q8." (star, optional dot after Q). Plain "1." / "2." still count for Allen-style files.
 * A bare "1.KTdT" in a maths solution is not a new question (needs a space or end after the mark).
 */
const QUESTION_START_RE =
  /^(?:\*{1,2}\s*)?(?:Q(?:ue(?:stion)?)?\s*\.?\s*(?:No\.?\s*)?(\d{1,3})(?!\d)\s*[.):\-]?|(\d{1,3})\s*[.):](?!\d)(?=\s|$))\s*/i
/**
 * Answer markers only: "Ans." / "Ans.." / "ANS." (capital A — a lowercase "answer." in a stem is
 * not a marker), "Answer:" / "Answers.", or "Correct answer:". "Answer to each question…" is not.
 */
const ANSWER_RE =
  /^(?:Ans\.?|ANS\.?)(?![a-zA-Z])\s*([.:\-=)\]]*)\s*([\s\S]*)$|^(?:Answers?|Correct\s+(?:answer|option))\s*[.:\-=]\s*(?:is\b\s*)?([\s\S]*)$/i
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

/** What the last institute file noted on a card; each new file writes them afresh. */
export const INSTITUTE_NOTE_FIELDS = ['instituteAnswerDisagrees', 'instituteQuestionText', 'instituteUnsureMatch', 'instituteOptionsUnmatched']

/** Card fields an institute file writes; a re-parse of the paper carries them over. */
export const INSTITUTE_CARD_FIELDS = ['answerInstitute', 'solutionInstitute', ...INSTITUTE_NOTE_FIELDS]

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
  // Mathpix often writes "\item[] *Q. 3 …" or "\item *Q.3".
  s = s.replace(/^\\item\s*\[([^\]]*)\]\s*/, '$1 ').replace(/^\\item\b\s*/, '')
  return s.replace(/\\textbf\{([^{}]*)\}/g, '$1').replace(/^\*\*([^*]+)\*\*/, '$1').trim()
}

/**
 * Mathpix often glues the next question onto the previous solution on the same line
 * ("… $$ \item[] *Q. 4 Consider…", "Ans. B \item[] Sol. …"). Put those markers on their own
 * line so Q.3 / Q.4 never stay inside Q.2's solution. (Do not break every mid-line "Q.1" —
 * that cuts Allen's maths answers.)
 * @param {string} raw
 */
function breakInstituteMarkers(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // "$$ \item[] *Q. 4" / "… \item[] *Q.3" / "Ans. B \item[] Sol."
    .replace(/\\item\s*\[[^\]]*\]\s*(?=\*?Q\.?\s*\d)/gi, '\n\\item[] ')
    .replace(/\\item\s*\[[^\]]*\]\s*(?=Sol\.)/gi, '\n\\item[] ')
    .replace(/([^\n$])(\*{1,2}\s*Q\.?\s*\d{1,3}\b)/g, '$1\n$2')
    .replace(/([^\n])(Ans\.\s*[A-Da-d1-9](?:\s*,\s*[A-Da-d])*)\s*(?=\\item|Sol\.)/g, '$1\n$2\n')
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

/** "Q.1" / "*Q.3" (not a bare "1." step in a solution). @param {string} probe */
function hasQPrefix(probe) {
  return /^(?:\*{1,2}\s*)?Q(?:ue(?:stion)?)?\b/i.test(String(probe ?? ''))
}

/**
 * A real next question (Allen "2. A ball is thrown…", FIITJEE "Q.7 …") rather than a short
 * numbered step in the working ("1. Find the friction first.", bare "6.", "2. Then a=…").
 * @param {string} probe
 */
function looksLikeNextQuestion(probe) {
  if (hasQPrefix(probe)) return true
  const after = String(probe ?? '').replace(QUESTION_START_RE, '').trim()
  if (!after) return false
  if (OPTION_LINE_RE.test(after) || /\?\s*$/.test(after)) return true
  return after.length >= 28 && !isMarker(after)
}

/** Numbered line that continues the working ("2. Then a = …"), not a new question. @param {string} probe */
function looksLikeSolutionStep(probe) {
  const after = String(probe ?? '').replace(QUESTION_START_RE, '').trim()
  return /^(?:then|so|hence|find|now|from|using|also|therefore|thus|we\b|let us|substitut|integrat|differenti|put\b|here\b)/i.test(
    after,
  )
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
    // Chemistry MCQs often repeat the same <smiles>…</smiles> / figure for (1)–(4).
    // That is not page furniture — dropping them empties every option (Q75 Shift 2).
    if (/<smiles>|\\includegraphics|!\[[^\]]*\]\(/i.test(line)) return true
    if (OPTION_LINE_RE.test(probe) || OPTION_BLOCK_RE.test(line)) return true
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
  const punct = m[1] || ''
  const body = String(m[2] ?? m[3] ?? '')
  const cut = body.search(SOL_IN_LINE_RE)
  const value = (cut >= 0 ? body.slice(0, cut) : body).trim()
  const tail = cut >= 0 ? body.slice(cut).trim() : ''
  if (!punct && value && !normalizeInstituteAnswer(value)) return null
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

/**
 * Value after a bare "Ans." / "Ans.." (FIITJEE often puts the letter on the next line, or on
 * "Sol. (A)" when "Ans.." is empty). Skips blank lines; stops at the next question / subject.
 * @returns {{ index: number, value: string } | null}
 */
function answerFromNextLine(lines, k) {
  for (let j = k + 1; j < lines.length; j += 1) {
    const probe = lines[j].probe
    if (!probe) continue
    if (questionNumberOf(probe) || (SUBJECT_RE.test(probe) && probe.length <= 48) || SKIP_HEAD_RE.test(probe)) {
      return null
    }
    let valueProbe = probe
    if (SOLUTION_RE.test(probe) || BARE_SOL_RE.test(probe)) {
      valueProbe = probe.replace(SOLUTION_RE, '').replace(BARE_SOL_RE, '').trim()
      if (!valueProbe) continue
    }
    const value = normalizeInstituteAnswer(valueProbe)
    if (value) return { index: j, value }
    if (!SOLUTION_RE.test(probe) && !BARE_SOL_RE.test(probe)) return null
  }
  return null
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
      if (!value && !line.tail) {
        const next = answerFromNextLine(lines, k)
        if (next) {
          value = next.value
          k = next.index
          // "Ans.." then "Sol. (A) …" — the letter is the answer; anything after it is the working.
          if (SOLUTION_RE.test(lines[k].probe) || BARE_SOL_RE.test(lines[k].probe)) {
            answer = value
            solMarked = true
            const after = lines[k].probe.replace(SOLUTION_RE, '').replace(BARE_SOL_RE, '').trim()
            const leftover = after.replace(/^\(?\s*[A-Da-d](?:\s*,\s*[A-Da-d])*\s*\)?\s*/, '').trim()
            if (leftover) rest.push(leftover)
            continue
          }
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
      // "Sol. (A)" with no "Ans." line: the letter is the answer, the rest is the working.
      if (!answer) {
        const asAns = normalizeInstituteAnswer(after)
        if (asAns && /^(?:[A-H](?:, [A-H])*|-?\d+(?:\.\d+)?)$/.test(asAns)) {
          answer = asAns
          const leftover = after.replace(/^\(?\s*[A-Da-d1-4](?:\s*,\s*[A-Da-d])*\s*\)?\s*/, '').trim()
          if (leftover && leftover !== after) rest.push(leftover)
          else if (leftover && !/^[A-Da-d1-4,\s()]+$/.test(after.trim())) rest.push(leftover)
          continue
        }
      }
      if (after) rest.push(after)
      continue
    }
    rest.push(raw)
  }
  let solution = rest.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!solMarked) solution = solution.replace(SOLUTION_RE, '').replace(BARE_SOL_RE, '').trim()
  // Never keep the next question inside this solution (Mathpix sometimes leaves "\item[] *Q. 4 …").
  const cut = solution.search(MERGED_Q_IN_SOL_RE)
  if (cut > 0) solution = solution.slice(0, cut).trim()
  else if (cut === 0) solution = ''
  solution = cleanInstituteSolutionBody(solution)
  return { question, answer, solution }
}

/** How many answers a read produced (for choosing Mathpix vs the PDF's own text). @param {ReturnType<typeof readInstituteSolutions>} read */
export function instituteAnswerCount(read) {
  if (!read?.entries?.size) return 0
  let n = 0
  for (const e of read.entries.values()) if (String(e.answer || '').trim() || String(e.solution || '').trim()) n += 1
  return n
}

/**
 * Drop section / marking-scheme chrome, the next question, empty pictures, and smashed "Delta ORT"
 * OCR so students never see "SECTION 1 (Maximum Marks…)" or the word "Delta" in a solution.
 * @param {unknown} text
 */
/** Running heads / footers FIITJEE prints on every page. */
const INSTITUTE_PAGE_FURNITURE_RE =
  /(?:^|\n)\s*(?:JEE\s*\(\s*ADVANCED\s*\)\s*-?\s*20\d{2}[^\n]*|FIITJEE\s+Ltd\.[^\n]*|website:\s*www\.fiitjee[^\n]*|www\.fiitjee\.com[^\n]*)/gi

/** Private-use “math font” letters from a PDF text layer — they show as junk/code on screen. */
const PDF_PUA_RE = /[\uE000-\uF8FF]/g

/**
 * How drawable a solution is (higher is better). PDF font glyphs score very low vs Mathpix LaTeX.
 * @param {unknown} text
 */
export function instituteSolutionDisplayScore(text) {
  const s = String(text ?? '')
  if (!s.trim()) return -1
  let score = Math.min(s.length, 1200) / 80
  const pua = (s.match(PDF_PUA_RE) || []).length
  score -= pua * 2.5
  if (/\\begin\{aligned\}|\\frac\s*\{|\$\$/.test(s)) score += 25
  if (/\$[^$\n]{2,}\$/.test(s)) score += 12
  if (/\\(?:mathrm|mathbf|Rightarrow|triangle|omega|cdot|times)\b/.test(s)) score += 8
  if (INSTITUTE_PAGE_FURNITURE_RE.test(s)) score -= 6
  INSTITUTE_PAGE_FURNITURE_RE.lastIndex = 0
  return score
}

/** True when the solution is mostly PDF private-use letters (looks like code to students). */
export function instituteSolutionLooksLikeRawPdf(text) {
  const s = String(text ?? '')
  if (!s.trim()) return false
  const pua = (s.match(PDF_PUA_RE) || []).length
  if (pua >= 8) return true
  if (pua >= 3 && pua / s.length > 0.03) return true
  // Stacked fraction lines with almost no words and no LaTeX — FIITJEE text layer.
  const lines = s.split(/\n/).filter((l) => l.trim())
  const short = lines.filter((l) => /^\s*[\d.+\-/=()]+\s*$/.test(l)).length
  if (lines.length >= 6 && short / lines.length >= 0.45 && !/\$|\\frac|\\begin\{/.test(s)) return true
  return false
}

/**
 * Prefer Mathpix LaTeX stems over longer PDF font-junk / stacked-digit soup.
 * @param {unknown} qA Mathpix (or first) question body
 * @param {unknown} qB PDF (or second) question body
 */
export function preferredInstituteQuestion(qA, qB) {
  const a = String(qA ?? '')
  const b = String(qB ?? '')
  if (!a.trim()) return b
  if (!b.trim()) return a
  const junkA = instituteSolutionLooksLikeRawPdf(a)
  const junkB = instituteSolutionLooksLikeRawPdf(b)
  if (junkA && !junkB) return b
  if (junkB && !junkA) return a
  const score = (s) => {
    let n = Math.min(s.length, 900) / 120
    if (/\$[^$\n]{2,}\$/.test(s)) n += 18
    if (/\\frac\s*\{|\\begin\{/.test(s)) n += 14
    if (/\\mathrm|\\sqrt|\\times|\\cdot/.test(s)) n += 6
    if (instituteSolutionLooksLikeRawPdf(s)) n -= 40
    return n
  }
  return score(a) >= score(b) ? a : b
}

/**
 * Strip PDF private-use font junk and chrome; keep the solution when enough readable
 * words / maths remain. Used so an institute upload keeps the maximum usable solutions.
 * @param {unknown} text
 * @returns {string}
 */
export function salvageInstituteSolutionBody(text) {
  let s = String(text ?? '')
  if (!s.trim()) return ''
  const hadPua = PDF_PUA_RE.test(s)
  PDF_PUA_RE.lastIndex = 0
  s = s.replace(PDF_PUA_RE, '')
  s = cleanInstituteSolutionBody(s)
  if (!s.trim() || instituteSolutionLooksLikeRawPdf(s)) return ''
  // After stripping FIITJEE math-font letters, leftover digit/letter scraps are not a solution.
  const words = (s.match(/[A-Za-z]{3,}/g) || []).length
  if (hadPua && words < 4) return ''
  return s
}

/** True when students can read this as an institute solution (drawn maths or plain words). */
export function instituteSolutionIsUsable(text) {
  if (salvageInstituteSolutionBody(text)) return true
  const cleaned = cleanInstituteSolutionBody(text)
  return Boolean(cleaned.trim()) && !instituteSolutionLooksLikeRawPdf(cleaned)
}

/**
 * True when a stored institute solution still looks broken to students (font junk, missing
 * glyphs, or bare scraps). Hybrid AI may replace these after they are cleared.
 * @param {unknown} text
 */
export function instituteSolutionLooksPoorForStudents(text) {
  const s = String(text ?? '').trim()
  if (!s) return true
  if (instituteSolutionLooksLikeRawPdf(s)) return true
  if (!instituteSolutionIsUsable(s)) return true
  // OCR that dropped Greek/math leaves blanks like "(0, –) becomes (, )".
  if (/\(\s*,\s*\)|becomes\s*\(\s*,|\by2\s*=|ˆ\s*ˆ|\\mathrm\{x\}\s*\\geq/.test(s) && !/\$\$/.test(s)) {
    return true
  }
  // Figure-only scraps with almost no prose. Two or more drawings can be a valid chemistry
  // Sol. (labels like "Aromatic" are inside the pictures — JEE Main Q81).
  const words = (s.match(/[A-Za-z]{3,}/g) || []).length
  const figs = (s.match(/\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}|!\[[^\]]*\]\([^)]+\)/g) || []).length
  if (words < 6 && figs > 0 && figs < 2) return true
  return false
}

export function cleanInstituteSolutionBody(text) {
  let s = String(text ?? '')
  if (!s.trim()) return ''
  const cutAt = (re) => {
    const at = s.search(re)
    if (at > 0) s = s.slice(0, at)
    else if (at === 0) s = ''
  }
  cutAt(SOLUTION_TAIL_CHROME_RE)
  cutAt(MERGED_Q_IN_SOL_RE)
  s = s.replace(INSTITUTE_PAGE_FURNITURE_RE, '\n')
  // Mathpix row-break turns \Delta / \triangle into "\\ Delta \mathrm{ORT}".
  s = s.replace(/\\\\\s*Delta\s*\\mathrm\{ORT\}/gi, '\\triangle\\mathrm{ORT}')
  s = s.replace(/(?:\\mathrm\{)?Delta\}?\s*\\mathrm\{ORT\}/gi, '\\triangle\\mathrm{ORT}')
  s = s.replace(/(?<![A-Za-z])Delta\s*\\mathrm\{ORT\}/gi, '\\triangle\\mathrm{ORT}')
  s = s.replace(/(?<![A-Za-z\\])Delta(?=\s*(?:ORT|ORT\b|\())/g, '\\triangle ')
  // Keep real pictures; only drop empty placeholders.
  s = s.replace(/!\[\]\(\s*\)/g, '')
  // `$\\end{itemize}$` / `$\\item[…]$` — drop the whole dollar wrap so we do not leave `$$`.
  s = s.replace(/\$\s*\\item\s*\[[^\]]*\]\s*\$/g, '')
  s = s.replace(/\$\s*\\(?:begin|end)\{(?:itemize|enumerate)\}\s*\$/g, '')
  s = s.replace(/\\item\s*\[[^\]]*\]\s*/g, '')
  s = s.replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '')
  // Keep $$ around aligned — stripping them leaves raw \\mathrm as “code” on screen.
  s = healInstituteSolutionMath(s)
  // Drop a trailing leftover opener `$$` only when the $$ count is odd. An even count
  // means the final `$$` closes a real display (S1 Q37 `$$…MeV$$`); the old aligned-only
  // keep rule stripped that closer and Quality then saw page leftovers forever.
  if (((s.match(/\$\$/g) || []).length % 2) === 1) s = s.replace(/\$\$\s*$/g, '')
  s = s.replace(/(?:^|\n)\s*\$\$\s*$/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return s
}

/**
 * Close broken Mathpix solution maths so students never see raw \\mathrm / half-dollars.
 * @param {string} text
 */
export function healInstituteSolutionMath(text) {
  let s = String(text ?? '')
  if (!s.trim()) return s
  // `\mathrm{e}^{- }}` (extra brace) from a smashed integrating-factor line.
  s = s.replace(/\\mathrm\{e\}\^\{\s*-\s*\}\}/g, '\\mathrm{e}^{-}')
  s = s.replace(/\\mathrm\{e\}\^\{\s*-\s*\}(?=\s*=)/g, '\\mathrm{e}^{-}')
  // `$$W=$\\frac…$` — display opened then an inner `$` cut the math (Q33). Keep $$…$$.
  s = s.replace(/\$\$([A-Za-z][A-Za-z0-9]*)=\$\\/g, (_, lead) => `$$${lead}=\\`)
  // `$$6 $\\mathrm…$` / `$$3=$\\mathrm…$` — digit then a stray `$` before a command (Q72/Q73).
  s = s.replace(/\$\$(\d+)\s+\$\\/g, (_, n) => `$$${n}\\`)
  s = s.replace(/\$\$(\d+)=\$\\/g, (_, n) => `$$${n}\\`)
  // FIITJEE empty-dollar holes where a figure was: ` $ $ $ $ $$…` → one display open.
  // Require a leading space/start so a real closing `$` of inline math is not eaten.
  s = s.replace(/(\s|^)(?:\$[ \t]+){2,}\$\$/g, '$1$$')
  // Bare `Let } $…` / leading `} $` from a cut aligned opener (Q20).
  s = s.replace(/(?:^|\n)\s*Let\s*\}\s*\$/g, '\n$')
  s = s.replace(/(?:^|\n)\s*\}\s*\$/g, '\n$')
  // `$\\mathrm{I}$ $$\\begin{aligned}` → close inline, open display on its own line.
  s = s.replace(/\$(\\mathrm\{[^}]+\})\$\s*\$\$\\begin\{aligned\}/g, '$$$1$$\n$$\\begin{aligned}')
  s = s.replace(/\$([^$\n]{1,80})\$\s*\$\$\\begin\{aligned\}/g, '$$$1$$\n$$\\begin{aligned}')
  // `$IF=…$$\Rightarrow …$$` (odd dollars) → one display block.
  s = s.replace(/\$([^$\n]{1,240}?)\$\$(\\Rightarrow[^$]{0,500}?)\$\$/g, (_, a, b) => `$$${a}${b}$$`)
  // `$IF=…$ $\Rightarrow …$` / `$$` left by a bad wrapBareLatexRuns pass → one display.
  s = s.replace(/\$([^$\n]{1,240}?)\$\s+\$(\\Rightarrow[^$]{0,500}?)\$\$?/g, (_, a, b) => `$$${a}${b}$$`)
  // Other `$…$$` glued to a following command — close inline then open display.
  // Skip the second `$` of a finished `$$…$$` so prose between two displays is kept (S1 Q66).
  s = s.replace(/(^|[^$])\$([^$\n]{1,240}?)\$\$(?=\\|(?:\s*\\Rightarrow)|\$\$)/g, (_, lead, inner) => `${lead}$${inner}$ $$`)
  // `\end{aligned}` must sit inside $$…$$; a lone trailing `$` is a cut closer.
  s = s.replace(/\\end\{aligned\}\$(?!\$)/g, () => '\\end{aligned}$$')
  // Prose after a closed aligned block with no $$ — close the display first.
  s = s.replace(/\\end\{aligned\}(?!\s*\$)(?=\s*[A-Za-z])/g, () => '\\end{aligned}$$\n')
  // Lone `$\\begin{aligned}` (missing a display dollar) → `$$\\begin{aligned}` (Q48–55).
  // Replacement uses a function: in replace strings `$$` is only one `$`.
  s = s.replace(/(^|[^$])\$\\begin\{aligned\}/gm, (_, lead) => `${lead}$$\\begin{aligned}`)
  // Open `$$\begin{aligned}` … `\end{aligned}` at EOF without `$$`.
  if (/\$\$\s*\\begin\{aligned\}/.test(s) && /\\end\{aligned\}\s*$/.test(s) && !/\\end\{aligned\}\s*\$\$\s*$/.test(s)) {
    s = s.replace(/\\end\{aligned\}\s*$/, () => '\\end{aligned}$$')
  }
  // Also close the last aligned when a single `$` was left at EOF.
  s = s.replace(/\\end\{aligned\}\$\s*$/g, () => '\\end{aligned}$$')
  // Mid-solution `\end{aligned}` closed with one `$` before more prose.
  s = s.replace(/\\end\{aligned\}\$(?!\$)(?=\s)/g, () => '\\end{aligned}$$')
  // `$…\lambda$ and \mathrm{cf}…\Rightarrow$` — prose “and” closed math too early (Q7).
  // Re-open `$` before the bare command so raw \mathrm is not left on screen.
  s = s.replace(
    /(\$(?:[^$\n]{1,200}?)\$)(\s+(?:and|or|then)\s+)(\\(?:mathrm|mathbf|mathbb|frac|text)\{)/g,
    (_, a, mid, cmd) => `${a}${mid}$${cmd}`,
  )
  // `$10 A$$.` / `$2 $V_1=V_2$$` — OCR closed inline with `$$` (2014 P1 printed-key scraps).
  // Do not match the second `$` of a real `$$…$$` display (wrapBareLatexRuns may promote
  // `$\\xrightarrow…$` → `$$\\xrightarrow…$$`; eating that re-opens raw commands — S1 Q66).
  s = s.replace(/(^|[^$])\$([^$\n]{1,120}?)\$\$(?=[\s.,;:!?]|$)/g, (_, lead, inner) => `${lead}$${inner}$`)
  // `]$$Q=2\times…$.` — display opened then closed with a single `$`.
  s = s.replace(/\$\$([^$\n]{1,160}?)\$\.(?=\s|$)/g, (_, inner) => `$$${inner}$$.`)
  // `$$ Answer :` leftover after stripping `$\\end{itemize}$` — plain prose, not maths.
  s = s.replace(/\$\$\s*(Answer\s*:)/gi, '$1')
  // `$2 $V_{1}=…` — digit then a nested `$` before the real math (printed-key OCR).
  s = s.replace(/\$(\d+)\s+\$([^$\n]{1,120}?)\$\$/g, (_, n, inner) => `$${n} ${inner}$`)
  s = s.replace(/\$(\d+)\s+\$([^$\n]{1,120}?)\$/g, (_, n, inner) => `$${n} ${inner}$`)
  // `Var. $=$\\frac…$` / bad heal `Var. $= $\\frac…` — empty dollars left `\frac` raw (S2 Q3).
  s = s.replace(/\$=\$\\/g, '$=\\')
  s = s.replace(/\$=\s+\$\\/g, '$=\\')
  // `$$y_1=…$\n$$\\begin` / `$$…=14$` — display opened then closed with a single `$` (S2 Q3/Q51).
  s = s.replace(/\$\$([^$\n]{1,240}?)\$\s*(?=\$\$)/g, (_, inner) => `$$${inner}$$\n`)
  s = s.replace(/\$\$([^$\n]{1,240}?)\$\s*$/gm, (_, inner) => `$$${inner}$$`)
  // `Proteins $$\xrightarrow{…}$ Peptides` — display opened then closed with one `$` (S1 Q66).
  s = s.replace(/\$\$(\\xrightarrow\{[^}]*\}[^$\n]{0,80}?)\$(?!\$)/g, (_, inner) => `$$${inner}$$`)
  // Open `$$…MeV` / `$$…` at EOF with no closer (S1 Q37 truncated institute Sol.).
  // Do not pair a bare leftover opener `…$$` at EOF — cleanInstituteSolutionBody strips those.
  if (
    /\$\$/.test(s) &&
    (s.match(/\$\$/g) || []).length % 2 === 1 &&
    !/\$\$\s*$/.test(s)
  ) {
    s = `${s.trimEnd()}$$`
  }
  return s
}

/**
 * Human reason when a stored solution still has institute chrome / smashed symbols ('' when clean).
 * Used by Quality check and Auto-fix.
 * @param {unknown} text
 */
export function instituteSolutionDirtyReason(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return ''
  const cleaned = cleanInstituteSolutionBody(raw)
  if (cleaned !== raw.trim()) {
    if (SOLUTION_TAIL_CHROME_RE.test(raw) || /Maximum\s+Marks|marking scheme/i.test(raw)) {
      return 'The solution still has section instructions or a marking scheme after Sol.; they are removed'
    }
    if (MERGED_Q_IN_SOL_RE.test(raw)) {
      return 'The next question was glued into this solution; it is cut off'
    }
    if (SMASHED_DELTA_RE.test(raw)) {
      return 'A smashed “Delta” in the solution is drawn as △'
    }
    if (/!\[\]\(\s*\)/.test(raw)) {
      return 'Empty picture placeholders are removed from the solution'
    }
    if (INSTITUTE_PAGE_FURNITURE_RE.test(raw)) {
      INSTITUTE_PAGE_FURNITURE_RE.lastIndex = 0
      return 'A running page header is still inside the solution; it is removed'
    }
  }
  INSTITUTE_PAGE_FURNITURE_RE.lastIndex = 0
  if (instituteSolutionLooksLikeRawPdf(raw)) {
    if (salvageInstituteSolutionBody(raw)) {
      return 'PDF font junk is stripped so the readable institute wording stays'
    }
    return 'The solution is only raw PDF letters (not drawable); it is cleared — re-add the institute PDF (Mathpix) for drawn maths'
  }
  return ''
}

/** @param {unknown} text */
export function instituteSolutionLooksDirty(text) {
  return Boolean(instituteSolutionDirtyReason(text))
}

/**
 * True when Quality can locally strip chrome or clear PDF-font junk.
 * @param {unknown} text
 */
export function instituteSolutionChromeFixable(text) {
  return Boolean(instituteSolutionDirtyReason(text))
}

/** Solutions that still contain the next question — the split failed. */
export function instituteSolutionsMergedCount(read) {
  if (!read?.entries?.size) return 0
  let n = 0
  for (const e of read.entries.values()) {
    if (MERGED_Q_IN_SOL_RE.test(String(e.solution || ''))) n += 1
  }
  return n
}

/**
 * Per question: keep Mathpix maths when it draws cleanly, and fill gaps from the PDF text.
 * @param {ReturnType<typeof readInstituteSolutions>} readMp
 * @param {ReturnType<typeof readInstituteSolutions>} readPdf
 */
/**
 * Prefer a usable Mathpix / salvaged body over raw PDF font junk so merge keeps
 * the maximum institute solutions students can actually read.
 * @param {unknown} text
 */
function preferredInstituteSolutionBody(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return ''
  const salvaged = salvageInstituteSolutionBody(raw)
  if (salvaged) return salvaged
  const cleaned = cleanInstituteSolutionBody(raw)
  if (cleaned && !instituteSolutionLooksLikeRawPdf(cleaned)) return cleaned
  return ''
}

/**
 * PDF-only FIITJEE booklets often look fine on screen but their text layer is private-use
 * maths fonts. Never keep that junk as a solution body — empty is better; Mathpix must fill it.
 * @param {unknown} text
 */
function usableOrEmptyInstituteSolution(text) {
  const preferred = preferredInstituteSolutionBody(text)
  if (preferred && instituteSolutionIsUsable(preferred)) return preferred
  return ''
}

export function mergeInstituteSolutionReads(readMp, readPdf) {
  const a = readMp?.entries
  const b = readPdf?.entries
  if (!a?.size) {
    if (!b?.size) return readPdf || readMp
    // PDF-only: keep answers/questions, drop unreadable solution bodies.
    const entries = new Map()
    for (const [key, eb] of b) {
      entries.set(key, { ...eb, solution: usableOrEmptyInstituteSolution(eb?.solution) })
    }
    return { ...readPdf, entries }
  }
  if (!b?.size) return readMp || readPdf
  /** @type {Map<string, { answer: string, solution: string, question: string }>} */
  const entries = new Map()
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const ea = a.get(key)
    const eb = b.get(key)
    if (!ea) {
      entries.set(key, { ...eb, solution: usableOrEmptyInstituteSolution(eb?.solution) })
      continue
    }
    if (!eb) {
      entries.set(key, { ...ea, solution: usableOrEmptyInstituteSolution(ea?.solution) })
      continue
    }
    // Mathpix first for solutions; PDF text only if Mathpix is empty and PDF is readable.
    const solMp = usableOrEmptyInstituteSolution(ea.solution)
    const solPdf = usableOrEmptyInstituteSolution(eb.solution)
    let solution = ''
    if (solMp && solPdf) {
      const scoreA = instituteSolutionDisplayScore(solMp)
      const scoreB = instituteSolutionDisplayScore(solPdf)
      // Prefer Mathpix when scores are close — PDF salvages are often half-missing glyphs.
      solution = scoreA + 3 >= scoreB ? solMp : solPdf
    } else solution = solMp || solPdf
    // Mathpix stems win over longer PDF font-junk (FIITJEE PUA / stacked digits).
    const question = preferredInstituteQuestion(ea.question, eb.question)
    const answer = String(ea.answer || '').trim() || String(eb.answer || '').trim()
    entries.set(key, { answer, solution, question })
  }
  return {
    entries,
    subjects: [...new Set([...(readMp.subjects || []), ...(readPdf.subjects || [])])],
    layout: readMp.layout || readPdf.layout,
    sectionText: String(readMp.sectionText || readPdf.sectionText || ''),
  }
}

/**
 * True when a PDF text layer is mostly FIITJEE/Allen private-use maths fonts — looks fine
 * on screen, but copy-paste / PyMuPDF text is unreadable. Solutions must come from Mathpix.
 * @param {unknown} text
 */
export function pdfTextIsMathFontJunk(text) {
  const s = String(text ?? '')
  if (s.length < 400) return false
  const pua = (s.match(PDF_PUA_RE) || []).length
  PDF_PUA_RE.lastIndex = 0
  return pua >= 40 && pua / s.length >= 0.002
}

/**
 * Drop solution bodies that students cannot read; keep answers and repeated stems.
 * @param {ReturnType<typeof readInstituteSolutions> | null | undefined} read
 */
export function stripUnusableInstituteSolutions(read) {
  if (!read?.entries?.size) return read
  /** @type {Map<string, { answer: string, solution: string, question: string }>} */
  const entries = new Map()
  for (const [key, entry] of read.entries) {
    entries.set(key, { ...entry, solution: usableOrEmptyInstituteSolution(entry?.solution) })
  }
  return { ...read, entries }
}

/**
 * Prefer the scan that found more answers without gluing the next question into a solution.
 * When both reads exist, merge per question so Mathpix maths wins over PDF font glyphs, while
 * PDF coverage still fills questions Mathpix missed.
 * High-PUA FIITJEE text layers contribute answers only — never solution bodies.
 * @param {string} mathpixText
 * @param {string} pdfText
 * @param {{ institute?: string }} [opts]
 * @returns {{ text: string, source: 'mathpix' | 'pdf' | 'mathpix-only' | 'pdf-only' | 'merged' | 'empty', read: ReturnType<typeof readInstituteSolutions> }}
 */
/** Rebuild apply()-ready text from a parsed institute read. @param {ReturnType<typeof readInstituteSolutions>} read */
function instituteReadToText(read) {
  const parts = []
  for (const [key, e] of read?.entries || []) {
    const colon = key.lastIndexOf(':')
    const head = key.slice(0, colon)
    const n = key.slice(colon + 1)
    const subject = head.startsWith('#') ? '' : head
    if (subject) parts.push(subject.replace(/^./, (c) => c.toUpperCase()))
    parts.push(`Q.${n} ${e.question || ''}`.trim())
    if (e.answer) parts.push(`Ans. ${e.answer}`)
    if (e.solution) parts.push(`Sol. ${e.solution}`)
  }
  return parts.join('\n')
}

export function pickInstituteSolutionsText(mathpixText, pdfText, opts = {}) {
  const mp = String(mathpixText ?? '').trim()
  const pdf = String(pdfText ?? '').trim()
  const readMp = mp ? readInstituteSolutions(mp, opts) : null
  const readPdfRaw = pdf ? readInstituteSolutions(pdf, opts) : null
  const pdfIsJunk = pdfTextIsMathFontJunk(pdf)
  // FIITJEE digital PDFs: keep Ans. from the text layer, never Sol. font junk.
  const readPdf = pdfIsJunk ? stripUnusableInstituteSolutions(readPdfRaw) : readPdfRaw
  const score = (read) => instituteAnswerCount(read) - 3 * instituteSolutionsMergedCount(read)
  const nMp = score(readMp)
  const nPdf = score(readPdf)
  if (!instituteAnswerCount(readMp) && !instituteAnswerCount(readPdf)) {
    return { text: mp || pdf, source: 'empty', read: readMp || readPdf }
  }
  if (!instituteAnswerCount(readPdf)) return { text: mp, source: 'mathpix-only', read: readMp }
  if (!instituteAnswerCount(readMp)) {
    // Answers from the PDF are fine; strip unreadable solution bodies before apply.
    const cleaned = mergeInstituteSolutionReads(
      { entries: new Map(), subjects: [], layout: readPdf?.layout || 'repeated_questions', sectionText: '' },
      readPdf,
    )
    return { text: instituteReadToText(cleaned) || pdf, source: 'pdf-only', read: cleaned }
  }
  // High-PUA FIITJEE layers: always Mathpix sols + PDF answers. Never prefer PDF Sol. bodies
  // just because Mathpix found fewer answers (thin OCR still beats unreadable glyphs).
  if (pdfIsJunk || (instituteAnswerCount(readMp) && instituteAnswerCount(readPdf))) {
    const merged = mergeInstituteSolutionReads(readMp, readPdf)
    return { text: instituteReadToText(merged) || mp, source: 'merged', read: merged }
  }
  if (nMp >= nPdf && instituteSolutionsMergedCount(readMp) <= instituteSolutionsMergedCount(readPdf)) {
    return { text: mp, source: 'mathpix', read: readMp }
  }
  // Readable PDF text (not PUA junk) may win coverage; still strip any unusable Sol. bodies.
  return { text: instituteReadToText(stripUnusableInstituteSolutions(readPdf)) || pdf, source: 'pdf', read: stripUnusableInstituteSolutions(readPdf) }
}

/**
 * Read an institute solutions file. Each question starts with its printed number; a number counts
 * as the next question only once the one before reached its "Ans." / "Sol.", and only when an
 * "Ans." / "Sol." follows before the next number — so numbered steps in a solution and numbered
 * statements in a question are not new questions. A subject line (or a long run) restarts the numbering.
 * Same shape as the end-of-paper key, with the repeated question as `question`.
 * A file that prints only answers and solutions ("1. (B)", "Q.1 Sol. …") is read as an answer file.
 * FIITJEE: "*Q.3" / "*Q8." are question starts; "Ans.." then "Sol. (A)" is the answer letter.
 * @param {unknown} raw Mathpix text
 * @param {{ institute?: string }} [opts]
 * @returns {{ entries: Map<string, { answer: string, solution: string, question: string }>, subjects: string[], layout: 'repeated_questions' | 'answers_only', sectionText: string } | null}
 */
export function readInstituteSolutions(raw, opts = {}) {
  const lines = cleanLines(breakInstituteMarkers(raw), opts.institute)
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
      // Once this question reached "Ans." / "Sol.", only the next number in order may open a new
      // question. A bare "1." inside the working must not steal the rest; a new subject may still
      // restart at "Q.1" (or "1." right after a subject heading).
      const subjectRestart = n === 1 && ahead && (fresh || (last >= 8 && hasQPrefix(l.probe)))
      // A bare "6." / "2. Then a=…" in the working is a step; Allen's "2. A ball…" and FIITJEE's "Q.7" are not.
      const nextInOrder =
        n === last + 1 &&
        (!stepRun || hasQPrefix(l.probe) || (looksLikeNextQuestion(l.probe) && !looksLikeSolutionStep(l.probe)))
      const nextQuestion = !cur ? ahead : cur.marked ? nextInOrder || subjectRestart : n === last + 1 && ahead
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
  // One Sol. block is enough; do not replace it with an answer-key read of the marking scheme.
  if (entries.size >= 1) return { entries, subjects, layout: 'repeated_questions', sectionText: '' }
  const plain = readAnswerFileSection(raw)
  if (plain?.entries?.size) {
    /** @type {Map<string, { answer: string, solution: string, question: string }>} */
    const asRead = new Map()
    for (const [key, e] of plain.entries) asRead.set(key, { answer: e.answer || '', solution: e.solution || '', question: '' })
    return { entries: asRead, subjects: plain.subjects, layout: 'answers_only', sectionText: plain.sectionText }
  }
  return null
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
 * card has nothing): its answer against the official key, its text against the institute copy,
 * an institute question that may be this one, and options that could not be lined up. The last
 * two go once an admin edits the card.
 * @param {any} q
 * @returns {{
 *   answer: { said: string, official: string } | null,
 *   text: ReturnType<typeof instituteTextDifference>,
 *   unsure: { label: string, answer: string } | null,
 *   options: { said: string } | null,
 * }}
 */
export function instituteCardNotes(q) {
  const said = String(q?.instituteAnswerDisagrees ?? '').trim()
  const fields = said ? endKeyAnswerFields(said, q) : null
  const copy = String(q?.instituteQuestionText ?? '').trim()
  const text = copy ? instituteTextDifference(q, copy) : null
  const edited = q?.adminEdited === true
  const guess = q?.instituteUnsureMatch
  const optionsSaid = String(q?.instituteOptionsUnmatched ?? '').trim()
  return {
    answer: fields && !instituteAnswerAgrees(q, fields) ? { said, official: instituteAnswerText(q) || 'nothing' } : null,
    text: text?.differs ? text : null,
    unsure: !edited && guess?.label ? { label: String(guess.label), answer: String(guess.answer ?? '') } : null,
    options: !edited && optionsSaid ? { said: optionsSaid } : null,
  }
}

/**
 * Quality check lines for an institute file: answers that differ from the official key, stems
 * that differ from the institute's copy, institute questions matched with doubt (not used), and
 * options that could not be lined up (answer not used). Cards an admin approved get no alarms.
 * @param {any[]} questions @param {(q: any) => boolean} [isPlaceholder]
 * @returns {string[]}
 */
export function instituteQualityLines(questions, isPlaceholder = () => false) {
  /** @type {Array<{ n: number, said: string, official: string }>} */
  const disagree = []
  /** @type {number[]} */
  const textDiffers = []
  /** @type {string[]} */
  const doubts = []
  ;(Array.isArray(questions) ? questions : []).forEach((q, i) => {
    if (!q || isPlaceholder(q) || q.adminApproved === true) return
    if (!INSTITUTE_NOTE_FIELDS.some((key) => q[key])) return
    const notes = instituteCardNotes(q)
    if (notes.answer) disagree.push({ n: i + 1, ...notes.answer })
    if (notes.text) textDiffers.push(i + 1)
    if (notes.unsure) {
      doubts.push(
        `Go to Q ${i + 1}. Institute ${notes.unsure.label} looks like official Q ${i + 1} but not sure — its answer and solution were not used; check.`,
      )
    }
    if (notes.options) {
      doubts.push(
        `Go to Q ${i + 1}. The institute's options could not be matched to this question's options — its answer (${notes.options.said}) was not used; check.`,
      )
    }
  })
  /** @type {string[]} */
  const lines =
    disagree.length > MAX_ANSWER_LINES
      ? [`Go to Q ${disagree.map((d) => d.n).join(', ')}. The institute answer differs from the official key; the official answer is kept — check.`]
      : disagree.map((d) => `Go to Q ${d.n}. Institute says ${d.said}, official key says ${d.official} — check.`)
  if (textDiffers.length) {
    lines.push(`Go to Q ${textDiffers.join(', ')}. Question text differs from the institute copy — check against the original.`)
  }
  return lines.concat(doubts)
}
