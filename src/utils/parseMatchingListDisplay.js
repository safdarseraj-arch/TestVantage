/**
 * Display-only split of JEE Advanced matching-list / match-the-column stems.
 * Does not write to the question bank or pending PYQ store.
 *
 * Conventions:
 * - Matching list: List-I (P)(Q)(R)(S) × List-II (1)(2)(3)(4)(5)
 * - Classic match column: Column I (A)(B)(C)(D) × Column II (P)(Q)(R)(S)(T)
 */

import {
  extractMathpixImageUrls,
  normalizeBrokenMathpixGraphics,
  stripEmptyFigureShells,
  stripEmptyImageMarkdown,
} from './mathpixMedia.js'

/** @typedef {{ label: string, text: string }} MatchListItem */
/** @typedef {{ intro: string, listITitle: string, listIITitle: string, listI: MatchListItem[], listII: MatchListItem[], outro?: string }} MatchingListDisplay */

const LIST_I_RE = /(?:\*{0,2}\s*)?(?:List|Column)\s*[-–]?\s*I(?!I)\b\s*(?:\*{0,2})/gi
const LIST_II_RE = /(?:\*{0,2}\s*)?(?:List|Column)\s*[-–]?\s*II\s*(?:\*{0,2})/gi

const MATCH_HINT =
  /match\s+each\s+entry|match\s+(?:the\s+)?(?:column|list)|(?:List|Column)\s*[-–]?\s*I(?!I)\b/i

const TABULAR_BEGIN =
  /\\(?:begin|text\s*\{\s*begin\s*\})\s*\{\s*tabular\s*\}(?:\s*\[[^\]]*\])?(?:\s*\{[^}]*\})?/i
const TABULAR_END = /\\(?:end|text\s*\{\s*end\s*\})\s*\{\s*tabular\s*\}/i

/**
 * Drop an unlabeled List-II blob that sits immediately in front of the
 * numbered List-II. Keeps the numbered rows. Does not invent entries.
 * @param {unknown} text
 */
export function stripUnlabeledListTwoDump(text) {
  return String(text ?? '')
    .replace(
      /(?:List|Column)\s*[-–]?\s*II\s+(?!and\b)(?!\(\s*1\s*\))(?:(?!\(\s*1\s*\)|(?:List|Column)\s*[-–]?\s*I(?!I))[^\n]){8,500}?(?=\s*(?:List|Column)\s*[-–]?\s*II\s*\(\s*1\s*\))/gi,
      '',
    )
    .replace(
      /(?:^|\n)[ \t]*(?:List|Column)\s*[-–]?\s*II[ \t]*(?:\n[ \t]*\([1-5]\)[ \t]*){3,}\s*$/i,
      '',
    )
}

/**
 * OCR glue in matching-list cells (0for → 0 for, Mis → M is).
 * @param {string} text
 */
export function repairMatchListOcrGlitches(text) {
  return String(text ?? '')
    .replace(/\bOfor\b/g, '0 for')
    .replace(/\b0for\b/gi, '0 for')
    .replace(/=\s*O\s+for\b/g, '= 0 for')
    .replace(/\bMis\b/g, 'M is')
    .replace(
      /\$\s*(\d+\s*)?C_\{0\}\s*\/\s*(\d+)\s*\$/g,
      (_, num, den) => {
        const n = String(num ?? '').trim()
        return n ? `$\\frac{${n} C_{0}}{${den}}$` : `$\\frac{C_{0}}{${den}}$`
      },
    )
    // List-II label alone in dollars: $(1)$ → (1)
    .replace(/\$\(\s*([1-5])\s*\)\$/g, '\n($1)\n')
    // Glued next List-II label inside point-math: $(3,2) (4)$ → $(3,2)$\n(4)
    .replace(/\$\(\s*([^)$]+?)\)\s*\(\s*([1-5])\s*\)\s*\$/g, (_, coords, n) => `$(${coords})$\n(${n})`)
    // Trailing smashed tabular chrome after a finished match block
    .replace(/\n\s*List-I\s*\n\s*\[t\]\s*\{[^}]*\}\s*$/i, '')
}

/**
 * Answer keys are "(P) → (2), (Q) → (5)", not a List-I column.
 * A long stem that also mentions those letters is not a key.
 * @param {unknown} text
 */
export function looksLikeMatchAnswerKey(text) {
  const t = String(text ?? '')
  const pairs =
    t.match(
      /\(\s*[PQRS]\s*\)\s*(?:\$+\s*)?(?:\\rightarrow|→|->)\s*(?:\$+\s*)?\(?\s*[1-5]/gi,
    ) || []
  const barePairs =
    t.match(
      /(?:^|[^A-Za-z])(?:\\mathrm\s*\{[^}]*\}|[PQRS])\s*(?:\$+\s*)?(?:\\rightarrow|→|->)\s*(?:\$+\s*)?\(?\s*[1-5]/gi,
    ) || []
  if (pairs.length < 2 && barePairs.length < 2) return false
  const stripped = t
    .replace(/\\mathrm\s*\{([^}]*)\}/g, '$1')
    .replace(/\\(?:rightarrow|quad|qquad)\b/g, '')
    .replace(/\(\s*[PQRS1-5]\s*\)/gi, '')
    .replace(/[\\$&{},\s→>~-]+/g, '')
    .replace(/[PQRS1-5,]/gi, '')
  return stripped.length < 12
}

