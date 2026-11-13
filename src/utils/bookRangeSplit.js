/**
 * One page range of a book / question bank PDF (Mathpix text) cut into the parts a teacher
 * reviews: each exercise, plus the solved examples of the chapter. Theory pages are left out.
 * Each part is then read by the same paper pipeline as an official PYQ (split, printed
 * answers and solutions, Quality check, Auto-fix, Compare), so the text of a part is written
 * in the forms that pipeline already reads:
 *   - questions start "Q. N" (books often print "1." with only a few questions per exercise),
 *   - a worked example is "Q. N" with its printed solution after "Sol.",
 *   - the answer key / hints of an exercise follow it under "ANSWER KEY" / "HINTS & SOLUTIONS",
 *     with "(b)" read as "(B)" and "(3)" as "(C)" when the options are printed (1)–(4).
 * Local only: no Gemini, no Mathpix.
 */

const HEADING_WRAP_RE = /^\s*(?:\\(?:section|subsection|subsubsection|title|chapter)\*?\{([\s\S]*)\}\s*$|#{1,6}\s+(.+)$|\\textbf\{([^{}]+)\}\s*$)/
const NUMBER_TOKEN = String.raw`(?:\d{1,3}(?:\.\d{1,3})*|[IVXL]{1,6}\b|[A-H]\b)`

const CHAPTER_RE = new RegExp(String.raw`^(?:chapter|unit)\s*[-:#.\u2013]?\s*(\d{1,3}|[IVXL]{1,6})\b\s*[:.\-\u2013]?\s*(.*)$`, 'i')
/** Headings that open an exercise of their own. */
const EXERCISE_RE = new RegExp(
  String.raw`^(?:exercises?|level|practice\s+(?:problems?|questions?|set|exercise)|problems(?:\s+for\s+practice)?|questions?\s+for\s+practice|assignments?|worksheets?|dpp|daily\s+practice|previous\s+years?(?:'|\u2019)?\s*(?:questions?|problems?|papers?)?|past\s+years?\s*(?:questions?|problems?)?|miscellaneous(?:\s+(?:exercise|questions?|problems?))?|ncert(?:\s+(?:exercise|exemplar|questions?))?|exemplar(?:\s+problems?)?|additional\s+(?:questions?|problems?|exercise)|review\s+(?:questions?|exercise)|chapter\s+(?:test|exercise|review)|board\s+(?:questions?|level)|competition\s+(?:level|corner)|test\s+(?:yourself|your\s+skills?)|self[\s-]+(?:test|assessment)|check\s+your\s+(?:understanding|progress)|objective\s+(?:questions?|exercise)|subjective\s+(?:questions?|exercise)|mcqs?)\b(?:\s*[-:#.\u2013]?\s*${NUMBER_TOKEN})?`,
  'i',
)
/** Headings for a kind of question inside an exercise ("Single correct", "Section A"): they cut only outside an exercise. */
const SUBTYPE_RE =
  /^(?:section|part)\s*[-:\u2013]?\s*(?:[A-H]|[IVX]{1,4}|\d{1,2})\b|^(?:only\s+)?(?:single|one|multiple|more\s+than\s+one|one\s+or\s+more)\s+(?:correct|choice|options?)|^(?:multiple\s+choice|comprehension|passage|paragraph\s+(?:based|type)|matrix|match(?:ing)?\s+(?:the\s+)?(?:columns?|following|type)|integer|numerical|assertion|statement|true\s*(?:or|\/|and)\s*false|fill\s+in|very\s+short|short\s+answer|long\s+answer|case\s+(?:study|based)|objective|subjective)\b/i
const EXAMPLES_HEAD_RE = /^(?:solved|worked(?:\s+out)?|illustrative|typical|selected|some)?\s*(?:examples?|illustrations?|problems?\s+solved)\s*(?:[-:.\u2013]\s*\S.*)?$/i
const ANSWERS_HEAD_RE =
  /^(?:answer\s*keys?|answers?(?:\s+(?:&|\\&|and|with)\s+(?:solutions?|hints?|explanations?))?|hints?\s*(?:&|\\&|and)\s*solutions?|solutions?|explanations?|hints?(?:\s+to\s+(?:selected\s+)?(?:questions|problems))?|answers?\s+to\s+.+|solutions?\s+to\s+.+)\s*(?:[-:.\u2013]\s*(.*))?$/i
/** Numbered topic heading of the theory ("2.3 Motion in a Plane"). */
const TOPIC_RE = /^\d{1,2}(?:\.\d{1,2}){1,3}\s+[A-Z][^\n]{2,80}$/
const EXAMPLE_LINE_RE =
  /^[ \t]*(?:\\textbf\{\s*)?(?:solved\s+)?(?:example|illustration|ex\.|eg\.)\s*[-:#.\u2013]?\s*(\d{1,3}(?:\.\d{1,3})?)\s*(?:\}\s*)?[:.)\]\-\u2013]*\s*(?:\}\s*)?/i
const SOLUTION_LINE_RE = /^[ \t]*(?:\\textbf\{\s*)?(?:solution|soln|sol|answer|ans)\s*(?:\}\s*)?[.:)\-\u2013]*\s*(?:\}\s*)?(?=\S|$)/i
const QUESTION_MARK_RE = /(?:^|\n)[ \t]*(?:\\section\*?\{\s*)?Q\s*\.?\s*\d{1,3}\b|\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\][ \t]*\d{1,3}\b)/g
const NUMBERED_LINE_RE = /^([ \t]*)(?:(\d{1,3})\s*[.)](?:[ \t]+(?=\S)|[ \t]*$)|\\item\s*\[\s*(\d{1,3})\s*[.)]?\s*\][ \t]*|Q\s*\.?\s*(\d{1,3})\s*[.):]?[ \t]*)/
const NUMERIC_OPTION_RE = /(?:^|\n|\s)\(\s*([1-4])\s*\)\s*\S/g
const LETTER_OPTION_RE = /(?:^|\n|\s)\(\s*([a-dA-D])\s*\)\s*\S/g

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 }

