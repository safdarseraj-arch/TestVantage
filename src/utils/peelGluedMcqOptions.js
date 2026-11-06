/**
 * Shared heal: MCQ option sequences glued into the stem after
 * "option(s) is(are) correct" / reagent-order prompts (Q.7 ion detector,
 * P to Q Lindlar sequences). Never invents options — only splits text already
 * present in the stem or this question's OCR window.
 */
import { findOptionsBlockStart } from './mcqOptionMarkers.js'
import { consumeIncludeGraphics } from './mathpixMedia.js'
import { parseQuestionText } from './parseQuestionText.js'

const MCQ_OPTION_PROMPT_RE =
  /(?:Which of the following option\(s\) is\(are\) correct|The option\(s\) with correct sequence of reagents[\s\S]{0,160}?is\(are\))\s*\??/i

const REAGENT_PROMPT_TAIL_RE = /conversion of P to Q is\(are\)/i

function pad4(options) {
  const out = (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim())
  while (out.length < 4) out.push('')
  return out.slice(0, 4)
}

function filledCount(options) {
  return pad4(options).filter(Boolean).length
}

/** Pull Mathpix figures out of a tail so they stay on the stem. */
export function peelFiguresFromBand(band) {
  const t = String(band ?? '')
  const figures = []
  let rest = ''
  let i = 0
  while (i < t.length) {
    if (t.startsWith('\\includegraphics', i)) {
      const g = consumeIncludeGraphics(t, i)
      if (g) {
        figures.push(t.slice(i, g.end).trim())
        i = g.end
        continue
      }
    }
    if (t.startsWith('![', i)) {
      const close = t.indexOf(')', i)
      if (close > i && /cdn\.mathpix\.com/i.test(t.slice(i, close + 1))) {
        figures.push(t.slice(i, close + 1).trim())
        i = close + 1
        continue
      }
    }
    rest += t[i]
    i += 1
  }
  return {
    figures: figures.filter(Boolean).join('\n'),
    rest: rest.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
  }
}

/**
 * Four i-iv reagent rows smashed together without (A)-(D).
 * A new row starts at i) only after the previous row already has ii/iii/iv.
 * @param {string} band
 * @returns {string[] | null}
 */
export function splitReagentSequenceOptions(band) {
  const t = String(band ?? '')
  if (!t.trim()) return null
  const tokenRe = /(?:^|[\s.;+])(i{1,3}|iv)\s*[\)\.]/gi
  /** @type {{ roman: string, index: number }[]} */
  const tokens = []
  let m
  while ((m = tokenRe.exec(t)) !== null) {
    const raw = m[0]
    const index = /^[iv]/i.test(raw) ? m.index : m.index + 1
    tokens.push({ roman: m[1].toLowerCase(), index })
  }
  if (tokens.length < 4) return null
  /** @type {{ roman: string, index: number }[][]} */
  const groups = []
  let cur = []
  for (const tok of tokens) {
    const priorHasSteps = cur.some((x) => x.roman === 'ii' || x.roman === 'iii' || x.roman === 'iv')
    if (tok.roman === 'i' && cur.length && priorHasSteps) {
      groups.push(cur)
      cur = [tok]
    } else {
      cur.push(tok)
    }
  }
  if (cur.length) groups.push(cur)
  if (groups.length < 2) return null
  const options = ['', '', '', '']
  for (let i = 0; i < Math.min(4, groups.length); i += 1) {
    const from = groups[i][0].index
    const to = i + 1 < groups.length ? groups[i + 1][0].index : t.length
    options[i] = t.slice(from, to).trim().replace(/[;,\s]+$/g, '').trim()
  }
  return options.filter(Boolean).length >= 2 ? options : null
}

function parseLabeledOptionBand(band) {
  const t = String(band ?? '').trim()
  if (!t) return null
  const start = findOptionsBlockStart(t)
  if (start < 0) return null
  const parsed = parseQuestionText(t.slice(start))
  if ((parsed?.optionsFound ?? 0) < 2) return null
  return pad4(parsed.options)
}

function splitOptionLikeSentences(band) {
  const t = String(band ?? '').trim()
  if (!t) return null
  const lines = t.split(/\n+/).map((s) => s.trim()).filter((s) => s.length >= 12)
  if (lines.length >= 3 && lines.length <= 6) return pad4(lines.slice(0, 4))
  const sents = t
    .split(/(?<=[.?!])\s+(?=(?:If|The|When|For)\b)/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12)
  if (sents.length >= 3 && sents.length <= 4) return pad4(sents)
  return null
}

/**
 * Prefer stored A-D text that already appears in the band; leftover sentences
 * fill empty slots. Never invents wording.
 * @param {string} band
 * @param {string[]} existing
 */