/** Turn LaTeX \& / tabular & between match pairs into a comma. Keep the OCR pairs. */
export function normalizeMatchAnswerKey(text) {
  const raw = String(text ?? '')
  if (!looksLikeMatchAnswerKey(raw)) return raw
  let s = raw.replace(/\\&/g, ',')
  s = s.replace(/(\)\s*,)\s*&\s*/g, '$1 ')
  s = s.replace(/\s+&\s+/g, ', ')
  s = s.replace(/\\{2,}/g, ' ')
  s = s.replace(/\$\$+/g, '')
  s = s.replace(
    /\$\s*(\(\s*[PQRS]\s*\)\s*(?:\\rightarrow|→|->)\s*\(\s*[1-5]\s*\))\s*\$/gi,
    '$1',
  )
  s = s.replace(/\\rightarrow/g, '→')
  s = s.replace(/→\s*(?=\()/g, '→ ')
  s = s.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1')
  s = s.replace(/&\s*(?=\$|$)/g, '')
  s = s.replace(/\$+/g, '')
  s = s.replace(/[{}~]/g, '')
  s = s.replace(/,\s*,+/g, ',')
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * OCR sometimes reads List-I and List-II on the same lines: (P) … (1) … (Q) … (2).
 * Put each marker back in its column. Do not add a letter that is not in the text.
 * A display-math block stuck on a short List-II value moves onto the previous
 * List-I row that does not yet have display math. If that row is already full,
 * the math stays unlabeled.
 * @param {string} text
 */
function unwrapTextWrappedListNumbers(text) {
  return String(text ?? '').replace(
    /\$\$\s*\\text\s*\{\s*(\(\s*[1-5]\s*\)\s*is)\s*\}\s*([1-5])\s*\$\$/g,
    '\n$1 $2\n',
  )
}

/**
 * A display set left above List-I is the missing (P)–(S) row when exactly one
 * letter is absent. The set text is already in the OCR. Do not invent a row.
 */
function promoteUnlabeledSetToMissingLetter(text) {
  const src = String(text ?? '')
  const listIAt = src.search(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I(?!I)\b/i)
  const listIIAt = src.search(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*II\b/i)
  if (listIAt < 0 || listIIAt < listIAt) return src
  const intro = src.slice(0, listIAt)
  const listI = src.slice(listIAt, listIIAt)
  const tail = src.slice(listIIAt)
  const set = intro.match(/\$\$\s*\\left\\\{[\s\S]*?\\right\\\}\s*\$\$/)
  if (!set) return src
  const have = ['P', 'Q', 'R', 'S'].filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)`).test(listI))
  const missing = ['P', 'Q', 'R', 'S'].filter((L) => !have.includes(L))
  if (missing.length !== 1 || have.length < 2) return src
  const letter = missing[0]
  const row = `(${letter})\n${set[0].trim()}`
  const after = ['P', 'Q', 'R', 'S'].slice(['P', 'Q', 'R', 'S'].indexOf(letter) + 1).find((L) => have.includes(L))
  const nextList = after
    ? listI.replace(new RegExp(`(\\(\\s*${after}\\s*\\))`), `${row}\n$1`)
    : `${listI.trim()}\n${row}\n`
  const intro2 = intro.replace(set[0], '').replace(/\n{3,}/g, '\n\n').trim()
  return [intro2, nextList.trim(), tail.trim()].filter(Boolean).join('\n\n')
}

export function separateInterleavedMatchColumns(text) {
  const src = unwrapTextWrappedListNumbers(text)
  // Do not rebuild "(P) → (5), (Q) → (4)" into List-I (P)→(Q) and List-II (5)(4).
  if (looksLikeMatchAnswerKey(src)) return promoteUnlabeledSetToMissingLetter(src)
  const letters = ['P', 'Q', 'R', 'S']
  const nums = ['1', '2', '3', '4', '5']
  const hits = []
  for (const L of [...letters, ...nums]) {
    const re = new RegExp(`\\(\\s*${L}\\s*\\)`, 'g')
    for (const m of src.matchAll(re)) {
      if (m.index == null) continue
      const before = src.slice(0, m.index)
      const dollars = (before.match(/\$/g) || []).length
      if (dollars % 2 === 1 && !/(?:^|\n)\s*$/.test(before)) continue
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 16)
      if (/^\s*(?:\\rightarrow|→|->)/.test(after)) continue
      hits.push({ letter: L, kind: nums.includes(L) ? 'num' : 'letter', start: m.index, end: m.index + m[0].length })
    }
  }
  hits.sort((a, b) => a.start - b.start)
  const seen = new Set()
  const uniq = []
  for (const h of hits) {
    if (seen.has(h.letter)) continue
    seen.add(h.letter)
    uniq.push(h)
  }
  const rowHits = uniq.filter((h) => h.kind === 'letter')
  const colHits = uniq.filter((h) => h.kind === 'num')
  if (rowHits.length < 2 || colHits.length < 2) return promoteUnlabeledSetToMissingLetter(src)
  const firstCol = Math.min(...colHits.map((h) => h.start))
  const lastRow = Math.max(...rowHits.map((h) => h.start))
  if (firstCol >= lastRow) return promoteUnlabeledSetToMissingLetter(src)
  const sortedRows = [...rowHits].sort((a, b) => a.start - b.start)
  let gaps = 0
  for (let i = 0; i < sortedRows.length - 1; i += 1) {
    if (colHits.some((c) => c.start > sortedRows[i].start && c.start < sortedRows[i + 1].start)) gaps += 1
  }
  if (gaps < 1) return promoteUnlabeledSetToMissingLetter(src)

  const optAt = src.search(/\\begin\{tabular\}/i)
  const limit = optAt > 40 ? optAt : src.length
  const stream = uniq.filter((h) => h.start < limit).sort((a, b) => a.start - b.start)
  if (stream.length < 4) return promoteUnlabeledSetToMissingLetter(src)

  const items = stream.map((h, i) => {
    const next = stream[i + 1]
    const end = next && next.start < limit ? next.start : limit
    let body = src.slice(h.end, end)
      .replace(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I{1,2}\s*$/i, '')
      .replace(/\\begin\{tabular\}[\s\S]*$/i, '')
      .trim()
    return { ...h, body }
  })

  const orphans = []
  let lastLetter = null
  for (const item of items) {
    if (item.kind === 'letter') {
      lastLetter = item
      continue
    }
    const displays = []
    const value = item.body.replace(/\$\$[\s\S]*?\$\$/g, (block) => {
      displays.push(block)
      return ''
    }).trim()
    const short = value.length < 80 && !/the number of elements|the value of|passes through/i.test(value)
    if (!displays.length || !short || !value) continue
    item.body = value
    for (const block of displays) {
      if (lastLetter && !/\$\$/.test(lastLetter.body)) {
        lastLetter.body = `${lastLetter.body}\n${block}`.trim()
      } else {
        orphans.push(block)
      }
    }
  }

  let intro = src.slice(0, stream[0].start)
    .replace(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I{1,2}\s*$/i, '')
    .trim()
  const listI = items.filter((x) => x.kind === 'letter' && x.body)
  const listII = items.filter((x) => x.kind === 'num' && x.body)
  const missingLetter = ['P', 'Q', 'R', 'S'].filter((L) => !listI.some((x) => x.letter === L))
  const setOrphans = orphans.filter((block) => /\\left\\\{/.test(block))
  if (missingLetter.length === 1 && setOrphans.length === 1) {
    listI.push({ letter: missingLetter[0], body: setOrphans[0] })
    orphans.splice(orphans.indexOf(setOrphans[0]), 1)
    listI.sort((a, b) => 'PQRS'.indexOf(a.letter) - 'PQRS'.indexOf(b.letter))
  }
  if (orphans.length) intro = `${intro}\n\n${orphans.join('\n\n')}`.trim()
  if (listI.length < 2 || listII.length < 2) return promoteUnlabeledSetToMissingLetter(src)
  const tail = src.slice(limit).trim()
  return promoteUnlabeledSetToMissingLetter([
    intro,
    `List-I\n${listI.map((x) => `(${x.letter}) ${x.body}`).join('\n')}`,
    `List-II\n${listII.map((x) => `(${x.letter}) ${x.body}`).join('\n')}`,
    tail,
  ].filter(Boolean).join('\n\n'))
}

function stripLatexBold(text) {
  return String(text ?? '').replace(/\\textbf\s*\{([^{}]*)\}/g, '$1')
}

function isListHeaderCell(text) {
  const t = String(text ?? '').replace(/\$/g, '').trim()
  return /^(?:\*{0,2}\s*)?(?:List|Column)\s*[-–]?\s*I{1,2}\s*(?:\*{0,2})?$/i.test(t)
}

/**
 * Split on a top-level LaTeX delimiter, skipping `{…}` and `\begin{…}…\end{…}`.
 * @param {string} text
 * @param {'&' | '\\\\'} delimiter
 */
function splitTopLevelLatex(text, delimiter) {
  const t = String(text ?? '')
  const parts = []
  let cur = ''
  let i = 0
  let brace = 0
  let env = 0
  while (i < t.length) {
    if (t[i] === '\\' && t.startsWith('\\begin{', i)) {
      const close = t.indexOf('}', i + 7)
      const name = close > 0 ? t.slice(i + 7, close) : ''
      if (name && name !== 'tabular') env += 1
      const end = close > 0 ? close + 1 : i + 7
      cur += t.slice(i, end)
      i = end
      continue
    }
    if (t[i] === '\\' && t.startsWith('\\end{', i)) {
      const close = t.indexOf('}', i + 5)
      env = Math.max(0, env - 1)
      const end = close > 0 ? close + 1 : i + 5
      cur += t.slice(i, end)
      i = end
      continue
    }
    if (t[i] === '\\' && (t[i + 1] === '{' || t[i + 1] === '}')) {
      cur += t.slice(i, i + 2)
      i += 2
      continue
    }
    if (t[i] === '{') brace += 1
    else if (t[i] === '}') brace = Math.max(0, brace - 1)

    if (brace === 0 && env === 0) {
      if (delimiter === '&' && t[i] === '&') {
        parts.push(cur)
        cur = ''
        i += 1
        continue
      }
      if (delimiter === '\\\\' && t.startsWith('\\\\', i) && !/[a-zA-Z]/.test(t[i + 2] || '')) {
        parts.push(cur)
        cur = ''
        i += 2
        if (t[i] === '*') i += 1
        if (t[i] === '[') {
          const rb = t.indexOf(']', i)
          if (rb > 0) i = rb + 1
        }
        continue
      }
      if (delimiter === '\n' && t[i] === '\n') {
        parts.push(cur)
        cur = ''
        i += 1
        continue
      }
    }
    cur += t[i]
    i += 1
  }
  if (cur.trim() || parts.length) parts.push(cur)
  return parts
}

/**
 * Mathpix match keys arrive as $(\mathrm{A})$ / $\mathrm{P} \rightarrow 4$.
 * Turn those into (A) / P so A–D restore can copy OCR without inventing.
 * @param {unknown} text
 */
export function unwrapMathrmListLabels(text) {
  return String(text ?? '')
    .replace(/\$\s*\(\\mathrm\{([A-D1-5PQRS])\}\)\s*\$/g, '($1)')
    .replace(/\(\\mathrm\{([A-D1-5PQRS])\}\)/g, '($1)')
    // 9~\mu\mathrm{C}: a letter glued to the command before it would make the unknown \muC.
    .replace(/(\\[A-Za-z]+)?\\mathrm\{([A-D1-5PQRS])\}/g, (_, cmd, label) => (cmd ? `${cmd} ${label}` : label))
}

/**
 * Keep (P)/(1)/(A) labels when Mathpix wraps rows in \\item[(P)] / \\item[A.].
 * Do not turn \\item[Q.] into a list letter.
 * @param {unknown} text
 */
/** Replace \\caption{…} using a matching brace so inner \\mathrm{…} is not cut. */
export function rewriteCaptionCommands(text) {
  const s = String(text ?? '')
  let out = ''
  let i = 0
  while (i < s.length) {
    const at = s.toLowerCase().indexOf('\\caption', i)
    if (at < 0) {
      out += s.slice(i)
      break
    }
    if (/[A-Za-z]/.test(s[at - 1] || '')) {
      out += s.slice(i, at + 8)
      i = at + 8
      continue
    }
    out += s.slice(i, at)
    let j = at + 8
    if (s[j] === '*') j += 1
    while (j < s.length && s[j] === ' ') j += 1
    if (s[j] !== '{') {
      out += s.slice(at, j)
      i = j
      continue
    }
    let depth = 0
    let k = j
    for (; k < s.length; k += 1) {
      if (s[k] === '{') depth += 1
      else if (s[k] === '}') {
        depth -= 1
        if (depth === 0) {
          k += 1
          break
        }
      }
    }
    const inner = s.slice(j + 1, k - 1).trim()
    if (/^List-I{1,2}$/i.test(inner)) out += `\n${inner}\n`
    else {
      const roman = inner.match(/^\(\s*(I{1,3}|IV|V)\s*\)$/)
      const labeled = inner.match(/(?:\\item\s*\[\s*)?\(\s*([PQRSTABCD1-5])\s*\)/i)
      if (roman) out += `\n(${roman[1]})\n`
      else if (labeled) out += `\n(${String(labeled[1]).toUpperCase()})\n`
      else {
        let dumped = inner
        if (/\\(?:mathrm|ce|text)\b/.test(dumped) && /\$\$/.test(dumped)) {
          dumped = dumped.replace(/\$\$/g, '$').replace(/\$\s*\$/g, ' ')
        }
        out += `\n${dumped}\n`
      }
    }
    i = k
  }
  return out
}

export function rewriteLatexItemLabels(text) {
  return unwrapMathrmListLabels(
    rewriteCaptionCommands(
    String(text ?? '')
    .replace(/\\captionsetup\{[^}]*\}/gi, ' ')
    .replace(
      /\$+\s*\\text\s*\{\s*(\(\s*[1-5]\s*\))\s*is\s*\}\s*([1-5])\s*\$+/g,
      (_, label, n) => `\n${String(label).replace(/\s/g, '')} is ${n}\n`,
    )
    .replace(/\\section\*?\{\s*(List-I{1,2})\s*\}/gi, '\n$1\n')
    .replace(/\\section\*?\{\s*(\(\s*[1-5]\s*\))\s*\$([^$]*)\$\s*\}/g, '\n$1 $$$2$$\n')
    .replace(/\\begin\{(?:itemize|enumerate)\}/gi, '\n')
    .replace(/\\end\{(?:itemize|enumerate)\}/gi, '\n')
    .replace(/\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\](?=\s*\$?\s*\d))/gi, ' ')
    .replace(/\\item\s*\[\s*-\s*\]/gi, ' ')
    .replace(/\\item\s*\[\s*\]/gi, ' ')
    .replace(/\\item\s*\[\s*\(\s*(I{1,3}|IV|VI?)\s*\)\s*\]/g, '\n($1) ')
    .replace(/\\item\s*\[\s*\(\s*(i{1,3}|iv|vi?)\s*\)\s*\]/g, '\n($1) ')
    .replace(
      /\\item\s*\[\s*(\(\s*[PQRSTUVWABCD1-6]\s*\)|[PQRSTUVWABCD1-6]\s*[.:]?)\s*\]/gi,
      (_, inner) => {
        const letter = String(inner ?? '')
          .replace(/[().:.\s]/g, '')
          .trim()
        if (!letter) return ' '
        return `\n(${letter.toUpperCase()}) `
      },
    )
    .replace(/\\item\s*\[[^\]]*\]/gi, ' ')
    .replace(/\\item\s*\[/gi, ' ')
    .replace(/\\item\b/gi, ' '),
    ),
  )
}

function cleanTabularCell(cell) {
  return repairMatchListOcrGlitches(
    stripLatexBold(rewriteLatexItemLabels(String(cell ?? '')))
      .replace(/\\hline\b/gi, '')
      .replace(/^\s*\\(?:centering|raggedright|raggedleft)\b/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      // "\textbf{P.} In process I" / "\textbf{1.} $8$" cells: the bold "P." is the row label.
      .replace(/^([PQRSTU]|[1-6])\s*[.:]\s+/, '($1) '),
  )
}

/** Left = List-I / Column I; right (P) beside (A)–(D) is Column II, not List-I. */
function classifyTabularMatchCell(cell, side, leftCell) {
  const t = String(cell ?? '').trim()
  if (!t) return side === 'left' ? 'I' : 'II'
  if (/^\(\s*[1-5]\s*\)/.test(t) && !/^\(\s*[PQRSABCD]\s*\)/i.test(t)) return 'II'
  if (/^\(\s*[ABCD]\s*\)/i.test(t)) return 'I'
  if (/^\(\s*[PQRS]\s*\)/i.test(t)) {
    if (side === 'left') return 'I'
    if (/^\(\s*[ABCD]\s*\)/i.test(String(leftCell ?? ''))) return 'II'
    return 'II'
  }
  return side === 'left' ? 'I' : 'II'
}

/**
 * Turn a List-I / List-II `\begin{tabular}` dump into sequential headers + (P)(Q)… (1)(2)….
 * No-op when there is no tabular environment.
 * @param {unknown} text
 */
export function flattenTabularMatchLists(text) {
  let s = String(text ?? '').replace(/\r\n/g, '\n')
  if (!s.trim()) return s
  // TeX en dash: "LIST--I" is the heading "LIST-I".
  s = s.replace(/\b(List|Column)\s*--\s*(?=I)/gi, '$1-')
  s = s.replace(/\\text\s*\{\s*begin\s*\}\s*\{\s*tabular\s*\}/gi, '\\begin{tabular}')
  s = s.replace(/\\text\s*\{\s*end\s*\}\s*\{\s*tabular\s*\}/gi, '\\end{tabular}')
  const beginAt = s.search(TABULAR_BEGIN)
  if (beginAt < 0) return repairMatchListOcrGlitches(s)
  const beginM = s.slice(beginAt).match(TABULAR_BEGIN)
  if (!beginM) return repairMatchListOcrGlitches(s)
  const bodyStart = beginAt + beginM[0].length
  const rest = s.slice(bodyStart)
  let endRel = rest.search(TABULAR_END)
  let after = ''
  if (endRel < 0) {
    const cutters = [
      rest.search(/\n(?:Q(?:uestion)?\s*\.?\s*)?\d{1,2}[\.\)]\s/),
      rest.search(/\n\(\s*[A-D]\s*\)\s*(?:\(|P|\\)/),
      rest.search(/\n--- page ---/i),
    ].filter((n) => n >= 40)
    endRel = cutters.length ? Math.min(...cutters) : rest.length
    after = rest.slice(endRel)
  } else {
    const afterM = rest.slice(endRel).match(TABULAR_END)
    after = rest.slice(endRel + (afterM?.[0]?.length ?? 0))
  }
  const body = rest.slice(0, endRel)
  const intro = s.slice(0, beginAt).trim()

  // Second column labelled (i)…(iv) is not a (1)…(5) List-II: keep the paper's table.
  const romanRight = (body.match(/&\s*\(\s*(?:i{1,3}|iv|vi{0,3}|ix|x)\s*\)/gi) || []).length
  if (endRel < rest.length && romanRight >= 2 && !/&\s*\(\s*[1-5]\s*\)/.test(body)) return s

  let rows = splitTopLevelLatex(body, '\\\\')
  if (rows.length < 3) {
    const byLine = splitTopLevelLatex(body, '\n').filter((r) => String(r).trim())
    if (byLine.length > rows.length) rows = byLine
  }

  const listIParts = []
  const listIIParts = []
  const usedColumnTitles = { I: false, II: false }
  for (const row of rows) {
    const cols = splitTopLevelLatex(row, '&').map(cleanTabularCell)
    if (!cols.length) continue
    const left = cols[0] || ''
    const right = cols.length > 1 ? cols.slice(1).join(' ').trim() : ''
    if (isListHeaderCell(left) && /column/i.test(left)) usedColumnTitles.I = true
    if (isListHeaderCell(right) && /column/i.test(right)) usedColumnTitles.II = true
    if (left && !isListHeaderCell(left)) {
      if (classifyTabularMatchCell(left, 'left', left) === 'II') listIIParts.push(left)
      else listIParts.push(left)
    }
    if (right && !isListHeaderCell(right)) {
      if (classifyTabularMatchCell(right, 'right', left) === 'I') listIParts.push(right)
      else listIIParts.push(right)
    }
  }

  const hasLabeledRows =
    listIParts.some((p) => /\(\s*[PQRS]\s*\)/i.test(p)) ||
    listIIParts.some((p) => /\(\s*[1-5PQRS]\s*\)/i.test(p))
  const hasListHeaders = rows.some((row) =>
    splitTopLevelLatex(row, '&').some((c) => isListHeaderCell(cleanTabularCell(c))),
  )
  // A–D MCQ option tables (\hline (A) & …) are NOT match lists — leave them for option peel.
  const onlyAbcdLabels =
    !hasListHeaders &&
    ![...listIParts, ...listIIParts].some((p) => /\(\s*[PQRS]\s*\)/i.test(p)) &&
    [...listIParts, ...listIIParts].filter((p) => /\(\s*[A-D]\s*\)/i.test(p)).length >= 2
  if (onlyAbcdLabels && !/List-I|List-II|Column\s*I\b|Match\s+(?:the|each)/i.test(intro)) {
    return repairMatchListOcrGlitches(s)
  }
  if (!hasLabeledRows && !hasListHeaders) return repairMatchListOcrGlitches(s)

  const titleI = usedColumnTitles.I || usedColumnTitles.II ? 'Column I' : 'List-I'
  const titleII = usedColumnTitles.I || usedColumnTitles.II ? 'Column II' : 'List-II'
  const chunks = [intro]
  if (listIParts.length) chunks.push(`${titleI}\n${listIParts.join('\n')}`)
  if (listIIParts.length) chunks.push(`${titleII}\n${listIIParts.join('\n')}`)
  const tail = String(after || '').trim()
  if (tail) chunks.push(tail)
  return repairMatchListOcrGlitches(chunks.filter(Boolean).join('\n\n').trim())
}

/**
 * @param {string} text
 */
export function looksLikeMatchingListStem(text) {
  const raw = String(text ?? '')
  const t = flattenTabularMatchLists(raw)
  if (!t.trim()) return false
  const pqrs = countMarkers(t, ['P', 'Q', 'R', 'S'])
  const abcd = countMarkers(t, ['A', 'B', 'C', 'D'])
  const nums = countMarkers(t, ['1', '2', '3', '4'])
  const hasHeader = LIST_I_RE.test(t)
  LIST_I_RE.lastIndex = 0
  const hasTitrate = /Titrate\s*:/i.test(t)
  const hasFigures = /\\begin\{figure\}|\\includegraphics|\\caption\{\s*List/i.test(t)
  if (/\\begin\{tabular\}/i.test(raw) && /List-I|List-II/i.test(t)) {
    if (pqrs >= 3 || abcd >= 3 || hasTitrate || hasFigures) return true
  }
  if (hasHeader && (pqrs >= 3 || abcd >= 3)) return true
  if (/^List-I\b/m.test(t) && /^List-II\b/m.test(t) && (pqrs >= 2 || abcd >= 2 || nums >= 2)) return true
  if (MATCH_HINT.test(t) && pqrs >= 3 && nums >= 3) return true
  if (MATCH_HINT.test(t) && abcd >= 3 && pqrs >= 3) return true
  // “Match each entry in List-I…” / “Match the column” + A–D or P–S rows
  // (rows often live in option boxes; stitch puts them on the stem first).
  if (MATCH_HINT.test(t) && (pqrs >= 3 || abcd >= 3)) return true
  if (MATCH_HINT.test(t) && hasTitrate) return true
  if (MATCH_HINT.test(t) && hasFigures) return true
  return false
}

/** @param {string} text @param {string[]} letters */
function countMarkers(text, letters) {
  return letters.filter((L) => new RegExp(`\\(\\s*${escapeRe(L)}\\s*\\)`).test(text)).length
}

/** JEE Advanced 2022+: List-I (I)–(IV) × List-II (P)–(T). */
const ROMAN_LIST_I = ['I', 'II', 'III', 'IV']

/** @param {unknown} text */
function hasRomanListI(text) {
  return countMarkers(String(text ?? ''), ROMAN_LIST_I) >= 2
}

const ALPHA_LIST_I = ['A', 'B', 'C', 'D']

const ANSWER_KEY_ROW_RE = /\(\s*[A-D]\s*\)[^\n]{0,30}?(?:\\mathrm\{\s*)?[A-DPQRS]\s*\}?\s*(?:\\rightarrow|\\to\b|→|->)\s*(?:\\mathrm\{\s*)?\(?\s*[1-5IV]/g

/** List-I lettered (A)–(D) with List-II (1)–(5), and no (P)–(S) rows. */
function hasAlphaListI(text) {
  const t = String(text ?? '').replace(ANSWER_KEY_ROW_RE, ' ')
  return countMarkers(t, ALPHA_LIST_I) >= 2 && countMarkers(t, ['P', 'Q', 'R', 'S']) < 2
}

/** @param {{ label?: string }[] | null | undefined} rows */
function rowsAreAlpha(rows) {
  return (rows || []).some((r) => /^\(\s*[A-D]\s*\)$/.test(String(r?.label ?? '')))
}

/** @param {{ label?: string }[] | null | undefined} rows */
function rowsAreRoman(rows) {
  return (rows || []).some((r) => /^\(\s*(?:I{1,3}|IV)\s*\)$/.test(String(r?.label ?? '')))
}

/** @param {string} s */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Drop leftover **bold** markdown outside $…$ (Gemini often emits **List-I**).
 * @param {string} text
 */
export function stripMarkdownBoldOutsideMath(text) {
  const t = String(text ?? '')
  let out = ''
  let i = 0
  while (i < t.length) {
    if (t.startsWith('$$', i)) {
      const end = t.indexOf('$$', i + 2)
      if (end !== -1) {
        out += t.slice(i, end + 2)
        i = end + 2
        continue
      }
    }
    if (t[i] === '$') {
      const end = t.indexOf('$', i + 1)
      if (end !== -1) {
        out += t.slice(i, end + 1)
        i = end + 1
        continue
      }
    }
    if (t.startsWith('**', i)) {
      const end = t.indexOf('**', i + 2)
      if (end !== -1) {
        out += t.slice(i + 2, end)
        i = end + 2
        continue
      }
    }
    out += t[i]
    i += 1
  }
  return out
}

/** @param {string} after */
function listBodyFollows(after) {
  const s = String(after ?? '')
  if (/^\s*\(\s*(?:[APQR1]|I{1,3}|IV)\s*\)/.test(s)) return true
  if (/^\s*\*+\s*\(\s*(?:[APQR1]|I{1,3}|IV)\s*\)/.test(s)) return true
  if (/^\s*\n/.test(s)) return true
  if (/^\s*\}/.test(s) && /\\end\{figure\}/i.test(s.slice(0, 48))) return true
  const nextHeader = s.slice(1).search(/(?:List|Column)\s*[-–]?\s*I{1,2}\b/i)
  const window = nextHeader >= 0 ? s.slice(0, nextHeader + 1) : s.slice(0, 100)
  return (
    /Titrate\s*:/i.test(window) ||
    /\\begin\{figure\}/i.test(window) ||
    /\\includegraphics/i.test(window) ||
    /!\[[^\]]*\]\(\s*https?:\/\//i.test(window)
  )
}

/** Skip "in List-I" / "List-I contains" prose unless a real list body follows. */
function isProseListMention(text, index, end) {
  const before = text.slice(Math.max(0, index - 24), index)
  const after = text.slice(end, end + 80)
  if (/^\s*contains\b/i.test(after)) return true
  if (/^\s*with\s+(?:the\s+)?appropriate/i.test(after)) return true
  if (/^\s+and\s+choose\b/i.test(after)) return true
  // "Match … with List-II." / "values in List-II." — not a list header.
  if (/\b(?:with|in)\s*$/i.test(before)) {
    if (!/^\s*[.:]?\s*(?:Titrate\s*:|\\begin\{figure\}|\\includegraphics|\(\s*[APQR1-5]\s*\))/i.test(after)) {
      return true
    }
  }
  if (/^\s*[.?!;,:]/.test(after) && !/\(\s*[1-5PQRS]\s*\)/i.test(after.slice(0, 50))) {
    return true
  }
  return false
}

/** Printed List-II body is complete enough to keep (not smashed OCR / answer-key glue). */
function listTwoBlockLooksUsable(block) {
  const t = String(block ?? '')
  if (!t.trim()) return false
  const labels = t.match(/\(\s*[1-5]\s*\)/g) || []
  const letterLabels = t.match(/\(\s*[PQRSTU]\s*\)/g) || []
  if (labels.length < 4 && letterLabels.length < 4) return false
  // $3 C_{0\n$} style smash
  if (/\$[^$\n]{0,80}\n\s*\$/.test(t.slice(0, 320))) return false
  // Mapping keys glued into List-II values
  if (/P\s*(?:\\rightarrow|→|->)/i.test(t) && /Q\s*(?:\\rightarrow|→|->)/i.test(t)) return false
  return true
}

function stemUsableListTwoIndex(stem) {
  const re = /(?:List|Column)\s*[-–]?\s*II\b/gi
  for (const m of String(stem ?? '').matchAll(re)) {
    if (m.index == null) continue
    if (isProseListMention(stem, m.index, m.index + m[0].length)) continue
    if (listTwoBlockLooksUsable(stem.slice(m.index))) return m.index
  }
  return -1
}

/** Drop a standalone (non-prose) List-II dump so a cleaner option copy can replace it. */
function stripUnusableListTwo(stem) {
  const t = String(stem ?? '')
  const re = /(?:List|Column)\s*[-–]?\s*II\b/gi
  let cut = -1
  for (const m of t.matchAll(re)) {
    if (m.index == null) continue
    if (isProseListMention(t, m.index, m.index + m[0].length)) continue
    cut = m.index
  }
  if (cut < 12) return t.trim()
  return t.slice(0, cut).trim()
}

/** Answer-key rows like (P) → (1), not List-I statements. */
export function optionsLookLikeMatchAnswers(options) {
  const opts = (Array.isArray(options) ? options : [])
    .map((o) => String(o ?? '').trim())
    .filter(Boolean)
  if (opts.length < 2) return false
  const mapping = opts.filter((o) =>
    /\(\s*P\s*\)\s*\$?\s*(?:\\rightarrow|→|->)/i.test(o) ||
    /(?:^|[\s(;,])I\s*\)?\s*\$?\s*(?:\\rightarrow|→|->)[\s\S]*\bII\s*\)?\s*\$?\s*(?:\\rightarrow|→|->)/.test(o) ||
    /\bP\s*\}?\s*\$?\s*(?:\\rightarrow|→|->)\s*\$?\s*\(?[1-5QRS]/i.test(o) ||
    /\bP\s*[-–]\s*[1-5]\b/i.test(o) && /\bQ\s*[-–]\s*[1-5]\b/i.test(o),
  )
  return mapping.length >= 2
}

/**
 * Fold A–D option boxes back onto the stem when upload stored List-I / List-II there.
 * @param {string} text
 * @param {unknown} options
 */
export function stitchMatchListSource(text, options) {
  const stem = String(text ?? '').replace(/\r\n/g, '\n').trim()
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim())
  const filled = opts.filter(Boolean)
  if (!filled.length) return stem

  const gluedIIOpt = opts.find((o) => /(?:List|Column)\s*[-–]?\s*II\b/i.test(o))
  const gluedII = Boolean(gluedIIOpt)
  const stemHasRows =
    countMarkers(stem, ['P', 'Q', 'R', 'S']) >= 3 || countMarkers(stem, ['A', 'B', 'C', 'D']) >= 3

  if (optionsLookLikeMatchAnswers(opts) && !gluedII) return stem
  if (stemHasRows && gluedII) {
    const tail = String(gluedIIOpt).match(/((?:List|Column)\s*[-–]?\s*II\b[\s\S]*)/i)
    if (tail && listTwoBlockLooksUsable(tail[1]) && stemUsableListTwoIndex(stem) < 0) {
      return `${stripUnusableListTwo(stem)}\n${tail[1]}`.trim()
    }
    return stem
  }
  if (stemHasRows) return stem

  const probe = filled[0].replace(/^\(\s*[A-D]\s*\)\s*/i, '').slice(0, 32)
  if (probe.length >= 12 && stem.includes(probe) && !gluedII) return stem

  const letters = ['A', 'B', 'C', 'D']
  const lines = opts
    .map((o, i) => {
      if (!o) return ''
      if (/^\(\s*[A-D]\s*\)/i.test(o)) return o
      return `(${letters[i]}) ${o}`
    })
    .filter(Boolean)
  return `${stem}\n${lines.join('\n')}`
}

/**
 * Move a List-II block glued onto any A–D option into the stem, and clean that option.
 * Prefer this over re-OCR when the option already holds the printed List-II.
 * Never invents rows.
 * @param {string} text
 * @param {unknown} options
 * @returns {{ text: string, options: string[] }}
 */
export function foldListIIFromOptionsIntoStem(text, options) {
  const stem = String(text ?? '').replace(/\r\n/g, '\n').trim()
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  let block = ''
  let blockFrom = -1
  for (let i = 0; i < opts.length; i += 1) {
    const o = opts[i]
    const m = o.match(/((?:List|Column)\s*[-–]?\s*II\b[\s\S]*)$/i)
    if (!m) continue
    const candidate = m[1].trim()
    if (candidate.length > block.length) {
      block = candidate
      blockFrom = i
    }
  }
  if (!block || blockFrom < 0) return { text: stem, options: opts.map((o) => o.trim()) }

  const nextOpts = opts.map((o, i) => {
    if (i !== blockFrom) return o.trim()
    return o.replace(/((?:List|Column)\s*[-–]?\s*II\b[\s\S]*)$/i, '').trim()
  })

  if (!listTwoBlockLooksUsable(block)) return { text: stem, options: nextOpts }
  if (stemUsableListTwoIndex(stem) >= 0) return { text: stem, options: nextOpts }
  return { text: `${stripUnusableListTwo(stem)}\n\n${block}`.trim(), options: nextOpts }
}

function findGluedListIIIndex(block) {
  const t = String(block ?? '')
  const re = /(?:List|Column)\s*[-–]?\s*II\b/gi
  let last = -1
  for (const m of t.matchAll(re)) {
    if (m.index == null) continue
    if (isProseListMention(t, m.index, m.index + m[0].length)) continue
    last = m.index
  }
  return last
}

function peelGluedListIIFromLastItem(items) {
  if (!items.length) return { items, listIIBlock: '' }
  const last = items[items.length - 1]
  const t = String(last.text ?? '')
  const at = findGluedListIIIndex(t)
  if (at < 0) return { items, listIIBlock: '' }
  const before = t.slice(0, at).replace(/\s+then\s*$/i, '').trim()
  const tail = t.slice(at).trim()
  if (!tail) return { items, listIIBlock: '' }
  const next = items.slice()
  if (before) next[next.length - 1] = { ...last, text: before }
  else next.pop()
  return { items: next.filter((x) => String(x.text).trim()), listIIBlock: tail }
}

function inferListStartFromItems(text) {
  const t = String(text ?? '')
  const hintAt = t.search(MATCH_HINT)
  const from = hintAt >= 0 ? hintAt : 0
  let best = null
  for (const L of ['P', 'A']) {
    const re = new RegExp(`\\(\\s*${escapeRe(L)}\\s*\\)`)
    const slice = t.slice(from)
    const m = slice.match(re)
    if (m && m.index != null) {
      const index = from + m.index
      if (best == null || index < best.index) {
        best = { index, end: index, raw: 'List-I' }
      }
    }
  }
  return best
}

/**
 * True when A–D option boxes were List-I (or glued List-II), so the bank
 * should show the two lists instead of repeating those boxes as MCQ answers.
 */
export function matchOptionsFoldedIntoLists(text, options) {
  const filled = (Array.isArray(options) ? options : []).filter((o) => String(o ?? '').trim())
  if (filled.length < 2) return false
  const blob = `${text ?? ''}\n${filled.join('\n')}`
  if (!/(?:List|Column)\s*[-–]?\s*I{1,2}\b/i.test(blob)) return false
  if (optionsLookLikeMatchAnswers(options)) return false
  const stemOnly = parseMatchingListForDisplay(String(text ?? ''))
  const withOpts = parseMatchingListForDisplay(String(text ?? ''), options)
  if (!withOpts?.listI?.length) return false
  if ((stemOnly?.listI?.length ?? 0) >= 2) {
    const last = String(filled[filled.length - 1] ?? '')
    return (
      /(?:List|Column)\s*[-–]?\s*II\b/i.test(last) && (withOpts.listII?.length ?? 0) >= 1
    )
  }
  return withOpts.listI.length >= 2
}

/**
 * @param {string} text
 * @param {RegExp} re
 * @param {RegExp} followRe
 */
function findStandaloneHeader(text, re, followRe) {
  re.lastIndex = 0
  /** @type {{ index: number, end: number, raw: string } | null} */
  let best = null
  for (const m of text.matchAll(re)) {
    if (m.index == null) continue
    const end = m.index + m[0].length
    if (isProseListMention(text, m.index, end)) continue
    const after = text.slice(end, end + 280)
    const followed = followRe.test(after) || listBodyFollows(after) || /\*/.test(m[0])
    const hit = { index: m.index, end, raw: m[0] }
    if (followed) return hit
    if (!best) best = hit
  }
  return best
}

/** Keep “List-I contains…” when the first List-I token is prose, not the header. */
function recoverMatchListIntro(raw, intro, listIHeadIndex) {
  const out = String(intro ?? '').trim()
  if (out) return out
  const src = String(raw ?? '')
  if (!/List-I contains|Match each entry in List-I/i.test(src)) return out
  const cut =
    Number(listIHeadIndex) > 20
      ? Number(listIHeadIndex)
      : findStandaloneHeader(src, LIST_I_RE, /^\s*\(\s*[APQR]/)?.index ??
        src.search(/\n\s*(?:List|Column)\s*[-–]?\s*I(?!I)\b/i)
  if (cut > 20) return src.slice(0, cut).replace(/\s+/g, ' ').trim()
  return out
}

/**
 * "Match List I of the nuclear processes with List II …" with no List-I heading line
 * (2013 P2 Q19): the List-I found is a word in the sentence, so the whole sentence up to
 * the first row is the intro, not just "Match". '' when the List-I found is a heading.
 * @param {string} raw
 * @param {{ index: number, end: number } | null | undefined} head
 */
function sentenceIntroAroundListWord(raw, head) {
  if (!head) return ''
  const src = String(raw ?? '')
  const lineStart = src.lastIndexOf('\n', head.index - 1) + 1
  const lineEndAt = src.indexOf('\n', head.end)
  const lineEnd = lineEndAt < 0 ? src.length : lineEndAt
  const before = src.slice(lineStart, head.index)
  const after = src.slice(head.end, lineEnd)
  if (!/[A-Za-z]/.test(before)) return ''
  if (!/^[ \t]*[,:]?[ \t]*[A-Za-z]+[ \t]+[A-Za-z]+/.test(after)) return ''
  if (LIST_ROW_MARKER_RE.test(after)) return ''
  const rowAt = src.slice(lineEnd).search(/\n[ \t]*\(\s*(?:[PQRSTABCD1-5]|I{1,3}|IV)\s*\)/)
  const cut = rowAt < 0 ? lineEnd : lineEnd + rowAt
  return src.slice(0, cut).trim()
}

/** Keep the Mathpix figure that sits above \caption{List-I} / \caption{List-II}. */
function includePrecedingFigure(text, head) {
  if (!head) return head
  const before = text.slice(0, head.index)
  const lower = before.toLowerCase()
  const figAt = lower.lastIndexOf('\\begin{figure}')
  const incAt = lower.lastIndexOf('\\includegraphics')
  const mdClose = before.lastIndexOf('](https://cdn.mathpix.com')
  const mdAt = mdClose >= 0 ? before.lastIndexOf('![', mdClose) : -1
  let at = -1
  if (figAt >= 0 && head.index - figAt <= 800) at = figAt
  if (incAt >= 0 && head.index - incAt <= 600) at = at < 0 ? incAt : Math.min(at, incAt)
  if (mdAt >= 0 && head.index - mdAt <= 600) at = at < 0 ? mdAt : Math.min(at, mdAt)
  if (at < 0) return head
  const between = text.slice(at, head.index)
  if (/(?:List|Column)\s*[-–]?\s*I{1,2}\b/i.test(between)) return head
  if (/Match\s+(?:the|each)|choose the correct option/i.test(between)) return head
  if (
    /\bas shown in (?:the )?(?:figure|P-T|P-V|diagram)/i.test(
      text.slice(Math.max(0, at - 160), at),
    )
  ) {
    return head
  }
  if (
    /\bas shown in the figure\b(?!s)/i.test(text.slice(0, at)) &&
    extractMathpixImageUrls(before).length === 1
  ) {
    return head
  }
  return { ...head, index: at }
}

/**
 * Split a block on (P)(Q)… or (1)(2)… markers. Skips markers inside $…$.
 * @param {string} block
 * @param {string[]} letters
 * @returns {MatchListItem[]}
 */
export function splitMatchListItems(block, letters) {
  const text = String(block ?? '')
  /** @type {{ letter: string, start: number, end: number }[]} */
  const hits = []
  for (const L of letters) {
    const re = new RegExp(`\\(\\s*${escapeRe(L)}\\s*\\)`, 'g')
    for (const m of text.matchAll(re)) {
      if (m.index == null) continue
      const before = text.slice(0, m.index)
      const dollars = (before.match(/\$/g) || []).length
      const atLine = /(?:^|\n)\s*$/.test(before)
      if (dollars % 2 === 1 && !atLine) continue
      hits.push({ letter: L, start: m.index, end: m.index + m[0].length })
    }
  }
  hits.sort((a, b) => a.start - b.start)
  const best = new Map()
  for (const h of hits) {
    const next = hits.find((x) => x.start > h.start)
    const body = text.slice(h.end, next ? next.start : text.length).trim()
    const prev = best.get(h.letter)
    if (!prev) {
      best.set(h.letter, { ...h, body })
      continue
    }
    if (looksLikePhysicsListTwoValue(prev.body) && /<smiles>|includegraphics/i.test(body)) continue
    if (looksLikePhysicsListTwoValue(body) && /<smiles>|includegraphics/i.test(prev.body)) {
      best.set(h.letter, { ...h, body })
      continue
    }
    if (body.length > prev.body.length) best.set(h.letter, { ...h, body })
  }
  const ordered = letters
    .map((L) => best.get(L))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
  const rows = ordered.map((h, i) => {
    const next = ordered[i + 1]
    let body = stripMarkdownBoldOutsideMath(text.slice(h.end, next ? next.start : text.length))
      .replace(/^\s*(?:[:.]|[-–](?=\s))\s*/, '')
      .replace(/(?:^|\n)\s*(?:List|Column)\s*[-–]?\s*I{1,2}\b[\s\S]*$/i, '')
      .trim()
    const echo = body.search(new RegExp(`(?:^|\\n)\\s*\\(\\s*${escapeRe(h.letter)}\\s*\\)\\s*`))
    if (echo >= 0) body = body.slice(0, echo).trim()
    return { label: `(${h.letter})`, text: body }
  })
  return letters.every((L) => /^[1-6]$/.test(L)) ? peelTrailingListFigures(rows, letters) : rows
}

/**
 * A finished List-II value followed by its own figure is the next row
 * (the figure crop often contains the missing number). Do not glue that
 * figure onto the previous value, and do not invent a number past 5.
 * @param {MatchListItem[]} items
 * @param {string[]} letters
 */
function peelTrailingListFigures(items, letters) {
  const used = new Set(items.map((x) => String(x.label || '').replace(/[()]/g, '')))
  /** @type {MatchListItem[]} */
  const out = []
  for (const item of items) {
    const text = String(item.text ?? '').trim()
    const cut = text.search(/\n\s*(?:\\includegraphics|!\[)/)
    if (cut < 8) {
      out.push(item)
      continue
    }
    const head = text.slice(0, cut).trim()
    const tail = text.slice(cut).trim()
    const tailIsFigure = /^(?:\\includegraphics\{[^}]+\}\s*|!\[[^\]]*\]\([^)]+\)\s*)+$/.test(tail)
    // A multi-line row ("Scheme IV" with its reaction steps) owns the picture under it.
    const headIsValue =
      head.length < 160 &&
      !head.includes('\n') &&
      !/includegraphics|<smiles>/i.test(head) &&
      (/\\frac|\\sqrt|\\mathrm/.test(head) || looksLikePhysicsListTwoValue(head))
    if (!tailIsFigure || !headIsValue) {
      out.push(item)
      continue
    }
    out.push({ ...item, text: head })
    const figs = tail.split(/\n(?=\\includegraphics|!\[)/).map((s) => s.trim()).filter(Boolean)
    let n = letters.indexOf(String(item.label || '').replace(/[()]/g, '')) + 1
    for (const fig of figs) {
      while (n < letters.length && used.has(letters[n])) n += 1
      if (n >= letters.length) {
        out[out.length - 1] = {
          ...out[out.length - 1],
          text: `${out[out.length - 1].text}\n${fig}`.trim(),
        }
        continue
      }
      used.add(letters[n])
      out.push({ label: `(${letters[n]})`, text: fig })
      n += 1
    }
  }
  return out
}

/** @param {MatchListItem[]} items @param {string[]} numLetters */
function peelNumericListII(items, numLetters) {
  if (!items.length) return { items, listII: [] }
  const last = items[items.length - 1]
  const numStart = last.text.search(/\(\s*1\s*\)/)
  if (numStart < 6) return { items, listII: [] }
  const tail = last.text.slice(numStart)
  const listII = splitMatchListItems(tail, numLetters).filter((x) => String(x.text).trim())
  if (listII.length < 2) return { items, listII: [] }
  const next = [...items]
  next[next.length - 1] = { ...last, text: last.text.slice(0, numStart).trim() }
  return { items: next, listII }
}

/**
 * Conductometric / titration match lists often omit (P)(Q)(R)(S).
 * @param {string} block
 * @returns {MatchListItem[]}
 */
export function splitTitrateListI(block) {
  const raw = String(block ?? '')
  if (!/Titrate\s*:/i.test(raw)) return []
  const parts = raw
    .split(/Titrate\s*:/i)
    .map((s) => s.replace(/\\caption\{\s*\}/gi, '').trim())
    .filter((p) => {
      const t = p.replace(/[*{}]/g, '').trim()
      if (/^(?:List|Column)\s*[-–]?\s*I{1,2}$/i.test(t)) return false
      return t.length >= 4
    })
  const letters = ['P', 'Q', 'R', 'S']
  return parts.slice(0, 4).map((text, i) => ({
    label: `(${letters[i]})`,
    text: `Titrate: ${text}`.replace(/\s+/g, ' ').trim(),
  }))
}

/**
 * List-II (or List-I) that is only Mathpix figures.
 * @param {string} block
 * @param {string[]} labels
 * @returns {MatchListItem[]}
 */
export function itemsFromMathpixFigures(block, labels = ['1', '2', '3', '4', '5']) {
  const urls = extractMathpixImageUrls(block)
  if (!urls.length) return []
  return urls.map((url, i) => ({
    label: `(${labels[i] || i + 1})`,
    text: `\\includegraphics{${url}}`,
  }))
}

const MEDIA_TOKEN_RE =
  /(?:List|Column)\s*[-–]?\s*II\b|(?:List|Column)\s*[-–]?\s*I(?!I)\b|\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}|!\[\s*[^\]]*\]\s*\(\s*https?:\/\/cdn\.mathpix\.com[^\s)]+\)?|<smiles>[\s\S]*?<\/smiles>|\(\s*[PQRS1-5]\s*\)/gi

const MEDIA_TOKEN_ROMAN_RE =
  /(?:[Ll][Ii][Ss][Tt]|[Cc]olumn|COLUMN)\s*[-–]?\s*II\b|(?:[Ll][Ii][Ss][Tt]|[Cc]olumn|COLUMN)\s*[-–]?\s*I(?!I)\b|\\includegraphics(?:\[[^\]]*\])?\{[^}]+\}|!\[\s*[^\]]*\]\s*\(\s*https?:\/\/cdn\.mathpix\.com[^\s)]+\)?|<smiles>[\s\S]*?<\/smiles>|\(\s*(?:[PQRSTU]|I{1,3}|IV)\s*\)/g

const MEDIA_TOKEN_ALPHA_RE = new RegExp(MEDIA_TOKEN_RE.source.replace('[PQRS1-5]', '[A-D1-5]'), 'gi')

function mediaTokenKind(tok, roman = false, alpha = false) {
  const t = String(tok ?? '')
  if (/^(?:List|Column)\s*[-–]?\s*II\b/i.test(t)) return 'ii'
  if (/^(?:List|Column)\s*[-–]?\s*I(?!I)\b/i.test(t)) return 'i'
  if (/^\\includegraphics|^!\[|<smiles>/i.test(t)) return 'media'
  if (roman) {
    if (/^\(\s*(?:I{1,3}|IV)\s*\)$/.test(t)) return 'labI'
    return /^\(\s*[PQRSTU]\s*\)$/.test(t) ? 'labII' : 'other'
  }
  const L = t.match(alpha ? /^\(\s*([A-D1-5])\s*\)$/i : /^\(\s*([PQRS1-5])\s*\)$/i)?.[1]
  if (!L) return 'other'
  return /\d/.test(L) ? 'labII' : 'labI'
}

function tokenToMediaText(tok) {
  const t = String(tok ?? '').trim()
  const smiles = t.match(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/i)
  if (smiles) return `<smiles>${String(smiles[1] ?? '').trim()}</smiles>`
  const urls = extractMathpixImageUrls(t)
  if (urls[0]) return `\\includegraphics{${urls[0]}}`
  return t
}

/**
 * Figure / SMILES match columns: unlabeled drawings under List-I become (P)(Q)…,
 * labeled (R)(S) stay on List-I even if a List-II header was printed in between.
 */
export function parseMediaMatchLists(text) {
  const raw = normalizeBrokenMathpixGraphics(String(text ?? ''))
  if (!/\\includegraphics|cdn\.mathpix\.com|<smiles>/i.test(raw)) return null
  const roman = hasRomanListI(raw)
  const alpha = !roman && hasAlphaListI(raw)
  const lettersI = roman ? ROMAN_LIST_I : alpha ? ALPHA_LIST_I : ['P', 'Q', 'R', 'S']
  const lettersII = roman ? ['P', 'Q', 'R', 'S', 'T', 'U'] : ['1', '2', '3', '4', '5']
  const tokens = [...raw.matchAll(roman ? MEDIA_TOKEN_ROMAN_RE : alpha ? MEDIA_TOKEN_ALPHA_RE : MEDIA_TOKEN_RE)]
  if (tokens.length < 3) return null
  /** @type {Record<string, string>} */
  const rowsI = {}
  /** @type {Record<string, string>} */
  const rowsII = {}
  const unlabeledI = []
  const unlabeledII = []
  /** @type {string[]} */
  const pendingQueueI = []
  /** @type {string[]} */
  const pendingQueueII = []
  /** @type {Set<string>} */
  const seenLabelsI = new Set()
  let side = 'I'
  let introEnd = tokens[0]?.index ?? 0
  // "<smiles>…</smiles>\n$+\mathrm{HNO}_{2}$": the reagent after a drawing belongs to that row.
  const reagentAfter = (at) => {
    const m = tokens[at]
    const end = (m.index ?? 0) + m[0].length
    const stop = tokens[at + 1]?.index ?? raw.length
    const gap = raw.slice(end, stop).split(/\n[ \t]*\n/)[0].trim()
    if (!gap || gap.length > 120) return ''
    return /^(?:\$\s*)?\+|^\$?\s*\\(?:longrightarrow|xrightarrow|rightarrow)\b/.test(gap) ? gap : ''
  }
  for (const [at, m] of tokens.entries()) {
    const tok = m[0]
    const kind = mediaTokenKind(tok, roman, alpha)
    if (kind === 'i') {
      side = 'I'
      pendingQueueII.length = 0
      if (m.index != null && m.index < introEnd) introEnd = m.index
      continue
    }
    if (kind === 'ii') {
      side = 'II'
      pendingQueueI.length = 0
      continue
    }
    if (kind === 'labI') {
      const L = tok.replace(/[()]/g, '').toUpperCase()
      seenLabelsI.add(L)
      pendingQueueI.push(L)
      side = 'I'
      continue
    }
    if (kind === 'labII') {
      pendingQueueII.push(tok.replace(/[()]/g, ''))
      side = 'II'
      continue
    }
    if (kind !== 'media') continue
    const drawn = tokenToMediaText(tok)
    if (!drawn) continue
    const body = [drawn, reagentAfter(at)].filter(Boolean).join('\n')
    if (side === 'II' && pendingQueueII.length) {
      const L = pendingQueueII.pop()
      rowsII[L] = [rowsII[L], body].filter(Boolean).join('\n')
      continue
    }
    if (pendingQueueI.length) {
      const L = pendingQueueI.pop()
      rowsI[L] = [rowsI[L], body].filter(Boolean).join('\n')
      continue
    }
    if (side === 'II') unlabeledII.push(body)
    else unlabeledI.push(body)
  }
  const fill = (rows, unlabeled, letters) => {
    let u = 0
    for (const L of letters) {
      if (rows[L]) continue
      if (u < unlabeled.length) {
        rows[L] = unlabeled[u]
        u += 1
      }
    }
  }
  fill(rowsI, unlabeledI, lettersI)
  fill(rowsII, unlabeledII, lettersII)
  const listI = lettersI
    .filter((L) => rowsI[L] || seenLabelsI.has(L))
    .map((L) => ({ label: `(${L})`, text: rowsI[L] || '' }))
  const listII = lettersII
    .filter((L) => rowsII[L])
    .map((L) => ({ label: `(${L})`, text: rowsII[L] }))
  if (listI.length < 2) return null
  const listIHead = findStandaloneHeader(raw, LIST_I_RE, /^\s*\(\s*[APQR]/)
  const header = listIHead?.index ?? -1
  const intro = recoverMatchListIntro(
    raw,
    (header >= 0 ? raw.slice(0, header) : raw.slice(0, introEnd))
      .replace(/\s+/g, ' ')
      .trim(),
    header,
  )
  return {
    intro,
    listITitle: 'List-I',
    listIITitle: 'List-II',
    listI,
    listII,
  }
}

function looksLikePhysicsListTwoValue(body) {
  const t = String(body ?? '').trim()
  if (!t || /<smiles>/i.test(t)) return false
  if (/includegraphics|cdn\.mathpix/i.test(t)) return false
  return (
    /\\circ|°|C_\{0\}|\\varepsilon|\\mathcal\{R\}|T_\{0\}|\\ln/.test(t) ||
    /^\$?[\d.\-]+\s*$/.test(t.replace(/[{}\\mathrm]/g, '').trim())
  )
}

function fillEmptyMatchRows(parsedRows, mediaRows, order) {
  const p = Object.fromEntries((parsedRows || []).map((r) => [r.label, r]))
  const m = Object.fromEntries((mediaRows || []).map((r) => [r.label, r]))
  const parsedPhysics =
    (parsedRows || []).filter((r) => looksLikePhysicsListTwoValue(r.text)).length >= 2
  return order
    .filter((L) => p[`(${L})`] || m[`(${L})`])
    .map((L) => {
      const lab = `(${L})`
      const a = String(p[lab]?.text ?? '').trim()
      if (a) return p[lab]
      const media = String(m[lab]?.text ?? '')
      if (parsedPhysics && /<smiles>/i.test(media)) return p[lab]
      return m[lab] || p[lab]
    })
    .filter(Boolean)
}

function preferRicherMatchParse(parsed, media) {
  if (!media?.listI?.length) return parsed
  if (!parsed?.listI?.length) return media
  const roman = rowsAreRoman(parsed.listI) || rowsAreRoman(media.listI)
  if (roman && rowsAreRoman(parsed.listI) !== rowsAreRoman(media.listI)) {
    return rowsAreRoman(parsed.listI) ? parsed : media
  }
  const alpha = !roman && rowsAreAlpha(media.listI)
  const lettersI = roman ? ROMAN_LIST_I : alpha ? ALPHA_LIST_I : ['P', 'Q', 'R', 'S']
  const lettersII = roman ? ['P', 'Q', 'R', 'S', 'T', 'U'] : ['1', '2', '3', '4', '5']
  const lastI = `(${lettersI[lettersI.length - 1]})`
  const parsedS = parsed.listI.some((x) => x.label === lastI)
  const mediaS = media.listI.some((x) => x.label === lastI)
  // Media rows win when they add rows; text rows ((P) $$…$$ beside a picture (S)) still fill their blanks.
  const listI =
    media.listI.length > parsed.listI.length || (mediaS && !parsedS)
      ? fillEmptyMatchRows(media.listI, parsed.listI, lettersI)
      : fillEmptyMatchRows(parsed.listI, media.listI, lettersI)
  let listII = fillEmptyMatchRows(parsed.listII, media.listII, lettersII)
  // A picture the text rows or the intro already show ("Scheme IV" with its reaction, the
  // pathway drawings above List-I) is not an extra List-II row (2014 P2 Q37/Q38).
  const parsedII = (parsed.listII || []).filter((row) => String(row.text ?? '').trim())
  if (parsedII.length >= 4) {
    const shown = new Set(
      [parsed.intro, ...(parsed.listI || []).map((row) => row.text), ...parsedII.map((row) => row.text)]
        .flatMap((t) => extractMathpixImageUrls(String(t ?? ''))),
    )
    const own = new Set(parsedII.map((row) => row.label))
    listII = listII.filter((row) => {
      if (own.has(row.label)) return true
      const urls = extractMathpixImageUrls(String(row.text ?? ''))
      return !urls.length || !urls.every((u) => shown.has(u))
    })
  }
  const listIMedia = new Set(
    listI
      .map((row) => String(row.text ?? ''))
      .flatMap((t) => extractMathpixImageUrls(t))
      .filter(Boolean),
  )
  listII = (listII.length ? listII : parsed.listII || []).filter((row) => {
    const urls = extractMathpixImageUrls(String(row.text ?? ''))
    if (!urls.length) return true
    return !urls.every((u) => listIMedia.has(u))
  })
  return {
    ...parsed,
    intro: parsed.intro || media.intro,
    listI,
    listII,
  }
}

const MATCH_OUTRO_RE =
  /\n\s*(?=Which (?:one )?of the following\b|Match (?:each|the)\b|\[?\s*Given\s*:|The correct (?:option|match)\b|Choose the correct\b)/i

/** The question line printed under the lists, not part of the last row. */
function peelRowOutro(rows) {
  const list = Array.isArray(rows) ? rows : []
  const last = list[list.length - 1]
  const t = String(last?.text ?? '')
  const at = t.search(MATCH_OUTRO_RE)
  if (at <= 0 || !t.slice(0, at).trim()) return { rows: list, outro: '' }
  return {
    rows: [...list.slice(0, -1), { ...last, text: t.slice(0, at).trim() }],
    outro: t.slice(at).trim(),
  }
}

function withMatchListOutro(parsed) {
  if (!parsed?.listI?.length) return parsed
  const a = peelRowOutro(parsed.listI)
  const b = peelRowOutro(parsed.listII)
  const outro = [parsed.outro, a.outro, b.outro].filter(Boolean).join('\n\n')
  if (!outro) return parsed
  return { ...parsed, listI: a.rows, listII: b.rows, outro }
}

const MATCH_PARSE_MAX_CHARS = 24_000

/**
 * Pure text → lists parse, so the same stem always gives the same answer.
 * One Approve & Publish click re-asks for the same card dozens of times
 * (hasListIEntries, looksLikeMatchInstructionOnly, the leftover-card checks),
 * and each parse re-runs the whole OCR repair chain. Callers only read the
 * result, so it is safe to hand back the same object.
 */
const MATCH_PARSE_CACHE_MAX = 192
/** @type {Map<string, MatchingListDisplay | null>} */
const matchParseCache = new Map()

/**
 * @param {string} text
 * @param {unknown} [options]
 * @returns {MatchingListDisplay | null}
 */
export function parseMatchingListForDisplay(text, options) {
  const t = String(text ?? '')
  const optKey = Array.isArray(options)
    ? options.map((o) => String(o ?? '')).join('\u0001')
    : options == null
      ? ''
      : String(options)
  const key = `${optKey}\u0000${t}`
  if (matchParseCache.has(key)) return matchParseCache.get(key) ?? null
  let parsed = parseMatchingListForDisplayNoCache(t, options)
  const rowCount = (p) => (p?.listI?.length ?? 0) + (p?.listII?.length ?? 0)
  // Picture rows "(P)" with a bare "1." List-II (2014 P2 Q18) parse List-I alone; read the bare labels too.
  if (!parsed || (parsed.listI?.length ?? 0) < 2 || (parsed.listII?.length ?? 0) < 2) {
    const labelled = labelBareListRows(t)
    if (labelled !== t) {
      const again = parseMatchingListForDisplayNoCache(labelled, options)
      if (again && rowCount(again) > rowCount(parsed)) parsed = again
    }
  }
  // One original-page picture of both lists is the whole table, not row (P) of List-I.
  if (
    parsed?.listI?.length === 1 &&
    !parsed.listII?.length &&
    /^\s*\\includegraphics(?:\[[^\]]*\])?\{\s*\/api\/official-pyq\/original\/crops\/[^}]*\}\s*$/.test(String(parsed.listI[0]?.text ?? ''))
  ) {
    parsed = null
  }
  if (matchParseCache.size >= MATCH_PARSE_CACHE_MAX) {
    matchParseCache.delete(matchParseCache.keys().next().value)
  }
  matchParseCache.set(key, parsed)
  return parsed
}

/**
 * "LIST-I / P. The function f1 is" and "LIST-II / 1. NOT continuous / (2) <newline> continuous":
 * bare "P." / "1." row labels and a label alone on its line become "(P) …" / "(2) …".
 * Only between standalone List-I and List-II heading lines.
 * @param {string} text
 */
function labelBareListRows(text) {
  const t = String(text ?? '')
  const one = t.match(/(?:^|\n)[ \t]*(?:List|Column)[ \t]*[-–]*[ \t]*I[ \t]*(?=\n)/i)
  const two = t.match(/(?:^|\n)[ \t]*(?:List|Column)[ \t]*[-–]*[ \t]*II[ \t]*(?=\n)/i)
  if (!one || !two || (two.index ?? 0) <= (one.index ?? 0)) return t
  const joinLoneLabels = (s) => s.replace(/(^|\n)[ \t]*\(\s*([PQRSTU]|[1-6])\s*\)[ \t]*\n+[ \t]*(?=[^\s(])/g, '$1($2) ')
  const head = t.slice(0, one.index)
  const listOne = joinLoneLabels(t.slice(one.index, two.index).replace(/(^|\n)[ \t]*([PQRSTU])\.[ \t]+/g, '$1($2) '))
  const listTwo = joinLoneLabels(t.slice(two.index).replace(/(^|\n)[ \t]*([1-6])\.[ \t]+/g, '$1($2) '))
  return `${head}${listOne}${listTwo}`
}

function parseMatchingListForDisplayNoCache(text, options) {
  try {
    return parseMatchingListForDisplayUnsafe(text, options)
  } catch {
    try {
      return parseMediaMatchLists(
        rewriteLatexItemLabels(flattenTabularMatchLists(String(text ?? ''))),
      )
    } catch {
      return null
    }
  }
}

function parseMatchingListForDisplayUnsafe(text, options) {
  const combined = stripEmptyImageMarkdown(
    stripEmptyFigureShells(stitchMatchListSource(String(text ?? '').replace(/\r\n/g, '\n'), options)),
  )
  if (combined.length > MATCH_PARSE_MAX_CHARS) return null
  const raw = separateInterleavedMatchColumns(
    repairMatchListOcrGlitches(
      rewriteLatexItemLabels(
        flattenTabularMatchLists(
          normalizeBrokenMathpixGraphics(stripLatexBold(stripMarkdownBoldOutsideMath(combined))),
        ),
      ),
    ),
  )
  if (raw.length > MATCH_PARSE_MAX_CHARS) return null
  if (!looksLikeMatchingListStem(raw)) return null
  const media = parseMediaMatchLists(raw)

  const listIHead = includePrecedingFigure(
    raw,
    findStandaloneHeader(raw, LIST_I_RE, /^\s*\(\s*[APQR]/) || inferListStartFromItems(raw),
  )
  const listIIHead = includePrecedingFigure(
    raw,
    findStandaloneHeader(raw, LIST_II_RE, /^\s*\(\s*[PQR1]/),
  )

  let intro = raw
  let listIBlock = ''
  let listIIBlock = ''
  let listITitle = 'List-I'
  let listIITitle = 'List-II'

  if (listIHead && listIIHead && listIHead.index < listIIHead.index) {
    intro = raw.slice(0, listIHead.index)
    listIBlock = raw.slice(listIHead.index, listIIHead.index)
    listIIBlock = raw.slice(listIIHead.index)
    if (/column/i.test(listIHead.raw)) {
      listITitle = 'Column I'
      listIITitle = 'Column II'
    }
  } else if (listIHead) {
    intro = raw.slice(0, listIHead.index)
    listIBlock = raw.slice(listIHead.index)
    if (/column/i.test(listIHead.raw)) {
      listITitle = 'Column I'
      listIITitle = 'Column II'
    }
  } else if (MATCH_HINT.test(raw) && (/Titrate\s*:/i.test(raw) || /\\includegraphics|\\begin\{figure\}/i.test(raw))) {
    const titrateAt = raw.search(/Titrate\s*:/i)
    const figAt = raw.search(/\\begin\{figure\}|\\includegraphics/i)
    const cut =
      titrateAt >= 0 && (figAt < 0 || titrateAt < figAt)
        ? titrateAt
        : figAt >= 0
          ? figAt
          : -1
    if (cut < 0) return null
    intro = raw.slice(0, cut).replace(/\s*(?:List|Column)\s*[-–]?\s*I{1,2}\s*$/i, '').trim()
    listIBlock = raw.slice(cut)
    LIST_II_RE.lastIndex = 0
    const listIIAt = listIBlock.search(LIST_II_RE)
    if (listIIAt > 0) {
      listIIBlock = listIBlock.slice(listIIAt).replace(/^(?:\*{0,2}\s*)?(?:List|Column)\s*[-–]?\s*II\s*(?:\*{0,2})/i, '')
      listIBlock = listIBlock.slice(0, listIIAt)
    }
  } else {
    return null
  }

  // "List-I  List-II" printed side by side: both lists' rows follow the two headings.
  // Each heading alone on its line, so "…considering List-I and List-II?" before the
  // answer choices is not mistaken for the pair.
  const stackedHeads = raw.match(
    /(?:^|\n)[ \t]*\**[ \t]*((?:List|Column)[ \t]*[-–]?[ \t]*I)[ \t]*\**[ \t]*\n[ \t]*\**[ \t]*(?:List|Column)[ \t]*[-–]?[ \t]*II[ \t]*\**[ \t]*\n/i,
  )
  if (stackedHeads && stackedHeads.index != null) {
    const rows = raw.slice(stackedHeads.index + stackedHeads[0].length)
    const firstP = rows.search(/\(\s*P\s*\)/)
    if (firstP > 0 && countMarkers(rows.slice(0, firstP), ROMAN_LIST_I) >= 2) {
      const column = /column/i.test(stackedHeads[1])
      intro = raw.slice(0, stackedHeads.index)
      listITitle = column ? 'Column I' : 'List-I'
      listIITitle = column ? 'Column II' : 'List-II'
      listIBlock = `${listITitle}\n${rows.slice(0, firstP)}`
      listIIBlock = `${listIITitle}\n${rows.slice(firstP)}`
    }
  }

  const optGlue = listIIBlock.search(/\(\s*A\s*\)\s*(?:\(|P|\\)/)
  if (optGlue > 8) listIIBlock = listIIBlock.slice(0, optGlue)
  const keyGlue = listIIBlock.search(
    /\bThe correct option is\b|\(\s*A\s*\)[\s\S]{0,24}?P\s*(?:\\rightarrow|→|->)/i,
  )
  if (keyGlue > 8) listIIBlock = listIIBlock.slice(0, keyGlue)

  if (!listIIBlock && listIBlock) {
    const gluedAt = findGluedListIIIndex(listIBlock)
    if (gluedAt > 8) {
      listIIBlock = listIBlock.slice(gluedAt)
      listIBlock = listIBlock.slice(0, gluedAt)
    }
  }

  // Mathpix sometimes prints List-II (1)(2) then continues with List-I (R)(S) in the same block.
  {
    const mixed = splitMatchListItems(listIIBlock, ['P', 'Q', 'R', 'S', '1', '2', '3', '4', '5']).filter(
      (x) => {
        const t = String(x.text ?? '').trim()
        if (/[1-5]/.test(x.label) && t.length >= 1) return true
        return t.length >= 4
      },
    )
    const strayI = mixed.filter(
      (x) =>
        /[PQRS]/i.test(x.label) &&
        !/^(?:\\rightarrow|→|->)/.test(String(x.text).trim()) &&
        String(x.text).replace(/\s+/g, ' ').trim().length >= 10,
    )
    const nums = mixed.filter((x) => /[1-5]/.test(x.label))
    if (strayI.length >= 1 && nums.length >= 2) {
      for (const row of strayI) {
        const letter = row.label.replace(/[()]/g, '')
        if (!new RegExp(`\\(\\s*${letter}\\s*\\)`, 'i').test(listIBlock)) {
          listIBlock = `${listIBlock.trim()}\n${row.label} ${row.text}`.trim()
        }
      }
      listIIBlock = `List-II\n${nums.map((r) => `${r.label} ${r.text}`).join('\n')}`
    }
  }

  const pqrs = countMarkers(listIBlock, ['P', 'Q', 'R', 'S'])
  const abcd = countMarkers(listIBlock, ['A', 'B', 'C', 'D'])
  const romanI = countMarkers(listIBlock, ROMAN_LIST_I)
  const mappingAbcd =
    abcd >= 2 &&
    /\(\s*A\s*\)\s*P\s*(?:\\rightarrow|→|->)|\(\s*A\s*\)\s*P\s*→/i.test(listIBlock)
  const listILetters = romanI >= 2 && romanI >= pqrs
    ? ROMAN_LIST_I
    : mappingAbcd
      ? ['P', 'Q', 'R', 'S']
      : pqrs >= 3 && pqrs >= abcd
        ? ['P', 'Q', 'R', 'S']
        : ['A', 'B', 'C', 'D']

  let itemsI = splitMatchListItems(listIBlock, listILetters).filter((x) => String(x.text).trim())
  const mappingI =
    itemsI.filter((x) => /P\s*(?:\\rightarrow|→|->)\s*\(?[1-5]/i.test(String(x.text ?? ''))).length >= 2
  if (mappingI) {
    const pqrsItems = splitMatchListItems(listIBlock, ['P', 'Q', 'R', 'S']).filter((x) =>
      String(x.text).trim(),
    )
    const pqrsAreMaps = pqrsItems.filter((x) =>
      /P\s*(?:\\rightarrow|→|->)\s*\(?[1-5]/i.test(String(x.text ?? '')),
    ).length >= 2
    itemsI = !pqrsAreMaps && pqrsItems.length >= 2 ? pqrsItems : []
  }
  if (!listIIBlock && itemsI.length) {
    const peeledHeader = peelGluedListIIFromLastItem(itemsI)
    if (peeledHeader.listIIBlock) {
      itemsI = peeledHeader.items
      listIIBlock = peeledHeader.listIIBlock
    }
  }
  if (itemsI.length < 2) {
    const titrate = splitTitrateListI(listIBlock)
    if (titrate.length >= 2) itemsI = titrate
  }
  if (itemsI.length < 2) {
    const figs = itemsFromMathpixFigures(listIBlock, ['P', 'Q', 'R', 'S'])
    if (figs.length >= 1) itemsI = figs
  }
  const figureOnlyI =
    itemsI.length >= 1 && itemsI.every((x) => /\\includegraphics|cdn\.mathpix/i.test(x.text))
  if (itemsI.length < 2 && !figureOnlyI) {
    if (media?.listI?.length >= 2) return media
    return null
  }

  const numCount = countMarkers(listIIBlock, ['1', '2', '3', '4'])
  const colPQ = countMarkers(listIIBlock, ['P', 'Q', 'R', 'S'])
  /** List-II can run to (6) (2018 P2 Q33, Q51, Q52). */
  const listIILetters =
    numCount >= 2 && numCount >= colPQ ? ['1', '2', '3', '4', '5', '6'] : ['P', 'Q', 'R', 'S', 'T', 'U']

  let itemsII = splitMatchListItems(listIIBlock, listIILetters).filter((x) => String(x.text).trim())
  // Labels present but bodies empty (missing figs) — do not steal List-I media.
  const listIILabeledEmpty = numCount >= 2 && itemsII.length < 2
  if (itemsII.length < 2 && !listIILabeledEmpty) {
    const peeled = peelNumericListII(itemsI, ['1', '2', '3', '4', '5'])
    itemsI = peeled.items.filter((x) => String(x.text).trim())
    itemsII = peeled.listII
  }
  if (itemsII.length < 2 && !listIILabeledEmpty) {
    const figs = itemsFromMathpixFigures(listIIBlock, ['1', '2', '3', '4', '5'])
    if (figs.length >= 1) itemsII = figs
  }

  const listIMedia = new Set(
    itemsI
      .map((row) => String(row.text ?? ''))
      .flatMap((t) => extractMathpixImageUrls(t))
      .filter(Boolean),
  )
  itemsII = itemsII.filter((row) => {
    const urls = extractMathpixImageUrls(String(row.text ?? ''))
    if (!urls.length) return true
    return !urls.every((u) => listIMedia.has(u))
  })

  itemsI = itemsI.filter((row) => {
    const t = String(row.text ?? '')
      .replace(/\$+/g, '')
      .replace(/\\caption\s*\{[^}]*\}/gi, '')
      .trim()
    if (!t) return false
    if (/^\(\s*[PQRSABCD1-5]\s*\)\s*$/i.test(t)) return false
    return true
  })

  const sentence = sentenceIntroAroundListWord(raw, listIHead)
  if (sentence.length > intro.trim().length) intro = sentence
  intro = recoverMatchListIntro(
    raw,
    intro
      .replace(/\s+/g, ' ')
      .replace(/\s*Match each entry in List-I to the correct entries? in List-II\.?\s*/i, (m) =>
        m.trim().endsWith('.') ? `${m.trim()} ` : `${m.trim()}. `,
      )
      .trim(),
    listIHead?.index,
  )

  const parsed = withMatchListOutro(
    preferRicherMatchParse(
      {
        intro,
        listITitle,
        listIITitle,
        listI: itemsI,
        listII: itemsII,
      },
      media,
    ),
  )
  return placeSchemeAboveLists(raw, withHeadingFiguresKept(parsed, [listIBlock, listIIBlock]))
}

const LIST_ROW_MARKER_RE = /\(\s*(?:[PQRSTUABCD1-6]|i{1,3}|iv|I{1,3}|IV)\s*\)/
const FIGURE_CODE_RE = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]+\)/g

const FIGURE_ONLY_RE = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]+\)/g

/**
 * The scheme sits above List-I, and the picture after row (S) is List-II (2014 P2 Q37).
 * A picture that belongs on row (S) itself is left there.
 * @param {string} raw
 * @param {MatchingListDisplay | null} parsed
 */
function placeSchemeAboveLists(raw, parsed) {
  if (!parsed?.listI?.length) return parsed
  const listAt = String(raw).search(/(?:^|\n)[ \t]*(?:List|Column)[ \t]*[-–]?[ \t]*I(?!I)\b/i)
  const scheme = listAt > 0 ? extractMathpixImageUrls(String(raw).slice(0, listAt)) : []
  const bareScheme = (row) => {
    const urls = extractMathpixImageUrls(row?.text)
    const bare = !String(row?.text ?? '').replace(FIGURE_ONLY_RE, '').trim()
    return bare && urls.length > 0 && urls.every((url) => scheme.includes(url))
  }
  const listI = parsed.listI.map((row) => ({ ...row }))
  let listII = (parsed.listII || []).map((row) => ({ ...row }))
  const last = listI[listI.length - 1]
  const lastText = String(last?.text ?? '')
  const lastUrls = extractMathpixImageUrls(lastText)
  const words = lastText.replace(FIGURE_ONLY_RE, '').replace(/\s+/g, ' ').trim()
  const rightIsScheme = listII.length === 1 && bareScheme(listII[0])
  if (last && (listII.length === 0 || rightIsScheme) && lastUrls.length === 1 && words && words.length < lastText.trim().length) {
    listI[listI.length - 1] = { ...last, text: words }
    listII = [...listII, { label: '(1)', text: `\\includegraphics{${lastUrls[0]}}` }]
  }
  let intro = String(parsed.intro ?? '')
  if (scheme.length && listII.length > 1) {
    const kept = []
    for (const row of listII) {
      if (!bareScheme(row)) {
        kept.push(row)
        continue
      }
      if (!extractMathpixImageUrls(intro).some((url) => scheme.includes(url))) {
        intro = `${intro}\n${scheme.map((url) => `\\includegraphics{${url}}`).join('\n')}`.trim()
      }
    }
    listII = kept
  }
  return { ...parsed, intro, listI, listII }
}

/**
 * A question drawing printed just above "List-I" (2014 P2 Q17 charges, Q19 incline) is pulled into
 * the list block with the heading; when no row shows it, it stays under the question text.
 */
function withHeadingFiguresKept(parsed, blocks) {
  if (!parsed?.listI?.length) return parsed
  const shown = new Set(
    [parsed.intro, parsed.outro, ...[...(parsed.listI || []), ...(parsed.listII || [])].map((row) => row?.text)]
      .flatMap((t) => extractMathpixImageUrls(String(t ?? ''))),
  )
  const lost = []
  for (const block of blocks) {
    const text = String(block ?? '')
    const first = text.search(LIST_ROW_MARKER_RE)
    for (const code of (first < 0 ? '' : text.slice(0, first)).match(FIGURE_CODE_RE) || []) {
      const urls = extractMathpixImageUrls(code)
      if (urls.length && urls.every((u) => !shown.has(u))) {
        urls.forEach((u) => shown.add(u))
        lost.push(code)
      }
    }
  }
  if (!lost.length) return parsed
  return { ...parsed, intro: [String(parsed.intro ?? '').trim(), ...lost].filter(Boolean).join('\n') }
}

/** Keep (4) on row 4 when (2) and (3) are absent. Do not slide later numbers up. */
export function placeListIIByNumber(items) {
  const list = Array.isArray(items) ? items : []
  const labels = list.map((it) => Number(String(it?.label || '').replace(/[()]/g, '')))
  if (!labels.length || labels.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) return list
  const by = new Map()
  list.forEach((it, i) => {
    if (!by.has(labels[i])) by.set(labels[i], it)
  })
  const max = Math.max(...labels)
  const slots = []
  for (let n = 1; n <= max; n += 1) slots.push(by.get(n) || null)
  return slots
}

/**
 * Pair List-I with List-II. An extra List-II item stays on the right with no left card.
 * @param {MatchListItem[] | null | undefined} listI
 * @param {MatchListItem[] | null | undefined} listII
 */
export function matchListRowPlan(listI, listII) {
  const left = Array.isArray(listI) ? listI : []
  const right = placeListIIByNumber(listII)
  const count = Math.max(left.length, right.length)
  /** @type {{ left: MatchListItem | null, right: MatchListItem | null, leftCard: boolean }[]} */
  const rows = []
  for (let i = 0; i < count; i += 1) {
    const item = left[i] || null
    rows.push({
      left: item,
      right: right[i] || null,
      leftCard: Boolean(item),
    })
  }
  return rows
}
