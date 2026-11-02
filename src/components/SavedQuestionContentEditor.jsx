import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { finalizeStemForBank, stemForLivePreview, stemNeedsSourceRepair, stemSaveBlockers } from '../utils/persistUpload.js'
import MathText from './MathText'
import MathSymbolBar, { insertIntoField } from './MathSymbolBar'
import LatexDualEditField from './LatexDualEditField'
import NumericalAnswerInput from './NumericalAnswerInput'
import { OptionBody, QuestionStem } from './QuestionMedia'
import { IMAGE_OPTION_LABELS } from '../utils/imageQuestion'
import { validateNumericalAnswer } from '../utils/numericalAnswer.js'
import { applyPassagePivqAnswerInput, passagePivqAnswerDisplay } from '../utils/passageSubAnswer.js'
import { sanitizeNumericalAnswerInput } from '../utils/numericalAnswer.js'
import {
  getPassageText,
  isPassageLinkedQuestion,
  getPassageSetQuestions,
} from '../utils/passage.js'
import { formatMatrixCorrectAnswer } from '../utils/matrixMatch.js'
import { shouldShowQuestionStemImage } from '../utils/stemDiagramDetect.js'
import DraftFieldConfidence, { FieldConfidenceInline } from './DraftFieldConfidence.jsx'
import MissingSolutionFill from './MissingSolutionFill.jsx'
import { resolveQuestionFieldConfidence } from '../utils/uploadFieldConfidence.js'

/**
 * @param {import('../data/tests').Question} q
 */
function questionHasHybridImages(q) {
  return (
    !!q.questionImage ||
    !!q.optionsImage ||
    (Array.isArray(q.optionImages) && q.optionImages.some(Boolean)) ||
    !!q.solutionImage
  )
}

/**
 * Edit stem, options, and correct answer inside the saved-question viewer.
 * @param {{
 *   question: import('../data/tests').Question
 *   allQuestions?: import('../data/tests').Question[]
 *   onSave: (updates: Partial<import('../data/tests').Question>) => void
 *   onCancel: () => void
 *   onOpenFullEditor: () => void
 * }} props
 */
