import { useEffect, useMemo, useState } from 'react'
import { getExamQuestionTypeHint } from '../data/examPatterns'
import { getAllExamPatterns } from '../utils/customBankMeta.js'
import MetaRenameSyncDialog from './MetaRenameSyncDialog.jsx'
import {
  getQuestionType,
  hasCustomQuestionTypeLabel,
  renameQuestionTypeLabel,
  resetQuestionTypeLabel,
} from '../data/questionTypes'
import {
  getSectionOptions,
  getChapterOptions,
  getTopicOptions,
  registerCustomHierarchy,
  renameHierarchyItem,
} from '../utils/curriculumOptions'
import {
  countQuestionsForHierarchyRename,
  applyHierarchyRenameToQuestions,
  queuePendingRename,
} from '../utils/metaRenameSync.js'
import { registerCustomSubject } from '../utils/customBankMeta.js'
import {
  getSubjectOptionsForPicker,
  getQuestionTypeOptionsForExams,
  defaultQuestionTypeForExams,
  formatToughnessLabel,
  metadataDefaultsForSubject,
  collectSourcesInBank,
} from '../utils/questionMetadata'

const TOUGHNESS_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1)

const ADD_VALUE = '__add_new__'

/**
 * Cascading classification: Subject → Unit → Chapter → Topic.
 * (Stored as `section` in the question record for compatibility.)
 */
