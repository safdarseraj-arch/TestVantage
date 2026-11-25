/**
 * JEE Main "statements (A)–(D) + Choose the most appropriate + (1)–(4) combinations"
 * (e.g. proton / E and B fields). Combination options must not strip the statement
 * block from the stem, and the stem must keep (A)–(D) for students.
 */

/** @param {unknown} option */
export function optionLooksLikeAssertionCombination(option) {
  const s = String(option ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return false
  // "(A), (B) and (C) only" / "(B), (C) and (D) only"
  if (/^\(\s*[A-D]\s*\)\s*,\s*\(\s*[A-D]\s*\)/i.test(s) && /\bonly\b/i.test(s)) return true
  if (
    /^\(\s*[A-D]\s*\)\s*,\s*\(\s*[A-D]\s*\)\s*(?:and|&)\s*\(\s*[A-D]\s*\)/i.test(s)
  ) {
    return true
  }
  // "(B) and (C) only" / "(A) and (B) only" / "(B) only" (FIITJEE S_N1 halide MCQ)
  if (/^\(\s*[A-D]\s*\)\s+(?:and|or)\s+\(\s*[A-D]\s*\)/i.test(s) && /\bonly\b/i.test(s)) return true
  if (/^\(\s*[A-D]\s*\)\s+only\b/i.test(s)) return true
  return false
}

/** @param {unknown} options */
export function optionsLookLikeAssertionCombinations(options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (opts.length < 2) return false
  const hits = opts.filter(optionLooksLikeAssertionCombination).length
  return hits >= 2 && hits >= Math.ceil(opts.length * 0.5)
}

/** Stem already holds field / statement lines (A)–(D), not only a combination list. */
export function stemHasAssertionStatements(stem) {
  const t = String(stem ?? '')
  // Statement lines: "(A) $…$" or "(A) E = 0" — not "(A), (B) and (C) only"
  const a = /(?:^|\n)\s*\(\s*A\s*\)\s+(?!,)/i.test(t)
  const b = /(?:^|\n)\s*\(\s*B\s*\)\s+(?!,)/i.test(t)
  const c = /(?:^|\n)\s*\(\s*[CD]\s*\)\s+(?!,)/i.test(t)
  return a && b && c
}

/**
 * Peel "(1) (A), (B) and (C) only" … "(4) …" as the four choices; keep statements in the stem.
 * @param {string} raw
 * @returns {{ stem: string, options: string[] } | null}
 */
export function peelAssertionCombinationBlock(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  if (!text.trim()) return null
  const chooseAt = text.search(
    /Choose\s+the\s+most\s+appropriate\s+answer\s+from\s+the\s+options\s+given\s+below\s*:?/i,
  )
  if (chooseAt < 20) return null
  const beforeChoose = text.slice(0, chooseAt)
  if (!stemHasAssertionStatements(beforeChoose)) return null
  const after = text.slice(chooseAt)
  const chooseLine = (after.match(/^[^\n]+/) || [''])[0]
  const rest = after.slice(chooseLine.length)
  const hits = [...rest.matchAll(/(?:^|\n)[ \t]*\(\s*([1-4])\s*\)[ \t]*([^\n]+)/g)]
  if (hits.length < 2) return null
  const byNum = { 1: '', 2: '', 3: '', 4: '' }
  for (const m of hits) {
    const n = m[1]
    const body = String(m[2] ?? '').trim()
    if (!optionLooksLikeAssertionCombination(body) && !/\(\s*[A-D]\s*\)/i.test(body)) continue
    byNum[n] = body
  }
  const options = [byNum[1], byNum[2], byNum[3], byNum[4]]
  if (options.filter(Boolean).length < 2) return null
  const stem = `${beforeChoose.trim()}\n${chooseLine.trim()}`.trim()
  return { stem: fixDuplicateEdFieldStatement(stem), options }
}

/**
 * OCR sometimes copies (B) onto (D) for E/B field questions. Classic key is
 * (D) E ≠ 0, B ≠ 0 when (B) is E = 0, B ≠ 0 and (C) is E ≠ 0, B = 0.
 * @param {string} stem
 */
export function fixDuplicateEdFieldStatement(stem) {
  const t = String(stem ?? '')
  const b = t.match(/(?:^|\n)[ \t]*\(\s*B\s*\)[ \t]*([^\n]+)/i)
  const c = t.match(/(?:^|\n)[ \t]*\(\s*C\s*\)[ \t]*([^\n]+)/i)
  const d = t.match(/(?:^|\n)[ \t]*\(\s*D\s*\)[ \t]*([^\n]+)/i)
  if (!b || !c || !d) return t
  const nb = normField(b[1])
  const nc = normField(c[1])
  const nd = normField(d[1])
  if (!nb || !nc || !nd) return t
  // (B) and (D) identical, (C) has E≠0 / B=0 → rewrite (D) as E≠0, B≠0
  if (nb !== nd) return t
  if (!/e\s*(?:\\neq|≠|!=)\s*0/i.test(nc) || !/b\s*=\s*0/i.test(nc)) return t
  if (!/e\s*=\s*0/i.test(nb) || !/b\s*(?:\\neq|≠|!=)\s*0/i.test(nb)) return t
  return t.replace(
    /((?:^|\n)[ \t]*\(\s*D\s*\)[ \t]*)([^\n]+)/i,
    '$1$\\mathrm{E} \\neq 0, \\mathrm{B} \\neq 0$',
  )
}

/** @param {string} line */
function normField(line) {
  return String(line ?? '')
    .replace(/\$/g, '')
    .replace(/\\mathrm\s*\{\s*([^}]*)\s*\}/gi, '$1')
    .replace(/\\neq|≠|!=/gi, '≠')
    .replace(/[^A-Za-z0-9≠=]/g, '')
    .toLowerCase()
}

