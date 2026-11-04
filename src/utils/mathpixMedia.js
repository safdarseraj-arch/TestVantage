/**
 * Mathpix papers ship figures as markdown images and includegraphics URLs.
 * Those are part of the question (List-I drawings, V-T graphs).
 */

/** Pictures the admin cut out of the original paper (served by the Hybrid AI helper). */
export const ORIGINAL_CROP_URL_PREFIX = '/api/official-pyq/original/crops/'
const MATHPIX_HOST = /cdn\.mathpix\.com|\/api\/official-pyq\/original\/crops\//i

export function isOriginalCropUrl(url) {
  return String(url ?? '').startsWith(ORIGINAL_CROP_URL_PREFIX)
}

function mathStateBefore(str, offset) {
  const before = String(str ?? '').slice(0, offset)
  let i = 0
  let inline = false
  let display = false
  while (i < before.length) {
    if (before[i] === '\\') {
      i += 2
      continue
    }
    if (before.startsWith('$$', i)) {
      if (inline) inline = false
      display = !display
      i += 2
      continue
    }
    if (before[i] === '$') {
      if (!display) inline = !inline
      i += 1
      continue
    }
    i += 1
  }
  return { inline, display }
}

/**
 * Drop a stray opener $ sitting in front of a figure.
 * If an inline formula is already open, close it before the figure.
 * Does not invent question text.
 * @param {unknown} text
 */
export function guardDollarsAroundFigures(text) {
  const beforeFig =
    /(?<!\$)\$(?=\s*(?:\\includegraphics\b|!\[[^\]]*\]\(\s*https?:\/\/cdn\.mathpix))/gi
  let s = String(text ?? '').replace(beforeFig, (dollar, offset, str) => {
    const st = mathStateBefore(str, offset)
    if (st.inline && !st.display) return dollar
    return ''
  })
  s = s.replace(/\\includegraphics\b/gi, (img, offset, str) => {
    const st = mathStateBefore(str, offset)
    if (st.inline && !st.display) return `$${img}`
    return img
  })
  return s
}

export function hasMathpixMedia(raw) {
  const t = String(raw ?? '')
  return (
    MATHPIX_HOST.test(t) ||
    /\\includegraphics/i.test(t) ||
    /\\begin\{figure\}/i.test(t) ||
    /!\[[^\]]*\]\(\s*\$?\s*https?:\/\//i.test(t)
  )
}

export function cleanMathpixImageUrl(url) {
  return String(url ?? '')
    .replace(/\\&/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/to\s*p_?\s*l\s*eft_/gi, 'top_left_')
    .replace(/\s+/g, '')
    .trim()
}

/** Balanced `{…}` starting at `pos` (the opener). */
function readBraceGroup(text, pos) {
  if (text[pos] !== '{') return -1
  let depth = 1
  let i = pos + 1
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') depth -= 1
    i += 1
  }
  return depth === 0 ? i : -1
}

/**
 * Parse one \\includegraphics… command, including broken Mathpix options
 * like `[alt={},max width= ]`.
 * @returns {{ end: number, url: string } | null}
 */
export function consumeIncludeGraphics(text, start = 0) {
  const t = String(text ?? '')
  if (!t.startsWith('\\includegraphics', start)) return null
  let i = start + '\\includegraphics'.length
  if (t[i] === '*') i += 1
  while (i < t.length && /\s/.test(t[i])) i += 1
  if (t[i] === '[') {
    let depth = 1
    i += 1
    while (i < t.length && depth > 0) {
      if (t[i] === '[') depth += 1
      else if (t[i] === ']') depth -= 1
      i += 1
    }
  }
  while (i < t.length && /\s/.test(t[i])) i += 1
  if (t[i] === '{') {
    const rest = t.slice(i + 1)
    const urlMatch = rest.match(/^(https?:\/\/cdn\.mathpix\.com\/[^}\s]+)/i)
    if (urlMatch) {
      let end = i + 1 + urlMatch[1].length
      if (t[end] === '}') end += 1
      return { end, url: cleanMathpixImageUrl(urlMatch[1]) }
    }
    const close = readBraceGroup(t, i)
    if (close < 0) return null
    return { end: close, url: cleanMathpixImageUrl(t.slice(i + 1, close - 1)) }
  }
  const bare = t.slice(i).match(/^(https?:\/\/cdn\.mathpix\.com\/[^\s]+)/i)
  if (bare) return { end: i + bare[1].length, url: cleanMathpixImageUrl(bare[1]) }
  return null
}

