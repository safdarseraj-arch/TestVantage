/**
 * Delayed math for Official PYQ preview. Loaded only after Next has painted
 * plain text — never import this from the tab-click path.
 */

import { useMemo } from 'react'
import { QuestionStem, OptionBody } from '../components/QuestionMediaLite.jsx'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import { looksLikeParagraphPropertyOptions } from '../utils/passage.js'
import { officialPyqCardAsShown } from '../utils/officialPyqCardAsShown.js'
import { formatOfficialPyqAnswerKey, officialPyqCardHasAnswerKey } from '../utils/officialPyqCardEdit.js'
import { isMatrixGridCard } from '../utils/matrixGridPyq.js'
import MatrixGridView from '../components/MatrixGridView.jsx'

export default function OfficialPyqPreviewMath({ q, sourceText = '', sourceTick = 0 }) {
  const { text, options, passage, questionImage, healed, healError } = useMemo(
    () => officialPyqCardAsShown(q, sourceText),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, sourceText, sourceTick],
  )
  // Answer / solution live on the stored card (heal only touches stem + passage).
  const keyCard = healed || q
  const answerKey = officialPyqCardHasAnswerKey(keyCard)
    ? formatOfficialPyqAnswerKey(keyCard)
    : officialPyqCardHasAnswerKey(q)
      ? formatOfficialPyqAnswerKey(q)
      : ''
  const solution = String(keyCard?.solution ?? q?.solution ?? '').trim()
  const flagProblems = q?.adminApproved !== true
  const grid = isMatrixGridCard(q)
  const hidePassageProps = looksLikeParagraphPropertyOptions(options, passage)
  const showOptions =
    !grid &&
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
            parseMatchLists={/List\s*-?\s*I\b/i.test(passage) && /List\s*-?\s*II\b/i.test(passage)}
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
      {grid ? <MatrixGridView question={q} showKey highlightProblems={flagProblems} /> : null}
      {answerKey || solution ? (
        <div className="official-pyq-review-key" data-testid="official-pyq-review-key">
          {answerKey ? (
            <p className="official-pyq-review-answer" data-testid="official-pyq-review-answer">
              <strong>Answer:</strong> {answerKey}
            </p>
          ) : null}
          {solution ? (
            <div className="official-pyq-solution-preview" data-testid="official-pyq-review-solution">
              <span className="metadata-label">Solution</span>
              <QuestionStem
                text={solution}
                options={[]}
                highlightProblems={false}
                className="official-pyq-simple-stem"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