/** @param {string} line */
function headingText(line) {
  const m = String(line).match(HEADING_WRAP_RE)
  if (m) return { text: clean(m[1] ?? m[2] ?? m[3] ?? ''), wrapped: true }
  return { text: clean(line), wrapped: false }
}

/** @param {unknown} s */
function clean(s) {
  return String(s ?? '')
    .replace(/\\textbf\{([^{}]*)\}/g, '$1')
    .replace(/[{}*]/g, ' ')
    .replace(/\\&/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A plain line is a heading only when it is short and printed like one. */
function plainLineCanBeHeading(text) {
  if (!text || text.length > 70) return false
  if (/[.?]$/.test(text) && !/\b(?:no|ex)\.$/i.test(text)) return false
  if (text.split(/\s+/).length > 9) return false
  return true
}

/**
 * @param {string} line
 * @param {boolean} inExercise
 * @returns {{ kind: 'chapter' | 'exercise' | 'subtype' | 'examples' | 'answers' | 'theory', title: string, chapterNumber?: string } | null}
 */
export function classifyBookHeading(line, inExercise = false) {
  const { text, wrapped } = headingText(line)
  if (!text || (!wrapped && !plainLineCanBeHeading(text))) return null
  const ch = text.match(CHAPTER_RE)
  if (ch && (wrapped || text.length <= 60)) return { kind: 'chapter', title: text, chapterNumber: ch[1] }
  if (EXAMPLE_LINE_RE.test(text) && !EXAMPLES_HEAD_RE.test(text)) return null
  const shout = text === text.toUpperCase() && /[A-Z]{3}/.test(text)
  if (ANSWERS_HEAD_RE.test(text)) {
    // "Solution" alone under a question is that question's solution, not a heading.
    const plural = /answers|keys?|solutions|hints|explanations|\bto\b/i.test(text)
    if ((wrapped || shout) && (plural || wrapped)) return { kind: 'answers', title: text }
    return null
  }
  if (EXERCISE_RE.test(text)) return { kind: 'exercise', title: text }
  if (EXAMPLES_HEAD_RE.test(text) && (wrapped || shout)) return { kind: 'examples', title: text }
  if (SUBTYPE_RE.test(text) && (wrapped || shout)) return { kind: 'subtype', title: text }
  if (TOPIC_RE.test(text)) return { kind: 'theory', title: text }
  if (wrapped && !inExercise) return { kind: 'theory', title: text }
  return null
}

/** "Exercise - II" and "EXERCISE 2" are the same exercise. */
export function bookExerciseKey(title) {
  return clean(title)
    .toLowerCase()
    .replace(/\b(?:answers?|answer\s*keys?|keys?|hints?|solutions?|to|of|for|the|and|&)\b/g, ' ')
    .replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (r) => String(ROMAN[r]))
    .replace(/[^a-z0-9]+/g, '')
}

/** @param {string} text */
function countQuestionMarkers(text) {
  return (String(text).match(QUESTION_MARK_RE) || []).length
}

/**
 * Line-start numbers that count 1, 2, 3 … (restarting at 1 after a kind-of-question heading)
 * become "Q. N", so a short exercise splits like a paper.
 * @param {string} text
 */
export function markBookQuestionNumbers(text, opts = {}) {
  const lines = String(text).split('\n')
  if (countQuestionMarkers(text) >= 2) return { text, count: countQuestionMarkers(text) }
  let last = 0
  let count = 0
  let afterHeading = false
  const out = lines.map((line) => {
    if (classifyBookHeading(line, true)) {
      afterHeading = true
      return line
    }
    const m = line.match(NUMBERED_LINE_RE)
    if (!m) return line
    const n = Number(m[2] || m[3] || m[4])
    const restart = n === 1 && last > 0 && afterHeading
    const first = opts.startAny && last === 0 && n >= 1
    if (n !== last + 1 && !restart && !first) return line
    last = n
    count += 1
    afterHeading = false
    return `${m[1]}Q. ${n} ${line.slice(m[0].length)}`
  })
  return { text: out.join('\n'), count }
}

/** @param {string} questions */
function usesNumericOptions(questions) {
  const numeric = (String(questions).match(NUMERIC_OPTION_RE) || []).length
  const letters = (String(questions).match(LETTER_OPTION_RE) || []).length
  return numeric >= 4 && numeric > letters
}

/**
 * The key's "(b)" → "(B)"; with options printed (1)–(4), "(3)" means option C.
 * @param {string} answers
 * @param {{ numericOptions?: boolean }} [opts]
 */
export function normalizeBookAnswerKey(answers, opts = {}) {
  let out = String(answers).replace(/\(\s*([a-d])\s*\)/g, (_, l) => `(${l.toUpperCase()})`)
  out = out.replace(/(^|[\s,;|])(\d{1,3}\s*[.):\-\u2013]\s*)([a-d])(?=$|[\s,;|.])/gm, (_, a, b, l) => `${a}${b}${l.toUpperCase()}`)
  if (opts.numericOptions) {
    out = out.replace(/\(\s*([1-4])\s*\)/g, (_, d) => `(${'ABCD'[Number(d) - 1]})`)
  }
  return out
}

