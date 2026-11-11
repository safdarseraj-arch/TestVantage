/**
 * A bilingual paper read with the Hindi words dropped (2013 P2) keeps what the Hindi copy shared with
 * the English one: its formulas, labels and slashes. Cards are English only, so these are removed:
 * "$\mu_2>\mu_1$ and/ $\mu_2>\mu_3$", "List I / I", "Warm/", "$\boldsymbol{P}$ (major) $\boldsymbol{P}$",
 * a line that ends by repeating its own formulas, and a second A–D list made of the first one's symbols.
 */

const MATH_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g
const OPTION_LINE_RE = /^\s*(?:\\item\s*\[\s*)?\(\s*([A-D])\s*\)\s*\]?\s*(.*)$/

/** @param {string} chunk */
function mathPieces(chunk) {
  return chunk
    .replace(/^\$+|\$+$/g, '')
    .split(',')
    .map((p) => p.replace(/\s+/g, '').replace(/=$/, ''))
    .filter(Boolean)
}

/**
 * "… $\tan\theta=$ $PQ, y^2=4ax$ $\theta$ $\tan\theta=$": three or more formulas, each already in the line,
 * with nothing but spaces and commas between them, after a full stop or another formula.
 * Not "Then the vectors $a$, $b$, $c$": a word before them is English.
 * @param {string} line
 */
export function dropRepeatedMathTail(line) {
  const s = String(line ?? '')
  const chunks = [...s.matchAll(MATH_RE)]
  for (let k = 1; k <= chunks.length - 3; k += 1) {
    const tail = s.slice(chunks[k].index)
    if (tail.replace(MATH_RE, '').replace(/[\s,.;]/g, '')) continue
    if (!/[.?:$]$/.test(s.slice(0, chunks[k].index).trimEnd())) continue
    if (!chunks.slice(k).some((m) => m[0].replace(/[\s$]/g, '').length >= 6)) continue
    const before = new Set(chunks.slice(0, k).flatMap((m) => mathPieces(m[0])))
    if (chunks.slice(k).every((m) => mathPieces(m[0]).every((p) => before.has(p)))) {
      return s.slice(0, chunks[k].index).trimEnd()
    }
  }
  return s
}

/** @param {string} text */
function outsideMath(text, fn) {
  const s = String(text ?? '')
  let out = ''
  let last = 0
  for (const m of s.matchAll(MATH_RE)) {
    out += fn(s.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + fn(s.slice(last))
}

/** @param {string} prose */
function slashLeftovers(prose) {
  return prose
    .replace(/\b(and|or)\/(?=\s|$)/g, '$1')
    .replace(/\b((?:List|Column)\s*[-–]?\s*(I{1,2}))\s*\/\s*\2\b/g, '$1')
    .replace(/([A-Za-z)])[ \t]*\/[ \t]*(?=\n|$)/g, '$1')
}

/** "$\boldsymbol{P}$ (major) $\boldsymbol{P}$" → "$\boldsymbol{P}$ (major)". */
function dropRepeatedLabel(option) {
  const m = String(option ?? '').match(/^(\s*)(\$[^$\n]+\$)(\s+\([^()$\n]{1,20}\))\s+(\$[^$\n]+\$)\s*$/)
  if (m && m[2].replace(/\s+/g, '') === m[4].replace(/\s+/g, '')) return `${m[1]}${m[2]}${m[3]}`
  return option
}

/** @param {string} s */
function words(s) {
  return String(s ?? '')
    .replace(/\$[^$]*\$/g, (m) => ` ${m.replace(/\s+/g, '')} `)
    .split(/\s+/)
    .filter(Boolean)
}

/** @param {string[]} short @param {string[]} long */
function isSubsequence(short, long) {
  let i = 0
  for (const w of long) if (w === short[i]) i += 1
  return i === short.length
}

/** @param {string[]} lines @param {number} at */
function optionRunAt(lines, at) {
  const run = []
  let i = at
  while (i < lines.length && run.length < 4) {
    if (!lines[i].trim()) {
      i += 1
      continue
    }
    const m = lines[i].match(OPTION_LINE_RE)
    if (!m || m[1] !== 'ABCD'[run.length]) return null
    run.push({ line: i, body: m[2] })
    i += 1
  }
  return run.length === 4 ? { run, end: i } : null
}

/**
 * "(A) K to L and L to M … (A) K L L M …": the second list is the Hindi copy with its words gone.
 * @param {string[]} lines
 */
function dropStrippedOptionCopies(lines) {
  const drop = new Set()
  for (let i = 0; i < lines.length; i += 1) {
    const first = optionRunAt(lines, i)
    if (!first) continue
    const second = optionRunAt(lines, first.end)
    if (
      second &&
      second.run.every((o, k) => {
        const short = words(o.body)
        const long = words(first.run[k].body)
        return short.length && short.length < long.length && isSubsequence(short, long)
      })
    ) {
      for (const o of second.run) drop.add(o.line)
    }
    i = first.end - 1
  }
  return drop.size ? lines.filter((_, i) => !drop.has(i)) : lines
}

/**
 * @param {unknown} raw scan text (Mathpix LaTeX / markdown)
 * @returns {string}
 */
export function stripBilingualScanLeftovers(raw) {
  const lines = dropStrippedOptionCopies(String(raw ?? '').split('\n'))
  return lines
    .map((line) => {
      let out = outsideMath(dropRepeatedMathTail(line), slashLeftovers)
      if (OPTION_LINE_RE.test(out)) {
        const m = out.match(/^(\s*(?:\\item\s*\[\s*)?\(\s*[A-D]\s*\)\s*\]?)(.*)$/)
        if (m) out = m[1] + dropRepeatedLabel(m[2])
      }
      return out
    })
    .join('\n')
}

/**
 * The same leftovers on a saved card, for the quality check.
 * @param {{ text?: unknown, passageText?: unknown, options?: unknown[] }} card
 * @returns {string[]}
 */
export function bilingualLeftoversOnCard(card) {
  const parts = [card?.passageText, card?.text].map((p) => String(p ?? ''))
  const options = (Array.isArray(card?.options) ? card.options : []).map((o) => String(o ?? ''))
  const out = []
  const changed = (s) =>
    s
      .split('\n')
      .some((line) => outsideMath(dropRepeatedMathTail(line), slashLeftovers) !== line)
  if (parts.some(changed) || options.some(changed)) {
    out.push('text left over from the Hindi copy shows on the card (a stray "/" or repeated formulas)')
  }
  if (options.some((o) => dropRepeatedLabel(o) !== o)) {
    out.push('an option repeats its own label (left over from the Hindi copy)')
  }
  return out
}
