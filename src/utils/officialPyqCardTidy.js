/**
 * Card damage the scan itself settles, with no judgement call: the printed question number
 * left in front of the text, the card's own options repeated inside the stem, two options glued
 * into one box, and a first word the scan printed in lower case. Pure functions only.
 */

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const compact = (text) =>
  String(text ?? '')
    .replace(/\\(?:left|right|mathrm|mathbf|text|textbf)\b/g, '')
    .replace(/[\s${}~]/g, '')
    .toLowerCase()

const MARKER_LEAD_RE = /^\s*(?:\\item\s*\[\s*Q\s*\.?\s*\]\s*|Q\s*\.\s*)(\d{1,3})\b[ \t]*[.:)]?[ \t]*/
const NUMBER_LEAD_RE = /^\s*(\d{1,3})(?:[ \t]*[.)])?[ \t]+(?=\S)/

/** The first two words of the text, as a pattern that tolerates any spacing. */
function openingPattern(rest) {
  const words = String(rest ?? '').trim().split(/\s+/).slice(0, 2)
  if (!words.length || !/[A-Za-z]{2,}/.test(words[0])) return ''
  return words.map(escapeRe).join('\\s+')
}

/**
 * The text without "Q. 12" / "3 " in front of it when that is the printed marker of this question
 * (2019 P1 Q30 "Q. 12 Choose …", 2025 P2 Q19 "3 As shown …" — the scan prints "\item[Q.] 3 As
 * shown"). '' when the text does not start with its own marker.
 * @param {any} q
 * @param {string} ocr
 */
export function stemWithoutPrintedNumber(q, ocr) {
  const text = String(q?.text ?? '')
  const printed = Number(q?.printedNumber)
  if (!Number.isFinite(printed) || printed <= 0) return ''
  const marker = text.match(MARKER_LEAD_RE)
  if (marker && Number(marker[1]) === printed && text.slice(marker[0].length).trim()) {
    return text.slice(marker[0].length).trimStart()
  }
  const lead = text.match(NUMBER_LEAD_RE)
  if (!lead || Number(lead[1]) !== printed) return ''
  const rest = text.slice(lead[0].length)
  const opening = openingPattern(rest)
  if (!opening) return ''
  const inScan = new RegExp(
    `(?:\\\\item\\s*\\[\\s*Q\\s*\\.?\\s*\\]\\s*|Q\\s*\\.?\\s*|(?:^|\\n)[ \\t]*)${printed}\\s*[.)]?\\s*${opening}`,
  )
  return inScan.test(String(ocr ?? '')) ? rest.trimStart() : ''
}

const OWN_OPTION_LINE_RE = /^\s*(?:\[\s*([A-D])\s*\]|\(\s*([A-D])\s*\)|([A-D])\s*[.)])\s*(\S.*)$/

/**
 * The stem without its own options repeated as "[A] … [D]" / "(A) …" lines (2017 P2 Q48).
 * '' when fewer than three such lines match the card's options.
 * @param {any} q
 */
export function stemWithoutOwnOptionLines(q) {
  const options = (Array.isArray(q?.options) ? q.options : []).map(compact)
  if (options.filter(Boolean).length < 3) return ''
  const lines = String(q?.text ?? '').split('\n')
  const drop = new Set()
  lines.forEach((line, i) => {
    const m = line.match(OWN_OPTION_LINE_RE)
    if (!m) return
    const at = (m[1] || m[2] || m[3]).charCodeAt(0) - 65
    const body = compact(m[4])
    if (body && options[at] && body === options[at]) drop.add(i)
  })
  if (drop.size < 3) return ''
  const kept = lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return kept || ''
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const DRAWING_RE = /^\s*(?:<smiles>[\s\S]*<\/smiles>|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\))\s*$/

/**
 * The answer choices left in the stem as "[A] II > I > IV > III" lines while the option boxes hold
 * the drawings I–IV the choices name (2017 P2 Q25). The drawings go back into the stem under
 * their labels and the choices become the options. null when not the case.
 * @param {any} q
 * @returns {{ text: string, options: string[] } | null}
 */