/** @param {string} text */
function exercisePartText(text) {
  const numericOptions = usesNumericOptions(text)
  return { text: numericOptions ? letterBookNumericOptions(text) : text, numericOptions }
}

/**
 * Options printed (1)–(4) are read as (A)–(D): in each question the last (1) that has (2), (3)
 * and (4) after it, in order. "From equation (1)" in the stem stays.
 * @param {string} text exercise text with "Q. N" markers
 */
export function letterBookNumericOptions(text) {
  const blocks = String(text).split(/(?=(?:^|\n)[ \t]*Q\s*\.?\s*\d{1,3}\b)/)
  return blocks
    .map((block) => {
      const marks = [...block.matchAll(/(^|\s)\(\s*([1-4])\s*\)(?=\s)/g)].map((m) => ({
        n: Number(m[2]),
        at: m.index + m[1].length,
        len: m[0].length - m[1].length,
      }))
      for (let i = marks.length - 1; i >= 0; i -= 1) {
        if (marks[i].n !== 1) continue
        const set = [marks[i]]
        for (let k = i + 1; k < marks.length && set.length < 4; k += 1) {
          if (marks[k].n === set.length + 1) set.push(marks[k])
        }
        if (set.length < 4) continue
        let out = block
        for (const m of [...set].reverse()) {
          out = `${out.slice(0, m.at)}(${'ABCD'[m.n - 1]})${out.slice(m.at + m.len)}`
        }
        return out
      }
      return block
    })
    .join('')
}

/** @param {string} text */
function optionMarkCount(text) {
  return (String(text).match(LETTER_OPTION_RE) || []).length + (String(text).match(NUMERIC_OPTION_RE) || []).length
}

/**
 * Inside an answer part an "Exercise 2" line heads that exercise's key, unless what follows
 * reads like questions (the key of the exercise before was printed right after it).
 * @param {string[]} lines
 * @param {number} from
 */
