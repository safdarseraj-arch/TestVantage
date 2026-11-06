import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem/mhchem.js'
import { prepareTextForMathTextDisplay, stripLatexDisplayChrome, normalizeSplitMathDollars } from '../utils/prepareMathForRender'
import { keepStructuredQuestionLines } from '../utils/repairMatrixStem.js'
import {
  convertLatexTabularToArray,
  splitMatchColumnTables,
  stripDollarsInsideLatexEnvs,
} from '../utils/latexTabularDisplay.js'
import { wrapBareLatexRuns, repairOrphanAlignedBody } from '../utils/wrapBareLatexRuns.js'
import { hasMathpixMedia, splitMathpixMediaSegments, stripMathpixFigureChrome } from '../utils/mathpixMedia'
import { figureRowShare, groupSideBySideFigureSegments } from '../utils/figureLayout.js'
import { splitSmilesDisplaySegments } from '../utils/smilesDisplay.js'
import { displayMathStandsAlone } from '../utils/sanitizeMathDelimiters.js'
import SmilesStructure from './SmilesStructure.jsx'
import {
  embedInlineLatexInProse,
  isEnglishHeavyMath,
  repairGluedEnglishProse,
  splitBareProseFromLatex,
  unwrapEnglishDollarBlocks,
} from '../utils/fixRunawayInlineMath'

/** Insert spaces between adjacent math/prose parts when the source string omitted them */
function needsSpaceBefore(part, prev) {
  if (!prev || !part) return false
  const p = part.trim()
  const c = prev.trim()
  if (!p || !c) return false
  if (c.endsWith('$') && !p.startsWith('$')) return true
  if (/[a-z0-9)]$/i.test(c) && /^[a-z]/i.test(p)) return true
  return false
}

/** Split English glued inside a single $…$ block (before \frac, etc.) */
function renderMixedProseMath(latex, key, depth) {
  const repaired = repairGluedEnglishProse(latex)
  const fracIdx = repaired.search(/\\(?:frac|left|det)/)
  if (fracIdx > 0 && /then|absolute|value|of/i.test(repaired.slice(0, fracIdx))) {
    const prose = repaired.slice(0, fracIdx).trim()
    const math = repaired.slice(fracIdx).trim()
    return (
      <span key={key} className="math-mixed-prose-math">
        <span className="math-prose-chunk">{prose} </span>
        {renderPart(`$${math}$`, `${key}-m`, depth + 1)}
      </span>
    )
  }
  return null
}

/** Last-resort prose when KaTeX rejects a fragment — never show `\rightarrow` or raw `\log`. */
function readableLatexFallback(latex) {
  return stripLatexDisplayChrome(repairOrphanAlignedBody(String(latex ?? '')))
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\quad\b/g, ' ')
    .replace(/\\qquad\b/g, ' ')
    .replace(/\\right\b/g, '')
    .replace(/\\left\b/g, '')
    .replace(/\\r(?![a-zA-Z])/g, '')
    .replace(/\\times\b/g, '×')
    .replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)')
    .replace(/\\log\s*(?:_\{([^{}]+)\})?/g, (_, b) => (b ? `log_${b}` : 'log'))
    .replace(/\\ln\b/g, 'ln')
    .replace(/\\begin\{(?:tabular|array|cases|aligned|align\*?|eqnarray)\}(\[[^\]]*\])?(\{[^}]*\})?/g, '')
    .replace(/\\end\{(?:tabular|array|cases|aligned|align\*?|eqnarray)\}/g, '')
    .replace(/\\\\/g, ' ')
    .replace(/(^|\s)&\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Prefer wrap-in-$$ + KaTeX over hiding \\begin{array|cases|tabular}. */
function tryRenderDisplayEnv(latex) {
  let body = convertLatexTabularToArray(String(latex ?? ''))
  body = stripDollarsInsideLatexEnvs(body)
  body = body.replace(/^\$+|\$+$/g, '').trim()
  if (!/\\begin\{(?:array|cases|tabular|matrix|bmatrix|pmatrix|vmatrix|aligned)\}/.test(body)) {
    const repaired = repairOrphanAlignedBody(body)
    if (repaired !== body) {
      body = repaired.replace(/^\$+|\$+$/g, '').trim()
    }
  }
  if (!/\\begin\{(?:array|cases|tabular|matrix|bmatrix|pmatrix|vmatrix|aligned)\}/.test(body)) {
    return null
  }
  return renderLatexToHtml(body, true)
}

function renderLatexToHtml(latex, displayMode = false) {
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode,
    })
    if (html.includes('katex-error')) return null
    return html
  } catch {
    return null
  }
}

