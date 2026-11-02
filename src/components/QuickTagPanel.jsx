import { useState } from 'react'
import QuestionMetadataForm from './QuestionMetadataForm'
import { validateQuestionMetadata } from '../utils/questionMetadata'
import { isQuestionMetaClassified } from '../utils/bankListFilters'

/**
 * Inline editor to fill or change all metadata tags on one saved question.
 * @param {{
 *   question: import('../data/tests').Question,
 *   bankQuestions: import('../data/tests').Question[],
 *   onSave: (updates: Partial<import('../data/tests').Question>) => void,
 *   onCancel: () => void,
 *   onHierarchyRenamed?: (info: object) => void,
 * }} props
 */
export default function QuickTagPanel({ question, bankQuestions, onSave, onCancel, onHierarchyRenamed }) {
  const q = question
  const [subject, setSubject] = useState(q.subject ?? '')
  const [section, setSection] = useState(q.section ?? '')
  const [chapter, setChapter] = useState(q.chapter ?? '')
  const [topic, setTopic] = useState(q.topic ?? '')
  const [questionType, setQuestionType] = useState(q.questionType ?? 'single_correct')
  const [examIds, setExamIds] = useState([...(q.examIds ?? [])])
  const [toughnessLevel, setToughnessLevel] = useState(
    q.toughnessLevel != null && q.toughnessLevel !== '' ? q.toughnessLevel : '',
  )
  const [source, setSource] = useState(q.source ?? '')
  const [error, setError] = useState('')

  const handleSave = () => {
    const errors = validateQuestionMetadata({ subject, questionType, examIds })
    if (errors.length) {
      setError(errors.join(' '))
      return
    }
    setError('')
    onSave({
      subject,
      section: section.trim() || undefined,
      chapter: chapter.trim() || undefined,
      topic: topic.trim() || undefined,
      questionType,
      examIds: [...examIds],
      toughnessLevel:
        toughnessLevel !== '' && toughnessLevel != null ? Number(toughnessLevel) : undefined,
      source: source.trim() || undefined,
    })
  }

  const classified = isQuestionMetaClassified({
    ...q,
    subject,
    section,
    chapter,
    questionType,
  })

  return (
    <div className="quick-tag-panel card-inner">
      <div className="quick-tag-head">
        <h4>{classified ? 'Edit metadata' : 'Complete metadata tags'}</h4>
        <p className="form-hint">
          Classified needs <strong>Subject + Unit + Chapter + Type</strong> (topic optional).
        </p>
        {q.officialPyq ? (
          <p className="form-hint">
            Official PYQ passage questions are <strong>NVQ</strong> (type a number), not{' '}
            <strong>SCQ</strong> (A–D). If Gemini chose SCQ or PSCQ, change Type to NVQ, or{' '}
            <strong>PIVQ</strong> when several parts share one passage.
          </p>
        ) : null}
      </div>
      <QuestionMetadataForm
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
        toughnessLevel={toughnessLevel}
        onToughnessLevelChange={setToughnessLevel}
        source={source}
        onSourceChange={setSource}
        bankQuestions={bankQuestions}
        onHierarchyRenamed={onHierarchyRenamed}
        allowAddSubject
      />
      {error && <p className="form-error">{error}</p>}
      <div className="quick-tag-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
          Save tags
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
