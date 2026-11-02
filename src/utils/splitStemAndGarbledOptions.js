/**
 * Generic Convert heal: OCR dumped A-D into the stem as circled marks / Ww soup.
 * Unknown questions still get four option slots instead of one garbled preview.
 */

const STEM_TAIL_RE =
  /\b(?:then\s*:|must be same as\s*:|is equal to\s*:|equals\s*:)\s*/i

/** Display math after Then — keep it in the stem; do not treat as option soup. */
function looksLikeStemMathContinuation(after) {
  const t = String(after ?? '').trim()
  if (!t) return false
  if (/^(?:Ww|[\u00AE\u00A9\u2117])/.test(t)) return false
  if (/^\(\s*[A-D]\s*\)/i.test(t) && /\(\s*B\s*\)/i.test(t)) return false
  return /\\(?:sin|cos|tan|cot|left|frac|sqrt)|\$\$/.test(t)
}

/** Unlabeled OCR marks used as sequential A-D separators (not mark followed by paren). */
const UNLABELED_MARK_RE = /(?:^|\s)(?:Ww\b|[\u00AE\u00A9\u2117])(?!\s*\))/g

/**
 * True when option letters were destroyed and the A-D band leaked into the stem.
 * @param {string} text
 */
export function looksLikeLeakedOptionBand(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  const labeled = (t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
  if (labeled >= 2) return false
  const unlabeled = (t.match(UNLABELED_MARK_RE) ?? []).length
  if (unlabeled < 2) return false
  if (STEM_TAIL_RE.test(t)) return true
  if (
    unlabeled >= 3 &&
    /(?:\\int|\bdx\b|g\s*\(\s*x\s*\)|passing through|curve\s+g)/i.test(t)
  ) {
    return true
  }
  return false
}

/**
 * Map sequential Ww / circled marks onto (A)-(D) so the normal MCQ parser can split.
 * @param {string} text
 */
export function relabelSequentialOcrOptionMarks(text) {
  const raw = String(text ?? '')
  if (!looksLikeLeakedOptionBand(raw)) return raw
  const letters = ['A', 'B', 'C', 'D']
  let i = 0
  return raw.replace(UNLABELED_MARK_RE, () => {
    if (i >= 4) return ' '
    const letter = letters[i]
    i += 1
    return '\n(' + letter + ') '
  })
}

/**
 * @param {string} band
 * @returns {string[]}
 */
function splitOptionBand(band) {
  const s = String(band ?? '').trim()
  const out = ['', '', '', '']
  if (!s) return out

  const labeled = s
    .replace(/[\u24B6\u24D0]/g, '\n\u00A7A\u00A7')
    .replace(/[\u24B7\u24D1]/g, '\n\u00A7B\u00A7')
    .replace(/[\u24B8\u24D2]/g, '\n\u00A7C\u00A7')
    .replace(/[\u24B9\u24D3]/g, '\n\u00A7D\u00A7')
    .replace(/\(\s*([A-D])\s*\)/gi, '\n\u00A7$1\u00A7')

  if (/\u00A7[A-D]\u00A7/.test(labeled)) {
    const re = /\u00A7([A-D])\u00A7\s*([^\u00A7]*)/gi
    let m
    while ((m = re.exec(labeled)) !== null) {
      const idx = m[1].toUpperCase().charCodeAt(0) - 65
      if (idx >= 0 && idx < 4) out[idx] = String(m[2] ?? '').trim()
    }
    return out
  }

  const parts = s
    .split(/(?:^|\s)(?:Ww\b|[\u00AE\u00A9\u2117])\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (let i = 0; i < Math.min(4, parts.length); i += 1) out[i] = parts[i]
  return out
}

/**
 * Cut stem at then: / must be same as: and fill up to four A-D slots from OCR junk.
 * @param {string} text
 * @returns {{ stem: string, options: string[] } | null}
 */
export function splitStemAndGarbledOptions(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw || !looksLikeLeakedOptionBand(raw)) return null

  const relabeled = relabelSequentialOcrOptionMarks(raw)
  const cut = relabeled.search(STEM_TAIL_RE)
  let stem = relabeled
  let band = ''
  if (cut >= 0) {
    const m = relabeled.slice(cut).match(STEM_TAIL_RE)
    const idx = cut + (m?.[0].length ?? 0)
    const after = relabeled.slice(idx).trim()
    if (looksLikeStemMathContinuation(after)) {
      const firstMark = relabeled.search(/\(\s*A\s*\)|(?:^|\s)(?:Ww\b|[\u00AE\u00A9\u2117])/i)
      if (firstMark > idx) {
        stem = relabeled.slice(0, firstMark).trim()
        band = relabeled.slice(firstMark).trim()
      } else {
        stem = relabeled
        band = ''
      }
    } else {
      stem = relabeled.slice(0, idx).trim()
      band = relabeled.slice(idx).trim()
    }
  } else {
    const firstMark = relabeled.search(/\(\s*A\s*\)|(?:^|\s)(?:Ww\b|[\u00AE\u00A9\u2117])/i)
    if (firstMark > 24) {
      stem = relabeled.slice(0, firstMark).trim()
      band = relabeled.slice(firstMark).trim()
    }
  }
  if (!band || band.length < 2) return null

  const options = splitOptionBand(band)
  if (options.filter(Boolean).length < 2) return null
  return { stem, options }
}

/**
 * Drop the leaked A-D soup from a stem; keep the prompt ending (then:).
 * @param {string} text
 */
export function stripLeakedOptionBandFromStem(text) {
  const split = splitStemAndGarbledOptions(text)
  return split?.stem ?? String(text ?? '')
}

/**
 * Fill empty / Option A-D slots from a leaked stem (or raw OCR sidecar).
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean, multi?: boolean, _ocrSource?: string }} parsed
 */
export function repairGarbledStemOptionsParse(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.multi) return parsed
  const stem = String(parsed.text ?? '')
  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  const placeholderN = opts.filter((o) => /^Option\s+[A-D]$/i.test(String(o ?? '').trim())).length
  const filled = opts.filter((o) => {
    const t = String(o ?? '').trim()
    return t && !/^Option\s+[A-D]$/i.test(t)
  }).length
  const need =
    filled < 2 || placeholderN >= 2 || looksLikeLeakedOptionBand(stem)
  if (!need) return parsed

  const blob = stem + '\n' + opts.join('\n') + '\n' + String(parsed._ocrSource ?? '')
  const split =
    splitStemAndGarbledOptions(stem) ||
    splitStemAndGarbledOptions(blob) ||
    splitStemAndGarbledOptions(String(parsed._ocrSource ?? ''))
  if (!split) return parsed

  if (looksLikeLeakedOptionBand(stem) || !stem.trim()) {
    parsed.text = split.stem
  }
  for (let i = 0; i < 4; i += 1) {
    const cur = String(opts[i] ?? '').trim()
    if (!cur || /^Option\s+[A-D]$/i.test(cur)) {
      if (split.options[i]) opts[i] = split.options[i]
    }
  }
  parsed.options = opts
  parsed.optionsFound = opts.filter((o) => {
    const t = String(o ?? '').trim()
    return t && !/^Option\s+[A-D]$/i.test(t)
  }).length
  if (parsed.optionsFound >= 4) parsed.complete = true
  return parsed
}