function tryRenderBareLatex(part) {
  const trimmed = part.trim()
  if (!trimmed.includes('\\')) return null

  const envHtml = tryRenderDisplayEnv(trimmed)
  if (envHtml) return envHtml

  // English + cut-off \\frac must not be forced through KaTeX as one blob.
  if (
    /\b(?:be|such|that|let|the|and|with|then)\b/i.test(trimmed) &&
    /[a-z]{3,}\s+[a-z]{3,}/i.test(trimmed) &&
    !/\\(?:mathrm|text|begin)\{/.test(trimmed)
  ) {
    return null
  }

  const displayMatrix = /\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|array|cases|tabular)\}/.test(trimmed)
  const inline =
    /\\(?:frac|sqrt|hat|vec|left|mathrm|operatorname|begin|text)\{/.test(trimmed) ||
    /\\left\[\\begin\{/.test(trimmed) ||
    /\\begin\{(?:array|cases|tabular)\}/.test(trimmed) ||
    /\\rightarrow\b/.test(trimmed)

  if (!displayMatrix && !inline) return null

  return renderLatexToHtml(trimmed, displayMatrix)
}

function renderPart(part, key, depth = 0) {
  if (depth > 6) {
    return <span key={key}>{part}</span>
  }
  const isInline = part.startsWith('$') && part.endsWith('$') && part.length >= 3 && !part.startsWith('$$')
  const isDisplay = part.startsWith('$$') && part.endsWith('$$') && part.length >= 4
  if (!isInline && !isDisplay) {
    const bareSplit = splitBareProseFromLatex(part)
    if (bareSplit) {
      return (
        <span key={key} className="math-mixed-prose-math">
          <span className="math-prose-chunk">{bareSplit.prose} </span>
          {renderPart(`$${bareSplit.math}$`, `${key}-b`, depth + 1)}
          {bareSplit.suffix ? (
            <span className="math-prose-chunk"> {bareSplit.suffix}</span>
          ) : null}
        </span>
      )
    }

    const bareHtml = tryRenderBareLatex(part)
    if (bareHtml) {
      return (
        <span
          key={key}
          className="math-inline"
          dangerouslySetInnerHTML={{ __html: bareHtml }}
        />
      )
    }
    if (/\\(?:mathrm|text|begin)\{/.test(part) && depth < 5) {
      const wrapped = wrapBareLatexRuns(stripLatexDisplayChrome(part))
      if (wrapped !== part && wrapped.includes('$')) {
        return renderPart(wrapped, key, depth + 1)
      }
    }
    const prose = repairGluedEnglishProse(part)
    const shown = /\\(?:rightarrow|left|right|quad|times|mathrm|text|begin|caption|hline|item)\b/.test(prose)
      ? readableLatexFallback(prose)
      : prose
    return <span key={key} className="math-prose-chunk">{shown}</span>
  }
  const latex = isDisplay ? part.slice(2, -2) : part.slice(1, -1)
  const needsDisplayMatrix =
    /\\begin\{(?:bmatrix|pmatrix|matrix|vmatrix|array|cases|aligned|align\*?|eqnarray)\}/.test(latex)
  const ownLine = isDisplay && displayMathStandsAlone(latex)

  if (!needsDisplayMatrix && !ownLine) {
    const mixed = renderMixedProseMath(latex, key, depth)
    if (mixed) return mixed
  }

  if (isDisplay && /\\end\{bmatrix\}/.test(latex)) {
    const tailMatch = latex.match(
      /^(A\s*=\s*\\begin\{bmatrix\}[\s\S]*?\\end\{bmatrix\})\s+(then\s+absolute\s+value\s+of\s+[\s\S]*)$/i,
    )
    if (tailMatch) {
      const tail = tailMatch[2].trim()
      const tailSplit = splitBareProseFromLatex(tail)
      return (
        <span key={key} className="math-matrix-stem-tail">
          {renderPart(`$$${tailMatch[1]}$$`, `${key}-m`, depth + 1)}
          {tailSplit ? (
            <>
              <span className="math-prose-chunk"> {tailSplit.prose} </span>
              {renderPart(`$${tailSplit.math}$`, `${key}-f`, depth + 1)}
              {tailSplit.suffix ? (
                <span className="math-prose-chunk"> {tailSplit.suffix}</span>
              ) : null}
            </>
          ) : (
            <span className="math-prose-chunk"> {tail} </span>
          )}
        </span>
      )
    }
  }

  if (isEnglishHeavyMath(latex) && !needsDisplayMatrix) {
    const fixed = embedInlineLatexInProse(`$${latex}$`)
    const segments = splitMathSegments(unwrapEnglishDollarBlocks(fixed))
    if (segments.every((p) => !p.startsWith('$') || !isEnglishHeavyMath(p.slice(1, -1)))) {
      return (
        <span key={key} className="math-plain-prose">
          {segments.map((p, j) => renderPart(p, `${key}-p${j}`, depth + 1))}
        </span>
      )
    }
    const fallback = repairGluedEnglishProse(latex)
    return <span key={key} className="math-prose-chunk">{fallback.replace(/\\angle\b/g, '∠')}</span>
  }
  try {
    const html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: isDisplay || needsDisplayMatrix,
    })
    // Never paint KaTeX red error underlines — never dump raw \rightarrow either.
    if (html.includes('katex-error')) {
      const envHtml = tryRenderDisplayEnv(latex)
      if (envHtml) {
        return (
          <span
            key={key}
            className="math-display"
            dangerouslySetInnerHTML={{ __html: envHtml }}
          />
        )
      }
      return <span key={key} className="math-prose-chunk">{readableLatexFallback(latex)}</span>
    }
    return (
      <span
        key={key}
        className={
          ownLine || /\\begin\{(?:array|aligned|tabular)\}|\\hline\b|\\xrightarrow\b/.test(latex)
            ? 'math-display math-display-block'
            : isDisplay || needsDisplayMatrix
              ? 'math-display'
              : 'math-inline'
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  } catch {
    const envHtml = tryRenderDisplayEnv(latex)
    if (envHtml) {
      return (
        <span
          key={key}
          className="math-display"
          dangerouslySetInnerHTML={{ __html: envHtml }}
        />
      )
    }
    return <span key={key} className="math-prose-chunk">{readableLatexFallback(latex)}</span>
  }
}

/** Split $...$ / $$...$$ from Mathpix / OCR output */
function splitMathSegments(text) {
  const keepStepLines = keepStructuredQuestionLines(text)
  const normalized = normalizeSplitMathDollars(text, { keepLineBreaks: keepStepLines })

  const parts = []
  let i = 0
  while (i < normalized.length) {
    if (normalized.startsWith('$$', i)) {
      const end = normalized.indexOf('$$', i + 2)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 2))
        i = end + 2
        continue
      }
    }
    if (normalized[i] === '$') {
      const end = normalized.indexOf('$', i + 1)
      if (end !== -1) {
        parts.push(normalized.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const nextD = normalized.indexOf('$$', i)
    const nextS = normalized.indexOf('$', i)
    let next = normalized.length
    if (nextD !== -1) next = Math.min(next, nextD)
    if (nextS !== -1) next = Math.min(next, nextS)
    if (next > i) parts.push(normalized.slice(i, next))
    i = next === i ? i + 1 : next
  }
  return parts.filter((p) => p.length > 0)
}

function renderPreparedMath(text, questionContext, optionLetter) {
  let prepared = prepareTextForMathTextDisplay(text ?? '', {
    questionContext,
    optionLetter,
  })
  prepared = wrapBareLatexRuns(repairOrphanAlignedBody(prepared))
  prepared = stripLatexDisplayChrome(prepared)
  if (
    !/\\begin\{(?:bmatrix|pmatrix|vmatrix|aligned|align\*?|array|cases)\}|\\operatorname\b/.test(
      prepared,
    )
  ) {
    prepared = unwrapEnglishDollarBlocks(prepared)
  }
  const parts = splitMathSegments(prepared)
  return (
    <span className="math-text-flow">
      {parts.map((part, i) => (
        <span key={i} className="math-flow-segment">
          {i > 0 && needsSpaceBefore(part, parts[i - 1]) ? ' ' : null}
          {renderSegmentBody(part, i)}
        </span>
      ))}
    </span>
  )
}

function nextDrawnHtmlBlock(text, from) {
  const tableAt = text.indexOf('<table class="paper-data-table"', from)
  const sheetAt = text.indexOf('<div class="sheet-config-pair"', from)
  const reactionAt = text.indexOf('<div class="reaction-align"', from)
  const spots = [tableAt, sheetAt, reactionAt].filter((n) => n >= 0)
  const at = spots.length ? Math.min(...spots) : -1
  if (at < 0) return null
  if (at === tableAt) {
    const end = text.indexOf('</table>', at)
    if (end < 0) return null
    return { start: at, end: end + '</table>'.length }
  }
  let i = at
  let depth = 0
  while (i < text.length) {
    if (text.startsWith('<div', i)) {
      depth += 1
      i += 4
      continue
    }
    if (text.startsWith('</div>', i)) {
      depth -= 1
      i += 6
      if (depth === 0) return { start: at, end: i }
      continue
    }
    i += 1
  }
  return null
}

/** A drawn data table or sheet figure stays HTML. The sentence after it starts on the next line. */
function renderSegmentBody(part, key) {
  const raw = String(part ?? '')
  if (!raw.includes('paper-data-table') && !raw.includes('sheet-config-pair') && !raw.includes('reaction-align')) {
    return renderPart(part, key, 0)
  }
  const nodes = []
  let last = 0
  let n = 0
  while (last < raw.length) {
    const block = nextDrawnHtmlBlock(raw, last)
    if (!block) break
    if (block.start > last) {
      nodes.push(
        <span key={`${key}-p${n}`}>{renderPart(raw.slice(last, block.start), `${key}-p${n}`, 0)}</span>,
      )
    }
    nodes.push(
      <span
        key={`${key}-html${n}`}
        style={{ display: 'block' }}
        dangerouslySetInnerHTML={{ __html: raw.slice(block.start, block.end) }}
      />,
    )
    last = block.end
    n += 1
  }
  if (last < raw.length) {
    nodes.push(
      <span key={`${key}-p${n}`}>{renderPart(raw.slice(last), `${key}-p${n}`, 0)}</span>,
    )
  }
  return <span key={key}>{nodes}</span>
}

export default function MathText({ text, questionContext, optionLetter }) {
  const raw = String(text ?? '')
  const matchTables = splitMatchColumnTables(raw)
  if (matchTables) {
    return (
      <span className="math-text-flow">
        {matchTables.map((part, i) =>
          part.kind === 'html' ? (
            <span
              key={`mt-${i}`}
              className="match-columns-table-wrap"
              style={{ display: 'block', overflowX: 'auto' }}
              dangerouslySetInnerHTML={{ __html: part.value }}
            />
          ) : (
            <MathText key={`tx-${i}`} text={part.value} questionContext={questionContext} optionLetter={optionLetter} />
          ),
        )}
      </span>
    )
  }
  if (/<smiles>/i.test(raw)) {
    const segs = splitSmilesDisplaySegments(raw)
    const looping =
      segs.length === 1 &&
      segs[0].kind === 'text' &&
      /<smiles>/i.test(String(segs[0].value ?? ''))
    if (looping) {
      return renderPreparedMath(
        raw.replace(/<\/?smiles>/gi, ''),
        questionContext,
        optionLetter,
      )
    }
    return (
      <span className="math-text-flow math-text-with-smiles">
        {segs.map((seg, i) =>
          seg.kind === 'smiles' ? (
            <SmilesStructure key={`smi-${i}`} smiles={seg.value} />
          ) : (
            <span key={`tx-${i}`}>
              {renderPreparedMath(
                String(seg.value ?? '').replace(/<\/?smiles>/gi, ''),
                questionContext,
                optionLetter,
              )}
            </span>
          ),
        )}
      </span>
    )
  }
  if (hasMathpixMedia(raw)) {
    return (
      <span className="math-text-flow math-text-with-figures">
        {groupSideBySideFigureSegments(splitMathpixMediaSegments(raw), stripMathpixFigureChrome).map((seg, i) =>
          seg.kind === 'row' ? (
            <span key={`row-${i}`} className="mathpix-figure-row" data-testid="mathpix-figure-row">
              {seg.value.map((fig, j) => (
                <img
                  key={`fig-${i}-${j}`}
                  className="mathpix-paper-figure"
                  src={fig.url}
                  alt=""
                  style={{ maxWidth: `calc(${figureRowShare(seg.value, j)}% - 0.75rem)` }}
                />
              ))}
            </span>
          ) : seg.kind === 'img' ? (
            <img
              key={`fig-${i}`}
              className="mathpix-paper-figure"
              src={seg.value}
              alt=""
            />
          ) : (
            <span key={`tx-${i}`}>
              {renderPreparedMath(stripMathpixFigureChrome(seg.value), questionContext, optionLetter)}
            </span>
          ),
        )}
      </span>
    )
  }
  return renderPreparedMath(raw, questionContext, optionLetter)
}
