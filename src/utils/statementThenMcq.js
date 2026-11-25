/**
 * FIITJEE / JEE Main: statements (I)/(II) in the stem, then choices
 * "(1) Both (I) and (II) are correct" … "(4) Only (II) is correct".
 * Splitters often peel (I)/(II) as the MCQ options and drop the real (1)–(4).
 */

const THEN_CHOICE_RE =
  /(?:^|\n)\s*(?:\(?\s*([1-4])\s*\)|[1-4]\s*[.)])\s*((?:Both|Only)\s*\(\s*[IVX]+\s*\)[^\n]*)/gi

/**
 * @param {unknown} option
 */
export function optionLooksLikeStatementThenChoice(option) {
  const s = String(option ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return false
  return /^(?:Both|Only)\s*\(\s*[IVX]+\s*\)/i.test(s)
}

/**
 * @param {unknown} options
 */
export function optionsLookLikeStatementThenChoices(options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (opts.length < 2) return false
  const hits = opts.filter(optionLooksLikeStatementThenChoice).length
  return hits >= 2 && hits >= Math.ceil(opts.length * 0.5)
}

/**
 * @param {string} raw
 * @returns {{ stem: string, options: string[] } | null}
 */
export function peelStatementThenMcqBlock(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  if (!text.trim()) return null
  if (!/\(\s*I\s*\)/.test(text) || !/\(\s*II\s*\)/.test(text)) return null
  const thenAt = text.search(/(?:^|\n)\s*Then\s*(?:\n|$)/i)
  if (thenAt < 20) return null
  const afterThen = text.slice(thenAt)
  const hits = [...afterThen.matchAll(THEN_CHOICE_RE)]
  if (hits.length < 2) return null
  const byNum = { 1: '', 2: '', 3: '', 4: '' }
  for (const m of hits) {
    const n = String(m[1] || '')
    const body = String(m[2] || '').trim()
    if (!n || !optionLooksLikeStatementThenChoice(body)) continue
    byNum[n] = body
  }
  const options = [byNum[1], byNum[2], byNum[3], byNum[4]]
  if (options.filter(Boolean).length < 3) return null
  const stem = text.slice(0, thenAt).trim() + '\nThen'
  return { stem: stem.trim(), options }
}

/**
 * Repair a card whose options are the (I)/(II) statements instead of Both/Only choices.
 * @template {Record<string, any>} T
 * @param {T} q
 * @param {unknown} source
 * @returns {T}
 */
export function repairStatementThenMcqCard(q, source) {
  if (!q || typeof q !== 'object') return q
  const type = String(q.questionType ?? q.type ?? '').toLowerCase()
  const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '').trim()) : []
  // Number-answer cards must never pick up Both/Only (I)/(II) choices from another stem in OCR.
  if (/^(?:numerical|integer|passage_integer)$/.test(type)) {
    if (!opts.length) return q
    if (optionsLookLikeStatementThenChoices(opts) || opts.every((o) => !o)) {
      return { ...q, options: [] }
    }
    return { ...q, options: [] }
  }
  if (opts.length >= 4 && optionsLookLikeStatementThenChoices(opts)) return q
  const looksLikeStatementsAsOptions =
    opts.length >= 2 &&
    opts.filter((o) => /^\(?\s*[IVX]+\s*\)?\s+/i.test(o) || /intersects the x/i.test(o)).length >= 2 &&
    !optionsLookLikeStatementThenChoices(opts)
  if (!looksLikeStatementsAsOptions && opts.length >= 4) return q
  // Never peel choices out of the whole paper OCR blob — that steals another question's Both/Only set.
  const blob = [q.text, opts.join('\n')].join('\n')
  const peeled = peelStatementThenMcqBlock(blob)
  if (!peeled) return q
  return {
    ...q,
    text: peeled.stem,
    options: peeled.options.map((o, i) => o || opts[i] || ''),
  }
}