function mergeBandWithExisting(band, existing) {
  const opts = pad4(existing)
  const labeled = parseLabeledOptionBand(band)
  if (labeled && labeled.filter(Boolean).length >= filledCount(opts)) return labeled
  const roman = splitReagentSequenceOptions(band)
  if (roman && roman.filter(Boolean).length >= 2) return roman

  let remaining = band
  const found = pad4(opts)
  for (let i = 0; i < 4; i += 1) {
    const o = found[i]
    if (!o || o.length < 12) continue
    const needle = o.replace(/\s+/g, ' ').trim().slice(0, 28)
    const pos = remaining.toLowerCase().indexOf(needle.toLowerCase())
    if (pos >= 0) {
      remaining = `${remaining.slice(0, pos)} ${remaining.slice(pos + o.length)}`
    }
  }
  const leftovers = remaining.replace(/\s+/g, ' ').trim()
  const parts = splitOptionLikeSentences(leftovers) || []
  let pi = 0
  for (let i = 0; i < 4 && pi < parts.length; i += 1) {
    if (!found[i] && parts[pi]) {
      found[i] = parts[pi]
      pi += 1
    }
  }
  if (found.filter(Boolean).length >= 2 && found.filter(Boolean).length >= filledCount(opts)) {
    return found
  }
  const sents = splitOptionLikeSentences(band)
  if (sents && sents.filter(Boolean).length > filledCount(opts)) return sents
  return found.filter(Boolean).length >= 2 ? found : null
}

function findPromptEnd(text) {
  const raw = String(text ?? '')
  const m = raw.match(MCQ_OPTION_PROMPT_RE)
  if (m && m.index != null) return m.index + m[0].length
  const reagent = raw.search(REAGENT_PROMPT_TAIL_RE)
  if (reagent >= 0) {
    const tail = raw.slice(reagent).match(/is\(are\)/i)
    if (tail && tail.index != null) return reagent + tail.index + tail[0].length
  }
  return -1
}

function looksLikeGluedOptionTail(rest) {
  if (!rest || rest.length < 12) return false
  if (findOptionsBlockStart(rest) >= 0) return true
  if (splitReagentSequenceOptions(rest)) return true
  if ((rest.match(/(?:^|[\s.;])i\s*[\)\.]/gi) || []).length >= 2 && /ii\s*[\)\.]/i.test(rest)) {
    return true
  }
  if (/(?:Lindlar|NaBH4|NaBH_\{4\}|SnCl2|SnCl_\{2\}).{8,}(?:Lindlar|NaBH4|NaBH_\{4\})/i.test(rest)) {
    return true
  }
  if (/(?:If the H|AM\s*=\s*144|The detector|The width\s*w)/i.test(rest)) return true
  const sents = splitOptionLikeSentences(rest)
  return Boolean(sents && sents.filter(Boolean).length >= 3)
}

function mergeOptions(prefer, fallback) {
  const a = pad4(prefer)
  const b = pad4(fallback)
  return [0, 1, 2, 3].map((i) => a[i] || b[i] || '')
}

/**
 * @param {string} text
 * @param {unknown[]} [options]
 * @param {unknown} [source]
 * @returns {{ text: string, options: string[] }}
 */
