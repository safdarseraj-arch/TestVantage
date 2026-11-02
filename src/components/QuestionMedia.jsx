import MathText from './MathText'
import MatchListDisplay from './MatchListDisplay'
import { parseMatchingListForDisplay } from '../utils/parseMatchingListDisplay.js'
import { latexExtractionIncomplete } from '../utils/healTruncatedLatex.js'
import { dedupeRepeatedStemPhrase } from '../utils/dedupeStemText.js'
import { findOptionsBlockStart } from '../utils/mcqOptionMarkers.js'
import { buildMcqPreviewContext } from '../utils/repairMcqOption'
import { optionTextForDisplay, verbalGraphOptionAltText } from '../utils/graphOptionOcr.js'
import { stripLeakedOptionsFromStem } from '../utils/stripLeakedOptionsFromStem.js'
import { stripTrailingOptionMarkerFromStem } from '../utils/optionStemLeak.js'
import {
  countRealMcqOptions,
  stemLikelyNeedsDiagramImage,
} from '../utils/stemDiagramDetect.js'
import { sanitizeStemForDisplay } from '../utils/sanitizeStemForDisplay.js'

/** Stem preview only — hide (A)–(D) block. Keep List-I / Column I markers. */
function stemTextForPreview(text, options = []) {
  let t = sanitizeStemForDisplay(text, options)
  if (!parseMatchingListForDisplay(t, options)) {
    const mcqCount = countRealMcqOptions(t, options)
    if (mcqCount >= 2) {
      const optStart = findOptionsBlockStart(t)
      if (optStart > 40) t = t.slice(0, optStart).trim()
    }
    t = stripTrailingOptionMarkerFromStem(stripLeakedOptionsFromStem(t, options), options)
  }
  if (stemLikelyNeedsDiagramImage(t)) return t
  const deduped = dedupeRepeatedStemPhrase(t)
  if (
    deduped.length < t.length * 0.55 &&
    /^(?:\)|\.{2,}|defined\b|forall\b)/i.test(deduped.trim())
  ) {
    return t
  }
  if (/\bis\s+equal\s+to\b/i.test(t) && !/\bis\s+equal\s+to\b/i.test(deduped)) {
    return t
  }
  return deduped
}

/**
 * Question stem — text and/or image (hybrid mode).
 * @param {{
 *   text?: string
 *   questionImage?: string
 *   hideTextWithImage?: boolean
 *   className?: string
 *   layout?: 'split' | 'inline'
 *   imageFirst?: boolean
 *   options?: string[]
 *   parseMatchLists?: boolean
 * }} props
 */
export function QuestionStem({
  text,
  questionImage,
  hideTextWithImage = false,
  className = 'question-text',
  layout = 'split',
  imageFirst = true,
  options = [],
  parseMatchLists = true,
}) {
  const sanitized = sanitizeStemForDisplay(text ?? '', options)
  const parsedLists = parseMatchingListForDisplay(sanitized, options)
  const showMatchLayout = Boolean(parseMatchLists && parsedLists?.listI?.length)
  const extractionIncomplete = latexExtractionIncomplete(sanitized)
  const previewText = showMatchLayout
    ? parsedLists.intro
    : parsedLists && !parseMatchLists
      ? stemTextForPreview(parsedLists.intro, options)
      : stemTextForPreview(sanitized, options)
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
      {showMatchLayout ? (
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

/**
 * Option body — image per option, shared options image, or text.
 * @param {Object} props
 * @param {string} [props.text]
 * @param {string} [props.optionImage]
 * @param {boolean} [props.imageOnly]
 * @param {string} [props.questionText]
 * @param {string[]} [props.allOptions]
 * @param {string} [props.optionLetter]
 */
export function OptionBody({
  text,
  optionImage,
  imageOnly = false,
  questionText = '',
  allOptions = [],
  optionLetter = '',
}) {
  const displayText = optionTextForDisplay(text, !!optionImage, questionText)
  const alt =
    verbalGraphOptionAltText(text) ||
    (optionLetter ? `Option ${optionLetter} graph` : 'Option graph')
  if (optionImage && !displayText) {
    return <img src={optionImage} alt={alt} className="question-content-img option-content-img" />
  }
  if (optionImage && displayText) {
    const questionContext = buildMcqPreviewContext({ questionText, options: allOptions })
    return (
      <>
        <img src={optionImage} alt={alt} className="question-content-img option-content-img" />
        <MathText text={displayText} questionContext={questionContext} optionLetter={optionLetter} />
      </>
    )
  }
  if (imageOnly) return null
  // Missing crop: never pretend a verbal "[Graph A: …]" description is the graph.
  if (!displayText) return null
  const questionContext = buildMcqPreviewContext({
    questionText,
    options: allOptions,
  })
  return (
    <MathText
      text={displayText}
      questionContext={questionContext}
      optionLetter={optionLetter}
    />
  )
}

/**
 * Solution block — text and/or image.
 * @param {{ solution?: string, solutionImage?: string }} props
 */
export function SolutionMedia({ solution, solutionImage }) {
  if (!solution?.trim() && !solutionImage) {
    return <p className="form-hint">No solution uploaded for this question.</p>
  }
  return (
    <>
      {solutionImage && (
        <img
          src={solutionImage}
          alt="Solution"
          className="question-content-img solution-content-img"
        />
      )}
      {solution?.trim() && <MathText text={solution} />}
    </>
  )
}
