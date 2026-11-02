import MathText from './MathText'
import { OptionBody } from './QuestionMedia'
import {
  passageSubQuestionDisplayText,
  shouldShowPassageTextBesideImage,
  stripSubStemsFromPassageBody } from '../utils/passage.js'
import {
  applyPassagePivqAnswerInput,
  passagePivqAnswerDisplay } from '../utils/passageSubAnswer.js'
import { sanitizeNumericalAnswerInput } from '../utils/numericalAnswer.js'

/**
 * Review passage + sub-questions before saving to the bank.
 */
export default function PassageSplitPanel({
  passageText,
  passageImage,
  passageImageCrop = false,
  subQuestions,
  onPassageChange,
  onSubQuestionChange,
  onSubCorrectIndex,
  onSubCorrectInteger: _onSubCorrectInteger,
  onSubCorrectNumerical: _onSubCorrectNumerical,
  onSubAnswerMode: _onSubAnswerMode,
  onSaveAll,
  onDismiss,
  disabled,
  isEditMode = false,
  integerMode = false,
  onReplacePassageDiagram,
  onRemovePassageDiagram }) {
  if (!subQuestions?.length) return null

  const subStemTexts = subQuestions.map((sq) => sq.text).filter(Boolean)
  const passageBody = stripSubStemsFromPassageBody(passageText ?? '', subStemTexts)

  const allOptionless = subQuestions.every((sq) =>
    (sq.options ?? []).every((o) => !String(o ?? '').trim()),
  )
  const useInteger = integerMode || allOptionless
  const showPassageText = shouldShowPassageTextBesideImage(
    { passageImage, passageImageCrop, passageText },
    passageText,
  )

  const missingOptionsCount = useInteger
    ? 0
    : subQuestions.filter((sq) =>
        (sq.options ?? []).every((o) => !String(o ?? '').trim()),
      ).length

  return (
    <div className="card bank-panel passage-split-panel">
      <h3>
        {isEditMode
          ? `Edit passage set — ${subQuestions.length} questions`
          : `Passage — ${subQuestions.length} questions detected`}
      </h3>
      <p className="form-hint">
        {isEditMode ? (
          <>
            Update the <strong>shared passage</strong>, each <strong>stem</strong>,{' '}
            <strong>options A–D</strong>, and <strong>correct answer</strong>. Subject, exams,
            toughness, solution, and <strong>question type (PIVQ / PSCQ)</strong> use the metadata
            fields below — they apply to <strong>every question</strong> in this set when you save.
          </>
        ) : (
          <>
            This upload has one <strong>shared passage</strong> and{' '}
            <strong>
              {useInteger
                ? `${subQuestions.length} PIVQ sub-questions (integer or decimal answers)`
                : `${subQuestions.length} MCQs`}
            </strong>
            . Saved as one <strong>passage block</strong> in your bank (PIVQ/PSCQ) — edit, tag, and
            delete the whole set together.
          </>
        )}
      </p>

      {missingOptionsCount > 0 && (
        <p className="form-hint passage-split-options-warning">
          ⚠ {missingOptionsCount} of {subQuestions.length} question
          {subQuestions.length === 1 ? '' : 's'} have no options yet. Type options A–D and mark the
          correct one for each before saving.
        </p>
      )}

      <label className="passage-split-passage-label">
        Passage text (shared)
        <textarea
          rows={6}
          value={passageText}
          onChange={(e) => onPassageChange(e.target.value)}
          disabled={disabled}
        />
      </label>
      <div className="form-preview passage-split-passage-preview">
        <span>Passage preview:</span>
        {passageImage && (
          <img
            src={passageImage}
            alt="Passage diagram"
            className="question-content-img passage-diagram-img"
          />
        )}
        {showPassageText && passageBody ? (
          <MathText text={passageBody} />
        ) : (
          <p className="form-hint">
            Passage wording is in the image above; edit it in the passage text box.
          </p>
        )}
      </div>
      {(isEditMode || onReplacePassageDiagram) && onReplacePassageDiagram && (
        <div className="passage-split-diagram-actions">
          <label className="btn btn-ghost btn-sm file-btn">
            {passageImage ? 'Replace passage diagram' : 'Attach passage diagram'}
            <input
              type="file"
              hidden
              accept="image/png,image/jpeg,image/jpg,image/webp"
              disabled={disabled}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onReplacePassageDiagram(f)
                e.target.value = ''
              }}
            />
          </label>
          {passageImage && onRemovePassageDiagram && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled}
              onClick={onRemovePassageDiagram}
            >
              Remove diagram
            </button>
          )}
        </div>
      )}

      {subQuestions.map((sq, i) => (
        <div key={i} className="passage-split-sub card-inner">
          <h4>Question {i + 1}</h4>
          <label>
            Question text
            <textarea
              rows={4}
              value={sq.text}
              onChange={(e) => onSubQuestionChange(i, { text: e.target.value })}
              disabled={disabled}
            />
          </label>
          <div className="form-preview">
            {(() => {
              const preview = passageSubQuestionDisplayText(sq.text, passageText)
              return preview ? (
              <MathText text={preview} />
            ) : (
              <p className="form-hint">Stated in the passage above.</p>
            )
            })()}
          </div>
          {useInteger ? (
            <div className="passage-split-answer-block">
              <label>
                Correct answer (integer 0–9999 or decimal)
                <input
                  type="text"
                  inputMode="decimal"
                  className="numerical-answer-field"
                  value={sanitizeNumericalAnswerInput(passagePivqAnswerDisplay(sq), {
                    allowIncomplete: true })}
                  onChange={(e) => {
                    const raw = sanitizeNumericalAnswerInput(e.target.value, {
                      allowIncomplete: true })
                    const applied = applyPassagePivqAnswerInput(sq, raw)
                    onSubQuestionChange(i, {
                      answerMode: applied.answerMode ?? 'integer',
                      correctInteger: applied.correctInteger,
                      correctNumerical: applied.correctNumerical })
                  }}
                  placeholder="e.g. 40 or 45.23"
                  disabled={disabled}
                />
              </label>
              <p className="form-hint">
                Whole numbers are scored as integers; answers with a decimal point (e.g.{' '}
                <code>3.14</code>) are scored as numerical (± tolerance).
              </p>
            </div>
          ) : (
            <>
              {(sq.options ?? []).every((o) => !String(o ?? '').trim()) && (
                <p className="form-hint passage-split-options-warning">
                  No options detected for this question — please enter options A–D below.
                </p>
              )}
              {sq.correctIndex == null &&
                (sq.options ?? []).some((o) => String(o ?? '').trim()) && (
                  <p className="form-hint passage-split-options-warning">
                    No correct option marked yet — pick A–D (not defaulted to A).
                  </p>
                )}
              <div className="passage-split-options">
                {sq.options.map((opt, oi) => (
                  <div key={oi} className="passage-split-option-row">
                    <span className="option-step-label">{String.fromCharCode(65 + oi)}</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...sq.options]
                        next[oi] = e.target.value
                        onSubQuestionChange(i, { options: next })
                      }}
                      disabled={disabled}
                    />
                    <label className="msq-check">
                      <input
                        type="radio"
                        name={`passage-correct-${i}`}
                        checked={sq.correctIndex === oi}
                        onChange={() => onSubCorrectIndex(i, oi)}
                        disabled={disabled}
                      />
                      Correct
                    </label>
                  </div>
                ))}
              </div>
              <div className="form-preview option-preview-row">
                {sq.options.map((opt, oi) =>
                  opt.trim() ? (
                    <div key={oi} className="passage-split-opt-preview">
                      <span>{String.fromCharCode(65 + oi)}</span>
                      <OptionBody text={opt} optionLetter={String.fromCharCode(65 + oi)} />
                    </div>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="passage-split-actions">
        <button type="button" className="btn btn-primary" disabled={disabled} onClick={onSaveAll}>
          {isEditMode
            ? `Update all ${subQuestions.length} questions in bank`
            : `Save all ${subQuestions.length} questions to bank`}
        </button>
        {!isEditMode && (
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onDismiss}>
            Edit as single question instead
          </button>
        )}
        {isEditMode && (
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onDismiss}>
            Cancel edit
          </button>
        )}
      </div>
    </div>
  )
}
