/**
 * Papers that print every answer, or every worked solution, after the last question:
 * "ANSWER KEY" then "1. (B)  2. (C) …", or "SOLUTIONS" / "HINTS & SOLUTIONS" then "1. …  2. …".
 * That part is no question: it is cut off before questions are counted or split, read into a
 * key by question number (one key per subject when the numbering restarts), and put on the
 * cards as printed on the paper.
 */
import { numericChoiceFields, parseNumericAnswer, parseNumericAnswerChoices } from './answerAlternatives.js'

const HEADING_SRC = String.raw`^[ \t]*(?:\\section\*?\{\s*)?((?:ANSWER\s*KEYS?|ANSWERS)(?:\s*(?:&|\\&|AND|WITH)\s*(?:SOLUTIONS|EXPLANATIONS|HINTS))?|HINTS?\s*(?:&|\\&|AND)\s*SOLUTIONS|SOLUTIONS|EXPLANATIONS)[ \t]*(?:\}[ \t]*)?$`
const headingRe = () => new RegExp(HEADING_SRC, 'gim')
const SUBJECT_LINE_RE =
  /^[ \t]*(?:\\section\*?\{\s*)?(?:PART\s*[-\u2013\u2014]?\s*(?:IV|I{1,3}|[A-D1-4])\s*[:\-\u2013\u2014]?\s*)?(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS?|BIOLOGY)[ \t]*(?:\}[ \t]*)?$/i
const QUESTION_MARK_RE =
  /\\item\s*\[\s*Q|(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?Q\s*\.?\s*\d{1,3}\b|(?:^|\n)[ \t]*(?:\\item\s*\[\s*)?\d{1,3}\s*\.(?:\s*\])?[ \t]+\S/g
const OPTION_D_LINE_RE = /(?:^|\n)[ \t]*(?:\\item\s*\[\s*)?\(\s*D\s*\)/g

const VALUE_SRC = String.raw`\(\s*[A-D]\s*\)(?:\s*(?:,|&|and)\s*\(\s*[A-D]\s*\))*|[A-D](?:\s*,\s*[A-D])*|\[\s*-?\d+(?:\.\d+)?\s*(?:to|\u2013|\u2014|-)\s*-?\d+(?:\.\d+)?\s*\]|-?\d+(?:\.\d+)?`
const VALUE_RE = new RegExp(String.raw`^(?:${VALUE_SRC})$`, 'i')
const KEY_TOKEN_RE = new RegExp(
  String.raw`(?:^|[\s,;|])(?:Q\s*\.?\s*(?:No\.?\s*)?)?(\d{1,3})\s*[.):\-\u2013]\s*(${VALUE_SRC})(?=$|[\s,;|.])`,
  'gm',
)
const SOLUTION_START_RE =
  /^[ \t]*(?:\\item\s*\[\s*)?(?:(?:Q|Sol(?:ution)?|Ans)\s*\.?\s*)?(\d{1,3})\s*(?:[.):]\s*\]?|\])(?=\s|$)/
const ANSWER_LEAD_RE = new RegExp(String.raw`^(?:Ans(?:wer)?s?\s*[.:\-=]?\s*)?(\(\s*[A-D]\s*\)(?:\s*(?:,|&|and)\s*\(\s*[A-D]\s*\))*)(?=\s|$)`, 'i')
const ANSWER_LINE_RE = new RegExp(String.raw`(?:^|\n)[ \t]*Ans(?:wer)?s?\s*[.:\-=]\s*(${VALUE_SRC})[ \t]*(?=\n|$)`, 'i')
const SOLUTION_MARK_RE = /^(?:Sol(?:ution)?|Explanation|Hints?)\s*[.:\-\u2013]?\s*/i

function subjectName(raw) {
  const s = String(raw ?? '').toLowerCase()
  if (/^math/.test(s)) return 'mathematics'
  return ['physics', 'chemistry', 'biology'].includes(s) ? s : ''
}

/** Rows of a key table: a row of numbers over a row of answers, or "N & answer" pairs. */
function tabularEntries(tab) {
  const rows = tab
    .replace(/\\(?:begin|end)\{tabular\}(?:\[[a-z]\])?(?:\{[^{}]*\})?/g, '')
    .replace(/\\hline/g, '')
    .split(/\\\\/)
    .map((row) => row.split('&').map((cell) => cell.replace(/\$/g, '').trim()))
    .filter((cells) => cells.some(Boolean))
  const out = []
  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i]
    const next = rows[i + 1]
    if (cells.every((c) => /^\d{1,3}$/.test(c)) && next?.length === cells.length && next.every((c) => VALUE_RE.test(c))) {
      cells.forEach((c, k) => out.push({ n: Number(c), value: next[k] }))
      i += 1
      continue
    }
    if (cells.length % 2 === 0) {
      for (let k = 0; k < cells.length; k += 2) {
        if (/^\d{1,3}$/.test(cells[k]) && VALUE_RE.test(cells[k + 1])) out.push({ n: Number(cells[k]), value: cells[k + 1] })
      }
    }
  }
  return out
}