function answerKeyAhead(lines, from) {
  const ahead = []
  for (let i = from; i < lines.length && ahead.length < 25; i += 1) {
    if (classifyBookHeading(lines[i], true)) break
    if (lines[i].trim()) ahead.push(lines[i])
  }
  const text = ahead.join('\n')
  if (/\\begin\{tabular\}/.test(text)) return true
  const keys = (text.match(/(?:^|[\s,;|])\d{1,3}\s*[.):\-\u2013]\s*\(?\s*[A-Da-d1-4]\s*\)?(?=$|[\s,;|.])/gm) || []).length
  const words = (text.match(/[A-Za-z]{4,}/g) || []).length
  if (keys >= 3 && keys * 2 >= words) return true
  return optionMarkCount(text) < 4 && /(?:^|\n)\s*(?:Q\s*\.?\s*)?\d{1,3}\s*[.)]\s/.test(text) && keys >= 1
}

const KEY_ENTRY_RE = /(^|[\s,;|])(\d{1,3})(\s*[.):\-\u2013]\s*)(\(\s*[A-Da-d1-4]\s*\)(?:\s*(?:,|&|and)\s*\(\s*[A-Da-d]\s*\))*|[A-Da-d](?:\s*,\s*[A-Da-d])*|-?\d+(?:\.\d+)?)(?=$|[\s,;|.])/gm
const BLOCK_START_RE = /^[ \t]*(?:Q\s*\.?\s*)?(\d{1,3})\s*[.):](?=\s)/

/** A key table (numbers over answers, or number & answer pairs) as "N. answer" lines. */
function tabularAsKeyLines(text) {
  return String(text).replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/g, (tab) => {
    const rows = tab
      .replace(/\\(?:begin|end)\{tabular\}(?:\{[^{}]*\})?/g, '')
      .replace(/\\hline/g, '')
      .split(/\\\\/)
      .map((row) => row.split('&').map((c) => c.replace(/\$/g, '').trim()))
      .filter((cells) => cells.some(Boolean))
    const out = []
    for (let i = 0; i < rows.length; i += 1) {
      const cells = rows[i]
      const next = rows[i + 1]
      if (cells.every((c) => /^\d{1,3}$/.test(c)) && next?.length === cells.length) {
        cells.forEach((c, k) => out.push(`${c}. ${next[k]}`))
        i += 1
      } else if (cells.length % 2 === 0) {
        for (let k = 0; k < cells.length; k += 2) if (/^\d{1,3}$/.test(cells[k])) out.push(`${cells[k]}. ${cells[k + 1]}`)
      }
    }
    return `\n${out.join('\n')}\n`
  })
}

/**
 * The key / solutions of an exercise whose first questions were read in an earlier range:
 * entries up to `offset` belong to that earlier part (kept as printed), the rest are renumbered
 * from 1 for this part.
 * @param {string} body
 * @param {number} offset
 */
export function shiftAnswerNumbers(body, offset) {
  const mine = []
  const earlier = []
  let block = null
  for (const line of tabularAsKeyLines(body).split('\n')) {
    const tokens = [...line.matchAll(KEY_ENTRY_RE)]
    if (tokens.length >= 2) {
      block = null
      for (const t of tokens) {
        const n = Number(t[2])
        if (n > offset) mine.push(`${n - offset}. ${t[4]}`)
        else earlier.push(`${n}. ${t[4]}`)
      }
      continue
    }
    const start = line.match(BLOCK_START_RE)
    if (start) {
      const n = Number(start[1])
      block = n > offset ? mine : earlier
      block.push(n > offset ? line.replace(BLOCK_START_RE, (m) => m.replace(String(n), String(n - offset))) : line)
      continue
    }
    if (block) block.push(line)
  }
  return { mine: mine.join('\n').trim(), earlier: earlier.join('\n').trim() }
}

/** @param {string} body */
function answersHeadingFor(body) {
  const lines = String(body).split('\n').filter((l) => l.trim())
  const long = lines.filter((l) => l.replace(/\$[^$]*\$/g, 'x').length > 60).length
  return long >= Math.max(2, lines.length / 3) ? 'HINTS \\& SOLUTIONS' : 'ANSWER KEY'
}

