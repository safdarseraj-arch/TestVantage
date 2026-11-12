/**
 * Question Bank metatag fields on one Approved Official PYQ question.
 * Same form as Saved questions, Metatags, plus Answer and Solution.
 * On a Published paper the fields are shown read-only.
 */

import { useEffect, useMemo, useState } from 'react'
import MathText from './MathText.jsx'
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
import { isOfficialPyqFinalQuestionId } from '../utils/officialPyqPublishFlow.js'
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

function answerKey(meta) {
  return JSON.stringify([String(meta.index ?? meta.answerIndex ?? ''), meta.indices ?? meta.answerIndices ?? [], String(meta.number ?? meta.answerNumber ?? '')])
}

export default function OfficialPyqPublishedMetaForm({ paperId, questionIndex, question, published = false, keptId = '', onSaved }) {
  const canEdit = isAdminLoggedIn() && !published
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
  const [previous, setPrevious] = useState(null)
  const [hybridValues, setHybridValues] = useState(null)
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
    setPrevious(null)
    setHybridValues(null)
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

  /** Who wrote a changed answer or solution: Hybrid AI if it is still exactly what Hybrid AI gave, else the admin. */
  function changedSources(meta, solutionFromAi = false) {
    const stored = readMeta(question)
    const out = {}
    if (answerKey(meta) !== answerKey(stored)) {
      out.answerSource = hybridValues && answerKey(meta) === answerKey(hybridValues) ? 'hybrid_ai' : 'manual'
    }
    if (String(meta.solution ?? '').trim() !== stored.solution.trim()) {
      out.solutionSource =
        solutionFromAi || (hybridValues && String(meta.solution ?? '') === String(hybridValues.solution ?? ''))
          ? 'hybrid_ai'
          : 'manual'
    }
    return out
  }

  function savePayload(meta, solutionFromAi = false) {
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
      ...changedSources(meta, solutionFromAi),
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
      if (!filled || typeof filled !== 'object') {
        setError('Hybrid AI returned nothing for this question.')
        return
      }
      setPrevious(currentValues())
      const suggested = valuesFromSuggestion(filled)
      setHybridValues(suggested)
      showValues(suggested)
      const answered = String(filled.correct_answer || '').trim()
      const solved = String(filled.step_by_step_solution || '').trim()
      setNote(
        answered && solved
          ? 'Hybrid AI filled the boxes above. Check them, then press Save tags, answer, and solution.'
          : 'Hybrid AI filled the tags but could not work out the answer or solution from this question (a picture or text may be missing). Fill them by hand, then press Save.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hybrid AI could not fill this question.')
    } finally {
      setFilling(false)
    }
  }

  function currentValues() {
    return {
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
    }
  }

  function showValues(v) {
    setSubject(v.subject)
    setSection(v.section)
    setChapter(v.chapter)
    setTopic(v.topic)
    setQuestionType(v.questionType)
    setExamIds(v.examIds)
    setToughness(v.toughness)
    setSource(v.source)
    setSolution(v.solution)
    setAnswerIndex(v.answerIndex)
    setAnswerIndices(v.answerIndices)
    setAnswerNumber(v.answerNumber)
  }

  const onPutBack = () => {
    if (!previous) return
    showValues(previous)
    setPrevious(null)
    setHybridValues(null)
    setNote('Put back what was there before Hybrid AI. Nothing was saved.')
  }

  function valuesFromSuggestion(suggestion) {
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
    return {
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
      setQuestionId(String(result.question?.id ?? ''))
      setHybridValues(null)
      setPrevious(null)
      setNote('Saved. The paper is still Approved — students see it after you press Publish.')
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
        {published
          ? ' This paper is published, so these are read-only. Unpublish it to change them.'
          : canEdit
            ? ' Saving keeps the paper Approved and does not change the question wording or options.'
            : ' Only an admin can change them.'}
      </p>
      <p className="form-hint" data-testid="official-pyq-question-id">
        {published || isOfficialPyqFinalQuestionId(questionId)
          ? 'Question Id: ' + (questionId || 'Not created yet') + (published ? '' : ' (kept on Publish)')
          : keptId
            ? 'Question Id: ' + keptId + ' (given back on Publish)'
            : 'Question Id: given on Publish'}
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
      {String(solution || '').trim() ? (
        <div className="official-pyq-solution-preview" data-testid="official-pyq-meta-solution-preview">
          <span className="metadata-label">How students will see the solution</span>
          <MathText text={solution} />
        </div>
      ) : null}
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
            }, true)
            if (!result.ok) {
              setError(result.error || 'Could not save the solution.')
              return
            }
            setQuestionId(String(result.question?.id ?? ''))
            setNote('Saved the solution. The paper is still Approved. The question wording was not changed.')
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
      {previous ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="official-pyq-hybrid-put-back"
          onClick={onPutBack}
          disabled={saving || filling}
        >
          Put back what was there before Hybrid AI
        </button>
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