export default function SavedQuestionContentEditor({
  question: q,
  allQuestions = [],
  onSave,
  onCancel,
  onOpenFullEditor,
}) {
  const qType = q.questionType ?? 'single_correct'
  const bank = allQuestions.length ? allQuestions : [q]
  const passageSet = isPassageLinkedQuestion(q) ? getPassageSetQuestions(q, bank) : null
  const isPassageParent = !!q.passageText && !q.passageId
  const isMcqType =
    qType === 'single_correct' || qType === 'multiple_correct' || qType === 'passage_scq'
  const hasHybridImages = questionHasHybridImages(q)
  const needsFullEditor = qType === 'matrix_match'
  const hasOptions = isMcqType

  const linkedPassageText = isPassageLinkedQuestion(q) ? getPassageText(q, bank) : null

  const [text, setText] = useState(q.text ?? '')
  const [passageText, setPassageText] = useState(q.passageText ?? '')
  const [options, setOptions] = useState(() => {
    const o = [...(q.options ?? [])]
    while (o.length < 4) o.push('')
    return o.slice(0, 6)
  })
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex ?? 0)
  const [correctIndices, setCorrectIndices] = useState([...(q.correctIndices ?? [])])
  const [correctInteger, setCorrectInteger] = useState(
    q.correctInteger != null ? String(q.correctInteger) : '',
  )
  const [correctNumerical, setCorrectNumerical] = useState(
    q.correctNumerical != null ? String(q.correctNumerical) : '',
  )
  const [solution, setSolution] = useState(q.solution ?? '')
  const [videoSolution, setVideoSolution] = useState(q.videoSolution ?? '')
  const [error, setError] = useState('')
  const [showOptionsSection, setShowOptionsSection] = useState(hasOptions)

  const stemRef = useRef(null)
  const passageRef = useRef(null)
  const answerSectionRef = useRef(null)
  const optionsSectionRef = useRef(null)
  const questionSectionRef = useRef(null)
  const solutionRef = useRef(null)
  const optionRefs = useRef(/** @type {(HTMLTextAreaElement | null)[]} */ ([]))
  const [activeField, setActiveField] = useState(
    /** @type {{ type: 'stem' | 'passage' | 'solution' | 'option'; index?: number } | null} */ (null),
  )

  useEffect(() => {
    setText(finalizeStemForBank(q.text ?? '', q.options ?? []))
    setPassageText(q.passageText ?? '')
    const o = [...(q.options ?? [])]
    while (o.length < 4) o.push('')
    setOptions(o.slice(0, 6))
    setCorrectIndex(q.correctIndex ?? 0)
    setCorrectIndices([...(q.correctIndices ?? [])])
    setCorrectInteger(q.correctInteger != null ? String(q.correctInteger) : '')
    setCorrectNumerical(q.correctNumerical != null ? String(q.correctNumerical) : '')
    setSolution(q.solution ?? '')
    setVideoSolution(q.videoSolution ?? '')
    setError('')
    setShowOptionsSection(hasOptions)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, hasOptions, q.options, q.text])

  const previewStem = useMemo(() => stemForLivePreview(text, options), [text, options])
  const previewShowStemImage = useMemo(
    () =>
      shouldShowQuestionStemImage({
        ...q,
        text: previewStem || text,
        options,
      }),
    [q, previewStem, text, options],
  )
  const draftConf = useMemo(() => resolveQuestionFieldConfidence(q), [q])

  const syncStemFromRepair = useCallback(() => {
    if (!text.trim()) return
    const repaired = stemForLivePreview(text, options)
    if (repaired !== text) setText(repaired)
  }, [text, options])

  useEffect(() => {
    if (!text.trim() || !stemNeedsSourceRepair(text, options)) return
    syncStemFromRepair()
  }, [text, options, syncStemFromRepair])

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSymbolInsert = (insert) => {
    const field = activeField ?? { type: 'stem' }
    let el = stemRef.current
    let value = text
    let setter = setText

    if (field.type === 'passage') {
      el = passageRef.current
      value = passageText
      setter = setPassageText
    } else if (field.type === 'solution') {
      el = solutionRef.current
      value = solution
      setter = setSolution
    } else if (field.type === 'option' && field.index != null) {
      el = optionRefs.current[field.index] ?? null
      value = options[field.index] ?? ''
      const idx = field.index
      setter = (next) =>
        setOptions((prev) => prev.map((o, j) => (j === idx ? next : o)))
    }

    if (!el) return
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const { value: next, cursor } = insertIntoField(value, insert, start, end)
    setter(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }

  const toggleMsq = (i) => {
    setCorrectIndices((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b),
    )
  }

  const normalizeOptionsForSave = () =>
    options.slice(0, 4).map((o, i) => {
      const t = o.trim()
      if (t) return t
      if (q.optionImages?.[i]) return q.options?.[i]?.trim() || IMAGE_OPTION_LABELS[i]
      return ''
    })

  const handleSave = () => {
    setError('')
    if (passageSet && passageSet.length > 1 && q.passageId) {
      setError(
        'This sub-question belongs to a PIVQ/PSCQ passage block. Use Edit passage set to change passage, stems, and answers together.',
      )
      return
    }
    if (needsFullEditor) {
      onOpenFullEditor()
      return
    }

    const finalizedStem = finalizeStemForBank(text.trim(), options)
    const stemIssues = stemSaveBlockers(finalizedStem, options)
    if (stemIssues.length) {
      setError(
        `Matrix math could not be fixed automatically (${stemIssues[0]}). Edit the question LaTeX, then save again.`,
      )
      return
    }

    const updates = {
      text: finalizedStem,
      solution: solution.trim() || undefined,
      videoSolution: videoSolution.trim() || undefined,
    }

    if (isPassageParent && passageText.trim()) {
      updates.passageText = passageText.trim()
    }

    if (isMcqType) {
      const optTexts = options.map((o) => o.trim()).filter(Boolean)
      const hasOptImages = !!q.optionsImage || (q.optionImages ?? []).some(Boolean)
      if (optTexts.length < 2 && !hasOptImages) {
        setError('Enter at least two options (A and B), or keep option images from upload.')
        setShowOptionsSection(true)
        scrollToSection(optionsSectionRef)
        return
      }
      updates.options = normalizeOptionsForSave()
    }

    if (qType === 'single_correct' || qType === 'passage_scq') {
      updates.correctIndex = correctIndex
      onSave(updates)
      return
    }

    if (qType === 'multiple_correct') {
      if (!correctIndices.length) {
        setError('Select at least one correct option in section 1. Answer.')
        scrollToSection(answerSectionRef)
        return
      }
      updates.correctIndices = [...correctIndices]
      onSave(updates)
      return
    }

    if (qType === 'integer') {
      const n = parseInt(correctInteger, 10)
      if (Number.isNaN(n)) {
        setError('Enter a valid integer answer.')
        scrollToSection(answerSectionRef)
        return
      }
      updates.correctInteger = n
      onSave(updates)
      return
    }

    if (qType === 'numerical') {
      const check = validateNumericalAnswer(correctNumerical)
      if (!check.ok || check.value == null) {
        setError('Enter a valid numerical answer.')
        scrollToSection(answerSectionRef)
        return
      }
      updates.correctNumerical = check.value
      updates.numericalTolerance = q.numericalTolerance ?? 0.01
      onSave(updates)
      return
    }

    if (qType === 'passage_integer') {
      const applied = applyPassagePivqAnswerInput(
        q,
        correctNumerical || correctInteger || passagePivqAnswerDisplay(q),
      )
      if (!applied.ok) {
        setError(applied.error ?? 'Enter a valid integer or decimal answer.')
        scrollToSection(answerSectionRef)
        return
      }
      if (applied.incomplete) {
        setError('Finish entering the answer (e.g. 45.23).')
        scrollToSection(answerSectionRef)
        return
      }
      updates.answerMode = applied.answerMode
      if (applied.answerMode === 'numerical') {
        updates.correctNumerical = applied.correctNumerical
        updates.correctInteger = undefined
        updates.numericalTolerance = q.numericalTolerance ?? 0.01
      } else {
        updates.correctInteger = applied.correctInteger
        updates.correctNumerical = undefined
      }
      onSave(updates)
      return
    }

    onSave(updates)
  }

  const renderHybridImageNote = () => {
    if (!hasHybridImages) return null
    return (
      <div className="saved-hybrid-images-note">
        <p className="form-hint">
          This question includes <strong>uploaded images</strong> (shown below). Edit{' '}
          <strong>text and LaTeX</strong> here; use <strong>Full upload editor</strong> to replace
          question, option, or solution images.
        </p>
        <div className="saved-hybrid-thumbs">
          {q.questionImage && (
            <figure>
              <figcaption>Question image</figcaption>
              <img src={q.questionImage} alt="Question" className="saved-hybrid-thumb" />
            </figure>
          )}
          {q.optionsImage && (
            <figure>
              <figcaption>Options A–D</figcaption>
              <img src={q.optionsImage} alt="Options" className="saved-hybrid-thumb" />
            </figure>
          )}
          {(q.optionImages ?? []).map(
            (img, i) =>
              img && (
                <figure key={i}>
                  <figcaption>Option {String.fromCharCode(65 + i)}</figcaption>
                  <img src={img} alt={`Option ${i}`} className="saved-hybrid-thumb" />
                </figure>
              ),
          )}
          {q.solutionImage && (
            <figure>
              <figcaption>Solution image</figcaption>
              <img src={q.solutionImage} alt="Solution" className="saved-hybrid-thumb" />
            </figure>
          )}
        </div>
      </div>
    )
  }

  const renderLiveQuestionPreview = () => (
    <div className="saved-content-live-preview form-preview">
      <span className="latex-dual-preview-label">Question preview (as in test)</span>
      {(linkedPassageText || isPassageParent) && (passageText.trim() || linkedPassageText) && (
        <div className="saved-passage-preview-block">
          <span className="form-hint">Passage</span>
          <MathText text={isPassageParent ? passageText : linkedPassageText ?? ''} />
        </div>
      )}
      {text.trim() || previewShowStemImage ? (
        <QuestionStem
          text={previewStem}
          options={options}
          questionImage={previewShowStemImage ? q.questionImage : undefined}
          hideTextWithImage={false}
        />
      ) : (
        <p className="form-hint">
          Add question text in section {hasOptions ? '3' : '2'} to see the preview here.
        </p>
      )}
    </div>
  )

  const renderAnswerSection = () => (
    <section
      ref={answerSectionRef}
      className="saved-content-step-panel saved-content-section-answer"
      aria-labelledby="saved-step-answer"
    >
      <h5 id="saved-step-answer">
        1. Answer
        <FieldConfidenceInline field="answer" score={draftConf.fields.answer} />
      </h5>
      <p className="form-hint">
        Set the correct answer here first. For MCQs, pick A–D (edit option LaTeX in section 2).
      </p>

      {isMcqType && (
        <div className="saved-content-answer">
          <p className="form-hint">Pick the correct option letter.</p>
          <div className="saved-answer-picks">
            {[0, 1, 2, 3].map((i) => {
              const opt = options[i] ?? ''
              const hasContent = opt.trim() || q.optionImages?.[i] || (i === 0 && q.optionsImage)
              return (
                <label
                  key={i}
                  className={`saved-answer-pick ${hasContent ? '' : 'saved-answer-pick-empty'}`}
                >
                  <input
                    type={qType === 'multiple_correct' ? 'checkbox' : 'radio'}
                    name="content-correct"
                    checked={
                      qType === 'multiple_correct'
                        ? correctIndices.includes(i)
                        : correctIndex === i
                    }
                    onChange={() =>
                      qType === 'multiple_correct' ? toggleMsq(i) : setCorrectIndex(i)
                    }
                    disabled={!hasContent && qType !== 'multiple_correct'}
                  />
                  <span>{String.fromCharCode(65 + i)}</span>
                  {opt.trim() ? (
                    <span className="saved-answer-pick-preview">
                      <MathText text={opt} questionContext={text} />
                    </span>
                  ) : q.optionImages?.[i] ? (
                    <span className="form-hint">(image option)</span>
                  ) : q.optionsImage ? (
                    <span className="form-hint">(in combined options image)</span>
                  ) : (
                    <span className="form-hint">(empty)</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {qType === 'integer' && (
        <label className="saved-content-field">
          <span>Correct integer (0–9999)</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={correctInteger}
            onChange={(e) => setCorrectInteger(e.target.value)}
          />
        </label>
      )}

      {qType === 'numerical' && (
        <NumericalAnswerInput
          label="Correct numerical answer"
          value={correctNumerical}
          onChange={(v) => setCorrectNumerical(v ?? '')}
        />
      )}

      {qType === 'passage_integer' && (
        <label className="saved-content-field">
          <span>Correct answer (integer or decimal)</span>
          <input
            type="text"
            inputMode="decimal"
            className="numerical-answer-field"
            value={sanitizeNumericalAnswerInput(
              correctNumerical || correctInteger || passagePivqAnswerDisplay(q),
              { allowIncomplete: true },
            )}
            onChange={(e) => {
              const v = sanitizeNumericalAnswerInput(e.target.value, { allowIncomplete: true })
              setCorrectNumerical(v)
              setCorrectInteger(v.includes('.') ? '' : v)
            }}
            placeholder="e.g. 40 or 45.23"
          />
        </label>
      )}

      {hasOptions && (
        <button
          type="button"
          className="btn btn-ghost btn-sm saved-content-next-step"
          onClick={() => {
            setShowOptionsSection(true)
            scrollToSection(optionsSectionRef)
          }}
        >
          Jump to options (LaTeX + preview) →
        </button>
      )}
    </section>
  )

  const renderOptionsSection = () =>
    hasOptions ? (
      <section
        ref={optionsSectionRef}
        className="saved-content-step-panel saved-content-section-options"
        aria-labelledby="saved-step-options"
      >
        <div className="saved-content-section-head">
          <h5 id="saved-step-options">
            2. Options
            <FieldConfidenceInline field="options" score={draftConf.fields.options} />
          </h5>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowOptionsSection((v) => !v)}
            aria-expanded={showOptionsSection}
          >
            {showOptionsSection ? 'Hide options editor' : 'Show options editor'}
          </button>
        </div>
        {showOptionsSection && (
          <>
            <p className="form-hint">
              Each option: edit <strong>LaTeX / source</strong> (left) and check{' '}
              <strong>Preview</strong> (right). Leave blank if the option is image-only — use full
              editor to change images.
            </p>
            <MathSymbolBar onInsert={handleSymbolInsert} />
            <div className="saved-content-options-dual">
              {[0, 1, 2, 3].map((i) => {
                const opt = options[i] ?? ''
                return (
                  <div key={i} className="saved-content-option-dual-block">
                    <span className="saved-content-option-letter">{String.fromCharCode(65 + i)}</span>
                    <LatexDualEditField
                      label={`Option ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={(v) => setOptions((prev) => prev.map((o, j) => (j === i ? v : o)))}
                      rows={6}
                      placeholder={
                        q.optionImages?.[i] || (i === 0 && q.optionsImage)
                          ? 'Optional caption / LaTeX for this image option'
                          : 'e.g. $\\frac{1}{2}$ or plain text'
                      }
                      questionContext={text}
                      onTextareaRef={(el) => {
                        optionRefs.current[i] = el
                      }}
                      onFocus={() => setActiveField({ type: 'option', index: i })}
                    />
                    {(opt.trim() || q.optionImages?.[i] || (i === 0 && q.optionsImage)) && (
                      <div className="form-preview saved-option-full-preview">
                        <span className="form-hint">As shown in test</span>
                        <OptionBody
                          text={opt.trim() || IMAGE_OPTION_LABELS[i]}
                          optionImage={q.optionImages?.[i]}
                          questionText={text}
                          allOptions={options}
                          optionLetter={String.fromCharCode(65 + i)}
                        />
                        {q.optionsImage && !q.optionImages?.[i] && (
                          <img
                            src={q.optionsImage}
                            alt="Options A–D"
                            className="saved-hybrid-thumb"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    ) : null

  const renderQuestionSection = () => (
    <section
      ref={questionSectionRef}
      className="saved-content-step-panel saved-content-section-question"
      aria-labelledby="saved-step-question"
    >
      <h5 id="saved-step-question">
        {hasOptions ? '3. Complete question' : '2. Complete question'}
        <FieldConfidenceInline field="stem" score={draftConf.fields.stem} />
      </h5>
      <p className="form-hint">
        Edit the full question body: <strong>LaTeX / source</strong> and <strong>Preview</strong> side
        by side.
      </p>

      {isPassageParent && (
        <>
          <MathSymbolBar onInsert={handleSymbolInsert} />
          <LatexDualEditField
            label="Passage text (shared by all sub-questions)"
            value={passageText}
            onChange={setPassageText}
            rows={8}
            placeholder="Passage with $LaTeX$"
            questionContext={passageText}
            inputRef={passageRef}
            onFocus={() => setActiveField({ type: 'passage' })}
          />
        </>
      )}

      {q.passageId && !isPassageParent && (
        <p className="form-hint">
          Passage text is stored on the first question in this set. Edit it by opening question 1 in
          the set, or use <strong>Full upload editor</strong>.
        </p>
      )}

      <MathSymbolBar onInsert={handleSymbolInsert} />
      <LatexDualEditField
        label="Question body"
        value={text}
        onChange={setText}
        rows={10}
        placeholder="Full question stem with $LaTeX$"
        questionContext={text}
        previewText={previewStem}
        inputRef={stemRef}
        onFocus={() => setActiveField({ type: 'stem' })}
        onBlur={syncStemFromRepair}
      />
      <div className="form-preview question-stem-preview saved-content-full-stem-preview">
        <span className="latex-dual-preview-label">Complete question preview</span>
        {text.trim() || previewShowStemImage ? (
          <QuestionStem
            text={previewStem}
            options={options}
            questionImage={previewShowStemImage ? q.questionImage : undefined}
            hideTextWithImage={false}
          />
        ) : (
          <p className="form-hint">Enter question text above to see the full preview.</p>
        )}
      </div>
      <LatexDualEditField
        label={
          <>
            Solution / explanation
            <FieldConfidenceInline field="solution" score={draftConf.fields.solution} />
          </>
        }
        value={solution}
        onChange={setSolution}
        rows={8}
        placeholder="Step-by-step solution with $LaTeX$"
        questionContext={text}
        inputRef={solutionRef}
        onFocus={() => setActiveField({ type: 'solution' })}
      />
      <MissingSolutionFill
        hasSolution={Boolean(String(solution || '').trim())}
        questionText={text}
        options={options}
        subject={q.subject || ''}
        section={q.section || q.unit || ''}
        chapter={q.chapter || ''}
        topic={q.topic || ''}
        questionType={qType}
        examId={Array.isArray(q.examIds) && q.examIds.length ? q.examIds[0] : q.examPatternId || ''}
        toughness={q.toughnessLevel != null ? String(q.toughnessLevel) : ''}
        source={q.source || ''}
        answerText={
          qType === 'multiple_correct'
            ? (correctIndices || []).map((n) => String.fromCharCode(65 + Number(n))).join(',')
            : qType === 'integer' || qType === 'passage_integer'
              ? correctInteger
              : qType === 'numerical'
                ? correctNumerical
                : String.fromCharCode(65 + Number(correctIndex || 0))
        }
        storedSolution={solution}
        onApply={(next) => setSolution(next)}
      />
      <label className="saved-content-field">
        <span>Video solution URL</span>
        <input
          type="url"
          value={videoSolution}
          onChange={(e) => setVideoSolution(e.target.value)}
          placeholder="https://..."
        />
      </label>
    </section>
  )

  if (needsFullEditor) {
    return (
      <div className="saved-viewer-block saved-content-editor">
        <h4>2. Edit question &amp; answer</h4>
        <DraftFieldConfidence question={q} variant="breakdown" alwaysShow />
        <p className="form-hint">
          Matrix match uses a dedicated grid editor. Open the full upload editor to change rows,
          columns, and the answer key.
        </p>
        <p className="form-hint">
          Current answer: <strong>{formatMatrixCorrectAnswer(q)}</strong>
        </p>
        <div className="saved-content-editor-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenFullEditor}>
            Open full editor
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="saved-viewer-block saved-content-editor saved-content-editor-stacked">
      <h4>2. Edit question &amp; answer</h4>
      <DraftFieldConfidence question={q} variant="breakdown" alwaysShow />
      <p className="form-hint">
        Edit <strong>answer</strong>, <strong>options</strong> (if any), and <strong>question body</strong>{' '}
        below. Metatags are in tab 1 above.
        {passageSet && passageSet.length > 1 && (
          <>
            {' '}
            This set has {passageSet.length} linked questions — passage text on question 1; each
            sub-question has its own stem and answer here.
          </>
        )}
      </p>

      {renderHybridImageNote()}
      {renderLiveQuestionPreview()}

      <nav className="saved-content-step-nav" aria-label="Jump to section">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => scrollToSection(answerSectionRef)}
        >
          1. Answer
        </button>
        {hasOptions && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setShowOptionsSection(true)
              scrollToSection(optionsSectionRef)
            }}
          >
            2. Options
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => scrollToSection(questionSectionRef)}
        >
          {hasOptions ? '3. Question body' : '2. Question body'}
        </button>
      </nav>

      {renderAnswerSection()}
      {renderOptionsSection()}
      {renderQuestionSection()}

      {error && <p className="form-error">{error}</p>}

      <div className="saved-content-editor-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
          Save question &amp; answer
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenFullEditor}>
          Full upload editor (images)
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