function keyEntries(text) {
  const out = []
  let rest = String(text)
  for (const tab of rest.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/g) || []) {
    out.push(...tabularEntries(tab))
    rest = rest.replace(tab, '\n')
  }
  for (const m of rest.matchAll(KEY_TOKEN_RE)) out.push({ n: Number(m[1]), value: m[2].trim() })
  return out
}

/** One printed solution block: a leading "(B)" or an "Ans. (B)" line is the answer, the rest the solution. */
function solutionBlock(content) {
  let s = String(content).replace(/\\(?:begin|end)\{(?:itemize|enumerate)\}/g, '').trim()
  let answer = ''
  const line = s.match(ANSWER_LINE_RE)
  if (line) {
    answer = line[1]
    s = s.replace(line[0], '\n').trim()
  } else {
    const lead = s.match(ANSWER_LEAD_RE)
    if (lead) {
      answer = lead[1]
      s = s.slice(lead[0].length).trim()
    }
  }
  const solution = s.replace(SOLUTION_MARK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
  return { answer, solution }
}

/** Steps "1. 2. 3." inside a solution are not new blocks; numbering restarts only after a long run. */
function solutionEntries(text) {
  const out = []
  let current = null
  let last = 0
  for (const line of String(text).split('\n')) {
    const m = line.match(SOLUTION_START_RE)
    const n = m ? Number(m[1]) : 0
    if (m && (last === 0 || n === last + 1 || (n === 1 && last >= 8))) {
      if (current) out.push(current)
      current = { n, restart: n === 1 && last > 0, lines: [line.slice(m[0].length)] }
      last = n
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) out.push(current)
  return out.map((b) => ({ n: b.n, restart: b.restart, ...solutionBlock(b.lines.join('\n')) }))
}

/** @param {string} sectionText */
function readSection(sectionText) {
  /** @type {Map<string, { answer?: string, solution?: string }>} */
  const entries = new Map()
  /** @type {string[]} */
  const subjects = []
  const heads = [...sectionText.matchAll(headingRe())]
  heads.forEach((head, h) => {
    const kind = /SOLUTION|EXPLANATION|HINT/i.test(head[1]) ? 'solutions' : 'key'
    const body = sectionText.slice(head.index + head[0].length, heads[h + 1]?.index ?? sectionText.length)
    /** @type {Array<{ subject: string, text: string }>} */
    const parts = [{ subject: '', text: '' }]
    for (const line of body.split('\n')) {
      const subject = line.match(SUBJECT_LINE_RE)
      if (subject) {
        parts.push({ subject: subjectName(subject[1]), text: '' })
        continue
      }
      parts[parts.length - 1].text += `${line}\n`
    }
    let index = 0
    for (const part of parts) {
      if (!part.text.trim()) continue
      if (part.subject && !subjects.includes(part.subject)) subjects.push(part.subject)
      let last = 0
      const rows =
        kind === 'key'
          ? keyEntries(part.text).map((e) => ({ ...e, solution: '' }))
          : solutionEntries(part.text).map((e) => ({ n: e.n, value: e.answer, solution: e.solution, restart: e.restart }))
      for (const row of rows) {
        if (!part.subject && last > 0 && (row.n <= last || row.restart)) index += 1
        last = row.n
        const key = `${part.subject || `#${index}`}:${row.n}`
        const prev = entries.get(key) || {}
        entries.set(key, {
          ...prev,
          ...(row.value && !prev.answer ? { answer: row.value } : {}),
          ...(row.solution && !prev.solution ? { solution: row.solution } : {}),
        })
      }
    }
  })
  return { entries, subjects }
}

let lastIn = ''
/** @type {ReturnType<typeof readEndAnswerSectionOnce>} */
let lastOut = null

/**
 * The answer / solution part printed after the last question, or null.
 * The heading must be a line of its own, at least two questions must come before it, and the
 * part must read as answers (not as more questions with options).
 * @param {unknown} raw
 * @returns {{ questionText: string, sectionText: string, entries: Map<string, { answer?: string, solution?: string }>, subjects: string[] } | null}
 */
export function readEndAnswerSection(raw) {
  const text = String(raw ?? '')
  if (text === lastIn) return lastOut
  lastIn = text
  lastOut = readEndAnswerSectionOnce(text)
  return lastOut
}

function readEndAnswerSectionOnce(raw) {
  const text = raw.replace(/\r\n?/g, '\n')
  if (!new RegExp(HEADING_SRC, 'im').test(text)) return null
  for (const m of text.matchAll(headingRe())) {
    const before = text.slice(0, m.index)
    if ((before.match(QUESTION_MARK_RE) || []).length < 2) continue
    const sectionText = text.slice(m.index)
    const read = readSection(sectionText)
    if (read.entries.size < 2) continue
    if ((sectionText.match(OPTION_D_LINE_RE) || []).length >= Math.max(3, read.entries.size / 2)) continue
    return { questionText: before.replace(/\s+$/, ''), sectionText: sectionText.trim(), ...read }
  }
  return null
}

/** Paper text without the printed answer / solution part at the end. @param {unknown} raw */
export function stripEndAnswerSection(raw) {
  const end = readEndAnswerSection(raw)
  return end ? end.questionText : String(raw ?? '')
}

/** The printed answer / solution part as stored after the paper ('' when there is none). @param {unknown} raw */
export function storedEndAnswerSectionText(raw) {
  const end = readEndAnswerSection(raw)
  return end ? `\n\n${end.sectionText}\n` : ''
}

const ANSWER_FIELDS = ['correctIndex', 'correctIndices', 'correctInteger', 'correctNumerical', 'numericalTolerance', 'numericalAlternatives']

/** Answer fields for one card from a printed value ("(B)", "A, C", "7", "[0.7 to 0.8]"). */
export function endKeyAnswerFields(value, q) {
  const v = String(value ?? '').trim().replace(/\band\b/gi, ',')
  if (/^[\s(),&;A-D]+$/i.test(v)) {
    const letters = [...new Set([...v.toUpperCase().matchAll(/[A-D]/g)].map((m) => m[0].charCodeAt(0) - 65))].sort((a, b) => a - b)
    if (!letters.length) return null
    return letters.length > 1 || q?.questionType === 'multiple_correct' ? { correctIndices: letters } : { correctIndex: letters[0] }
  }
  const choices = parseNumericAnswerChoices(v)
  if (choices) return numericChoiceFields(choices)
  const band = parseNumericAnswer(v.replace(/^\[\s*(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*\]$/, '[$1 to $2]'))
  if (!band) return null
  if (band.tolerance != null) return { correctNumerical: band.value, numericalTolerance: band.tolerance }
  const filledOptions = (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
  if (filledOptions >= 2 && Number.isInteger(band.value) && band.value >= 1 && band.value <= 4) {
    return { correctIndex: band.value - 1 }
  }
  return Number.isInteger(band.value) && q?.questionType !== 'numerical'
    ? { correctInteger: band.value }
    : { correctNumerical: band.value }
}

/**
 * The key table and the solutions are often printed apart (key without subjects, solutions under
 * subject lines with running numbers), so one card's answer and solution can sit under two keys.
 */
function entryFor(end, n, subject, seg, numberRun) {
  const keys = [subject && `${subject}:${n}`, end.subjects[seg] && `${end.subjects[seg]}:${n}`, `#${numberRun}:${n}`]
  const named = end.subjects.filter((s) => end.entries.has(`${s}:${n}`))
  if (!subject && named.length === 1) keys.push(`${named[0]}:${n}`)
  let answer = ''
  let solution = ''
  for (const key of keys) {
    const e = key ? end.entries.get(key) : null
    if (!e) continue
    answer ||= e.answer || ''
    solution ||= e.solution || ''
  }
  return answer || solution ? { answer, solution } : null
}

/**
 * Put the end-of-paper answers and solutions on the cards (printed number, per subject when the
 * numbering restarts). A card the key does not name is left as it is; an admin's edit stays.
 * `fillOnly` leaves a card that already has a printed answer or a solution as it is.
 * @param {Array<Record<string, any>>} questions
 * @param {ReturnType<typeof readEndAnswerSection>} end
 * @param {{ fillOnly?: boolean }} [opts]
 */
export function applyEndAnswerSection(questions, end, opts = {}) {
  if (!end?.entries?.size || !Array.isArray(questions)) return questions
  let seg = 0
  let numberRun = 0
  let prev = 0
  let prevSubject = ''
  return questions.map((q, i) => {
    if (!q || typeof q !== 'object') return q
    const n = Number(q.printedNumber ?? q.questionNumber) || 0
    const subject = subjectName(q.subject)
    const restart = i > 0 && n > 0 && prev > 0 && n <= prev
    if (restart) numberRun += 1
    if (restart || (i > 0 && subject && prevSubject && subject !== prevSubject)) seg += 1
    if (n) prev = n
    if (subject) prevSubject = subject
    if (!n || q.placeholder === true) return q
    const entry = entryFor(end, n, subject, seg, numberRun)
    if (!entry) return q
    const next = { ...q }
    const fields = entry.answer ? endKeyAnswerFields(entry.answer, q) : null
    if (fields && q.adminEdited !== true && !(opts.fillOnly && q.answerSource === 'from_paper')) {
      for (const key of ANSWER_FIELDS) delete next[key]
      Object.assign(next, fields, { answerSource: 'from_paper' })
    }
    if (entry.solution && q.adminEdited !== true && q.solutionSource !== 'manual' && !(opts.fillOnly && String(q.solution ?? '').trim())) {
      next.solution = entry.solution
      next.solutionSource = 'from_paper'
    }
    return next
  })
}
