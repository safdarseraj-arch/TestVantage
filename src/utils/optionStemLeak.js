/** Shared: remove question stem / next-question text accidentally stored in an MCQ option. */

import { keepStructuredQuestionLines } from './repairMatrixStem.js'

/** Real English/math that often follows "is :" in a valid stem (keep). */
const REAL_STEM_TAIL_START =
  /^(?:sq\.?\s*units?|equal(?:\s+to)?|given\s+by|true|false|correct|incorrect|\$|\\(?:frac|sqrt|vec|hat|begin|pm|ell|dfrac|left|right|ce)|-?\d)/i

/**
 * Graph-axis / option-panel OCR crumbs after the stem ends
 * (e.g. "i pg oa PY a % ™ \\infty WV. A x").
 * @param {string} tail
 */
export function looksLikeGraphLabelOcrGarbage(tail) {
  const t = String(tail ?? '').trim()
  if (!t) return false
  if (REAL_STEM_TAIL_START.test(t)) return false
  // Real MCQ / chemistry / math continuation — never treat as graph crumbs
  if (/\(\s*[A-D]\s*\)|\\ce\{|\\frac\{|\\sqrt|\\vec\{|\\hat\{|\\begin\{/i.test(t.slice(0, 100))) {
    return false
  }
  const realWords = t.match(/\b[a-z]{4,}\b/gi) ?? []
  if (
    /\b(?:then|which|identify|find|locus|statement|following|correct|units?|bonding|hydrogen)\b/i.test(
      t,
    ) &&
    realWords.length >= 2
  ) {
    return false
  }
  if (/^\$|\\(?:hat|frac|vec|dfrac|pm|sqrt|ce)/i.test(t.slice(0, 24))) return false

  // Trademark / infinity / percent mixed into short non-prose tails
  if (/[™®©]/.test(t) || /\\infty|\u221e/.test(t)) {
    if (realWords.length < 2) return true
  }
  if (/%\s*[™®©\\]/.test(t) || /[™®©]\s*(?:\\|%|\u221e)/.test(t)) return true

  // Classic option-marker OCR soup
  if (/[»®©@]|HI\s*©|[-/]{2,}/.test(t.slice(0, 100))) return true

  // Run of short letter crumbs (tick labels / graph OCR) — not real sentences
  const tokens = t.split(/[\s,;|]+/).filter(Boolean)
  if (tokens.length >= 3) {
    const keepWord =
      /^(?:is|to|of|or|an|at|by|in|on|if|as|be|we|so|do|no|up|for|the|and|are|not|all|any|may|can|has|was|one|two|per|sq|units?|a|b|c|d|x|y|z|n|r|p|q)$/i
    const noise = tokens.filter((tok) => {
      const w = tok.replace(/[^A-Za-z]/g, '')
      if (!w) return /[™%∞]/.test(tok) || /\\infty/i.test(tok) || /^[.\-–—]+$/.test(tok)
      if (w.length > 3) return false
      return !keepWord.test(w)
    })
    if (noise.length >= 3 && noise.length >= Math.ceil(tokens.length * 0.5)) return true
  }

  // Mostly trademark / infinity crumbs with no real words (do not flag LaTeX `\`)
  if (
    t.length >= 8 &&
    realWords.length === 0 &&
    (t.match(/[A-Za-z]/g) ?? []).length >= 4 &&
    /[™%∞]/.test(t)
  ) {
    return true
  }
  return false
}

/**
 * Options are empty / attach-graph placeholders — stem must not keep option-band OCR.
 * @param {string[]} [options]
 */
function optionsLookLikeGraphsOrEmpty(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (!opts.length) return false
  const filled = opts.filter(Boolean)
  if (filled.length < 2) return filled.length === 0
  return filled.every(
    (o) =>
      !o ||
      /\(Graph\/diagram\s*[—\-]\s*attach image/i.test(o) ||
      /^Option\s+[A-D]$/i.test(o) ||
      /^\[?\s*Graph\s*[A-D]\s*[:\]]/i.test(o) ||
      o.length <= 2,
  )
}

/**
 * Strip option garbage merged into the stem by bad OCR
 * (e.g. "is - 1,2,» (C) 1, …" / "is - ®) ©)" / "is : i pg oa PY a % ™ …").
 * Safe for stem fields only — do not run on full OCR blobs that still contain A–D.
 * @param {string} stem
 * @param {string[]} [options] when graph/empty, cut any non-math tail after "is :"
 */
export function cleanStemMergedOptionGarbage(stem, options = []) {
  let s = String(stem ?? '').trim()
  if (!s) return s
  const equalsLeak = s.match(/^([\s\S]*?\bequals?\s*(?::-|[:–—]))\s*(.+)$/i)
  if (equalsLeak && /allb|laF?lb|lbP|aFlbP|\|a\|\^2.*\|b\|\^2/i.test(equalsLeak[2])) {
    if (!/\(\s*[A-D]\s*\)/i.test(equalsLeak[2])) {
      return equalsLeak[1].trim()
    }
  }
  // Require is/are + dash/colon, then OCR junk in the next ~100 chars (not mid-sentence "are")
  const promptCut = s.match(
    /^([\s\S]*?\b(?:is|are)\s*(?:equal\s+to\s*)?[-–—:]\s+)([\s\S]+)$/i,
  )
  if (promptCut) {
    const head = promptCut[1].trim()
    const tail = promptCut[2]
    const near = tail.slice(0, 120)
    const junkNear =
      (looksLikeGraphLabelOcrGarbage(near) ||
        /[»®©@]|HI\s*©|[-/]{2,}|\d\s*,\s*\d|\(\s*[A-D]\s*\)/i.test(near)) &&
      !/^\$|\\hat|\\frac|\\vec|\\dfrac|\\pm|\\sqrt/i.test(tail.trim().slice(0, 24))
    const graphOpts = optionsLookLikeGraphsOrEmpty(options)
    if (junkNear || (graphOpts && looksLikeGraphLabelOcrGarbage(tail.slice(0, 80)))) {
      return head.replace(/\s+$/, '').trim()
    }
    if (graphOpts && near.trim() && !REAL_STEM_TAIL_START.test(near) && near.length <= 60) {
      // Graph MCQ: any short non-math crumbs after "is :" are option-panel OCR — drop.
      if ((near.match(/\b[a-z]{4,}\b/gi) ?? []).length < 2) {
        return head.replace(/\s+$/, '').trim()
      }
    }
  }
  // "... ?" then graph-label OCR crumbs (not (A)–(D) / chemistry / math)
  const qCut = s.match(/^([\s\S]*\?)\s+(.+)$/)
  if (qCut) {
    const qTail = qCut[2]
    if (
      !/\(\s*[A-D]\s*\)|\\ce\{|\\frac|\\sqrt/i.test(qTail.slice(0, 80)) &&
      looksLikeGraphLabelOcrGarbage(qTail.slice(0, 120))
    ) {
      return qCut[1].trim()
    }
  }
  const idx = s.search(/\(\s*[A-D]\s*\)/i)
  if (idx > 50 && /[»®©@]|HI\s*©|\d\s*,\s*\d\s*,|™|\\infty/.test(s.slice(idx, idx + 90))) {
    return s.slice(0, idx).trim()
  }
  // Strip trailing nonsense run even without "is :" (last ~40 chars only)
  const trailing = s.match(/^([\s\S]{40,}?)\s+((?:[A-Za-z]{1,3}[\s,.|%™®©∞\\]+){3,}[A-Za-z0-9\s,.|%™®©∞\\]*)$/)
  if (trailing && looksLikeGraphLabelOcrGarbage(trailing[2])) {
    return trailing[1].replace(/\s+$/, '').trim()
  }
  return s
}

/**
 * OCR glues the first option label onto the stem: "... value of $\\lim…$ is (A)".
 * Strip when options are stored separately or the marker is clearly not P(A)/f(A).
 * @param {string} stem
 * @param {string[]} [options]
 */
export function stripTrailingOptionMarkerFromStem(stem, options = []) {
  let s = String(stem ?? '').replace(/\r\n/g, '\n').trim()
  if (!s) return s

  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const hasSeparateOpts = opts.some(Boolean)

  // "... is (A)" / "... is:(A)" — first MCQ label leaked onto the question line.
  s = s.replace(/\s+is\s*:\s*\(\s*A\s*\)\s*$/i, ' is')
  s = s.replace(/\s+is\s*\(\s*A\s*\)\s*$/i, ' is')

  if (hasSeparateOpts) {
    s = s.replace(/\s*\(\s*A\s*\)\s*$/i, '').trim()
  } else if (/\bis\s*$/i.test(s)) {
    s = s.replace(/\s*\(\s*A\s*\)\s*$/i, '').trim()
  }

  // A reaction scheme's numbered steps are lines. Squeezing them into one
  // sentence hides which reagent belongs to which arrow.
  if (keepStructuredQuestionLines(s)) {
    return s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** First line / block before (A) in a preview context string. */
export function inferStemFromContext(context) {
  const ctx = String(context ?? '').trim()
  if (!ctx) return ''
  const marker = ctx.search(/\n\(\s*A\s*\)/i)
  if (marker > 20) return ctx.slice(0, marker).trim()
  const first = ctx.split('\n')[0]?.trim() ?? ''
  return first.length > 25 ? first : ctx.slice(0, 200).trim()
}

/** New question / stem leak — avoid "Find the", "When the" inside a valid option. */
const NEXT_QUESTION_RE =
  /\s+(?:\d{1,3}\.\s*)?If\s+(?:\\vec|\$\\vec|\$?\\hat)|\s+(?:Let|Given)\s+\\vec\{|\s+If\s+\$\\vec\{|\s+If\s+\$\\hat\{/i

const BULK_NEXT_RE = /\n\s*(?:Q\s*\d|Question\s*\d|\d{1,3}\.\s*If\s|r\s+r\s*\^)/i
/** Last option before a page break: "7/3 \end{itemize} PHYSICS \begin{itemize}". */
const LIST_PAGE_TAIL_RE =
  /\s*\\(?:begin|end)\{(?:itemize|enumerate)\}(?:\s*(?:\\(?:begin|end)\{(?:itemize|enumerate)\}|\\section\*?\{[^{}]*\}|(?:PHYSICS|CHEMISTRY|MATHEMATICS|BIOLOGY)\b))*\s*$/
/** A line break left after an option sentence: "… is zero. \\" (2025 P2 Q23). */
const TRAILING_LINE_BREAK_RE = /(?:\s*\\\\)+\s*$/

/** Stem phrases that indicate duplicated question text — NOT "is equal to" (valid in options). */
const STEM_TAIL_LEAK_RE =
  /\b(?:are one of the sides|medians respectively|through the same vertex|such that|then area of triangle|projection of|is such that|which of the following)\b/i

/** Option B/C style: "... is equal to $2\\sqrt{5}$ sq units" — must stay intact. */
function hasOptionEqualityAnswer(text) {
  return /is\s+equal\s+to\s*(\$|\\frac|\\sqrt|[\d2])/i.test(text)
}

/** Multi-vector option: diagonals d1 and d2 then area. */
function hasMultiVectorOption(text) {
  return /parallelogram|diagonals?/i.test(text) && /\band\s+.*\\vec\{d\}_\{2\}/i.test(text)
}

/**
 * Meaningful English/math answer after a $…$ block — must NOT be stripped
 * (e.g. "$\\lim…$ does not exist", "$f(x)$ is undefined").
 * @param {string} text
 */
export function hasMeaningfulOptionAnswerTail(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  return (
    /\bdoes\s+not\s+exist\b/i.test(t) ||
    /\bis\s+undefined\b/i.test(t) ||
    /\bdoes\s+not\s+converge\b/i.test(t) ||
    /\bdiverge[sd]?\b/i.test(t) ||
    /\bcannot\s+be\s+determined\b/i.test(t) ||
    /\bis\s+(?:dis)?continuous\b/i.test(t) ||
    /\bis\s+(?:not\s+)?defined\b/i.test(t) ||
    /\bnone\s+of\s+(?:these|the\s+above)\b/i.test(t) ||
    /\ball\s+of\s+(?:these|the\s+above)\b/i.test(t) ||
    /\bif\s+and\s+only\s+if\b/i.test(t) ||
    /\bis\s+purely\s+(?:real|imaginary)\b/i.test(t) ||
    /\bwhere\s+\$i\b/i.test(t) ||
    hasShortPredicateTail(t)
  )
}

/**
 * A one- or two-word predicate closing the option ("$C$ is indefinite") is the
 * answer itself, not leaked stem prose. Trailing prepositions ("is equal to")
 * mean the sentence continues, so those stay strippable.
 * @param {string} text
 */
function hasShortPredicateTail(text) {
  const tail = String(text ?? '')
    .trim()
    .match(/(?:^|\$\s*)((?:is|are)\s+(?:not\s+)?[a-z]+(?:\s+[a-z]+)?)$/i)
  if (!tail) return false
  return !/\b(?:to|of|by|in|on|for|with|than|then|and|or|that|as)$/i.test(tail[1])
}

/**
 * @param {string} text
 * @param {number} pos
 * @param {string} phrase
 */
function shouldCutAtPhrase(text, pos, phrase) {
  if (/^is equal to$/i.test(phrase.trim())) {
    return !hasOptionEqualityAnswer(text.slice(pos))
  }
  return true
}

/**
 * @param {string} opt
 * @param {string} [stem]
 */
/** Drop passage Q2+ text leaked into an option (common on option D). */
export function stripNextSubQuestionFromOption(opt) {
  let o = String(opt ?? '').trim()
  if (!o) return o

  const inlineStem = o.match(
    /^([\d\s$\\{}^/+\-.(),]+?)\s+(?:Value\s+of|The\s+value\s+of|\d{1,2}[\.\)]\s+(?:Value|ratio|sum)\b)/i,
  )
  if (inlineStem) o = inlineStem[1].trim()

  const valueLeak = o.search(/\s+Value\s+of\s+(?:\$|\\frac|\\sum|\\dfrac)/i)
  if (valueLeak > 4 && /^[\d$\\]/.test(o)) o = o.slice(0, valueLeak).trim()

  o = o
    .replace(/\s+\d{1,2}[\.\)]\s+.*$/s, '')
    .replace(/\s+Value\s+of\b.*$/is, '')
    .replace(/\s*\(\s*A\s*\)\s*.*$/is, '')
    .trim()

  return o
}

/**
 * @param {string[]} options
 */
export function stripNextQuestionFromOptions(options) {
  return (options ?? []).map((opt, i) => {
    let o = String(opt ?? '').trim()
    if (i === 3 || (o.length > 40 && /\s+Value\s+of\b/i.test(o))) {
      o = stripNextSubQuestionFromOption(o)
    }
    return o
  })
}

export function trimQuestionLeakFromOption(opt, stem = '') {
  let o = stripNextSubQuestionFromOption(
    String(opt ?? '').trim().replace(LIST_PAGE_TAIL_RE, '').replace(TRAILING_LINE_BREAK_RE, ''),
  )
  if (!o) return o

  if (hasOptionEqualityAnswer(o) || hasMultiVectorOption(o)) {
    o = stripStemSuffixFromOption(o, stem, { preserveEquality: true })
  } else {
    o = stripStemSuffixFromOption(o, stem)
  }

  const nextQuestion = o.search(NEXT_QUESTION_RE)
  if (nextQuestion > 12) o = o.slice(0, nextQuestion).trim()

  const bulkNext = o.search(BULK_NEXT_RE)
  if (bulkNext > 8) o = o.slice(0, bulkNext).trim()

  if (o.length > 220 && !hasOptionEqualityAnswer(o)) {
    const tail = o.slice(120)
    const stemLike = tail.search(STEM_TAIL_LEAK_RE)
    if (stemLike >= 0) o = o.slice(0, 120 + stemLike).trim()
  }

  if (o.length > 140 && stem && !hasOptionEqualityAnswer(o)) {
    const s = stem.replace(/\s+/g, ' ').trim()
    if (s.length >= 25) {
      const pos = o.replace(/\s+/g, ' ').indexOf(s.slice(0, Math.min(60, s.length)))
      if (pos > 10) o = o.slice(0, pos).trim()
    }
  }

  return o.replace(/\s+/g, ' ').trim()
}

/** Join OCR-split math: "$\\frac{1}{2}$ $\\sqrt{86}$" → "$\\frac{1}{2}\\sqrt{86}$". */
export function mergeSplitMathDollars(opt) {
  let o = String(opt ?? '').trim()
  if (!o) return o

  for (let pass = 0; pass < 6; pass++) {
    const prev = o
    o = o.replace(/\$([^$]+)\$\s+\$([^$]+)\$/g, (_, a, b) => `$${a.trim()}${b.trim()}$`)
    o = o.replace(
      /\$([^$]+)\$\s+(?:\\)?(sqrt\{[^}]+\})\$?/gi,
      (_, a, sqrt) => `$${a.trim()}\\${sqrt}$`,
    )
    o = o.replace(
      /\$([^$]+)\$\s+\\(frac)\{([^}]*)\}\{([^}]*)\}/g,
      (_, a, cmd, p1, p2) => `$${a.trim()}\\${cmd}{${p1}}{${p2}}$`,
    )
    if (o === prev) break
  }
  return o
}

/** Drop English/OCR junk after math — never strip "is equal to $2\\sqrt{5}$" or "does not exist" tails. */
export function trimTrailingProseAfterMath(opt) {
  let o = mergeSplitMathDollars(String(opt ?? '').trim())
  if (!o) return o

  if (
    hasOptionEqualityAnswer(o) ||
    hasMultiVectorOption(o) ||
    /sq\.?\s*units?/i.test(o) ||
    hasMeaningfulOptionAnswerTail(o)
  ) {
    return o
  }

  const m = o.match(/^(\$(?:[^$]|\$\$)*\$)\s+(.+)$/s)
  if (!m) return o

  const tail = m[2].trim()
  if (/^\$/.test(tail) || /^\\(?:sqrt|frac|hat|vec)/.test(tail)) {
    return mergeSplitMathDollars(`${m[1].trim()} ${tail}`)
  }
  if (/\\sqrt|\\frac/.test(tail) && /^[\d\s$\\{}^/+\-.]+$/.test(tail)) {
    return mergeSplitMathDollars(`${m[1].trim()} ${tail}`)
  }
  if (
    /^and\s+\$/.test(tail) ||
    hasOptionEqualityAnswer(tail) ||
    hasMeaningfulOptionAnswerTail(tail) ||
    isOptionClauseTail(tail)
  ) {
    return o
  }
  return m[1].trim()
}

/**
 * "is increasing in $(0, \infty)$" or "in $(0, \infty)$" after the first formula is the
 * option itself (2017 P2 Q46). A run-on ("is equal to"), a new sentence, or page chrome is not.
 * @param {string} tail
 */
function isOptionClauseTail(tail) {
  const t = String(tail ?? '').trim()
  if (!t || t.length > 120 || !/^[a-z]/.test(t)) return false
  if (/[.?!:]\s+[A-Z]|\bthen\b|rough\s+work|\bQ\s*\.\s*\d/i.test(t)) return false
  const prose = t.replace(/\$[^$]*\$/g, ' $ ').trim()
  if (/\b(?:to|of|is|are|the|a|an|and|or|that|by|for|with|in|on|at|from|as|than|where|which)\s*[.,]?$/i.test(prose)) return false
  return prose.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length <= 10
}

/**
 * @param {string} opt
 * @param {string} stem
 * @param {{ preserveEquality?: boolean }} [opts]
 */
export function stripStemSuffixFromOption(opt, stem, opts = {}) {
  const o = String(opt ?? '').replace(/\s+/g, ' ').trim()
  const s = String(stem ?? '').replace(/\s+/g, ' ').trim()
  if (!o || !s || s.length < 20) return o

  if (opts.preserveEquality || hasOptionEqualityAnswer(o)) {
    return o
  }

  for (const len of [140, 100, 70, 45, 28]) {
    const needle = s.slice(0, Math.min(len, s.length))
    if (needle.length < 18) continue
    const pos = o.indexOf(needle)
    if (pos > 0 && (pos < 120 || STEM_TAIL_LEAK_RE.test(o.slice(pos)))) {
      return o.slice(0, pos).trim()
    }
  }

  const tailPhrases = [
    'are one of the sides and medians respectively',
    'are one of the sides',
    'medians respectively',
    'through the same vertex',
    'then area of triangle',
    'projection of',
    'such that',
    'which of the following',
  ]
  for (const phrase of tailPhrases) {
    const pos = o.search(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    if (pos > 20 || (pos > 10 && o.length - pos > 35)) {
      if (shouldCutAtPhrase(o, pos, phrase)) return o.slice(0, pos).trim()
    }
  }

  return o
}

/** @param {string[]} options @param {string} stem */
export function stripStemLeakFromOptions(options, stem) {
  const s = String(stem ?? '').trim()
  if (!s || s.length < 25) {
    return (options ?? []).map((opt) => trimQuestionLeakFromOption(opt))
  }

  const needles = [
    s.slice(0, 120),
    s.slice(0, 80),
    s.slice(0, 50),
    'are one of the sides and medians respectively',
    'are one of the sides',
    'medians respectively',
    'through the same vertex',
    'then area of triangle',
    'projection of',
    'which of the following',
  ].filter((n) => n.length >= 18)

  return (options ?? []).map((opt) => {
    let o = trimQuestionLeakFromOption(opt, s)
    if (hasOptionEqualityAnswer(o)) return o

    for (const needle of needles) {
      const pos = o.replace(/\s+/g, ' ').indexOf(needle.replace(/\s+/g, ' '))
      if (pos > 18) {
        o = o.slice(0, pos).trim()
        break
      }
    }
    return trimQuestionLeakFromOption(o, s)
  })
}

function foldStemRepeat(text) {
  return String(text ?? '')
    .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\$+/g, '')
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function optionIsOnlyMathpixImage(opt) {
  const raw = String(opt ?? '').trim()
  if (!/\\includegraphics|cdn\.mathpix\.com/i.test(raw)) return false
  const rest = raw
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[\s$]+/g, '')
  return rest.length === 0
}

/** Option A that is just the stem starting “A source…” */
export function optionLooksLikeStemRepeat(opt, stem) {
  const raw = String(opt ?? '').trim()
  if (optionIsOnlyMathpixImage(raw)) return false
  if (/\(\s*P\s*\)\s*[→\-]|P\s*→\s*[0-9]/.test(raw)) return false
  const o = foldStemRepeat(opt)
  const s = foldStemRepeat(stem)
  if (o.length < 20 || s.length < 20) return false
  const stemBody = s.replace(/^a\s+/, '')
  const optBody = o.replace(/^a\s+/, '')
  const n = Math.min(32, optBody.length, stemBody.length)
  if (n < 20) return false
  if (stemBody.startsWith(optBody.slice(0, n))) return true
  if (optBody.startsWith(stemBody.slice(0, n))) return true
  if (o.length >= 48 && s.includes(o)) return true
  if (optBody.length >= 48 && stemBody.includes(optBody)) return true
  const chunk = optBody.slice(0, Math.min(64, optBody.length))
  if (chunk.length >= 36 && stemBody.includes(chunk) && optBody.length > stemBody.length * 0.35) {
    return true
  }
  return false
}

/** Blank options that repeat the stem so A–D can be recovered from itemize / SMILES. */
export function dropStemRepeatOptions(options, stem) {
  return (Array.isArray(options) ? options : []).map((opt) =>
    optionLooksLikeStemRepeat(opt, stem) ? '' : String(opt ?? ''),
  )
}