export function choicesLeftInStem(q) {
  const options = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? ''))
  if (options.length < 2 || options.length > ROMAN.length || !options.every((o) => DRAWING_RE.test(o))) return null
  const lines = String(q?.text ?? '').split('\n')
  /** @type {Map<number, string>} */
  const choices = new Map()
  lines.forEach((line, i) => {
    const m = line.match(OWN_OPTION_LINE_RE)
    if (m) choices.set(i, m[4].trim())
  })
  if (choices.size < 3 || choices.size > 4) return null
  const letters = [...choices.keys()].map((i) => {
    const m = lines[i].match(OWN_OPTION_LINE_RE)
    return m?.[1] || m?.[2] || m?.[3]
  })
  if (letters.join('') !== 'ABCD'.slice(0, letters.length)) return null
  const labels = ROMAN.slice(0, options.length)
  const named = [...choices.values()].every((body) => {
    const used = body.replace(/\$[^$]*\$/g, ' ').match(/\b[IVX]+\b/g) || []
    return used.length >= 2 && used.every((label) => labels.includes(label))
  })
  if (!named) return null
  const stem = lines
    .filter((line, i) => !choices.has(i) && !labels.includes(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const drawings = options.map((o, i) => `${o.trim()}\n${labels[i]}`).join('\n')
  return { text: `${stem}\n${drawings}`, options: [...choices.values()] }
}

/** "$(50-25 \sqrt{3}, 25)(25,25 \sqrt{3})$" → two options; null when the box holds one. */
function splitGluedOption(opt) {
  const s = String(opt ?? '').trim()
  const tuple = s.match(/^\$\s*(\([^()$]*(?:\([^()$]*\)[^()$]*)*\))\s*(\([^()$]*(?:\([^()$]*\)[^()$]*)*\))\s*\$$/)
  if (tuple) return [`$${tuple[1]}$`, `$${tuple[2]}$`]
  const twoMath = s.match(/^(\$[^$]+\$)\s+(\$[^$]+\$)$/)
  if (twoMath) return [twoMath[1], twoMath[2]]
  return null
}

/**
 * Four options when three boxes are filled and one of them holds two options the scan glued
 * together (2016 P2 Q5). null when not the case.
 * @param {any} q
 * @returns {string[] | null}
 */
export function gluedOptionsSplit(q) {
  if (!/single_correct|multiple_correct/.test(String(q?.questionType ?? ''))) return null
  const options = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? ''))
  const filled = options.filter((o) => o.trim())
  if (filled.length !== 3 || options.length > 4) return null
  const glued = filled.map(splitGluedOption)
  if (glued.filter(Boolean).length !== 1) return null
  const out = filled.flatMap((opt, i) => glued[i] || [opt])
  return out.length === 4 ? out : null
}

/**
 * The text with its first word capitalised when the scan printed that word in lower case right
 * after the question marker (2016 P2 Q8: "\item[Q.] 8 light of wavelength"), so nothing was lost
 * before it. '' when not the case.
 * @param {string} text
 * @param {string} ocr
 */
export function stemWithCapitalisedStart(text, ocr) {
  const s = String(text ?? '')
  const m = s.match(/^(\s*)([a-z]{3,})\b(\s+\S+)/)
  if (!m) return ''
  const pattern = new RegExp(
    `(?:\\\\item\\s*\\[\\s*Q\\s*\\.?\\s*\\]\\s*\\d{1,3}|Q\\s*\\.?\\s*\\d{1,3}|(?:^|\\n)[ \\t]*\\d{1,3}\\s*[.)])\\s*${escapeRe(m[2])}\\s+${escapeRe(m[3].trim())}`,
  )
  if (!pattern.test(String(ocr ?? ''))) return ''
  return `${m[1]}${m[2][0].toUpperCase()}${m[2].slice(1)}${s.slice(m[1].length + m[2].length)}`
}

