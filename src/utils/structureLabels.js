const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const LETTERS = ['P', 'Q', 'R', 'S', 'T', 'U']
const SMILES_RE = /<smiles>[\s\S]*?<\/smiles>/gi
const ROMAN_TOKEN = /(?<![A-Za-z\\])(VIII|VII|VI|IV|V|III|II|I)(?![A-Za-z])/g
const LABEL_LINE = /^\s*\(?\s*(VIII|VII|VI|IV|V|III|II|I)\s*\)?\s*$/
/** "$\boldsymbol{P}$" or "$P$" alone on its line under a drawing (2013 P2 Q26, Q27). */
const LETTER_LABEL = String.raw`\$\s*(?:\\(?:boldsymbol|mathbf|textbf|mathrm)\s*\{\s*)?([P-U])\s*\}?\s*\$`
const LETTER_LINE = new RegExp(String.raw`^\s*${LETTER_LABEL}\s*$`)
const LETTER_OPTION = new RegExp(String.raw`^\s*${LETTER_LABEL}`)

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

/** Options that each open on a drawing's letter: "$\boldsymbol{Q}$ (minor)". */
function letterLabelsInOptions(options) {
  const used = new Set()
  for (const opt of Array.isArray(options) ? options : []) {
    const m = String(opt ?? '').match(LETTER_OPTION)
    if (!m) return new Set()
    used.add(m[1])
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

/** @param {string} text */
function stemLetterLabels(text) {
  /** @type {Map<string, number>} */
  const found = new Map()
  String(text ?? '')
    .split(SMILES_RE)
    .forEach((piece, after) => {
      for (const line of piece.split('\n')) {
        const m = line.match(LETTER_LINE)
        if (m && !found.has(m[1])) found.set(m[1], after)
      }
    })
  return found
}

/**
 * Which label set the options use for the drawings, with the labels the stem kept.
 * @param {{ text?: string, options?: string[] }} q
 */
function labelScheme(q) {
  const text = String(q?.text ?? '')
  const count = (text.match(SMILES_RE) || []).length
  if (count < 2) return null
  const roman = romanLabelsInOptions(q?.options)
  const romanWant = ROMAN.slice(0, count)
  if (count <= ROMAN.length && roman.size === count && romanWant.every((label) => roman.has(label))) {
    return { labels: ROMAN, want: romanWant, have: stemLabels(text), letter: false }
  }
  const letters = letterLabelsInOptions(q?.options)
  const letterWant = LETTERS.slice(0, count)
  if (count <= LETTERS.length && letters.size === count && letterWant.every((label) => letters.has(label))) {
    const have = stemLetterLabels(text)
    // No label under any drawing: the labels are inside the pictures, not lost.
    if (!have.size) return null
    return { labels: LETTERS, want: letterWant, have, letter: true }
  }
  return null
}

/**
 * The options compare structures I, II, III… (or P, Q, R…) but the scan kept only some labels under the drawings.
 * Returns the missing labels (empty when the card is fine or the labels mean something else).
 * @param {{ text?: string, options?: string[] }} q
 * @returns {string[]}
 */
export function missingStructureLabels(q) {
  const scheme = labelScheme(q)
  if (!scheme) return []
  return scheme.want.filter((label) => !scheme.have.has(label))
}

/**
 * Put the lost labels back under the structures in reading order. Only when every label the scan
 * did keep already sits right after its own structure, so the order is confirmed by the scan.
 * @template {{ text?: string, options?: string[] }} T
 * @param {T} q
 * @returns {T}
 */
export function restoreStructureLabels(q) {
  const scheme = labelScheme(q)
  if (!scheme || scheme.want.every((label) => scheme.have.has(label))) return q
  for (const [label, after] of scheme.have) {
    if (scheme.labels.indexOf(label) + 1 !== after) return q
  }
  const text = String(q?.text ?? '')
  const codes = text.match(SMILES_RE) || []
  const pieces = text.split(SMILES_RE)
  const labelLine = scheme.letter ? LETTER_LINE : LABEL_LINE
  const bold = /\\boldsymbol/.test(text)
  const show = (label) => (scheme.letter ? (bold ? `$\\boldsymbol{${label}}$` : `$${label}$`) : label)
  const dropLabels = (piece) =>
    piece
      .split('\n')
      .filter((line) => !labelLine.test(line))
      .join('\n')
  let out = pieces[0].replace(/\s+$/, '')
  codes.forEach((code, i) => {
    out += `${out ? '\n' : ''}${code}\n${show(scheme.labels[i])}\n`
    const between = dropLabels(pieces[i + 1] ?? '').trim()
    if (between) out += `${between}\n`
  })
  return { ...q, text: out.trim() }
}
