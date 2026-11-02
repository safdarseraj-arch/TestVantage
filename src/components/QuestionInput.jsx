import MathText from './MathText'
import { OptionBody, QuestionStem } from './QuestionMedia'
import { getQuestionType } from '../data/questionTypes'
import {
  MAX_NUMERICAL_DIGITS,
  sanitizeNumericalAnswerInput,
} from '../utils/numericalAnswer.js'
import {
  shouldHideStemTextWithImage,
  shouldShowQuestionStemImage,
} from '../utils/stemDiagramDetect.js'
import {
  getPassageImage,
  getPassageRawText,
  getPassageText,
  isPassageLinkedQuestion,
  passageSubQuestionDisplayText,
  shouldShowPassageImageInViewer,
  shouldShowPassageTextBesideImage,
} from '../utils/passage.js'
import MatrixMatchInput from './MatrixMatchInput'
import ExamIntegerKeypad from './ExamIntegerKeypad.jsx'

/**
 * @param {Object} props
 * @param {import('../data/tests').Question} props.question
 * @param {import('../data/tests').Question[]} props.allQuestions
 * @param {unknown} props.answer
 * @param {(answer: unknown) => void} props.onChange
 * @param {number[] | null} [props.optionPerm] display index → original option index
 * @param {number} [props.answerResetKey] unused (kept for API compat)
 */