/**
 * Worked examples → "Q. N" questions with their printed solutions after "Sol.".
 * @param {Array<{ number: string, lines: string[] }>} examples
 */
function examplesText(examples) {
  const numbers = examples.map((e) => e.number)
  const unique = new Set(numbers).size === numbers.length && numbers.every((n) => /^\d{1,3}$/.test(n))
  return examples
    .map((ex, i) => {
      const n = unique ? Number(ex.number) : i + 1
      const body = ex.lines
        .map((line) => (SOLUTION_LINE_RE.test(line) && !/^\s*ans(?:wer)?\b/i.test(line) ? line.replace(SOLUTION_LINE_RE, 'Sol. ') : line))
        .join('\n')
        .trim()
      return `Q. ${n} ${body}`
    })
    .join('\n\n')
}

/**
 * @typedef {{
 *   key: string
 *   kind: 'exercise' | 'examples'
 *   title: string
 *   chapter: string
 *   text: string
 *   questionCount: number
 *   numericOptions?: boolean
 *   numberOffset?: number
 *   answerTitle?: string
 * }} BookPart
 */

/**
 * @param {string} raw Mathpix text of one page range
 * @param {{ chapter?: string, continues?: string }} [opts] chapter of the range when no chapter heading is
 *   printed in it; `continues`: the exercise the previous range ended in
 * @returns {{
 *   parts: BookPart[]
 *   skipped: Array<{ title: string, chars: number }>
 *   unmatchedAnswers: Array<{ title: string, text: string, chapter: string }>
 * }}
 */
export function splitBookRangeText(raw, opts = {}) {
  const lines = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  let chapter = clean(opts.chapter)
  /** @type {Array<{ kind: string, title: string, chapter: string, lines: string[] }>} */
  const blocks = []
  let current = { kind: 'lead', title: '', chapter, lines: [] }
  const push = () => {
    if (current.lines.some((l) => l.trim()) || current.kind !== 'lead') blocks.push(current)
  }
  /** @type {Set<string>} */
  const seenExercises = new Set()
  lines.forEach((line, i) => {
    const inExercise = current.kind === 'exercise' || current.kind === 'answers'
    const head = classifyBookHeading(line, inExercise)
    const keepInAnswers =
      current.kind === 'answers' &&
      head?.kind === 'exercise' &&
      (seenExercises.has(`${chapter}|${bookExerciseKey(head.title)}`) || answerKeyAhead(lines, i + 1))
    if (!head || (head.kind === 'subtype' && inExercise) || keepInAnswers) {
      current.lines.push(line)
      return
    }
    if (head.kind === 'chapter') chapter = head.title
    push()
    current = { kind: head.kind === 'subtype' ? 'exercise' : head.kind, title: head.title, chapter, lines: [] }
    if (current.kind === 'exercise') seenExercises.add(`${chapter}|${bookExerciseKey(head.title)}`)
  })
  push()

  /** @type {BookPart[]} */
  const parts = []
  const skipped = []
  const unmatchedAnswers = []
  /** @type {Map<string, { number: string, lines: string[] }[]>} */
  const examplesByChapter = new Map()
  const exampleOrder = []

  const takeExamples = (block) => {
    /** @type {{ number: string, lines: string[] } | null} */
    let ex = null
    const rest = []
    const list = examplesByChapter.get(block.chapter) || []
    for (const line of block.lines) {
      const m = line.match(EXAMPLE_LINE_RE)
      if (m) {
        ex = { number: m[1], lines: [line.slice(m[0].length)] }
        list.push(ex)
        continue
      }
      if (ex) ex.lines.push(line)
      else rest.push(line)
    }
    if (list.length && !examplesByChapter.has(block.chapter)) {
      examplesByChapter.set(block.chapter, list)
      exampleOrder.push(block.chapter)
    }
    return rest.join('\n')
  }

  for (const block of blocks) {
    if (block.kind === 'exercise') {
      const marked = markBookQuestionNumbers(block.lines.join('\n').trim())
      if (!marked.count) {
        skipped.push({ title: block.title || 'Untitled exercise', chars: marked.text.length })
        continue
      }
      parts.push({
        key: bookExerciseKey(block.title),
        kind: 'exercise',
        title: block.title,
        chapter: block.chapter,
        ...exercisePartText(marked.text),
        questionCount: marked.count,
      })
      continue
    }
    if (block.kind === 'answers') {
      attachAnswers(block, parts, unmatchedAnswers)
      continue
    }
    const left = takeExamples(block)
    if (block.kind === 'lead' && left.trim()) {
      // The range starts inside an exercise that began on an earlier page. Its cards are
      // numbered from 1 (the split numbers short parts by place), and so is its key.
      const marked = markBookQuestionNumbers(left.trim(), { startAny: true })
      if (marked.count >= 2 && optionMarkCount(left) >= 4) {
        const first = Number(marked.text.match(/(?:^|\n)[ \t]*Q\s*\.?\s*(\d{1,3})\b/)?.[1]) || 1
        const offset = first - 1
        const text = offset
          ? marked.text.replace(/(^|\n)([ \t]*)Q\s*\.?\s*(\d{1,3})\b/g, (_, a, b, n) => `${a}${b}Q. ${Math.max(1, Number(n) - offset)}`)
          : marked.text
        const name = opts.continues ? clean(opts.continues) : 'Questions continued from earlier pages'
        parts.push({
          key: bookExerciseKey(opts.continues || 'continued'),
          kind: 'exercise',
          title: offset ? `${name} (continued, Q ${first}-${first + marked.count - 1})` : `${name} (continued)`,
          chapter: block.chapter,
          ...exercisePartText(text),
          questionCount: marked.count,
          numberOffset: offset,
        })
        continue
      }
    }
    if (left.trim()) skipped.push({ title: block.title || (block.kind === 'lead' ? 'Text before the first heading' : 'Theory'), chars: left.trim().length })
  }

  for (const ch of exampleOrder) {
    const list = examplesByChapter.get(ch) || []
    if (!list.length) continue
    parts.push({
      key: 'solvedexamples',
      kind: 'examples',
      title: 'Solved Examples',
      chapter: ch,
      text: examplesText(list),
      questionCount: list.length,
    })
  }
  return { parts, skipped, unmatchedAnswers }
}

