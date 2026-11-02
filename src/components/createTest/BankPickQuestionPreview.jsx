import MathText from '../MathText'
import { OptionBody, QuestionStem } from '../QuestionMedia'
import { effectiveQuestionTypeId } from '../../utils/bankListFilters'
import { getMatrixColHeadLabels, inferMatrixColCount, MATRIX_ROW_COUNT } from '../../utils/matrixMatch'
import { matrixRowsForUi, trimRowColumnIIBleed } from '../../utils/parseMatchColumnUpload'
import { shouldShowQuestionStemImage } from '../../utils/stemDiagramDetect.js'

/** @param {string} text */
function isMatrixStubStem(text) {
  const t = String(text ?? '')
    .trim()
    .replace(/\$/g, '')
  if (!t) return true
  return /^(?:match\s+(?:the\s+)?column|column[\s-]*i\s*column[\s-]*ii)/i.test(t)
}

/**
 * Full read-only preview for Create Test bank picker (incl. matrix match columns).
 * @param {{ question: import('../data/tests').Question, showAllOptionSlots?: boolean }} props
 */
export default function BankPickQuestionPreview({ question, showAllOptionSlots = false }) {
  const type = effectiveQuestionTypeId(question)
  const stem = String(question.text ?? '').trim()

  if (type === 'matrix_match') {
    const rows = matrixRowsForUi(
      (question.matrixRows ?? [])
        .slice(0, MATRIX_ROW_COUNT)
        .map((r) => trimRowColumnIIBleed(String(r ?? ''))),
    )
    const colCount = inferMatrixColCount(question)
    const cols = Array.from({ length: colCount }, (_, i) => question.matrixCols?.[i] ?? '')
    const colHeads = getMatrixColHeadLabels(question)
    const showStem = stem && !isMatrixStubStem(stem)

    return (
      <div className="bank-pick-preview bank-pick-preview-matrix">
        {showStem && (
          <div className="bank-pick-preview-stem">
            <MathText text={stem} />
          </div>
        )}
        <div className="bank-pick-matrix-columns">
          <div className="bank-pick-matrix-col">
            <h5>Column I</h5>
            <ol className="bank-pick-matrix-list" type="A">
              {rows.map((row, i) => (
                <li key={i} value={String.fromCharCode(65 + i)}>
                  <MathText text={row || `Row ${String.fromCharCode(65 + i)}`} />
                </li>
              ))}
            </ol>
          </div>
          <div className="bank-pick-matrix-col">
            <h5>Column II</h5>
            <ul className="bank-pick-matrix-list">
              {cols.map((col, j) => (
                <li key={j}>
                  <span className="bank-pick-matrix-col-label">{colHeads[j] ?? `(${j + 1})`}</span>
                  <MathText text={col || `Entry ${j + 1}`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bank-pick-preview">
      {stem ? (
        <QuestionStem text={stem} options={question.options} className="bank-pick-preview-stem" />
      ) : (
        <p className="form-hint">(No question text)</p>
      )}
      {shouldShowQuestionStemImage(question) && (
        <img
          src={question.questionImage}
          alt="Question diagram"
          className="bank-pick-preview-img"
        />
      )}
      {(type === 'single_correct' || type === 'multiple_correct' || type === 'passage_scq' || type === 'true_false') &&
        (showAllOptionSlots || (question.options ?? []).some((o) => String(o ?? '').trim())) && (
          <ul className="bank-pick-preview-options">
            {(showAllOptionSlots
              ? [...(question.options ?? []), '', '', '', ''].slice(0, 4)
              : (question.options ?? [])
            ).map((opt, i) => {
              const text = String(opt ?? '').trim()
              if (!showAllOptionSlots && !text) return null
              return (
                <li key={i} className={!text ? 'bank-pick-opt-missing' : ''}>
                  <span className="bank-pick-opt-letter">
                    {type === 'true_false' ? (i === 0 ? 'T' : 'F') : String.fromCharCode(65 + i)}
                  </span>
                  {text ? (
                    <OptionBody
                      text={opt}
                      optionImage={question.optionImages?.[i]}
                      questionText={question.text}
                      allOptions={question.options ?? []}
                      optionLetter={String.fromCharCode(65 + i)}
                    />
                  ) : (
                    <span className="bank-pick-opt-missing-label">
                      Missing — upload or edit in Question Bank
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}
