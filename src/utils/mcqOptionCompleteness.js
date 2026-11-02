/**
 * Detect truncated / incomplete later MCQ options (C/D short-changed vs A/B).
 * Shared by upload quality gate, merge, and heal — keep free of heavy imports.
 */

/**
 * Pad/truncate to exactly 4 A–D slots.
 * @param {string[] | null | undefined} options
 * @returns {string[]}
 */
export function stabilizeMcqOptionSlotsLite(options = []) {
  const next = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  while (next.length < 4) next.push('')
  return next
}

/**
 * Short but complete answers (e.g. "neither", "0", "∞") — not truncated scraps.
 * @param {string} t
 */
function looksLikeCompleteShortOption(t) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  if (!s || s.length > 28) return false
  if (/[…]|\.\.\.$|\\lim\s*$|\\frac\s*\{?\s*$/i.test(s)) return false
  if (
    /^(?:neither|none|both|zero|infinity|undefined|equal|unequal|true|false|yes|no)$/i.test(s)
  ) {
    return true
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return true
  if (/^\$[^$]{1,20}\$$/.test(s)) return true
  if (/^(?:none|all)\s+of\s+(?:these|the\s+above)$/i.test(s)) return true
  if (/\bdoes\s+not\s+exist\b/i.test(s)) return true
  // Short complete English phrase (no mid-cut math)
  if (/^[A-Za-z][A-Za-z\s,'-]{2,26}$/.test(s) && !/\b(?:lim|frac)\b/i.test(s)) return true
  return false
}

/**
 * True when option C or D looks truncated vs A/B (or lim line missing "does not exist").
 * Used to reject/retry incomplete auto-split / Gemini extract / polish.
 * @param {string[] | null | undefined} options
 * @param {string} [rawBlob] OCR / stem+options blob for existence-phrase checks
 */
export function mcqLaterOptionsLookTruncated(options = [], rawBlob = '') {
  const opts = stabilizeMcqOptionSlotsLite(options)
  const lens = opts.map((o) => o.replace(/\s+/g, ' ').trim().length)
  const texts = opts.map((o) => o.replace(/\s+/g, ' ').trim())
  const blob = String(rawBlob ?? '')
  const abAvg = (lens[0] + lens[1]) / 2

  // Empty C/D while A/B are real text answers.
  if (abAvg >= 10 && (lens[2] < 4 || lens[3] < 4)) {
    const graphStub = (t) =>
      !t ||
      /^Option\s+[A-D]$/i.test(t) ||
      /^\[?\s*Graph\s*[A-D]/i.test(t) ||
      /\(Graph\/diagram/i.test(t)
    if (!graphStub(texts[0]) && !graphStub(texts[1])) {
      const cOk = lens[2] >= 4 || looksLikeCompleteShortOption(texts[2])
      const dOk = lens[3] >= 4 || looksLikeCompleteShortOption(texts[3])
      if (!cOk || !dOk) return true
    }
  }

  // C or D much shorter than A/B (label scrap / half line) — but not complete short answers.
  if (abAvg >= 18) {
    if (lens[2] > 0 && lens[2] < abAvg * 0.4 && !looksLikeCompleteShortOption(texts[2])) {
      return true
    }
    if (lens[3] > 0 && lens[3] < abAvg * 0.4 && !looksLikeCompleteShortOption(texts[3])) {
      return true
    }
  }

  // Limit / existence MCQ: lim option without "does not exist" while OCR had it.
  const blobHasExist =
    /\bdoes\s+not\s+exist\b/i.test(blob) || texts.some((t) => /\bdoes\s+not\s+exist\b/i.test(t))
  if (blobHasExist) {
    for (const t of [texts[2], texts[3]]) {
      if (/\\lim|\blim\b/i.test(t) && !/\bdoes\s+not\s+exist\b/i.test(t)) return true
    }
  }

  return false
}