/**
 * Turn broken OCR graphics (`![]($ url`, `[alt={}]`, leaked height=&width=)
 * into a clean \\includegraphics{url} so they draw instead of showing as code.
 */
export function normalizeBrokenMathpixGraphics(text) {
  let s = String(text ?? '')
  if (!s) return s
  s = s.replace(
    /!\[\]\(\$\s*(https?:\/\/cdn\.mathpix\.com\/[^\s)]+)\s*\)?/gi,
    (_, url) => `\\includegraphics{${cleanMathpixImageUrl(url)}}`,
  )
  // Q48 List-II (5): ![](url?hei  — newline / missing ) must still become a figure.
  s = s.replace(
    /!\[\s*[^\]]*\]\s*\(\s*(https?:\/\/cdn\.mathpix\.com\/[^\s)]+)\s*\)?/gi,
    (_, url) => `\\includegraphics{${cleanMathpixImageUrl(url)}}`,
  )
  s = s.replace(/!\[\]\(\$\s*/g, ' ')
  // Lone stray $ before a figure (OCR). Keep a $ that closes a real formula.
  s = guardDollarsAroundFigures(s)
  let out = ''
  let i = 0
  let lastUrl = ''
  while (i < s.length) {
    if (s.startsWith('![', i) && /cdn\.mathpix\.com/i.test(s.slice(i, i + 120))) {
      const urlM = s.slice(i).match(/^!\[\s*[^\]]*\]\s*\(\s*(https?:\/\/cdn\.mathpix\.com\/[^\s)]+)/i)
      if (urlM) {
        const url = cleanMathpixImageUrl(urlM[1])
        if (url !== lastUrl) {
          out += `\\includegraphics{${url}}`
          lastUrl = url
        }
        i += urlM[0].length
        if (s[i] === ')') i += 1
        continue
      }
    }
    if (s.startsWith('\\includegraphics', i)) {
      const g = consumeIncludeGraphics(s, i)
      if (g?.url && MATHPIX_HOST.test(g.url)) {
        if (g.url !== lastUrl) {
          out += `\\includegraphics{${g.url}}`
          lastUrl = g.url
        }
        i = g.end
        continue
      }
    }
    const ch = s[i]
    if (!/\s/.test(ch)) lastUrl = ''
    out += ch
    i += 1
  }
  return expandNarrowListICrops(
    completeTruncatedMathpixCrops(
      out
        .replace(/(^|[\s>])height=\d+&width=\d+&top_left_[^\s}]*/gi, '$1')
        .replace(/[ \t]{2,}/g, ' '),
    ),
  )
}

/** Finish a cut crop (?hei) from other complete crops on the same file. Never invent a new page. */
export function completeTruncatedMathpixCrops(text) {
  const t = String(text ?? '')
  const incomplete = [...t.matchAll(/https?:\/\/cdn\.mathpix\.com\/cropped\/[^?\s)}]+[?](?!height=\d+&width=\d+)[^\s)}]*/gi)]
  if (!incomplete.length) return t
  const complete = [...t.matchAll(
    /https?:\/\/cdn\.mathpix\.com\/cropped\/[^?\s)}]+[?]height=\d+&width=\d+&top_left_y=\d+&top_left_x=\d+/gi,
  )].map((m) => {
    const q = String(m[0]).match(/height=(\d+)&width=(\d+)&top_left_y=(\d+)&top_left_x=(\d+)/i)
    return {
      url: m[0],
      file: String(m[0]).split('?')[0],
      h: Number(q[1]),
      w: Number(q[2]),
      y: Number(q[3]),
      x: Number(q[4]),
      index: m.index ?? 0,
    }
  })
  let out = t
  for (const m of incomplete) {
    const file = String(m[0]).split('?')[0]
    const badIndex = m.index ?? t.indexOf(m[0])
    const later = complete.filter((c) => c.file === file && c.index > badIndex).sort((a, b) => a.y - b.y)
    if (later.length) {
      out = replaceIncompleteMathpixUrl(out, m[0], later[0].url)
      continue
    }
    const blockStart = lastListTwoHeaderIndex(t, badIndex)
    const sibs = complete
      .filter((c) => c.file === file && c.index >= blockStart && c.index < badIndex)
      .sort((a, b) => a.y - b.y)
    const lastY = sibs.length ? sibs[sibs.length - 1].y : 0
    const existingNext = complete
      .filter((c) => c.file === file && c.y > lastY)
      .sort((a, b) => a.y - b.y)[0]
    if (existingNext) {
      out = replaceIncompleteMathpixUrl(out, m[0], existingNext.url)
      continue
    }
    if (sibs.length < 2) continue
    const last = sibs[sibs.length - 1]
    const prev = sibs[sibs.length - 2]
    const gap = Math.max(8, Math.min(40, last.y - (prev.y + prev.h)))
    const nextUrl = `${file}?height=${last.h}&width=${last.w}&top_left_y=${last.y + last.h + gap}&top_left_x=${last.x}`
    out = replaceIncompleteMathpixUrl(out, m[0], nextUrl)
  }
  return out
}

