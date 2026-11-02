/**
 * Question Bank metatag fields on one published Official PYQ question.
 * Same form as Saved questions, Metatags, plus Answer and Solution.
 */

import { useEffect, useMemo, useState } from 'react'
import MissingSolutionFill from './MissingSolutionFill.jsx'
import QuestionMetadataForm from './QuestionMetadataForm.jsx'
import { isAdminLoggedIn } from '../utils/auth.js'
import { fillOfficialPyqTags } from '../utils/hybridAiClient.js'
import {
  mapExamSlugToHybridLabel,
  mapHybridExamLabelToSlug,
  mapHybridPoolQuestionTypeToBankId,
  mapHybridSubjectLabelToSlug,
  mapSubjectSlugToHybridLabel,
} from '../utils/hybridMetadata.js'
import { answerFieldsFromHybrid } from '../utils/officialPyqReplica.js'
import {
  applyOfficialPyqPublishedMeta,
  normalizeBankSubjectId,
} from '../utils/officialPyqPublishedMeta.js'
import { loadQuestionBank } from '../utils/questionBank.js'

function optionLabel(opt, index) {
  const letter = String.fromCharCode(65 + index)
  const text = String(opt ?? '')
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return text ? letter + ') ' + text : letter
}

function answerKind(questionType) {
  if (questionType === 'multiple_correct') return 'multi'
  if (questionType === 'numerical') return 'numerical'
  if (questionType === 'integer' || questionType === 'passage_integer') return 'integer'
  return 'choice'
}

function readMeta(question) {
  const q = question && typeof question === 'object' ? question : {}
  return {
    subject: normalizeBankSubjectId(q.subject),
    section: String(q.section || q.unit || '').trim(),
    chapter: String(q.chapter || '').trim(),
    topic: String(q.topic || '').trim(),
    questionType: String(q.questionType || '').trim(),
    examIds: Array.isArray(q.examIds) ? [...q.examIds] : [],
    toughness: q.toughnessLevel != null && q.toughnessLevel !== '' ? String(q.toughnessLevel) : '',
    source: String(q.source || ''),
    index: q.correctIndex != null && q.correctIndex !== '' ? String(q.correctIndex) : '',
    indices: Array.isArray(q.correctIndices) ? q.correctIndices.map((n) => Number(n)) : [],
    number:
      q.correctNumerical != null && q.correctNumerical !== ''
        ? String(q.correctNumerical)
        : q.correctInteger != null && q.correctInteger !== ''
          ? String(q.correctInteger)
          : '',
    solution: String(q.solution || ''),
  }
}

