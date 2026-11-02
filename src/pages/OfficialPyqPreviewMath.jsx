/**
 * Delayed math for Official PYQ preview. Loaded only after Next has painted
 * plain text — never import this from the tab-click path.
 */

import { useMemo } from 'react'
import { QuestionStem, OptionBody } from '../components/QuestionMediaLite.jsx'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import { looksLikeParagraphPropertyOptions } from '../utils/passage.js'
import { officialPyqCardAsShown } from '../utils/officialPyqCardAsShown.js'

export default function OfficialPyqPreviewMath({ q, sourceText = '', sourceTick = 0 }) {
  const { text, options, passage, questionImage, healError } = useMemo(
    () => officialPyqCardAsShown(q, sourceText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, sourceText, sourceTick],
  )
  const flagProblems = q?.adminApproved !== true
  const hidePassageProps = looksLikeParagraphPropertyOptions(options, passage)
  const showOptions =
    !hidePassageProps &&
    options.some((o) => String(o ?? '').trim()) &&
    !matchOptionsFoldedIntoLists(text, options)
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
            highlightProblems={flagProblems}
            className="official-pyq-simple-stem"
          />
        </div>
      ) : null}
      <QuestionStem
        text={text}
        options={options}
        questionImage={questionImage}
        highlightProblems={flagProblems}
        className="official-pyq-simple-stem"
      />
      {showOptions ? (
        <ol className="official-pyq-options" type="A">
          {options.map((opt, oi) => {
            const shown = String(opt ?? '').trim()
            return shown ? (
              <li key={oi}>
                <OptionBody text={shown} highlightProblems={flagProblems} />
              </li>
            ) : null
          })}
        </ol>
      ) : null}
    </>
  )
}