const PICTURE_TOKEN_RE = /\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)/g
const ROW_LABEL_RE = /^\s*(\(\s*[A-Z1-9]\s*\)|[A-Z1-9]\s*[.)])/
const LABEL_ONLY_RE = /^\s*(\(\s*[A-Z1-9]\s*\)|[A-Z1-9]\s*[.)])\s*$/
const labelKey = (label) => String(label ?? '').replace(/[\s().]/g, '')

/**
 * The text with each picture shown once: a copy on a labelled row "(1) <picture>" is kept, a loose
 * copy elsewhere goes, with its label line when that label has a row of its own (2026 P1 Q31
 * printed List-II's pictures twice). '' when no picture repeats.
 * @param {string} text
 */
export function stemWithoutRepeatedPictures(text) {
  const lines = String(text ?? '').split('\n')
  /** @type {Map<string, number[]>} */
  const seen = new Map()
  lines.forEach((line, i) => {
    for (const m of line.matchAll(PICTURE_TOKEN_RE)) {
      const at = seen.get(m[0]) || []
      at.push(i)
      seen.set(m[0], at)
    }
  })
  const repeated = [...seen].filter(([, at]) => at.length > 1)
  if (!repeated.length) return ''
  /** @type {Map<string, number>} */
  const labelRows = new Map()
  for (const line of lines) {
    if (LABEL_ONLY_RE.test(line)) continue
    const key = labelKey(line.match(ROW_LABEL_RE)?.[1])
    if (key) labelRows.set(key, (labelRows.get(key) || 0) + 1)
  }
  // A labelled copy whose label another row also uses is the extra one (2014 P2 Q38's "(2) <picture>").
  const ownRow = (i) => labelRows.get(labelKey(lines[i].match(ROW_LABEL_RE)?.[1])) === 1
  const out = lines.slice()
  for (const [token, at] of repeated) {
    const keep = at.find((i) => ROW_LABEL_RE.test(lines[i]) && ownRow(i)) ?? at[0]
    for (const i of at) {
      if (i === keep) continue
      out[i] = out[i].split(token).join('').trimEnd()
      if (!out[i].trim()) out[i] = '\u0000'
    }
  }
  const rowLabels = new Set(
    out.filter((line) => line !== '\u0000' && !LABEL_ONLY_RE.test(line)).map((line) => labelKey(line.match(ROW_LABEL_RE)?.[1])).filter(Boolean),
  )
  const kept = out.filter((line, i) => {
    if (line === '\u0000') return false
    const label = line.match(LABEL_ONLY_RE)?.[1]
    if (!label || !rowLabels.has(labelKey(label))) return true
    // Only a label whose picture was the loose copy goes; a label line in front of its own row stays.
    let k = i + 1
    while (k < out.length && !out[k].trim()) k += 1
    return k < out.length && out[k] !== '\u0000'
  })
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * "Figure (a)" in the text while the caption under the picture reads "(A)": the scan
 * capitalised the caption, which then looks like an option letter (2022 P1 Q27).
 * Returns '' when no caption changes.
 * @param {unknown} text
 */
export function stemWithFigureCaptionCase(text) {
  const t = String(text ?? '')
  const lines = t.split('\n')
  let changed = false
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].trim().match(/^\(([A-D])\)$/)
    if (!m) continue
    let k = i - 1
    while (k >= 0 && !lines[k].trim()) k -= 1
    if (k < 0 || !/^\\includegraphics\b/.test(lines[k].trim())) continue
    const lower = m[1].toLowerCase()
    if (!new RegExp(`\\b(?:FIG|[Ff]ig)(?:URE|ure|\\.)?\\s*\\(${lower}\\)`).test(t)) continue
    lines[i] = lines[i].replace(`(${m[1]})`, `(${lower})`)
    changed = true
  }
  return changed ? lines.join('\n') : ''
}