export default function QuestionMetadataForm({
  subject,
  onSubjectChange,
  section,
  onSectionChange,
  chapter,
  onChapterChange,
  topic,
  onTopicChange,
  questionType,
  onQuestionTypeChange,
  examIds,
  onExamIdsChange,
  toughnessLevel,
  onToughnessLevelChange,
  source = '',
  onSourceChange,
  bankQuestions = [],
  onHierarchyRenamed,
  onTypeRenamed,
  allowAddSubject = false,
  hideQuestionType = false,
  /** When true, wrap fields in an expandable panel (upload page). */
  collapsible = false,
  /** Initial open state when collapsible — prefer collapsed to reduce clutter. */
  defaultOpen = false,
  /**
   * Published PYQ preview: keep a blank Subject or Type when Gemini left it empty.
   * The Question Bank editor does not pass this, so its dropdowns stay the same.
   */
  showBlankChoices = false,
}) {
  const [addingSubject, setAddingSubject] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [syncDialog, setSyncDialog] = useState(null)
  const [addingSection, setAddingSection] = useState(false)
  const [addingChapter, setAddingChapter] = useState(false)
  const [addingTopic, setAddingTopic] = useState(false)
  const [renamingLevel, setRenamingLevel] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [newChapterName, setNewChapterName] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [customVersion, setCustomVersion] = useState(0)
  const [panelOpen, setPanelOpen] = useState(defaultOpen)

  const subjectOptions = useMemo(
    () => getSubjectOptionsForPicker(examIds, bankQuestions),
    [examIds, bankQuestions],
  )
  const subjectLabel = subjectOptions.find((s) => s.id === subject)?.label ?? subject

  const sectionOptions = useMemo(
    () => getSectionOptions(subject, bankQuestions),
// eslint-disable-next-line react-hooks/exhaustive-deps
    [subject, bankQuestions, customVersion],
  )

  const chapterOptions = useMemo(
    () => (section ? getChapterOptions(subject, section, bankQuestions) : []),
// eslint-disable-next-line react-hooks/exhaustive-deps
    [subject, section, bankQuestions, customVersion],
  )

  const topicOptions = useMemo(
    () => (section && chapter ? getTopicOptions(subject, section, chapter, bankQuestions) : []),
// eslint-disable-next-line react-hooks/exhaustive-deps
    [subject, section, chapter, bankQuestions, customVersion],
  )

  const sourceOptions = useMemo(() => collectSourcesInBank(bankQuestions), [bankQuestions])

  const questionTypeOptions = useMemo(
    () => getQuestionTypeOptionsForExams(examIds),
// eslint-disable-next-line react-hooks/exhaustive-deps
    [examIds, customVersion],
  )

  const examTypeHint = useMemo(() => getExamQuestionTypeHint(examIds), [examIds])

  useEffect(() => {
    if (showBlankChoices) return
    const next = defaultQuestionTypeForExams(examIds, questionType)
    if (next && next !== questionType) onQuestionTypeChange(next)
  }, [examIds, questionType, onQuestionTypeChange, showBlankChoices])

  useEffect(() => {
    if (showBlankChoices) return
    if (!subject) return
    if (section && !sectionOptions.includes(section)) {
      onSectionChange('')
      onChapterChange('')
      onTopicChange('')
      setAddingChapter(false)
      setAddingTopic(false)
    }
  }, [subject, section, sectionOptions, onSectionChange, onChapterChange, onTopicChange, showBlankChoices])

  useEffect(() => {
    if (showBlankChoices) return
    if (!section) {
      if (chapter) onChapterChange('')
      if (topic) onTopicChange('')
      setAddingChapter(false)
      setAddingTopic(false)
      return
    }
    if (chapter && !chapterOptions.includes(chapter)) {
      onChapterChange('')
      onTopicChange('')
      setAddingTopic(false)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, chapter, chapterOptions, onChapterChange, onTopicChange, showBlankChoices])

  useEffect(() => {
    if (showBlankChoices) return
    if (!chapter) {
      if (topic) onTopicChange('')
      setAddingTopic(false)
      return
    }
    if (topic && !topicOptions.includes(topic)) {
      onTopicChange('')
    }
  }, [chapter, topic, topicOptions, onTopicChange, showBlankChoices])

  const handleSubjectChange = (nextSubject) => {
    onSubjectChange(nextSubject)
    onSectionChange('')
    onChapterChange('')
    onTopicChange('')
    setAddingSection(false)
    setAddingChapter(false)
    setAddingTopic(false)
    setRenamingLevel(null)
    setRenameError('')

    const { examIds: nextExams, questionType: nextType } = metadataDefaultsForSubject(
      nextSubject,
      { examIds, questionType },
    )
    const examsChanged =
      nextExams.length !== examIds.length || nextExams.some((id, i) => id !== examIds[i])
    if (examsChanged) onExamIdsChange(nextExams)
    if (nextType !== questionType) onQuestionTypeChange(nextType)
  }

  const cancelRename = () => {
    setRenamingLevel(null)
    setRenameValue('')
    setRenameError('')
  }

  const startRename = (level, currentName) => {
    setAddingSection(false)
    setAddingChapter(false)
    setAddingTopic(false)
    setRenamingLevel(level)
    setRenameValue(currentName)
    setRenameError('')
  }

  const commitRename = (level, oldName) => {
    const newName = renameValue.trim()

    if (level === 'questionType') {
      const result = renameQuestionTypeLabel(questionType, newName)
      if (!result.ok) {
        setRenameError(result.error ?? 'Could not rename.')
        return
      }
      setCustomVersion((n) => n + 1)
      cancelRename()
      onTypeRenamed?.({ typeId: questionType, oldName, newName })
      return
    }

    const context =
      level === 'chapter'
        ? { section }
        : level === 'topic'
          ? { section, chapter }
          : {}

    const result = renameHierarchyItem(subject, level, oldName, newName, context)
    if (!result.ok) {
      setRenameError(result.error ?? 'Could not rename.')
      return
    }

    const questionCount = countQuestionsForHierarchyRename(subject, level, oldName, context)

    const applyPicker = () => {
      if (level === 'section') onSectionChange(newName)
      else if (level === 'chapter') onChapterChange(newName)
      else onTopicChange(newName)
      setCustomVersion((n) => n + 1)
      cancelRename()
    }

    const finish = (syncNow) => {
      if (syncNow && questionCount > 0) {
        applyHierarchyRenameToQuestions(subject, level, oldName, newName, context)
      } else if (!syncNow && questionCount > 0) {
        queuePendingRename({ kind: 'hierarchy', subject, level, oldName, newName, context })
      }
      applyPicker()
      onHierarchyRenamed?.({ level, oldName, newName, questionCount, syncNow })
    }

    if (questionCount > 0) {
      setSyncDialog({
        title: 'Sync rename to saved questions?',
        message: `Rename “${oldName}” to “${newName}” on saved questions?`,
        questionCount,
        onSyncNow: () => {
          finish(true)
          setSyncDialog(null)
        },
        onSyncLater: () => {
          finish(false)
          setSyncDialog(null)
        },
        onCancel: () => setSyncDialog(null),
      })
      return
    }

    finish(true)
  }

  const commitNewSubject = () => {
    const r = registerCustomSubject(newSubjectName)
    if (!r.ok) {
      setRenameError(r.error ?? 'Could not add subject.')
      return
    }
    handleSubjectChange(r.subject.id)
    setAddingSubject(false)
    setNewSubjectName('')
    setCustomVersion((n) => n + 1)
  }

  const toggleExam = (id) => {
    const next = examIds.includes(id)
      ? examIds.filter((x) => x !== id)
      : [...examIds, id]
    onExamIdsChange(next)

    if (next.length) {
      const allowed = new Set(getSubjectOptionsForPicker(next, bankQuestions).map((s) => s.id))
      if (subject && !allowed.has(subject)) {
        const fallback = getSubjectOptionsForPicker(next, bankQuestions)[0]?.id
        if (fallback) handleSubjectChange(fallback)
      }
      const nextType = defaultQuestionTypeForExams(next, questionType)
      if (nextType !== questionType) onQuestionTypeChange(nextType)
    }
  }

  const handleSectionSelect = (value) => {
    if (value === ADD_VALUE) {
      setAddingSection(true)
      setNewSectionName('')
      return
    }
    setAddingSection(false)
    onSectionChange(value)
    onChapterChange('')
    onTopicChange('')
    setAddingChapter(false)
    setAddingTopic(false)
  }

  const handleChapterSelect = (value) => {
    if (value === ADD_VALUE) {
      setAddingChapter(true)
      setNewChapterName('')
      return
    }
    setAddingChapter(false)
    onChapterChange(value)
    onTopicChange('')
    setAddingTopic(false)
  }

  const handleTopicSelect = (value) => {
    if (value === ADD_VALUE) {
      setAddingTopic(true)
      setNewTopicName('')
      return
    }
    setAddingTopic(false)
    onTopicChange(value)
  }

  const commitNewSection = () => {
    const name = newSectionName.trim()
    if (!name || !subject) return
    registerCustomHierarchy(subject, name, '', '')
    onSectionChange(name)
    onChapterChange('')
    onTopicChange('')
    setAddingSection(false)
    setNewSectionName('')
    setCustomVersion((n) => n + 1)
  }

  const commitNewChapter = () => {
    const name = newChapterName.trim()
    if (!name || !section || !subject) return
    registerCustomHierarchy(subject, section, name, '')
    onChapterChange(name)
    onTopicChange('')
    setAddingChapter(false)
    setNewChapterName('')
    setCustomVersion((n) => n + 1)
  }

  const commitNewTopic = () => {
    const name = newTopicName.trim()
    if (!name || !chapter || !section || !subject) return
    registerCustomHierarchy(subject, section, chapter, name)
    onTopicChange(name)
    setAddingTopic(false)
    setNewTopicName('')
    setCustomVersion((n) => n + 1)
  }

  const sectionChoices =
    showBlankChoices && section && !sectionOptions.includes(section)
      ? [section, ...sectionOptions]
      : sectionOptions
  const chapterChoices =
    showBlankChoices && chapter && !chapterOptions.includes(chapter)
      ? [chapter, ...chapterOptions]
      : chapterOptions
  const topicChoices =
    showBlankChoices && topic && !topicOptions.includes(topic) ? [topic, ...topicOptions] : topicOptions
  const sectionSelectValue = section && sectionChoices.includes(section) ? section : ''
  const chapterSelectValue = chapter && chapterChoices.includes(chapter) ? chapter : ''
  const topicSelectValue = topic && topicChoices.includes(topic) ? topic : ''

  const renderRenameRow = (level, currentName, placeholder) =>
    renamingLevel === level ? (
      <div className="metadata-add-row metadata-rename-row">
        <input
          value={renameValue}
          onChange={(e) => {
            setRenameValue(e.target.value)
            setRenameError('')
          }}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && commitRename(level, currentName)}
          autoFocus
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => commitRename(level, currentName)}>
          Save
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelRename}>
          Cancel
        </button>
        {renameError && <span className="metadata-rename-error">{renameError}</span>}
      </div>
    ) : null

  const summaryLine = useMemo(() => {
    const examNames = getAllExamPatterns()
      .filter((p) => (examIds ?? []).includes(p.id))
      .map((p) => p.name)
    const parts = [
      subjectLabel || null,
      chapter || section || null,
      topic || null,
      !hideQuestionType ? getQuestionType(questionType)?.name || questionType : null,
      examNames.length
        ? examNames.slice(0, 2).join(', ') + (examNames.length > 2 ? '…' : '')
        : null,
      toughnessLevel !== '' && toughnessLevel != null
        ? formatToughnessLabel(Number(toughnessLevel))
        : null,
    ].filter(Boolean)
    return parts.join(' · ') || 'Subject, chapter, exam, difficulty…'
  }, [
    subjectLabel,
    chapter,
    section,
    topic,
    hideQuestionType,
    questionType,
    examIds,
    toughnessLevel,
  ])

  return (
    <div
      className={`question-metadata-form${collapsible ? ' question-metadata-form--collapsible' : ''}${
        collapsible && panelOpen ? ' is-open' : ''
      }`}
    >
      {collapsible ? (
        <button
          type="button"
          className="question-metadata-toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="question-metadata-toggle-main">
            <span className="question-metadata-toggle-title">1. Edit metatags</span>
            <span className="question-metadata-toggle-summary">{summaryLine}</span>
          </span>
          <span className="question-metadata-toggle-chevron" aria-hidden>
            {panelOpen ? '▾' : '▸'}
          </span>
        </button>
      ) : (
        <div className="question-metadata-head">
          <h3>Question classification</h3>
          <p className="form-hint">
            Set these <strong>before or after</strong> saving a question — open a saved row and click{' '}
            <strong>Edit</strong> to change anytime. Subject → Unit → Chapter → Topic are linked
            dropdowns. Use <strong>Modify</strong> on Unit, Chapter, Topic, or Type to rename labels
            (sync to saved questions now or later). Question type and exam(s) are required; toughness
            (1–10) is optional. For passage
            sets, <strong>PIVQ / PSCQ applies to all sub-questions</strong>. Upload any type:{' '}
            <strong>1 SCQ · 2 T/F · 3 MCQ · 4 MTC · 5 IVQ · 6 NVQ · 7 PIVQ · 8 PSCQ</strong>
            — exam tags only decide which tests can use it later.
          </p>
        </div>
      )}

      {(!collapsible || panelOpen) && (
      <>
      {collapsible && (
        <p className="form-hint question-metadata-collapsed-hint">
          Subject → Unit → Chapter → Topic, exam tags, and toughness. Keep collapsed while editing
          the question — expand only when tags need a change.
        </p>
      )}

      <div className="question-metadata-grid">
        <label className="metadata-field">
          <span className="metadata-label">
            1. Subject <span className="required-mark">*</span>
          </span>
          <select
            data-testid="bank-meta-subject"
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            required={!showBlankChoices}
          >
            {showBlankChoices ? <option value="">— Select subject —</option> : null}
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {allowAddSubject && (
            <>
              {!addingSubject ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm metadata-add-subject-btn"
                  onClick={() => setAddingSubject(true)}
                >
                  + Add subject
                </button>
              ) : (
                <div className="metadata-add-row">
                  <input
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="New subject name"
                    onKeyDown={(e) => e.key === 'Enter' && commitNewSubject()}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={commitNewSubject}>
                    Add
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAddingSubject(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </label>

        <label className="metadata-field">
          <span className="metadata-label">
            2. Unit
            {section && renamingLevel !== 'section' && (
              <button
                type="button"
                className="metadata-rename-btn"
                onClick={() => startRename('section', section)}
              >
                Modify
              </button>
            )}
          </span>
          <select
            data-testid="bank-meta-unit"
            value={sectionSelectValue}
            onChange={(e) => handleSectionSelect(e.target.value)}
            disabled={showBlankChoices ? false : !subject}
          >
            <option value="">— Select unit —</option>
            {sectionChoices.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {subject && <option value={ADD_VALUE}>+ Add new unit…</option>}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {subject
              ? `Units for ${subjectLabel} — e.g. Algebra, Trigonometry (${sectionOptions.length} available)`
              : 'Select a subject first'}
          </span>
          {addingSection && (
            <div className="metadata-add-row">
              <input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder={`New unit in ${subjectLabel}`}
                onKeyDown={(e) => e.key === 'Enter' && commitNewSection()}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={commitNewSection}>
                Add
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddingSection(false)}
              >
                Cancel
              </button>
            </div>
          )}
          {renderRenameRow('section', section, `Rename unit “${section}”`)}
        </label>

        <label className="metadata-field">
          <span className="metadata-label">
            3. Chapter
            {chapter && renamingLevel !== 'chapter' && (
              <button
                type="button"
                className="metadata-rename-btn"
                onClick={() => startRename('chapter', chapter)}
              >
                Modify
              </button>
            )}
          </span>
          <select
            data-testid="bank-meta-chapter"
            value={chapterSelectValue}
            onChange={(e) => handleChapterSelect(e.target.value)}
            disabled={showBlankChoices ? !section && !chapter : !section}
          >
            <option value="">— Select chapter —</option>
            {chapterChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {section && <option value={ADD_VALUE}>+ Add new chapter…</option>}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {!section
              ? 'Select a unit first — chapters depend on the unit'
              : `Chapters under “${section}” (${chapterOptions.length} available)`}
          </span>
          {addingChapter && (
            <div className="metadata-add-row">
              <input
                value={newChapterName}
                onChange={(e) => setNewChapterName(e.target.value)}
                placeholder={`New chapter under ${section}`}
                onKeyDown={(e) => e.key === 'Enter' && commitNewChapter()}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={commitNewChapter}>
                Add
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddingChapter(false)}
              >
                Cancel
              </button>
            </div>
          )}
          {renderRenameRow('chapter', chapter, `Rename chapter “${chapter}”`)}
        </label>

        <label className="metadata-field">
          <span className="metadata-label">
            4. Topic
            {topic && renamingLevel !== 'topic' && (
              <button
                type="button"
                className="metadata-rename-btn"
                onClick={() => startRename('topic', topic)}
              >
                Modify
              </button>
            )}
          </span>
          <select
            data-testid="bank-meta-topic"
            value={topicSelectValue}
            onChange={(e) => handleTopicSelect(e.target.value)}
            disabled={showBlankChoices ? !chapter && !topic : !chapter}
          >
            <option value="">— Select topic —</option>
            {topicChoices.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {chapter && <option value={ADD_VALUE}>+ Add new topic…</option>}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {!chapter
              ? 'Select a chapter first — topics are filtered by chapter'
              : `Topics under “${chapter}” (${topicOptions.length} available)`}
          </span>
          {addingTopic && (
            <div className="metadata-add-row">
              <input
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder={`New topic in ${chapter}`}
                onKeyDown={(e) => e.key === 'Enter' && commitNewTopic()}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={commitNewTopic}>
                Add
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAddingTopic(false)}
              >
                Cancel
              </button>
            </div>
          )}
          {renderRenameRow('topic', topic, `Rename topic “${topic}”`)}
        </label>

        {!hideQuestionType && (
          <label className="metadata-field">
            <span className="metadata-label">
              5. Type of question <span className="required-mark">*</span>
              {questionType && renamingLevel !== 'questionType' && (
                <button
                  type="button"
                  className="metadata-rename-btn"
                  onClick={() => startRename('questionType', getQuestionType(questionType).name)}
                >
                  Modify
                </button>
              )}
            </span>
            <select
              data-testid="bank-meta-type"
              value={questionType}
              onChange={(e) => onQuestionTypeChange(e.target.value)}
              required={!showBlankChoices}
            >
              {showBlankChoices ? <option value="">— Select type —</option> : null}
              {questionTypeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {examTypeHint && <p className="form-hint">{examTypeHint}</p>}
            {questionType === 'true_false' && (
              <p className="form-hint metadata-cdf-tf-hint">
                <strong>CDF only</strong> — used in Concept Definition &amp; Formula tests, not
                practice or normal papers. Tick the exam(s) below (JEE Main, JEE Advanced, NEET).
                Set toughness to <strong>1</strong>.
              </p>
            )}
            {renderRenameRow(
              'questionType',
              getQuestionType(questionType).name,
              `Rename type (e.g. ${getQuestionType(questionType).name})`,
            )}
            {questionType && hasCustomQuestionTypeLabel(questionType) && renamingLevel !== 'questionType' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm metadata-restore-type-btn"
                onClick={() => {
                  resetQuestionTypeLabel(questionType)
                  setCustomVersion((n) => n + 1)
                  onTypeRenamed?.({
                    typeId: questionType,
                    oldName: '',
                    newName: getQuestionType(questionType).name,
                    restored: true,
                  })
                }}
              >
                Restore default label
              </button>
            )}
          </label>
        )}
      </div>

      <fieldset className="metadata-exams-fieldset" data-testid="bank-meta-exam">
        <legend>
          6. Exam assigned <span className="required-mark">*</span>
          <span className="form-hint metadata-exams-hint"> — multi-select (JEE Main, JEE Advanced, NEET, …)</span>
        </legend>
        <div className="metadata-exam-checkboxes">
          {getAllExamPatterns().map((p) => (
            <label key={p.id} className={`metadata-exam-chip ${examIds.includes(p.id) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={examIds.includes(p.id)}
                onChange={() => toggleExam(p.id)}
              />
              <span className="metadata-exam-name">{p.name}</span>
              <span className="metadata-exam-subjects">{p.subjects.join(' · ')}</span>
            </label>
          ))}
        </div>
        {!examIds.length && (
          <p className="form-hint metadata-exam-warn">Pick at least one exam so this question appears in the right tests.</p>
        )}
      </fieldset>

      <label className="metadata-field metadata-toughness-field">
        <span className="metadata-label">7. Toughness level (1–10)</span>
        <select
          data-testid="bank-meta-toughness"
          value={toughnessLevel === '' || toughnessLevel == null ? '' : String(toughnessLevel)}
          onChange={(e) => onToughnessLevelChange(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">— Select later (1–10) —</option>
          {TOUGHNESS_LEVELS.map((n) => (
            <option key={n} value={n}>
              {n} — {n <= 3 ? 'Easy' : n <= 7 ? 'Moderate' : 'Tough'}
            </option>
          ))}
        </select>
        <span className="form-hint metadata-cascade-hint">
          {toughnessLevel
            ? formatToughnessLabel(toughnessLevel)
            : 'Optional — rate difficulty from 1 (easiest) to 10 (hardest); can be set anytime before or after save'}
        </span>
      </label>

      {onSourceChange && (
        <label className="metadata-field metadata-source-field">
          <span className="metadata-label">8. Source</span>
          <input
            data-testid="bank-meta-source"
            type="text"
            list="metadata-source-suggestions"
            value={source ?? ''}
            onChange={(e) => onSourceChange(e.target.value)}
            placeholder="Book name · Coaching material · PYQ exam"
            maxLength={120}
          />
          <datalist id="metadata-source-suggestions">
            {sourceOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className="form-hint metadata-cascade-hint">
            Enter <strong>book name</strong> if from a book, <strong>coaching name</strong> if from
            their material, or <strong>exam name / year</strong> if from PYQ (e.g. JEE Main 2023).
          </span>
        </label>
      )}

      <MetaRenameSyncDialog
        open={!!syncDialog}
        title={syncDialog?.title ?? ''}
        message={syncDialog?.message ?? ''}
        questionCount={syncDialog?.questionCount ?? 0}
        onSyncNow={syncDialog?.onSyncNow ?? (() => {})}
        onSyncLater={syncDialog?.onSyncLater ?? (() => {})}
        onCancel={syncDialog?.onCancel ?? (() => setSyncDialog(null))}
      />
      </>
      )}
    </div>
  )
}

