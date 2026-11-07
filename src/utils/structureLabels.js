const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const SMILES_RE = /<smiles>[\s\S]*?<\/smiles>/gi
const ROMAN_TOKEN = /(?<![A-Za-z\\])(VIII|VII|VI|IV|V|III|II|I)(?![A-Za-z])/g
const LABEL_LINE = /^\s*\(?\s*(VIII|VII|VI|IV|V|III|II|I)\s*\)?\s*$/

function romanLabelsInOptions(options) {
  const used = new Set()
  for (const opt of Array.isArray(options) ? options : []) {
    const flat = String(opt ?? '')
      .replace(SMILES_RE, ' ')
      .replace(/\\(?:mathrm|text)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\$/g, ' ')
    for (const m of flat.matchAll(ROMAN_TOKEN)) used.add(m[1])
  }
  return used
}

/** Labels the stem prints on their own line or in brackets, keyed to the structure they follow. */
function stemLabels(text) {
  const pieces = String(text ?? '').split(SMILES_RE)
  /** @type {Map<string, number>} */
  const found = new Map()
  pieces.forEach((piece, after) => {
    for (const line of piece.split('\n')) {
      const m = line.match(LABEL_LINE)
      if (m && !found.has(m[1])) found.set(m[1], after)
    }
    for (const m of piece.matchAll(/\(\s*(VIII|VII|VI|IV|V|III|II|I)\s*\)/g)) {
      if (!found.has(m[1])) found.set(m[1], after)
    }
  })
  return found
}

/**
 * The options compare structures I, II, III… but the scan kept only some labels under the drawings.
 * Returns the missing labels (empty when the card is fine or the labels mean something else).
 * @param {{ text?: string, options?: string[] }} q
 * @returns {string[]}
 */
export function missingStructureLabels(q) {
  const text = String(q?.text ?? '')
  const count = (text.match(SMILES_RE) || []).length
  if (count < 2 || count > ROMAN.length) return []
  const used = romanLabelsInOptions(q?.options)
  const want = ROMAN.slice(0, count)
  if (used.size !== count || !want.every((label) => used.has(label))) return []
  const have = stemLabels(text)
  return want.filter((label) => !have.has(label))
}

/**
 * Put the lost labels back under the structures in reading order. Only when every label the scan
 * did keep already sits right after its own structure, so the order is confirmed by the scan.
 * @template {{ text?: string, options?: string[] }} T
 * @param {T} q
 * @returns {T}
 */
export function restoreStructureLabels(q) {
  const missing = missingStructureLabels(q)
  if (!missing.length) return q
  const text = String(q?.text ?? '')
  const have = stemLabels(text)
  for (const [label, after] of have) {
    if (ROMAN.indexOf(label) + 1 !== after) return q
  }
  const codes = text.match(SMILES_RE) || []
  const pieces = text.split(SMILES_RE)
  const dropLabels = (piece) =>
    piece
      .split('\n')
      .filter((line) => !LABEL_LINE.test(line))
      .join('\n')
  let out = pieces[0].replace(/\s+$/, '')
  codes.forEach((code, i) => {
    out += `${out ? '\n' : ''}${code}\n${ROMAN[i]}\n`
    const between = dropLabels(pieces[i + 1] ?? '').trim()
    if (between) out += `${between}\n`
  })
  return { ...q, text: out.trim() }
}