function lastListTwoHeaderIndex(text, beforeIndex) {
  const slice = String(text ?? '').slice(0, Math.max(0, Number(beforeIndex) || 0))
  let last = 0
  for (const m of slice.matchAll(/(?:List|Column)\s*[-–]?\s*II\b/gi)) {
    if (m.index != null) last = m.index
  }
  return last
}

function replaceIncompleteMathpixUrl(text, bad, good) {
  if (!bad || bad === good) return String(text ?? '')
  const escaped = String(bad).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text ?? '').replace(new RegExp(`${escaped}(?![A-Za-z0-9_&=])`, 'g'), good)
}

/** Prefer the unused complete crop from OCR over a cut ?hei leftover. */
export function restoreTruncatedMathpixCropsFromSource(stem, source) {
  let text = String(stem ?? '')
  const src = String(source ?? '')
  if (!text || src.length < 40) return text
  const incomplete = [...text.matchAll(/https?:\/\/cdn\.mathpix\.com\/cropped\/[^?\s)}]+[?](?!height=\d+&width=\d+)[^\s)}]*/gi)]
  if (!incomplete.length) return text
  const fromSrc = extractMathpixImageUrls(src)
  for (const m of incomplete) {
    const bad = m[0]
    const file = bad.split('?')[0]
    const blockStart = lastListTwoHeaderIndex(text, m.index ?? 0)
    const before = text.slice(blockStart, m.index ?? 0)
    const maxUsedY = Math.max(
      0,
      ...extractMathpixImageUrls(before)
        .filter((u) => u.split('?')[0] === file && /height=\d+/.test(u))
        .map((u) => Number(u.match(/top_left_y=(\d+)/i)?.[1] || 0)),
    )
    const candidates = fromSrc
      .filter((u) => u.split('?')[0] === file && /height=\d+/.test(u))
      .map((u) => ({ url: u, y: Number(u.match(/top_left_y=(\d+)/i)?.[1] || 0) }))
      .filter((c) => c.y > maxUsedY)
      .sort((a, b) => a.y - b.y)
    if (!candidates.length) continue
    text = replaceIncompleteMathpixUrl(text, bad, candidates[0].url)
  }
  return text
}

/**
 * Keep each Mathpix crop rectangle as OCR wrote it.
 * Stretching a narrow crop builds a URL that is not in the OCR, and the
 * stolen-figure check then deletes that drawing.
 */
export function expandNarrowListICrops(text) {
  return String(text ?? '')
}

