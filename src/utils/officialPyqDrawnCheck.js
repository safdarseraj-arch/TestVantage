/**
 * Card text as students see it after KaTeX, and the raw code left on it. Shared by the
 * local quality check, the alert list and Compare, so all three judge the same drawing.
 */

import katex from 'katex'
import { convertLatexTabularToArray } from './latexTabularDisplay.js'
import { answerBlanksInMath, prepareTextForMathTextDisplay } from './prepareMathForRender.js'
import { mathDrawFailure } from './mathDrawCheck.js'

const HTML_ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" }

function plainHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? ' ')
}

/**
 * Tables as the student sees them (one row per line, cells split by |, raised
 * text as ^(n+)) and pictures as [picture]. Raw \begin{tabular} hid table mistakes
 * such as "Zn+" for Z^(n+) from the compare.
 * @param {unknown} text
 */
function drawnTablesAndPictures(text) {
  let s = String(text ?? '')
  if (/\\begin\{tabular\}/i.test(s)) {
    try {
      s = convertLatexTabularToArray(s)
    } catch {
      /* keep the raw table */
    }
  }
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, body) =>
    `\n${String(body)
      .split(/<\/tr>/i)
      .map((row) =>
        row
          .split(/<\/td>/i)
          .map((cell) =>
            plainHtml(cell.replace(/<sup>([\s\S]*?)<\/sup>/gi, '^($1)').replace(/<sub>([\s\S]*?)<\/sub>/gi, '_($1)')).trim(),
          )
          .filter(Boolean)
          .join(' | '),
      )
      .filter(Boolean)
      .join('\n')}\n`,
  )
  return withoutDrawnHtml(s)
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, '[picture]')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[picture]')
}

/**
 * A drawing the display already built (the charged-sheet figure, 2025 P2 Q23) is HTML with KaTeX in it.
 * Its hidden MathML keeps the TeX source (`<annotation>+\sigma_{0}</annotation>`), which no one sees.
 * @param {string} s
 */
function withoutDrawnHtml(s) {
  if (!/<(?:div|span)\b/i.test(s)) return s
  return s
    .replace(/<math\b[\s\S]*?<\/math>/gi, '')
    .replace(/<\/?(?:div|span|svg|path|line|br|sup|sub)\b[^>]*>/gi, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/[\u200b\u2061]/g, '')
}

/** The same display preparation MathText runs, so the check judges what students see. Molecules draw separately. */
function preparedLikeCard(text) {
  const raw = String(text ?? '')
  if (!raw.trim()) return raw
  try {
    return raw
      .split(/(<smiles>[\s\S]*?<\/smiles>)/i)
      .map((seg) => (/^<smiles>/i.test(seg) ? seg : prepareTextForMathTextDisplay(seg)))
      .join('')
  } catch {
    return raw
  }
}
/**
 * Card text as students see it: each $…$ drawn by KaTeX and flattened to
 * plain text. KaTeX drops spaces inside math, so `$0.03 \mathrm{M} \mathrm{KMnO}_4$`
 * reads "0.03MKMnO4" here — the stored LaTeX alone hides that.
 * @param {unknown} text
 */
export function officialPyqDrawnText(text) {
  const raw = answerBlanksInMath(drawnTablesAndPictures(preparedLikeCard(text)))
  if (!raw.includes('$')) return raw
  /** @param {string} latex @param {boolean} displayMode @param {string} whole */
  const draw = (latex, displayMode, whole) => {
    try {
      const html = katex.renderToString(latex, {
        output: 'html',
        displayMode,
        throwOnError: false,
        strict: 'ignore',
      })
      if (html.includes('katex-error')) return whole
      return html
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z#0-9]+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? ' ')
        .replace(/[\u200b\u2061]/g, '')
    } catch {
      return whole
    }
  }
  return raw.replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]*)\$/g, (whole, display, inline) => {
    const latex = String(display ?? inline ?? '').trim()
    if (!latex) return ''
    // The card draws an answer blank `$____ \mathrm{cm}$` as a line; KaTeX alone rejects the bare underscores.
    if (/\\underline\{\\hspace\{2em\}\}/.test(latex)) {
      return latex
        .split(/\\underline\{\\hspace\{2em\}\}/)
        .map((piece) => piece.trim())
        .map((piece) => (piece ? draw(piece, false, `$${piece}$`) : ''))
        .join(' ____ ')
        .replace(/\s+/g, ' ')
        .trim()
    }
    const blank = latex.match(/^(?:\\?_\s*){2,}/)
    if (blank) {
      const rest = latex.slice(blank[0].length).trim()
      return rest ? `____ ${draw(rest, false, `$${rest}$`)}` : '____'
    }
    return draw(latex, display != null, whole)
  })
}

/**
 * Raw code a student would see in drawn card text: a broken picture line,
 * a $ formula KaTeX could not draw (e.g. a cut-off \frac), or bare TeX.
 * Complete pictures were already turned into [picture]; molecules draw from <smiles>.
 * @param {unknown} drawn
 * @returns {string[]}
 */
export function officialPyqDrawnRawCode(drawn) {
  const t = String(drawn ?? '').replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' ')
  const out = []
  if (/\\includegraphics|!\[[^\]]*\]\(|\/api\/official-pyq\/original\/crops\//i.test(t)) {
    out.push('a picture line is broken, so the card shows \\includegraphics code instead of the picture')
  }
  const rest = t.replace(/\\includegraphics[^\n]*/gi, ' ')
  if (/\$/.test(rest)) out.push('a formula does not draw (a $ sign or cut-off math shows on the card)')
  else if (/\\[a-zA-Z]{2,}/.test(rest)) out.push(`raw code shows on the card (${rest.match(/\\[a-zA-Z]{2,}/)[0]})`)
  return out
}

/**
 * What a student would see go wrong on the card: math KaTeX cannot draw, raw code or a broken
 * picture line. Empty when the card draws cleanly.
 * @param {any} card
 * @returns {string[]}
 */
export function officialPyqDrawnProblems(card) {
  const parts = [card?.passageText, card?.text, ...(Array.isArray(card?.options) ? card.options : [])].map((p) =>
    String(p ?? ''),
  )
  const out = []
  for (const part of parts) {
    const fail = mathDrawFailure(part)
    if (fail) {
      out.push(`the math does not draw (${fail})`)
      break
    }
  }
  out.push(...officialPyqDrawnRawCode(parts.map((p) => officialPyqDrawnText(p)).join('\n')))
  return out
}