const MATHPIX_PIECE_RE =
  /^[ \t]*\\includegraphics(?:\[[^\]]*\])?\{(https:\/\/cdn\.mathpix\.com\/cropped\/[^?}\s]+)\?height=(\d+)&width=(\d+)&top_left_y=(\d+)&top_left_x=(\d+)\}[ \t]*$/
/** "compound ↑", "(Peroxyester)": words of a drawing that the scan printed as text between its pieces. */
const DRAWING_WORDS_RE = /^[ \t]*\(?[A-Za-z][A-Za-z'-]{3,}(?:[ \t]+[A-Za-z'-]+)?\)?(?:[ \t]*[↑↓])?[ \t]*$/
const NOT_DRAWING_WORDS_RE = /^\s*\(?(?:fig|figure|list|column|codes?|table|answer|ans|note|given|where|then|and|or)\b/i
/** Pieces of one drawing are this close on the scan page (about two lines of print). */
const PIECE_GAP = 120
/** About one printed letter on a Mathpix page, for the drawing's words beside a piece. */
const LETTER_WIDTH = 20

/**
 * The text with a drawing the scan cut into pieces shown whole: two or more pictures of one page
 * that sit together, with the drawing's own words printed as text between them (2014 P2 Q37's
 * peroxyester scheme came as five pieces and "compound ↑", "(Peroxyester)"). Mathpix draws any
 * box of the page, so the pieces become one picture of the box around them, widened by the
 * length of those words because they sit beside a piece. '' when no drawing is in pieces.
 * @param {unknown} text
 */
export function stemWithJoinedFigurePieces(text) {
  const lines = String(text ?? '').split('\n')
  const out = []
  let changed = false
  let i = 0
  while (i < lines.length) {
    const first = lines[i].match(MATHPIX_PIECE_RE)
    if (!first) {
      out.push(lines[i])
      i += 1
      continue
    }
    const pieces = [first]
    const words = []
    let pending = []
    let last = i
    for (let k = i + 1; k < lines.length; k += 1) {
      const piece = lines[k].match(MATHPIX_PIECE_RE)
      if (piece && piece[1] === first[1]) {
        pieces.push(piece)
        words.push(...pending.filter((line) => line.trim()))
        pending = []
        last = k
        continue
      }
      if (!lines[k].trim() || (DRAWING_WORDS_RE.test(lines[k]) && !NOT_DRAWING_WORDS_RE.test(lines[k]))) {
        pending.push(lines[k])
        continue
      }
      break
    }
    const boxes = pieces
      .map((m) => ({ h: Number(m[2]), w: Number(m[3]), y: Number(m[4]), x: Number(m[5]) }))
      .sort((a, b) => a.y - b.y)
    let bottom = boxes[0].y + boxes[0].h
    const together = boxes.every((b, k) => {
      if (k && b.y > bottom + PIECE_GAP) return false
      bottom = Math.max(bottom, b.y + b.h)
      return true
    })
    if (pieces.length < 2 || !words.length || !together) {
      out.push(lines[i])
      i += 1
      continue
    }
    const x0 = Math.min(...boxes.map((b) => b.x))
    const y0 = boxes[0].y
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + Math.max(...words.map((w) => w.trim().length)) * LETTER_WIDTH
    out.push(`\\includegraphics{${first[1]}?height=${bottom - y0}&width=${x1 - x0}&top_left_y=${y0}&top_left_x=${x0}}`)
    changed = true
    i = last + 1
  }
  return changed ? out.join('\n') : ''
}

const ORIGINAL_CROP_PREFIX = '/api/official-pyq/original/crops/'

/** Pictures cut from the original page, in the order Compare named them. */
function originalPageCrops(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((url) => String(url ?? '').trim())
    .filter((url) => url.startsWith(ORIGINAL_CROP_PREFIX))
}

/**
 * List-II when every row is only a label and a molecule code or a picture (2014 P2 Q37).
 * null when the block also holds ordinary words.
 * @param {string} text
 * @returns {{ index: number, block: string } | null}
 */
function structureOnlyListTwo(text) {
  const found = String(text).match(/(?:^|\n)([ \t]*(?:List|Column)[ \t]*[-–]?[ \t]*II\b[\s\S]*)$/i)
  if (!found) return null
  const block = found[1]
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
  const onlyStructures = lines.every(
    (line, i) =>
      (i === 0 && /^(?:List|Column)[ \t]*[-–]?[ \t]*II\b/i.test(line)) ||
      /^\(\s*[1-5]\s*\)$/.test(line) ||
      /^[1-5]\.$/.test(line) ||
      /^<smiles>[\s\S]*<\/smiles>$/i.test(line) ||
      /^\\includegraphics\b/.test(line),
  )
  if (!onlyStructures || !/<smiles>/i.test(block)) return null
  return { index: found.index ?? 0, block }
}

/**
 * A drawing the scan cut into pieces, and a List-II that is only molecule codes, shown from the
 * original page (2014 P2 Q37). The first picture replaces the pieces. One picture left over
 * replaces that whole List-II; one picture per molecule code replaces each code and keeps the
 * row labels. The lists and the answer codes stay. '' when this card has no cut-up drawing or
 * no original-page pictures.
 * @param {unknown} text
 * @param {unknown} urls
 */
export function textWithOriginalFigureCrops(text, urls) {
  const crops = originalPageCrops(urls)
  if (!crops.length) return ''
  const t = String(text ?? '')
  const joined = stemWithJoinedFigurePieces(t)
  if (!joined) return ''
  const oldUrls = new Set([...t.matchAll(/\\includegraphics\{([^}]+)\}/g)].map((m) => m[1]))
  const made = [...joined.matchAll(/\\includegraphics\{([^}]+)\}/g)].find((m) => !oldUrls.has(m[1]))
  if (!made) return ''
  let out = joined.replace(made[0], `\\includegraphics{${crops[0]}}`)
  const rest = crops.slice(1)
  const list = structureOnlyListTwo(out)
  if (list && rest.length === 1) {
    out = `${out.slice(0, list.index)}\n\\includegraphics{${rest[0]}}`
  } else if (list && rest.length === (list.block.match(/<smiles>/gi) || []).length) {
    let i = 0
    const replaced = list.block.replace(/<smiles>[\s\S]*?<\/smiles>/gi, () => `\\includegraphics{${rest[i++]}}`)
    out = out.slice(0, list.index) + replaced
  }
  const cleaned = out.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned !== t.trim() ? cleaned : ''
}

