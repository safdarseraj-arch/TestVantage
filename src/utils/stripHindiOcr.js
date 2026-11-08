/**
 * Bilingual JEE papers print each question (or whole pages) in English and then Hindi.
 * Cards are English only, so every OCR reader (splitter, marker count, facts card,
 * quality check) drops the Hindi copy first and they all see the same paper.
 * Text without Devanagari comes back unchanged.
 */

const DEVANAGARI_RE = /[\u0900-\u097F]/
const DEVANAGARI_ALL_RE = /[\u0900-\u097F]/g
const DEVANAGARI_RUN = String.raw`[\u0900-\u097F](?:[\u0900-\u097F\s,.;:!?'"“”‘’()\-–—|]*[\u0900-\u097F])?`
const DEVANAGARI_RUN_RE = new RegExp(String.raw`\(\s*${DEVANAGARI_RUN}\s*\)|\[\s*${DEVANAGARI_RUN}\s*\]|${DEVANAGARI_RUN}`, 'g')
const ITEM_MARKER_RE = /\\item\s*\[\s*Q\s*\.?\s*\]\s*(\d{1,3})\b|\\item\s*\[\s*Q\s*\.?\s*(\d{1,3})\s*\]/
const LINE_MARKER_RE = /^\s*(?:\\section\*?\{\s*)?Q\s*\.?\s*(\d{1,3})\b/
const ANSWER_RE = /^\s*(?:\\section\*?\{\s*)?(?:Official\s+)?(?:Answer|Ans|Key)\s*[:.\-=]/i
const HINDI_ANSWER_RE = /^\s*(?:\\section\*?\{\s*)?(?:सही\s+)?उत्तर\s*[:.\-=]\s*([^\n}]*)/
const STRUCT_RE = /^\s*(?:\\(?:begin|end)\{(?:itemize|enumerate|center|table|figure)\}\s*)+$/
const SECTION_RE = /^\s*(?:\\section\*?\{\s*)?(?:SECTION|PART|PARAGRAPH|Paragraph|Question\s+Stem)\b/
const OPTION_LABEL_RE = /\(\s*[A-D]\s*\)|\[\s*[A-D]\s*\]/
const FIGURE_RE = /\\includegraphics|!\[[^\]]*\]\(/
/** A Hindi page repeats a few questions; its "Q. 1" is the English Q.1 only when that marker is this close. */
const MARKER_WINDOW = 8
/** Unclosed tables / display math stop here instead of swallowing the rest of the paper. */
const MAX_UNIT_LINES = 80

function latinLetters(text) {
  return String(text)
    .replace(new RegExp(ITEM_MARKER_RE.source, 'g'), ' ')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$]*\$/g, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g, ' ')
    .replace(/\\(?:begin|end)\{[^}]*\}(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/\\[A-Za-z]+\*?/g, ' ')
    .replace(/\(\s*[A-D]\s*\)|\[\s*[A-D]\s*\]/g, ' ')
    .replace(/^\s*Q\s*\.?\s*\d{1,3}\b/gm, ' ')
    .replace(/[^A-Za-z]+/g, '').length
}

function devanagariCount(text) {
  return (String(text).match(DEVANAGARI_ALL_RE) || []).length
}

/** 'hi' when Devanagari outweighs the English prose; math, figures and labels count for neither. */
function langOf(text) {
  const deva = devanagariCount(text)
  const latin = latinLetters(text)
  if (!deva) return latin >= 3 ? 'en' : 'neutral'
  if (latin < 3 || latin < deva * 0.6) return 'hi'
  return 'mixed'
}

/** @param {string} text */
export function textIsMostlyHindi(text) {
  return DEVANAGARI_RE.test(String(text ?? '')) && langOf(text) === 'hi'
}

/**
 * A scan with almost no English prose: there is no English copy to keep.
 * @param {unknown} raw
 */
export function ocrIsHindiOnly(raw) {
  const text = String(raw ?? '')
  if (!DEVANAGARI_RE.test(text)) return false
  const deva = devanagariCount(text)
  return deva >= 300 && latinLetters(text) < deva * 0.2
}

/** @param {string} text */
export function stripDevanagariRuns(text) {
  const s = String(text ?? '')
  if (!DEVANAGARI_RE.test(s)) return s
  return s
    .replace(DEVANAGARI_RUN_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
}

function dollarPairs(line) {
  return (line.match(/\$\$/g) || []).length
}

/** Lines, with each table and each multi-line `$$…$$` kept as one unit. */
function splitUnits(lines) {
  const units = []
  for (let i = 0; i < lines.length; i += 1) {
    let j = i
    if (/\\begin\{tabular\}/.test(lines[i]) && !/\\end\{tabular\}/.test(lines[i])) {
      while (j < lines.length - 1 && j - i < MAX_UNIT_LINES && !/\\end\{tabular\}/.test(lines[j])) j += 1
      if (!/\\end\{tabular\}/.test(lines[j])) j = i
    } else if (dollarPairs(lines[i]) % 2 === 1) {
      while (j < lines.length - 1 && j - i < MAX_UNIT_LINES && dollarPairs(lines[j + 1]) % 2 === 0) j += 1
      if (j < lines.length - 1 && dollarPairs(lines[j + 1]) % 2 === 1) j += 1
      else j = i
    }
    units.push({ text: lines.slice(i, j + 1).join('\n') })
    i = j
  }
  return units
}

function classify(unit) {
  const text = unit.text
  if (!text.trim()) return { kind: 'blank' }
  if (STRUCT_RE.test(text)) return { kind: 'struct' }
  const first = text.split('\n')[0]
  const m = first.match(ITEM_MARKER_RE) || first.match(LINE_MARKER_RE)
  if (m) {
    const end = m.index + m[0].length
    const rest = first.slice(end) + text.slice(first.length)
    return { kind: 'marker', num: Number(m[1] || m[2]), marker: first.slice(0, end), restLang: langOf(rest) }
  }
  const hindiAnswer = first.match(HINDI_ANSWER_RE)
  if (hindiAnswer) return { kind: 'hiAnswer', value: stripDevanagariRuns(hindiAnswer[1]).trim() }
  const lang = langOf(text)
  if (lang !== 'hi' && ANSWER_RE.test(first)) return { kind: 'answer', lang }
  return { kind: 'body', lang, section: lang !== 'hi' && SECTION_RE.test(first) }
}

function significantAfter(units, i, skip = () => false) {
  for (let j = i + 1; j < units.length; j += 1) {
    const u = units[j]
    if (u.kind === 'blank' || u.kind === 'struct' || skip(u)) continue
    return u
  }
  return null
}

const norm = (text) => String(text).replace(/\\hline/g, '').replace(/\s+/g, '')

/**
 * Drop the Hindi copy of a bilingual scan. Keeps English text, English options, one
 * copy of each figure, answer lines and the English question markers. A Hindi-only
 * repeat of a question marker is dropped so it never becomes an extra card.
 * @param {unknown} raw
 * @returns {string}
 */
export function stripHindiOcr(raw) {
  const text = String(raw ?? '')
  if (!DEVANAGARI_RE.test(text) || ocrIsHindiOnly(text)) return text
  const units = splitUnits(text.split(/\r?\n/)).map((u) => ({ ...u, ...classify(u) }))

  units.forEach((u, i) => {
    if (u.kind !== 'marker') return
    if (u.restLang === 'hi') u.hindi = true
    else if (u.restLang === 'neutral') u.hindi = significantAfter(units, i)?.lang === 'hi'
  })

  const english = units.map((u, i) => ({ u, i })).filter(({ u }) => u.kind === 'marker' && !u.hindi)
  units.forEach((u, i) => {
    if (u.kind !== 'marker' || !u.hindi) return
    const k = english.filter((e) => e.i < i).length
    const near = english
      .slice(Math.max(0, k - MARKER_WINDOW), k + MARKER_WINDOW)
      .filter((e) => e.u.num === u.num)
      .sort((a, b) => Math.abs(a.i - i) - Math.abs(b.i - i))[0]
    if (near) u.copyOf = near.u
    else u.keepMarkerOnly = true
  })

  let key = 0
  for (const u of units) {
    if ((u.kind === 'marker' && (!u.hindi || u.keepMarkerOnly)) || (u.kind === 'body' && u.section)) key += 1
    u.key = key
  }

  /** @type {Map<number, { norms: Set<string>, options: boolean, figures: number, answer: boolean }>} */
  const sides = new Map()
  const side = (k) => {
    if (!sides.has(k)) sides.set(k, { norms: new Set(), options: false, figures: 0, answer: false })
    return sides.get(k)
  }
  const addEnglish = (u) => {
    const s = side(u.key)
    s.norms.add(norm(u.text))
    if (OPTION_LABEL_RE.test(u.text)) s.options = true
    if (FIGURE_RE.test(u.text)) s.figures += 1
  }

  let runKey = null
  for (const u of units) {
    if (u.kind === 'blank' || u.kind === 'struct') continue
    if (u.kind === 'marker') {
      if (u.copyOf) {
        u.drop = true
        runKey = u.copyOf.key
      } else if (u.keepMarkerOnly) {
        u.text = u.marker
        runKey = u.key
      } else {
        runKey = null
        addEnglish(u)
      }
      continue
    }
    if (u.kind === 'answer') {
      runKey = null
      side(u.key).answer = true
      continue
    }
    if (u.kind === 'hiAnswer') {
      u.candidate = true
      u.runKey = runKey ?? u.key
      continue
    }
    if (u.lang === 'hi') {
      u.drop = true
      if (runKey == null) runKey = u.key
      continue
    }
    if (runKey != null && side(runKey).norms.has(norm(u.text))) {
      u.drop = true
      continue
    }
    if (runKey != null && u.lang === 'neutral') {
      u.candidate = true
      u.runKey = runKey
      continue
    }
    runKey = null
    addEnglish(u)
  }

  units.forEach((u, i) => {
    if (!u.candidate) return
    const s = side(u.runKey)
    if (u.kind === 'hiAnswer') {
      if (s.answer || u.runKey !== u.key || !u.value) u.drop = true
      else {
        u.text = `Answer: ${u.value}`
        s.answer = true
      }
      return
    }
    if (u.runKey !== u.key) u.drop = true
    else if (OPTION_LABEL_RE.test(u.text)) u.drop = s.options
    else if (FIGURE_RE.test(u.text)) u.drop = s.figures > 0
    else {
      const next = significantAfter(units, i, (n) => n.candidate)
      u.drop = s.norms.has(norm(u.text)) || Boolean(next && next.drop && (next.lang === 'hi' || next.kind === 'marker'))
    }
  })

  const out = []
  let droppedSince = false
  for (const u of units) {
    if (u.drop) {
      droppedSince = true
      continue
    }
    const kept = stripDevanagariRuns(u.text)
    if (!kept.trim() && u.text.trim()) {
      droppedSince = true
      continue
    }
    if (!kept.trim() && droppedSince && out.length && !out[out.length - 1].trim()) continue
    out.push(kept)
    if (kept.trim()) droppedSince = false
  }
  return withoutEmptiedEnvironments(out).join('\n')
}

/** `\begin{itemize}` … `\end{itemize}` left with nothing inside once the Hindi copy is gone. */
function withoutEmptiedEnvironments(lines) {
  const out = [...lines]
  for (let i = 0; i < out.length; i += 1) {
    const open = out[i]?.match(/^\s*\\begin\{(itemize|enumerate|center|figure)\}\s*$/)
    if (!open) continue
    let j = i + 1
    while (j < out.length && !out[j].trim()) j += 1
    if (j < out.length && new RegExp(String.raw`^\s*\\end\{${open[1]}\}\s*$`).test(out[j])) {
      let k = j + 1
      if (k < out.length && !out[k].trim() && (i === 0 || !out[i - 1].trim())) k += 1
      out.splice(i, k - i)
      i = Math.max(-1, i - 2)
    }
  }
  return out
}
