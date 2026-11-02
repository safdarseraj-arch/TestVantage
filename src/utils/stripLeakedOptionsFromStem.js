import { latexExtractionIncomplete } from './healTruncatedLatex.js'
import { findOptionsBlockStart } from './mcqOptionMarkers.js'
import { peelFiguresFromBand } from './peelGluedMcqOptions.js'

/**
 * Remove option tails accidentally appended to the question stem.
 *
 * OCR/parsing sometimes glues the END of each option onto the stem WITHOUT
 * (A)–(D) markers, e.g. a stem ending with
 *   "… reaches a steady state n A than in B. the same rate in A and B . is \frac{1}{4}\mathrm{CE}^{2} . is \frac{1}{8}\mathrm{CE}^{2}"
 * where the trailing phrases are the suffixes of options A/B/C/D.
 *
 * Strategy: search the stem for distinctive suffixes / math expressions of the
 * stored options and cut the stem at the earliest leaked fragment.
 */

const CONNECTOR_TAIL =
  /\s+(?:in|n|is|the|a|an|of|to|at|and|than|by|on|or|for|with|that|then)$/i

/** @param {string} s */
function norm(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

/** Distinctive fragments of an option to look for inside the stem. */
function optionFragments(option) {
  const o = norm(option)
  if (!o) return []
  const frags = []

  // Full option fracs only. Bare \sqrt{11} also lives in the stem (cot x = -5/\sqrt{11}).
  const maths =
    o.match(
      /\\frac\{[^{}]*\}\{[^{}]*\}(?:\\(?:mathrm|text|mathbf)\{[^{}]*\})?(?:\s*\^\s*\{?\s*\d+\s*\}?)?/g,
    ) ?? []
  for (const m of maths) {
    const t = m.trim()
    if (t.length >= 12) frags.push(t)
  }

  // Word-based suffixes (longest first so we cut as early/cleanly as possible).
  const words = o.replace(/\$/g, '').split(' ').filter(Boolean)
  for (const n of [9, 7, 6, 5, 4]) {
    if (words.length >= n) {
      const suffix = words.slice(-n).join(' ').trim()
      const significant = suffix.replace(/[^a-z0-9]/gi, '')
      if (suffix.length >= 12 && significant.length >= 8) frags.push(suffix)
    }
  }
  return frags
}

/**
 * @param {string} stem
 * @param {string[]} [options]
 * @returns {string}
 */
/** Single A–D option line — never strip sibling-option tails from it. */
function looksLikeMcqOptionLine(text) {
  const t = norm(text)
  if (/^\(\s*[A-D]\s*\)\s*/i.test(t)) return true
  if (/^\$\s*[^$]+\$\s*$/.test(t) && t.length <= 220) return true
  return false
}

export function stripLeakedOptionsFromStem(stem, options = []) {
  const original = String(stem ?? '')
  let s = norm(original)
  if (!s) return original
  if (looksLikeMcqOptionLine(s)) return s

  const opts = (options ?? []).map(norm).filter(Boolean)
  const multiline = String(stem ?? '').replace(/\r\n/g, '\n')

  // Full (A)–(D) block duplicated onto the stem while options are already stored.
  if (opts.length >= 2) {
    const start = findOptionsBlockStart(multiline)
    if (start > 24) {
      const after = multiline.slice(start)
      if (
        /\(\s*A\s*\)/i.test(after) &&
        /\(\s*B\s*\)/i.test(after) &&
        /\(\s*[CD]\s*\)/i.test(after)
      ) {
        // Peel only the first A–D band — keep a glued following question for the splitter.
        let band = after
        const dAt = after.search(/\(\s*D\s*\)/i)
        if (dAt >= 0) {
          const afterD = after.slice(dAt + 3)
          const secondAt = afterD.search(
            /\n(?=(?:Let|If(?!\s+and\s+only)|Which|Consider|Suppose|For the|Match\s+|How many|What is|The value|An integer)\b)/i,
          )
          if (secondAt >= 1) {
            band = after.slice(0, dAt + 3 + secondAt)
          }
        }
        const peeled = peelFiguresFromBand(band)
        const leftover = band.length < after.length ? after.slice(band.length).trim() : ''
        const before = multiline.slice(0, start).trim()
        const next = `${before}${peeled.figures ? `\n${peeled.figures}` : ''}${leftover ? `\n${leftover}` : ''}`.trim()
        if (next.length >= 24 && !latexExtractionIncomplete(next)) return next
      }
    }

    // Leftover (C) &$ or smashed (C) & $\\$ mapping fragments
    const mapOptHits = opts.filter((o) =>
      /P\s*\)?\s*(?:→|\\rightarrow|->)|\\mathrm\s*\{\s*~?\s*S\s*\}/i.test(o),
    ).length
    if (mapOptHits >= 2) {
      let cutMap = -1
      const tabRe = /\\begin\{tabular\}[\s\S]{0,200}\(\s*[A-D]\s*\)\s*&/gi
      for (const m of multiline.matchAll(tabRe)) {
        if (m.index != null && m.index > 40) {
          cutMap = m.index
          break
        }
      }
      if (cutMap < 0) {
        const rowRe = /\(\s*[A-D]\s*\)\s*&\s*/gi
        for (const m of multiline.matchAll(rowRe)) {
          if (m.index != null && m.index > 40) {
            cutMap = m.index
            break
          }
        }
      }
      if (cutMap < 0) {
        const smashed = multiline.search(/\n\s*List-I\s*\n\s*\[t\]\s*\{/i)
        if (smashed > 40) cutMap = smashed
      }
      if (cutMap < 0) {
        const keyRe =
          /\(\s*[A-D]\s*\)\s*List-II\s*\(\s*P\s*\)\s*(?:→|\\rightarrow|->)/gi
        for (const m of multiline.matchAll(keyRe)) {
          if (m.index != null && m.index > 40) {
            cutMap = m.index
            break
          }
        }
      }
      if (cutMap > 40) {
        const after = multiline.slice(cutMap)
        if (
          /\(\s*[A-D]\s*\)\s*&/i.test(after) ||
          /\(\s*[A-D]\s*\)\s*List-II/i.test(after) ||
          /\[t\]\s*\{/i.test(after) ||
          /P\s*(?:→|\\rightarrow|->|\$\$\\rightarrow)/i.test(after)
        ) {
          const peeled = peelFiguresFromBand(after)
          const before = multiline.slice(0, cutMap).trim()
          const next = `${before}${peeled.figures ? `\n${peeled.figures}` : ''}`.trim()
          // Mapping rows are already in options[]. Cut them even when the stem math is incomplete.
          if (next.length >= 24) return next
        }
      }
    }
  }

  if (opts.length < 2) return original

  const minPos = Math.max(30, Math.floor(s.length * 0.25))
  const sLower = s.toLowerCase()
  let cut = -1

  for (const opt of opts) {
    for (const frag of optionFragments(opt)) {
      const pos = sLower.indexOf(frag.toLowerCase())
      if (pos >= minPos && (cut === -1 || pos < cut)) cut = pos
    }
  }

  if (cut <= minPos) return original

  let next = s.slice(0, cut).trim()
  next = next.replace(/[\s.,\-–—:;]+$/g, '').trim()
  next = next.replace(CONNECTOR_TAIL, '')
  next = next.replace(/[\s.,\-–—:;]+$/g, '').trim()
  const begins = (next.match(/\\begin\{aligned\}/g) || []).length
  const ends = (next.match(/\\end\{aligned\}/g) || []).length
  if (begins > ends || latexExtractionIncomplete(next)) return original
  return next
}
