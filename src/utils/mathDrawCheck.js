import katex from 'katex'
import { convertLatexTabularToArray } from './latexTabularDisplay.js'
import { prepareTextForMathTextDisplay } from './prepareMathForRender.js'

/**
 * A real draw failure: KaTeX rejects the math, or a TeX command is still
 * sitting outside math after the pieces that do draw are removed.
 * Raw HTML and a raw tabular environment are failures too.
 * @param {unknown} text
 * @returns {string}
 */
export function mathDrawFailure(text) {
  let raw = String(text ?? '')
  if (!raw.trim()) return ''
  // MathText draws its own reaction-align blocks; "2<P<8" in math is not a <p> tag.
  const htmlLeft = raw.replace(/<div class="reaction-align"[\s\S]*?<\/div>/gi, ' ')
  if (/<(?:div|table|span|br|p|td|tr)(?:\s[^<>]*)?\/?>/i.test(htmlLeft)) return 'raw HTML'
  try {
    raw = prepareTextForMathTextDisplay(raw)
      .replace(/<annotation\b[\s\S]*?<\/annotation>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  } catch {
    /* judge the stored text */
  }
  if (/\\begin\{tabular\}/i.test(raw)) {
    raw = convertLatexTabularToArray(raw)
    if (/\\begin\{tabular\}/i.test(raw)) return 'tabular source'
  }
  let rest = raw
  const segs = [...raw.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g)]
  for (const seg of segs) {
    const display = seg[0].startsWith('$$')
    const latex = (display ? seg[0].slice(2, -2) : seg[0].slice(1, -1)).trim()
    if (!latex) {
      rest = rest.replace(seg[0], ' ')
      continue
    }
    if (/\\[a-zA-Z]/.test(latex) || /[_^]/.test(latex) || display) {
      if (!katexDraws(latex, display)) return 'draw failure'
    }
    rest = rest.replace(seg[0], ' ')
  }
  if (/\\(?:frac|dfrac|mathrm|mathbf|mathbb|xrightarrow|begin|end|epsilon|text|left|right)\b/.test(rest)) {
    return 'leftover TeX'
  }
  return ''
}

function katexDraws(latex, displayMode) {
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: Boolean(displayMode),
      strict: 'ignore',
    })
    return Boolean(html) && !html.includes('katex-error')
  } catch {
    return false
  }
}