/** Drop image markup (wrong-question drawings). Keeps surrounding words. */
export function stripMathpixImageMarkup(raw) {
  const t = String(raw ?? '')
  if (!t) return t
  let out = ''
  let i = 0
  while (i < t.length) {
    if (t.startsWith('\\includegraphics', i)) {
      const g = consumeIncludeGraphics(t, i)
      if (g) {
        out += ' '
        i = g.end
        continue
      }
    }
    if (t.startsWith('![', i)) {
      const close = t.indexOf(')', i)
      if (close > i && MATHPIX_HOST.test(t.slice(i, close + 1))) {
        out += ' '
        i = close + 1
        continue
      }
    }
    if (t.startsWith('\\begin{figure', i)) {
      const endFig = t.toLowerCase().indexOf('\\end{figure', i)
      if (endFig > i) {
        const after = t.indexOf('}', endFig)
        out += ' '
        i = after > 0 ? after + 1 : endFig
        continue
      }
    }
    out += t[i]
    i += 1
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim()
}

export function extractMathpixImageUrls(raw) {
  const t = String(raw ?? '')
  const urls = []
  const push = (u) => {
    const clean = cleanMathpixImageUrl(u)
    if (MATHPIX_HOST.test(clean) && (/^https?:\/\//i.test(clean) || isOriginalCropUrl(clean))) urls.push(clean)
  }
  const md = /!\[\s*[^\]]*\]\s*\(\s*(https?:\/\/cdn\.mathpix\.com\/[^\s)]+)/gi
  let m
  while ((m = md.exec(t)) !== null) push(m[1])
  let i = 0
  while (i < t.length) {
    const at = t.indexOf('\\includegraphics', i)
    if (at < 0) break
    const g = consumeIncludeGraphics(t, at)
    if (g?.url) {
      push(g.url)
      i = g.end
      continue
    }
    i = at + 1
  }
  return [...new Set(urls)]
}

/** A cell that is only an axis label, such as $[\mathbf{R}] \longrightarrow$. */
function isAxisLabelStub(text) {
  const raw = String(text ?? '').trim()
  if (!raw || raw.length > 60) return false
  if (/!\[|\\includegraphics/i.test(raw)) return false
  const body = raw.replace(/\$+/g, '').trim()
  return /^(?:\[\s*)?\\mathbf\s*\{[A-Za-z]\}\s*\]?\s*(?:\\(?:longrightarrow|rightarrow)|→)\s*$/.test(body)
    || /^\[\s*[A-Za-z]\s*\]\s*(?:\\(?:longrightarrow|rightarrow)|→)\s*$/.test(body)
}

function optionCropBox(text) {
  const url = extractMathpixImageUrls(text)[0]
  if (!url) return null
  try {
    const u = new URL(url)
    const x = Number(u.searchParams.get('top_left_x'))
    const y = Number(u.searchParams.get('top_left_y'))
    const w = Number(u.searchParams.get('width'))
    const h = Number(u.searchParams.get('height'))
    if (![x, y, w, h].every((n) => Number.isFinite(n) && n > 0)) return null
    return { url, x, y, w, h, page: `${u.origin}${u.pathname}` }
  } catch {
    return null
  }
}

function boxesOverlap(a, b) {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return width > 8 && height > 8
}

/**
 * A 2×2 option table sometimes keeps three graph crops and one axis label
 * where the fourth crop should be. A later check can also blank that crop
 * because its box is not copied verbatim from the scan. The missing picture
 * is the same page scan, in the empty grid cell. The axis words stay inside
 * that picture. A real sentence in the empty cell is left alone.
 * @param {unknown[]} options
 */
export function restoreMissingOptionGridGraphs(options) {
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o ?? ''))
  if (opts.length < 3 || opts.length > 4) return opts
  const boxes = opts.map(optionCropBox)
  const known = boxes.map((box, i) => (box ? { ...box, i } : null)).filter(Boolean)
  if (known.length < 2) return opts
  if (new Set(known.map((b) => b.page)).size !== 1) return opts
  const next = opts.slice()
  let changed = false
  for (let i = 0; i < opts.length; i += 1) {
    if (boxes[i]) continue
    const stub = isAxisLabelStub(opts[i])
    const empty = !opts[i].trim()
    // One blank corner of a 3-crop grid is the dropped graph. Two blanks are not filled.
    if (!stub && !(empty && known.length >= 3)) continue
    const sameRow = known.find((b) => (b.i < 2) === (i < 2))
    const sameCol = known.find((b) => b.i % 2 === i % 2)
    const otherCol = known.filter((b) => b.i % 2 !== i % 2)
    if (!sameRow || !sameCol || !otherCol.length) continue
    const right = sameCol.x + sameCol.w
    const otherRight = Math.max(...otherCol.map((b) => b.x + b.w))
    const x = Math.max(otherRight + 40, sameCol.x - 70)
    const box = { x, y: sameRow.y, w: right - x, h: sameRow.h }
    if (box.w < 80 || box.h < 80) continue
    if (known.some((b) => boxesOverlap(box, b))) continue
    const u = new URL(sameCol.url)
    u.searchParams.set('height', String(Math.round(box.h)))
    u.searchParams.set('width', String(Math.round(box.w)))
    u.searchParams.set('top_left_y', String(Math.round(box.y)))
    u.searchParams.set('top_left_x', String(Math.round(box.x)))
    next[i] = `![](${u.toString()})`
    changed = true
  }
  return changed ? next : opts
}

export function mathpixFiguresSupplyListI(raw) {
  const t = String(raw ?? '')
  if (!hasMathpixMedia(t)) return false
  if (/\\caption\{\s*List-I\s*\}/i.test(t)) return true
  if (/List-I/i.test(t) && /\\caption\{\s*\(\s*[PQRS]\s*\)\s*\}/i.test(t)) return true
  if (/List-I/i.test(t) && extractMathpixImageUrls(t).length >= 2) return true
  return false
}

export function splitMathpixMediaSegments(raw) {
  const t = normalizeBrokenMathpixGraphics(raw)
  if (!hasMathpixMedia(t)) return [{ kind: 'text', value: t }]
  const parts = []
  let last = 0
  let i = 0
  while (i < t.length) {
    if (t.startsWith('![', i) && /cdn\.mathpix\.com/i.test(t.slice(i, i + 120))) {
      const urlM = t.slice(i).match(/^!\[\s*[^\]]*\]\s*\(\s*(https?:\/\/cdn\.mathpix\.com\/[^\s)]+)/i)
      if (urlM) {
        if (i > last) {
          const chunk = t.slice(last, i)
          if (chunk.trim()) parts.push({ kind: 'text', value: chunk })
        }
        const url = cleanMathpixImageUrl(urlM[1])
        const prev = parts[parts.length - 1]
        if (!(prev?.kind === 'img' && prev.value === url)) {
          parts.push({ kind: 'img', value: url })
        }
        last = i + urlM[0].length
        if (t[last] === ')') last += 1
        i = last
        continue
      }
    }
    if (t.startsWith('\\includegraphics', i)) {
      const g = consumeIncludeGraphics(t, i)
      if (g?.url && MATHPIX_HOST.test(g.url)) {
        if (i > last) {
          const chunk = t.slice(last, i)
          if (chunk.trim()) parts.push({ kind: 'text', value: chunk })
        }
        const prev = parts[parts.length - 1]
        if (!(prev?.kind === 'img' && prev.value === g.url)) {
          parts.push({ kind: 'img', value: g.url })
        }
        last = g.end
        i = last
        continue
      }
    }
    i += 1
  }
  if (last < t.length) {
    const tail = t.slice(last)
    if (tail.trim()) parts.push({ kind: 'text', value: tail })
  }
  return parts.length ? parts : [{ kind: 'text', value: t }]
}