export default function OfficialPyqPublishedMetaForm({ paperId, questionIndex, question, onSaved }) {
  const canEdit = isAdminLoggedIn()
  const initial = readMeta(question)
  const [subject, setSubject] = useState(initial.subject)
  const [section, setSection] = useState(initial.section)
  const [chapter, setChapter] = useState(initial.chapter)
  const [topic, setTopic] = useState(initial.topic)
  const [questionType, setQuestionType] = useState(initial.questionType)
  const [examIds, setExamIds] = useState(initial.examIds)
  const [toughness, setToughness] = useState(initial.toughness)
  const [source, setSource] = useState(initial.source)
  const [answerIndex, setAnswerIndex] = useState(initial.index)
  const [answerIndices, setAnswerIndices] = useState(initial.indices)
  const [answerNumber, setAnswerNumber] = useState(initial.number)
  const [solution, setSolution] = useState(initial.solution)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [filling, setFilling] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [questionId, setQuestionId] = useState(String(question?.id ?? ''))

  const resetKey = paperId + ':' + questionIndex + ':' + String(question?.id ?? '')
  useEffect(() => {
    const next = readMeta(question)
    setSubject(next.subject)
    setSection(next.section)
    setChapter(next.chapter)
    setTopic(next.topic)
    setQuestionType(next.questionType)
    setExamIds(next.examIds)
    setToughness(next.toughness)
    setSource(next.source)
    setAnswerIndex(next.index)
    setAnswerIndices(next.indices)
    setAnswerNumber(next.number)
    setSolution(next.solution)
    setQuestionId(String(question?.id ?? ''))
    setSuggestion(null)
  }, [resetKey, question])

  const bankQuestions = useMemo(() => {
    try {
      const rows = loadQuestionBank().questions ?? []
      if (!subject && !section && !chapter && !topic) return rows
      return [...rows, { subject, section, chapter, topic }]
    } catch {
      return subject || section || chapter || topic ? [{ subject, section, chapter, topic }] : []
    }
  }, [subject, section, chapter, topic, resetKey])

  const options = Array.isArray(question?.options) ? question.options : []
  const kind = answerKind(questionType)
  const choiceCount = Math.max(options.length, kind === 'choice' || kind === 'multi' ? 4 : 0)

  const toggleIndex = (index) => {
    setAnswerIndices((prev) =>
      prev.includes(index) ? prev.filter((n) => n !== index) : [...prev, index].sort((a, b) => a - b),
    )
  }

  function filledOrKept(next, current) {
    const text = String(next ?? '').trim()
    return text ? text : current
  }

  function savePayload(meta) {
    const answerKindNow = answerKind(meta.questionType)
    const answer =
      answerKindNow === 'multi'
        ? { correctIndex: '', correctIndices: meta.answerIndices, correctInteger: '', correctNumerical: '' }
        : answerKindNow === 'numerical' || (answerKindNow === 'integer' && String(meta.answerNumber).includes('.'))
          ? { correctIndex: '', correctIndices: [], correctInteger: '', correctNumerical: meta.answerNumber }
          : answerKindNow === 'integer'
            ? { correctIndex: '', correctIndices: [], correctInteger: meta.answerNumber, correctNumerical: '' }
            : { correctIndex: meta.answerIndex, correctIndices: [], correctInteger: '', correctNumerical: '' }
    return applyOfficialPyqPublishedMeta(paperId, questionIndex, {
      questionId: question?.id,
      expectText: question?.text ?? question?.stem ?? '',
      subject: meta.subject,
      section: meta.section,
      chapter: meta.chapter,
      topic: meta.topic,
      questionType: meta.questionType,
      examIds: meta.examIds,
      toughnessLevel: meta.toughness,
      source: meta.source,
      solution: meta.solution,
      ...answer,
    })
  }

  const onAskHybrid = async () => {
    if (!canEdit || filling || saving) return
    setFilling(true)
    setError('')
    setNote('')
    const examId = Array.isArray(examIds) && examIds.length ? examIds[0] : ''
    try {
      const filled = await fillOfficialPyqTags({
        question_text: String(question?.text ?? question?.stem ?? ''),
        options: options.map((opt) => String(opt ?? '')),
        subject: subject ? mapSubjectSlugToHybridLabel(subject, chapter || section) : '',
        unit: section,
        section,
        chapter,
        topic,
        question_type: questionType,
        exam: examId ? mapExamSlugToHybridLabel(examId) : '',
        toughness_level: toughness,
        source,
        answer:
          kind === 'multi'
            ? answerIndices.map((n) => String.fromCharCode(65 + Number(n))).join(',')
            : kind === 'integer' || kind === 'numerical'
              ? answerNumber
              : answerIndex === ''
                ? ''
                : String.fromCharCode(65 + Number(answerIndex)),
        solution,
      })
      setSuggestion(filled && typeof filled === 'object' ? filled : null)
      setNote('Hybrid AI returned tags, the answer, and a solution. Review them, then use them if they look right.')
    } catch (err) {
      setSuggestion(null)
      setError(err instanceof Error ? err.message : 'Hybrid AI could not fill this question.')
    } finally {
      setFilling(false)
    }
  }

  const onUseSuggestion = () => {
    if (!canEdit || !suggestion || saving) return
    const nextSubject = filledOrKept(
      suggestion.subject ? mapHybridSubjectLabelToSlug(suggestion.subject) : '',
      subject,
    )
    const nextSection = filledOrKept(suggestion.unit, section)
    const nextChapter = filledOrKept(suggestion.chapter, chapter)
    const nextTopic = filledOrKept(suggestion.topic, topic)
    const typeRaw = String(suggestion.question_type || '').trim()
    const nextType = typeRaw ? mapHybridPoolQuestionTypeToBankId(typeRaw, options) : questionType
    const examRaw = String(suggestion.exam || '').trim()
    const nextExamIds = examRaw ? [mapHybridExamLabelToSlug(examRaw)] : examIds
    const nextToughness = filledOrKept(suggestion.toughness_level, toughness)
    const nextSource = filledOrKept(suggestion.source, source)
    const nextSolution = String(suggestion.step_by_step_solution || '').trim() ? String(suggestion.step_by_step_solution).trim() : solution
    const answerRaw = String(suggestion.correct_answer || '').trim()
    const mapped = answerRaw ? answerFieldsFromHybrid(answerRaw) : null
    const nextIndex = mapped && mapped.correctIndex != null ? String(mapped.correctIndex) : answerIndex
    const nextIndices = mapped && Array.isArray(mapped.correctIndices) ? mapped.correctIndices : answerIndices
    const nextNumber =
      mapped && mapped.correctNumerical != null
        ? String(mapped.correctNumerical)
        : mapped && mapped.correctInteger != null
          ? String(mapped.correctInteger)
          : answerNumber
    setSubject(nextSubject)
    setSection(nextSection)
    setChapter(nextChapter)
    setTopic(nextTopic)
    setQuestionType(nextType)
    setExamIds(nextExamIds)
    setToughness(nextToughness)
    setSource(nextSource)
    setSolution(nextSolution)
    setAnswerIndex(nextIndex)
    setAnswerIndices(nextIndices)
    setAnswerNumber(nextNumber)
    setSaving(true)
    setError('')
    try {
      const result = savePayload({
        subject: nextSubject,
        section: nextSection,
        chapter: nextChapter,
        topic: nextTopic,
        questionType: nextType,
        examIds: nextExamIds,
        toughness: nextToughness,
        source: nextSource,
        solution: nextSolution,
        answerIndex: nextIndex,
        answerIndices: nextIndices,
        answerNumber: nextNumber,
      })
      if (!result.ok) {
        setError(result.error || 'Could not save.')
        return
      }
      const id = String(result.question?.id ?? '')
      setQuestionId(id)
      setSuggestion(null)
      setNote('Saved the Hybrid AI tags, answer, and solution. This paper is still published. The question wording was not changed.')
      if (typeof onSaved === 'function') onSaved(result.question)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  const onSave = () => {
    if (!canEdit || saving) return
    setSaving(true)
    setError('')
    setNote('')
    try {
      const result = savePayload({
        subject,
        section,
        chapter,
        topic,
        questionType,
        examIds,
        toughness,
        source,
        solution,
        answerIndex,
        answerIndices,
        answerNumber,
      })
      if (!result.ok) {
        setError(result.error || 'Could not save.')
        return
      }
      const id = String(result.question?.id ?? '')
      setQuestionId(id)
      const ready = Boolean(String(subject).trim() && String(section).trim() && String(chapter).trim())
      setNote(
        result.status === 'approved'
          ? id && ready
            ? 'Saved. Question Id ' + id + '. This paper is still published.'
            : 'Saved. This paper is still published. Question Id is created when Subject, Unit, and Chapter are filled.'
          : 'Saved.',
      )
      if (typeof onSaved === 'function') onSaved(result.question)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset
      className="official-pyq-published-meta"
      data-testid="official-pyq-published-meta"
      disabled={!canEdit || saving}
    >
      <legend>Metatags, answer, and solution</legend>
      <p className="form-hint">
        Same fields as Question Bank metatags. Stored values are shown, including blanks.
        {canEdit
          ? ' Saving stays on this published paper and does not change the question wording or options.'
          : ' Only an admin can change them.'}
      </p>
      <p className="form-hint" data-testid="official-pyq-question-id">
        Question Id: {questionId || 'Not created yet'}
      </p>
      <QuestionMetadataForm
        showBlankChoices
        subject={subject}
        onSubjectChange={setSubject}
        section={section}
        onSectionChange={setSection}
        chapter={chapter}
        onChapterChange={setChapter}
        topic={topic}
        onTopicChange={setTopic}
        questionType={questionType}
        onQuestionTypeChange={setQuestionType}
        examIds={examIds}
        onExamIdsChange={setExamIds}
        toughnessLevel={toughness}
        onToughnessLevelChange={(value) => setToughness(value === '' || value == null ? '' : String(value))}
        source={source}
        onSourceChange={setSource}
        bankQuestions={bankQuestions}
      />
      <label className="metadata-field">
        <span className="metadata-label">Answer</span>
        {kind === 'multi' ? (
          <div className="official-pyq-answer-choices" data-testid="official-pyq-meta-answer">
            {Array.from({ length: choiceCount }, (_, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={answerIndices.includes(i)}
                  onChange={() => toggleIndex(i)}
                />{' '}
                {optionLabel(options[i], i)}
              </label>
            ))}
          </div>
        ) : kind === 'integer' || kind === 'numerical' ? (
          <input
            data-testid="official-pyq-meta-answer"
            type="text"
            inputMode="decimal"
            value={answerNumber}
            onChange={(e) => setAnswerNumber(e.target.value)}
            placeholder="Blank if no answer was stored"
          />
        ) : (
          <select
            data-testid="official-pyq-meta-answer"
            value={answerIndex}
            onChange={(e) => setAnswerIndex(e.target.value)}
          >
            <option value="">- No answer stored -</option>
            {Array.from({ length: choiceCount }, (_, i) => (
              <option key={i} value={String(i)}>
                {optionLabel(options[i], i)}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="metadata-field">
        <span className="metadata-label">Solution</span>
        <textarea
          data-testid="official-pyq-meta-solution"
          rows={4}
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          placeholder="Blank if no solution was stored"
        />
      </label>
      <MissingSolutionFill
        hasSolution={Boolean(String(solution || '').trim())}
        questionText={String(question?.text ?? question?.stem ?? '')}
        options={options}
        subject={subject}
        section={section}
        chapter={chapter}
        topic={topic}
        questionType={questionType}
        examId={Array.isArray(examIds) && examIds.length ? examIds[0] : ''}
        toughness={toughness}
        source={source}
        answerText={
          kind === 'multi'
            ? answerIndices.map((n) => String.fromCharCode(65 + Number(n))).join(',')
            : kind === 'integer' || kind === 'numerical'
              ? answerNumber
              : answerIndex === ''
                ? ''
                : String.fromCharCode(65 + Number(answerIndex))
        }
        storedSolution={solution}
        disabled={saving || filling}
        onApply={(text) => {
          setSolution(text)
          setSaving(true)
          setError('')
          setNote('')
          try {
            const result = savePayload({
              subject,
              section,
              chapter,
              topic,
              questionType,
              examIds,
              toughness,
              source,
              solution: text,
              answerIndex,
              answerIndices,
              answerNumber,
            })
            if (!result.ok) {
              setError(result.error || 'Could not save the solution.')
              return
            }
            if (result.status !== 'approved') {
              setError('Save refused because the paper would leave Published.')
              return
            }
            const id = String(result.question?.id ?? '')
            setQuestionId(id)
            setNote('Saved the solution. This paper is still published. The question wording was not changed.')
            if (typeof onSaved === 'function') onSaved(result.question)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the solution.')
          } finally {
            setSaving(false)
          }
        }}
      />
      {canEdit ? (
        <div className="official-pyq-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="official-pyq-ask-hybrid"
            onClick={() => void onAskHybrid()}
            disabled={saving || filling}
          >
            {filling ? 'Asking Hybrid AI...' : 'Ask Hybrid AI to fill'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || filling}>
            {saving ? 'Saving...' : 'Save tags, answer, and solution'}
          </button>
        </div>
      ) : null}
      {suggestion ? (
        <div className="form-hint" data-testid="official-pyq-hybrid-suggestion">
          <p>
            Subject {suggestion.subject || '(blank)'}, Unit {suggestion.unit || '(blank)'}, Chapter{' '}
            {suggestion.chapter || '(blank)'}, Topic {suggestion.topic || '(blank)'}, Type{' '}
            {suggestion.question_type || '(blank)'}, Exam {suggestion.exam || '(blank)'}, Toughness{' '}
            {suggestion.toughness_level || '(blank)'}, Source {suggestion.source || '(blank)'}.
          </p>
          <p>Answer: {suggestion.correct_answer || '(blank, current answer stays)'}</p>
          <p>Solution: {suggestion.step_by_step_solution || '(blank, current solution stays)'}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="official-pyq-use-hybrid"
            onClick={onUseSuggestion}
            disabled={saving || filling}
          >
            Use these tags, answer, and solution
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="upload-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="form-hint" role="status">
          {note}
        </p>
      ) : null}
    </fieldset>
  )
}