const SCAN_PLACEHOLDER_LINE_RE = /^[ \t]*\[(?:Figure|Image|Diagram)\][ \t]*\n?/gim

/**
 * "[Figure]" is the scan's caption for a picture it could not name; it stands on a line of its own
 * above the picture (2014 P2 Q21–Q23). '' when there is none.
 * @param {unknown} text
 */
export function stemWithoutScanPlaceholders(text) {
  const t = String(text ?? '')
  const cleaned = t.replace(SCAN_PLACEHOLDER_LINE_RE, '').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned !== t.trim() ? cleaned : ''
}

/** Text outside $…$, pictures and molecules, where English spacing rules apply. */
function mapEnglish(text, fn) {
  return String(text ?? '')
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|<smiles>[\s\S]*?<\/smiles>)/)
    .map((seg, i) => (i % 2 ? seg : fn(seg)))
    .join('')
}

/**
 * "$90~\Omega$,as shown": the scan dropped the space after a comma. '' when nothing changes.
 * @param {unknown} text
 */
export function withSpaceAfterComma(text) {
  const t = String(text ?? '')
  const spaced = mapEnglish(t, (seg) => seg.replace(/,(?=[A-Za-z]{2,})/g, ', '))
  return spaced !== t ? spaced : ''
}

/** English words that start with "a" + another word; never split. */
const A_WORDS = new Set(
  [
    'about above abroad across adjust affix afloat again against ahead allot allow alone along aloud amend among amount another apart appear apply arise around arrange aside assign attach attend attest avail avert await awake aware away',
    'aboard abridge afield afresh alight apiece aright asleep astray awhile',
    'achiral acyclic apolar aperiodic aromatic asymmetric asymmetry atypical',
  ]
    .join(' ')
    .split(' '),
)