/** `![]()`, `![]( )`, and `!][()` are not figures. A real URL is left alone. */
export function stripEmptyImageMarkdown(text) {
  return String(text ?? '')
    .replace(/!\s*\]\s*\[\s*\(\s*\)/g, ' ')
    .replace(/!\[[^\]]*\]\(\s*\)/g, ' ')
}

/**
 * Drop empty figure wrappers. A figure that still has an image keeps that image
 * and its (P)/(1) caption. Does not invent a missing drawing.
 * @param {unknown} text
 */
export function stripEmptyFigureShells(text) {
  let s = String(text ?? '')
  s = s.replace(/\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/gi, (full, body) => {
    if (/\\includegraphics|cdn\.mathpix\.com/i.test(body)) return stripMathpixFigureChrome(full)
    return ' '
  })
  s = s.replace(/\\begin\{figure\*?\}/gi, ' ')
  s = s.replace(/\\end\{figure\*?\}/gi, ' ')
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
}

export function stripMathpixFigureChrome(raw) {
  return String(raw ?? '')
    .replace(/\\begin\{figure\*?\}/gi, ' ')
    .replace(/\\end\{figure\*?\}/gi, ' ')
    .replace(/\\captionsetup\{[^}]*\}/gi, ' ')
    .replace(/\\caption\{\s*List-I\s*\}/gi, '\nList-I\n')
    .replace(/\\caption\{\s*List-II\s*\}/gi, '\nList-II\n')
    .replace(/\\caption\{\s*(\([^)]+\))\s*\}/gi, '\n$1\n')
    .replace(/\\caption\{[^}]*\}/gi, ' ')
    // Keep match-list / MCQ labels; drop other \\item[…] chrome.
    .replace(/\\item\s*\[\s*\(?\s*([PQRS1-5A-D])\s*\)?\s*\]/gi, '\n($1)\n')
    .replace(/\\item\s*\[[^\]]*\]/gi, ' ')
    .replace(/\\begin\{itemize\}/gi, '\n')
    .replace(/\\end\{itemize\}/gi, '\n')
    .replace(/\\textwidth\b/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