export function peelGluedMcqOptions(text, options = [], source = '') {
  const raw = String(text ?? '')
  const existing = pad4(options)
  if (!raw.trim()) return { text: raw, options: existing }

  const promptEnd = findPromptEnd(raw)
  let stem = raw
  let band = ''
  let figures = ''

  if (promptEnd >= 0) {
    const before = raw.slice(0, promptEnd).trim()
    const peeled = peelFiguresFromBand(raw.slice(promptEnd))
    figures = peeled.figures
    band = peeled.rest
    const given = String(band ?? '').match(/^\s*(\[\s*Given\s*:[\s\S]*?\])\s*([\s\S]*)$/)
    if (given) {
      stem = `${before}\n\n${given[1].trim()}${figures ? `\n${figures}` : ''}`.trim()
      band = given[2].trim()
    } else {
      stem = figures ? `${before}\n${figures}`.trim() : before
    }
  } else if (looksLikeGluedOptionTail(raw) && filledCount(existing) < 4) {
    const roman = splitReagentSequenceOptions(raw)
    if (roman) {
      const firstI = raw.search(/(?:^|[\s.;])i\s*[\)\.]/i)
      if (firstI > 24) {
        const peeled = peelFiguresFromBand(raw.slice(firstI))
        stem = `${raw.slice(0, firstI).trim()}${peeled.figures ? `\n${peeled.figures}` : ''}`.trim()
        band = peeled.rest
      }
    }
  }

  // Options already stored — still cut a duplicated (A)–(D) band off the stem
  // (keep Mathpix figures that follow the band). Never invent options.
  if (!band && filledCount(existing) >= 2) {
    const start = findOptionsBlockStart(raw)
    if (start > 24) {
      const after = raw.slice(start)
      if (
        /\(\s*A\s*\)/i.test(after) &&
        /\(\s*B\s*\)/i.test(after) &&
        /\(\s*[CD]\s*\)/i.test(after)
      ) {
        // Peel only the first A–D band; keep a glued following question for the splitter.
        let bandEnd = after.length
        const dAt = after.search(/\(\s*D\s*\)/i)
        if (dAt >= 0) {
          const afterD = after.slice(dAt + 3)
          const secondAt = afterD.search(
            /\n(?=(?:Let|If(?!\s+and\s+only)|Which|Consider|Suppose|For the|Match\s+|How many|What is|The value|An integer)\b)/i,
          )
          if (secondAt >= 1) bandEnd = dAt + 3 + secondAt
        }
        const bandOnly = after.slice(0, bandEnd)
        const leftover = after.slice(bandEnd).trim()
        const peeled = peelFiguresFromBand(bandOnly)
        const before = raw.slice(0, start).trim()
        stem = `${before}${peeled.figures ? `\n${peeled.figures}` : ''}${leftover ? `\n${leftover}` : ''}`.trim()
        return { text: stem, options: existing }
      }
    }
    return { text: stem === raw ? raw : stem, options: existing }
  }

  let nextOpts = existing
  if (band && looksLikeGluedOptionTail(band)) {
    const fromBand = mergeBandWithExisting(band, existing)
    if (fromBand) nextOpts = mergeOptions(fromBand, existing)
  } else if (band && filledCount(existing) >= 2) {
    nextOpts = existing
  }

  const src = String(source ?? '')
  if (filledCount(nextOpts) < 4 && src.length >= 40) {
    const fromSrc = recoverOptionsFromOcr(stem, src)
    if (fromSrc) nextOpts = mergeOptions(nextOpts, fromSrc)
  }

  if (band && !looksLikeGluedOptionTail(band) && filledCount(nextOpts) < 2) {
    return { text: raw, options: existing }
  }

  return { text: stem, options: pad4(nextOpts) }
}

function clipToThisQuestion(slice, probeAt) {
  const t = String(slice ?? '')
  const re = /(?:\\item\s*\[\s*Q\s*\.?\s*(?:\d{1,3}\s*\]|\]\s*\$?\s*\d)|(?:^|\n)\s*Q\s*\.?\s*\d{1,2}\b)/gi
  const markers = [...t.matchAll(re)]
  if (!markers.length) return t
  const at = Number.isFinite(Number(probeAt)) ? Number(probeAt) : 0
  let start = 0
  let end = t.length
  for (const m of markers) {
    const i = m.index ?? 0
    if (i <= at) start = i
    else {
      end = i
      break
    }
  }
  return t.slice(start, end)
}

function windowHasThisStructure(window, stem) {
  const smiles = [...String(stem ?? '').matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)]
    .map((m) => String(m[1] ?? '').replace(/\s+/g, '').trim())
    .filter((s) => s.length >= 8)
  if (!smiles.length) return true
  const flat = String(window ?? '').replace(/\s+/g, '')
  return smiles.some((s) => flat.includes(s.slice(0, 20)))
}

function recoverOptionsFromOcr(stem, source) {
  const probe = String(stem ?? '')
    .replace(/\$+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
  if (probe.length < 16) return null
  const idx = source.indexOf(probe.slice(0, 28))
  const at =
    idx >= 0
      ? idx
      : source.replace(/\$+/g, '').replace(/\s+/g, ' ').indexOf(probe.slice(0, 24))
  if (at < 0) return null
  const start = Math.max(0, at - 80)
  const window = clipToThisQuestion(source.slice(start, at + 2200), at - start)
  if (!windowHasThisStructure(window, stem)) return null
  const parsed = parseQuestionText(window)
  if ((parsed?.optionsFound ?? 0) >= 2) {
    const opts = pad4(parsed.options)
    const junk = opts.filter((o) => {
      const s = String(o ?? '').trim()
      return /^and$/i.test(s) || /\bwill get\s*[+\-]?\d+\s*marks?\b/i.test(s) || /\bchoosing ONLY\b/i.test(s)
    }).length
    if (junk >= 2) return null
    return opts
  }
  const roman = splitReagentSequenceOptions(window)
  if (roman) return roman
  return null
}
