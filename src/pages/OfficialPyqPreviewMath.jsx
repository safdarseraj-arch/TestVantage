/**
 * Delayed math for Official PYQ preview. Loaded only after Next has painted
 * plain text — never import this from the tab-click path.
 */

import { useMemo } from 'react'
import { QuestionStem, OptionBody } from '../components/QuestionMediaLite.jsx'
import { healUploadQuestionCard } from '../utils/uploadQualityGuards.js'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import { extractMathpixImageUrls } from '../utils/mathpixMedia.js'
import {
  looksLikeParagraphPropertyOptions,
  officialPyqCardAllowsPassage,
  peelOfficialPyqCardForDisplay,
} from '../utils/passage.js'

export default function OfficialPyqPreviewMath({ q, sourceText: rawSourceText = '', sourceTick = 0 }) {
  const sourceText = q?.adminEdited === true ? '' : rawSourceText
  const healed = useMemo(() => {
    try {
      return peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, sourceText), sourceText)
    } catch (err) {
      console.error('Official PYQ preview heal failed', err)
      return {
        ...(q && typeof q === 'object' ? q : {}),
        text: String(q?.text ?? q?.stem ?? ''),
        options: Array.isArray(q?.options) ? q.options : [],
        _previewHealError: err instanceof Error ? err.message : String(err),
      }
    }
  }, [q, sourceText, sourceTick])
  const options = Array.isArray(healed?.options) ? healed.options : []
  const text = String(healed?.text ?? healed?.stem ?? '')
  const adminPassage = q?.passageSource === 'admin_facts' || q?.passageSource === 'admin_edit'
  const storedPass = String((adminPassage ? q?.passageText : healed?.passageText) ?? '').trim()
  const passage = adminPassage || officialPyqCardAllowsPassage(healed, sourceText)
    ? storedPass
    : String(sourceText ?? '').length < 40
      ? storedPass
      : ''
  const hidePassageProps = looksLikeParagraphPropertyOptions(options, passage)
  const showOptions =
    !hidePassageProps &&
    options.some((o) => String(o ?? '').trim()) &&
    !matchOptionsFoldedIntoLists(text, options)
  const questionImage = extractMathpixImageUrls(text).length
    ? undefined
    : String(healed?.questionImage ?? q?.questionImage ?? '').trim() || undefined
  const healError = String(healed?._previewHealError ?? '').trim()
  return (
    <>
      {healError ? (
        <p className="upload-error" role="alert">
          Preview clean-up hit an error: {healError}. Showing the stored question text.
        </p>
      ) : null}
      {passage ? (
        <div className="passage-block official-pyq-passage">
          <h3 className="official-pyq-passage-heading">Passage / Comprehension</h3>
          <QuestionStem
            text={passage}
            options={[]}
            parseMatchLists={false}
            highlightProblems
            className="official-pyq-simple-stem"
          />
        </div>
      ) : null}
      <QuestionStem
        text={text}
        options={options}
        questionImage={questionImage}
        highlightProblems
        className="official-pyq-simple-stem"
      />
      {showOptions ? (
        <ol className="official-pyq-options" type="A">
          {options.map((opt, oi) => {
            const shown = String(opt ?? '').trim()
            return shown ? (
              <li key={oi}>
                <OptionBody text={shown} highlightProblems />
              </li>
            ) : null
          })}
        </ol>
      ) : null}
    </>
  )
}
