/**
 * Official PYQ preview only — MathText + match lists.
 * Must not import graphOptionOcr, Mathpix, or per-question OCR repairs.
 */

import MathText from './MathText'
import MatchListDisplay from './MatchListDisplay'
import {
  parseMatchingListForDisplay,
  rewriteLatexItemLabels,
} from '../utils/parseMatchingListDisplay.js'
import { latexExtractionIncomplete } from '../utils/healTruncatedLatex.js'
import { findOptionsBlockStart } from '../utils/mcqOptionMarkers.js'
import { stripTrailingPyqSectionHeader } from '../utils/bulkExtractClean.js'
import { convertLatexTabularToArray } from '../utils/latexTabularDisplay.js'
import { reviewMarkSpans, sliceTextByFlagSpans } from '../utils/officialPyqReviewFlags.js'
import { sanitizeStemForDisplay, shownStemLooksIncomplete } from '../utils/sanitizeStemForDisplay.js'
import { stripLeakedOptionsFromStem } from '../utils/stripLeakedOptionsFromStem.js'
import { stripTrailingOptionMarkerFromStem } from '../utils/optionStemLeak.js'

const FLAG_MARK_STYLE = {
  background: '#fecaca',
  color: '#7f1d1d',
  padding: '0 0.15em',
  borderRadius: '0.2em',
}

/** A complete table that KaTeX can draw must stay a table, not raw source. */
function tableDraws(text) {
  const raw = String(text ?? '')
  if (!/\\begin\{tabular\}/i.test(raw) || !/\\end\{tabular\}/i.test(raw)) return false
  try {
    const shown = convertLatexTabularToArray(raw)
    return (
      (/\\begin\{array\}/.test(shown) || /class="paper-data-table"/.test(shown)) &&
      !/\\begin\{tabular\}/i.test(shown)
    )
  } catch {
    return false
  }
}

function ProblemMarkedText({ text, options }) {
  const raw = String(text ?? '')
  const spans = reviewMarkSpans(raw, options)
  if (!spans.length) return <MathText text={raw} />
  const parts = sliceTextByFlagSpans(raw, spans)
  return (
    <span className="math-text-flow">
      {parts.map((part, i) =>
        part.flag && !tableDraws(part.text) ? (
          <mark
            key={`flag-${i}`}
            data-testid="official-pyq-flag-mark"
            title="This part is the problem"
            style={FLAG_MARK_STYLE}
          >
            {part.text}
          </mark>
        ) : (
          <MathText key={`ok-${i}`} text={part.text} />
        ),
      )}
    </span>
  )
}

function stemTextForPreview(text, options = []) {
  let t = sanitizeStemForDisplay(text, options)
  if (!parseMatchingListForDisplay(t, options)) {
    /** Only a card that draws its own options may lose an option list in its text; a passage has none (2012 P2 Q13). */
    const hasOptions = (Array.isArray(options) ? options : []).filter((o) => String(o ?? '').trim()).length >= 2
    const optStart = hasOptions ? findOptionsBlockStart(t) : -1
    if (optStart > 40) t = t.slice(0, optStart).trim()
    t = stripTrailingOptionMarkerFromStem(stripLeakedOptionsFromStem(t, options), options)
  }
  return t
}

export function QuestionStem({
  text,
  questionImage,
  hideTextWithImage = false,
  className = 'question-text',
  layout = 'split',
  imageFirst = true,
  options = [],
  parseMatchLists = true,
  highlightProblems = false,
}) {
  const sanitized = sanitizeStemForDisplay(text ?? '', options)
  const parsedLists = parseMatchingListForDisplay(sanitized, options)
  const showMatchLayout = Boolean(parseMatchLists && parsedLists?.listI?.length)
  const extractionIncomplete = shownStemLooksIncomplete(sanitized, options)
  const previewText = showMatchLayout ? parsedLists.intro : stemTextForPreview(sanitized, options)
  const displayText =
    !showMatchLayout &&
    latexExtractionIncomplete(previewText) &&
    !latexExtractionIncomplete(sanitized)
      ? sanitized
      : previewText
  const hasText = showMatchLayout
    ? Boolean(parsedLists.intro?.trim() || parsedLists.listI.length)
    : Boolean(displayText?.trim() && displayText.trim() !== '(Image question)')
  const showImage = Boolean(questionImage?.trim())
  const showText = hasText && !(hideTextWithImage && showImage)
  const splitLayout = layout === 'split' && showImage && showText
  const imgAlt =
    displayText?.trim() && displayText.length < 240
      ? displayText.replace(/\$+/g, '').trim()
      : 'Question diagram'

  const diagram = showImage ? (
    <div className="question-stem-diagram">
      <img
        src={questionImage}
        alt={imgAlt}
        className="question-content-img question-stem-img"
      />
    </div>
  ) : null

  const copy = showText ? (
    <div className="question-stem-copy">
      {extractionIncomplete ? (
        <p className="extraction-incomplete-flag" role="status">
          Extraction incomplete — do not approve
        </p>
      ) : null}
      {highlightProblems && reviewMarkSpans(sanitized, options).length ? (
        <ProblemMarkedText text={sanitized} options={options} />
      ) : showMatchLayout ? (
        <MatchListDisplay parsed={parsedLists} />
      ) : (
        <MathText key={displayText} text={displayText} />
      )}
    </div>
  ) : null

  if (!diagram && !copy) return null

  if (!splitLayout) {
    const first = imageFirst ? diagram : copy
    const second = imageFirst ? copy : diagram
    return (
      <div className={className}>
        {first}
        {second}
      </div>
    )
  }

  return (
    <div className={`${className} question-stem-split`}>
      {imageFirst ? (
        <>
          {diagram}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {diagram}
        </>
      )}
    </div>
  )
}

export function OptionBody({ text, highlightProblems = false }) {
  const displayText = stripTrailingPyqSectionHeader(rewriteLatexItemLabels(String(text ?? ''))).trim()
  if (!displayText) return null
  if (highlightProblems && reviewMarkSpans(displayText).length) {
    return <ProblemMarkedText text={displayText} />
  }
  return <MathText text={displayText} />
}