/** Classic JEE Main Assertion (A) / Reason (R) choice bodies. */
export function optionLooksLikeAssertionReason(option) {
  const s = String(option ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return false
  if (/both\s*\(\s*A\s*\)\s*and\s*\(\s*R\s*\)/i.test(s)) return true
  if (/^\(\s*A\s*\)\s+is\s+(?:true|false)\b/i.test(s) && /\(\s*R\s*\)/i.test(s)) return true
  if (/\(\s*R\s*\)\s+is\s+(?:true|false|the\s+correct\s+explanation)/i.test(s)) return true
  return false
}

/** @param {unknown} options */
export function optionsLookLikeAssertionReason(options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (opts.length < 2) return false
  const hits = opts.filter(optionLooksLikeAssertionReason).length
  return hits >= 2
}

/** Stem already holds Assertion (A) and Reason (R) bodies. */
export function stemHasAssertionReasonBodies(stem) {
  const t = String(stem ?? '')
  return (
    /Assertion\s*\(\s*A\s*\)\s*:/i.test(t) &&
    /Reason\s*\(\s*R\s*\)\s*:/i.test(t) &&
    t.replace(/\s+/g, ' ').trim().length >= 80
  )
}

/**
 * Copy Assertion (A) / Reason (R) wording from OCR when the stored stem cut off after
 * "labelled as Assertion" (JEE Main Q76-style).
 * @param {any} q
 * @param {string} source
 */
export function restoreAssertionReasonFromSource(q, source) {
  if (!q || typeof q !== 'object') return q
  const opts = Array.isArray(q.options) ? q.options : []
  const text = String(q.text ?? q.stem ?? '')
  const wants =
    optionsLookLikeAssertionReason(opts) ||
    /labelled as Assertion|Assertion\s*\(\s*A\s*\)|Reason\s*\(\s*R\s*\)/i.test(text)
  if (!wants) return q
  if (stemHasAssertionReasonBodies(text)) return q
  const src = String(source ?? '')
  if (src.length < 40) return q
  const probe =
    text.replace(/\$[^$]*\$/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) ||
    'labelled as Assertion (A) and the other is labelled as Reason (R)'
  let at = src.indexOf(probe.slice(0, Math.min(36, probe.length)))
  if (at < 0) at = src.search(/labelled as Assertion\s*\(\s*A\s*\)/i)
  if (at < 0) at = src.search(/Assertion\s*\(\s*A\s*\)\s*:/i)
  if (at < 0) return q
  const window = src.slice(Math.max(0, at - 80), at + 1400)
  const block = window.match(
    /Given below are two statements[\s\S]{20,900}?(?=\n\s*(?:\\begin\{itemize\}|\\item\s*\[|Ans\.|Answer\s*:|Sol\.|\*\d{1,3}\.))/i,
  )
  let stem = block?.[0]?.trim() || ''
  if (!stemHasAssertionReasonBodies(stem)) {
    const bodies = window.match(
      /Assertion\s*\(\s*A\s*\)\s*:[\s\S]{8,400}?Reason\s*\(\s*R\s*\)\s*:[\s\S]{8,400}?(?=\n\s*(?:In the light|Choose the|\\begin\{itemize\}|\\item\s*\[|Ans\.))/i,
    )
    if (!bodies?.[0]) return q
    const opener =
      text.match(/Given below are two statements[^\n]*/i)?.[0] ||
      'Given below are two statements : one is labelled as Assertion (A) and the other is labelled as Reason (R).'
    const choose =
      window.match(/In the light of the above statements[^\n]*/i)?.[0] ||
      'In the light of the above statements, choose the most appropriate answer from the options given below:'
    stem = `${opener.trim()}\n${bodies[0].trim()}\n${choose.trim()}`.trim()
  }
  if (!stemHasAssertionReasonBodies(stem)) return q
  const nextOpts = restoreAssertionReasonOptionsFromWindow(opts, window)
  return { ...q, text: stem, options: nextOpts }
}

/** Repair options that lost a leading (A)/(C) after slot-label strip. */
function restoreAssertionReasonOptionsFromWindow(opts, window) {
  const hits = [...String(window ?? '').matchAll(/(?:^|\n)\s*(?:\\item\s*\[\s*)?\(?\s*([1-4])\s*\)?\s*\]?\s*([^\n]+)/g)]
  const byNum = { 1: '', 2: '', 3: '', 4: '' }
  for (const m of hits) {
    const body = String(m[2] ?? '').trim()
    if (!optionLooksLikeAssertionReason(body)) continue
    byNum[m[1]] = body.replace(/^\(\s*[1-4]\s*\)\s*/, '').trim()
  }
  const fromOcr = [byNum[1], byNum[2], byNum[3], byNum[4]]
  if (fromOcr.filter(Boolean).length < 2) return opts
  return fromOcr.map((o, i) => String(o || opts[i] || '').trim())
}

/**
 * When combination options are stored but the stem lost (A)–(D), copy them from OCR.
 * @param {any} q
 * @param {string} source
 */
export function restoreAssertionStatementsFromSource(q, source) {
  if (!q || typeof q !== 'object') return q
  const withReason = restoreAssertionReasonFromSource(q, source)
  const opts = Array.isArray(withReason.options) ? withReason.options : []
  if (!optionsLookLikeAssertionCombinations(opts)) return withReason
  const text = String(withReason.text ?? withReason.stem ?? '')
  if (stemHasAssertionStatements(text)) {
    const fixed = fixDuplicateEdFieldStatement(text)
    return fixed === text ? withReason : { ...withReason, text: fixed }
  }
  const src = String(source ?? '')
  if (src.length < 40) return withReason
  const fingerprint = text
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  if (fingerprint.length < 20) return withReason
  const at = src.search(new RegExp(fingerprint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  const window =
    at >= 0
      ? src.slice(Math.max(0, at - 20), at + 1200)
      : src
  const peeled = peelAssertionCombinationBlock(window)
  if (!peeled?.stem || !stemHasAssertionStatements(peeled.stem)) return withReason
  const nextOpts =
    peeled.options.filter(Boolean).length >= 2
      ? peeled.options.map((o, i) => String(o || opts[i] || '').trim())
      : opts
  return {
    ...withReason,
    text: peeled.stem,
    options: nextOpts,
  }
}