/**
 * An answer block names its exercise ("Answers – Exercise 2", or "Exercise 2" lines inside
 * one key for the whole chapter); without a name it is the key of the exercise just before it.
 * @param {{ title: string, chapter: string, lines: string[] }} block
 * @param {BookPart[]} parts
 * @param {Array<{ title: string, text: string, chapter: string }>} unmatched
 */
function attachAnswers(block, parts, unmatched) {
  /** @type {Array<{ title: string, lines: string[] }>} */
  const pieces = []
  const named = block.title.match(ANSWERS_HEAD_RE)?.[1] || block.title.match(/\bto\s+(.+)$/i)?.[1] || ''
  let piece = { title: EXERCISE_RE.test(clean(named)) ? clean(named) : '', lines: [] }
  for (const line of block.lines) {
    const { text } = headingText(line)
    const exerciseLine = text && text.length <= 60 && EXERCISE_RE.test(text) && !/\d{1,3}\s*[.)]\s*\(?[A-Da-d1-4]\)?\s+\d/.test(text)
    if (exerciseLine) {
      if (piece.lines.some((l) => l.trim())) pieces.push(piece)
      piece = { title: text, lines: [] }
      continue
    }
    piece.lines.push(line)
  }
  if (piece.lines.some((l) => l.trim())) pieces.push(piece)

  for (const p of pieces) {
    const body = p.lines.join('\n').trim()
    if (!body) continue
    const key = p.title ? bookExerciseKey(p.title) : ''
    const exercises = parts.filter((x) => x.kind === 'exercise' && x.chapter === block.chapter)
    const target = key
      ? [...exercises].reverse().find((x) => x.key === key && !x.answerTitle)
      : [...exercises].reverse().find((x) => !x.answerTitle)
    if (!target) {
      unmatched.push({ title: p.title || block.title, text: body, chapter: block.chapter })
      continue
    }
    let own = body
    if (target.numberOffset) {
      const shifted = shiftAnswerNumbers(body, target.numberOffset)
      own = shifted.mine
      if (shifted.earlier.trim()) unmatched.push({ title: p.title || target.title.replace(/\s*\(continued.*$/, ''), text: shifted.earlier, chapter: block.chapter })
    }
    const fixed = normalizeBookAnswerKey(own, { numericOptions: target.numericOptions })
    target.text = `${target.text}\n\n\\section*{${answersHeadingFor(fixed)}}\n${fixed}\n`
    target.answerTitle = p.title || block.title
  }
}