/**
 * "whichpasses", "ametre bridge": the scan glued "which" / "a" to the next word. "which" + word is
 * never one English word (except whichever); "a" + word is split only after "with", "of", … and
 * when that word stands alone elsewhere on the paper. '' when nothing changes.
 * @param {unknown} text
 * @param {string} ocr
 */
export function withGluedWordsSplit(text, ocr = '') {
  const t = String(text ?? '')
  const paper = `${t}\n${ocr}`
  const standsAlone = (word) => new RegExp(`(?:^|[^A-Za-z])${escapeRe(word)}(?![A-Za-z])`, 'i').test(paper.replace(new RegExp(`\\b(?:which|a)${escapeRe(word)}\\b`, 'gi'), ' '))
  const split = mapEnglish(t, (seg) =>
    seg
      .replace(/\b([Ww]hich)([a-z]{4,})\b/g, (whole, lead, rest) => (/^(?:ever|soever)$/.test(rest) ? whole : `${lead} ${rest}`))
      // "with ametre bridge": only after a word that is followed by an article.
      .replace(/\b((?:with|of|in|on|by|for|from|into|at|using)\s+)a([a-z]{5,})\b/g, (whole, before, rest) =>
        A_WORDS.has(`a${rest}`) || !standsAlone(rest) ? whole : `${before}a ${rest}`,
      ),
  )
  return split !== t ? split : ''
}

/**
 * Damage only the original page can settle: a structure the scan reduced to one bracket atom
 * ("<smiles>[CH]</smiles>", 2014 P2 Q38), text the scan replaced by "?", a condition cut before
 * its "=", or a figure label missing from its sequence ("I … III" with no II, 2014 P2 Q22). '' when none.
 * @param {any} q
 */
export function scanLossReason(q) {
  const parts = [q?.text, q?.passageText, ...(Array.isArray(q?.options) ? q.options : [])].map((p) => String(p ?? ''))
  if (parts.some((p) => /<smiles>\s*\[[A-Za-z]{1,2}H?\d?\]\s*<\/smiles>/.test(p))) {
    return 'A structure drawing is broken (the scan kept one atom); compare with the original page'
  }
  const text = String(q?.text ?? '')
  if (/(?:^|\n)[ \t]*\?[ \t]+\S/.test(text)) return 'Part of the text is lost (the scan printed “?”); compare with the original page'
  // "(P) For each $z_k$ there exists a $z_j$ such that $z_{k} \cdot z_{j}$" — the "= 1" is gone (2014 P2 Q57).
  const cutCondition = [...text.matchAll(/such\s+that\s+\$([^$]*)\$[ \t]*$/gm)].find(
    (m) => !/[=<>]|\\(?:leq?|geq?|neq|in|notin|subset|subseteq|perp|parallel|equiv|sim|approx)\b/.test(m[1]),
  )
  if (cutCondition) return 'A condition ends without its “=” part (the scan cut it); compare with the original page'
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI']
  const labels = new Set([...text.matchAll(/^[ \t]*(I{1,3}|IV|V|VI)[ \t]*$/gm)].map((m) => m[1]))
  const highest = Math.max(-1, ...[...labels].map((l) => romans.indexOf(l)))
  const gap = romans.slice(0, highest + 1).find((l) => !labels.has(l))
  if (labels.size >= 2 && gap) return `Figure label ${gap} is missing; compare with the original page`
  return ''
}

/** "equal$s_$" — the scan read "equals ____" as a subscript; the answer blank is put back (2019 P2 Q45). */
export function withAnswerBlankWord(text) {
  return String(text ?? '').replace(/\b([A-Za-z]{2,})\$([a-z]{1,3})_+\s*\$(?=\s*(?:\.|$))/g, '$1$2 ____')
}