export default function QuestionInput({ question, allQuestions, answer, onChange, optionPerm, answerResetKey: _answerResetKey = 0 }) {
  const type = question.questionType ?? 'single_correct'
  const typeDef = getQuestionType(type)
  const passageRaw = getPassageRawText(question, allQuestions)
  const passage = getPassageText(question, allQuestions)
  const passageImage = getPassageImage(question, allQuestions)
  const passageParent = question.passageText
    ? question
    : question.passageId
      ? allQuestions.find((x) => x.id === question.passageId)
      : null
  const showPassageImage =
    !!passageImage &&
    !!passageParent &&
    shouldShowPassageImageInViewer(passageParent, passage)
  const showPassageText =
    !!passage?.trim() &&
    (!passageImage ||
      !showPassageImage ||
      shouldShowPassageTextBesideImage(passageParent ?? question, passage))
  const showPassageBlock =
    !!passage?.trim() ||
    !!passageRaw?.trim() ||
    (!!passageImage && !!passageParent)
  const optionCount = (question.options ?? []).length
  const perm =
    optionPerm && optionPerm.length === optionCount
      ? optionPerm
      : Array.from({ length: optionCount }, (_, i) => i)

  const pickSingle = (displayIdx) => {
    onChange(perm[displayIdx])
  }

  const toggleMulti = (displayIdx) => {
    const orig = perm[displayIdx]
    const prev = Array.isArray(answer) ? [...answer] : []
    const selected = prev.includes(orig)
    if (selected) onChange(prev.filter((x) => x !== orig))
    else onChange([...prev, orig].sort((a, b) => a - b))
  }
  const stemForExam = isPassageLinkedQuestion(question)
    ? passageSubQuestionDisplayText(question.text ?? '', passageRaw ?? '')
    : question.text

  return (
    <div className="question-input exam-answer-zone">
      <span className="q-type-badge">{typeDef.shortName}</span>

      {showPassageBlock && (
        <div className="passage-block">
          <h4>Passage</h4>
          {showPassageImage && passageImage && (
            <img
              src={passageImage}
              alt="Passage diagram"
              className="question-content-img passage-diagram-img"
            />
          )}
          {showPassageText && (
            <div className="passage-text">
              <MathText text={passage} />
            </div>
          )}
        </div>
      )}

      <QuestionStem
        text={stemForExam}
        options={question.options}
        parseMatchLists={type !== 'matrix_match'}
        questionImage={
          shouldShowQuestionStemImage(question) ? question.questionImage : undefined
        }
        hideTextWithImage={shouldHideStemTextWithImage(question)}
      />

      {(type === 'single_correct' || type === 'passage_scq') && (
        <div className="options-list" role="radiogroup">
          {question.optionsImage && (
            <img
              src={question.optionsImage}
              alt="Answer options"
              className="question-content-img options-panel-img"
            />
          )}
          {perm.map((origIdx, displayIdx) => {
            const opt = (question.options ?? [])[origIdx]
            const selected = answer === origIdx
            return (
            <label
              key={displayIdx}
              className={`option-row ${selected ? 'selected' : ''}`}
              data-exam-mcq-option=""
              data-exam-question-id={question.id ?? ''}
              data-exam-mcq-mode="single"
              data-exam-mcq-value={String(origIdx)}
            >
              <input
                type="radio"
                name={question.id}
                readOnly
                tabIndex={-1}
                checked={selected}
                onChange={() => pickSingle(displayIdx)}
              />
              <span className="option-label">{String.fromCharCode(65 + displayIdx)}</span>
              <span className="option-text">
                <OptionBody
                  text={opt}
                  optionImage={question.optionImages?.[origIdx]}
                  imageOnly={!!question.optionsImage && !question.optionImages?.[origIdx]}
                  questionText={question.text}
                  allOptions={question.options ?? []}
                  optionLetter={String.fromCharCode(65 + displayIdx)}
                />
              </span>
            </label>
            )
          })}
        </div>
      )}

      {type === 'true_false' && (
        <div className="options-list true-false-options" role="radiogroup">
          {[0, 1].map((origIdx) => {
            const label = (question.options ?? [])[origIdx] ?? (origIdx === 0 ? 'TRUE' : 'FALSE')
            const selected = answer === origIdx
            return (
              <label
                key={origIdx}
                className={`option-row true-false-row ${selected ? 'selected' : ''}`}
                data-exam-mcq-option=""
                data-exam-question-id={question.id ?? ''}
                data-exam-mcq-mode="single"
                data-exam-mcq-value={String(origIdx)}
              >
                <input
                  type="radio"
                  name={question.id}
                  readOnly
                  tabIndex={-1}
                  checked={selected}
                  onChange={() => onChange(origIdx)}
                />
                <span className="option-label true-false-label">{label}</span>
              </label>
            )
          })}
        </div>
      )}

      {type === 'multiple_correct' && (
        <div className="options-list">
          <p className="msq-hint">Select all correct options</p>
          {question.optionsImage && (
            <img
              src={question.optionsImage}
              alt="Answer options"
              className="question-content-img options-panel-img"
            />
          )}
          {perm.map((origIdx, displayIdx) => {
            const opt = (question.options ?? [])[origIdx]
            const selected = Array.isArray(answer) && answer.includes(origIdx)
            return (
              <label
                key={displayIdx}
                className={`option-row ${selected ? 'selected' : ''}`}
                data-exam-mcq-option=""
                data-exam-question-id={question.id ?? ''}
                data-exam-mcq-mode="multi"
                data-exam-mcq-value={String(origIdx)}
              >
                <input
                  type="checkbox"
                  readOnly
                  tabIndex={-1}
                  checked={selected}
                  onChange={() => toggleMulti(displayIdx)}
                />
                <span className="option-label">{String.fromCharCode(65 + displayIdx)}</span>
                <span className="option-text">
                  <OptionBody
                    text={opt}
                    optionImage={question.optionImages?.[origIdx]}
                    imageOnly={!!question.optionsImage && !question.optionImages?.[origIdx]}
                    questionText={question.text}
                    allOptions={question.options ?? []}
                    optionLetter={String.fromCharCode(65 + displayIdx)}
                  />
                </span>
              </label>
            )
          })}
        </div>
      )}

      {type === 'integer' && (
        <ExamIntegerKeypad
          value={answer}
          onChange={onChange}
          questionId={question.id}
          resetKey={_answerResetKey}
        />
      )}

      {(type === 'numerical' || type === 'passage_integer') && (
        <div className="numerical-answer-input exam-answer-zone">
          <label className="numerical-answer-label" htmlFor={`exam-num-${question.id}`}>
            Your answer
            <input
              id={`exam-num-${question.id}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              className="numerical-answer-field"
              value={
                answer == null || answer === undefined
                  ? ''
                  : sanitizeNumericalAnswerInput(String(answer), { allowIncomplete: true })
              }
              placeholder="e.g. 45.23 or -2.345"
              onChange={(e) => {
                const next = sanitizeNumericalAnswerInput(e.target.value, { allowIncomplete: true })
                onChange(next === '' ? null : next)
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </label>
          <p className="form-hint numerical-answer-hint">
            Up to {MAX_NUMERICAL_DIGITS} digits; optional <code>-</code> and one decimal point. Use{' '}
            <code>.</code> not comma.
          </p>
          {import.meta.env.DEV && (
            <p className="form-hint exam-answer-debug">
              Check: saved answer = {answer == null || answer === '' ? '(empty)' : String(answer)}
            </p>
          )}
        </div>
      )}

      {type === 'matrix_match' && (
        <MatrixMatchInput question={question} answer={answer} onChange={onChange} />
      )}
    </div>
  )
}
