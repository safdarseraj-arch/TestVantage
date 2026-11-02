import { useEffect, useMemo, useState } from 'react'
import { CANONICAL_QUESTION_TYPE_IDS, getQuestionType, renameQuestionTypeLabel } from '../data/questionTypes'
import { getSubjectOptionsForPicker } from '../utils/questionMetadata'
import {
  getSectionOptions,
  getChapterOptions,
  getTopicOptions,
  registerCustomHierarchy,
  renameHierarchyItem,
} from '../utils/curriculumOptions'
import {
  getAllExamPatterns,
  registerCustomExam,
  registerCustomSubject,
  renameCustomExam,
  renameCustomSubjectLabel,
} from '../utils/customBankMeta'
import {
  applyAllPendingRenames,
  applyHierarchyRenameToQuestions,
  countQuestionsForHierarchyRename,
  loadPendingRenames,
  queuePendingRename,
  removePendingRename,
  applyPendingRename,
} from '../utils/metaRenameSync'
import { buildMetaTagCountIndex } from '../utils/syllabusMeta'
import MetaRenameSyncDialog from './MetaRenameSyncDialog'

/**
 * @param {{
 *   bankQuestions: import('../data/tests').Question[],
 *   onRefresh: () => void,
 *   onMessage: (type: string, text: string) => void,
 * }} props
 */
export default function BankMetaManager({ bankQuestions, onRefresh, onMessage }) {
  const [subject, setSubject] = useState('mathematics')
  const [section, setSection] = useState('')
  const [chapter, setChapter] = useState('')

  const [newSubjectName, setNewSubjectName] = useState('')
  const [newUnitName, setNewUnitName] = useState('')
  const [newChapterName, setNewChapterName] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [newExamName, setNewExamName] = useState('')
  const [newTypeLabel, setNewTypeLabel] = useState('')

  const [renameLevel, setRenameLevel] = useState('')
  const [renameOld, setRenameOld] = useState('')
  const [renameNew, setRenameNew] = useState('')
  const [renameTypeId, setRenameTypeId] = useState('single_correct')
  const [renameSubjectId, setRenameSubjectId] = useState('')
  const [renameExamId, setRenameExamId] = useState('')

  const [syncDialog, setSyncDialog] = useState(null)
  const [pendingList, setPendingList] = useState(() => loadPendingRenames())
  const [showTree, setShowTree] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShowTree(true), 0)
    return () => window.clearTimeout(id)
  }, [])

  const exams = getAllExamPatterns()
  const subjectOptions = useMemo(
    () => getSubjectOptionsForPicker([], bankQuestions),
    [bankQuestions],
  )
  const sectionOptions = useMemo(
    () => getSectionOptions(subject, bankQuestions),
    [subject, bankQuestions],
  )
  const chapterOptions = useMemo(
    () => (section ? getChapterOptions(subject, section, bankQuestions) : []),
    [subject, section, bankQuestions],
  )
  const topicOptions = useMemo(
    () => (section && chapter ? getTopicOptions(subject, section, chapter, bankQuestions) : []),
    [subject, section, chapter, bankQuestions],
  )
  const countIndex = useMemo(() => buildMetaTagCountIndex(bankQuestions), [bankQuestions])
  const tagTree = useMemo(() => {
    if (!showTree) return []
    const units = getSectionOptions(subject, bankQuestions)
    return units.map((unit) => ({
      unit,
      count: countIndex.section(subject, unit),
      chapters: getChapterOptions(subject, unit, bankQuestions).map((ch) => ({
        ch,
        count: countIndex.chapter(subject, unit, ch),
        topics: getTopicOptions(subject, unit, ch, bankQuestions).map((tp) => ({
          tp,
          count: countIndex.topic(subject, unit, ch, tp),
        })),
      })),
    }))
  }, [showTree, subject, bankQuestions, countIndex])

  const refreshPending = () => setPendingList(loadPendingRenames())

  const openSyncDialog = (config) => setSyncDialog(config)

  const finishHierarchyRename = (level, oldName, newName, context, syncNow) => {
    const result = renameHierarchyItem(subject, level, oldName, newName, context)
    if (!result.ok) {
      onMessage('error', result.error ?? 'Could not rename.')
      return
    }
    const count = countQuestionsForHierarchyRename(subject, level, oldName, context, bankQuestions)
    if (syncNow && count > 0) {
      const updated = applyHierarchyRenameToQuestions(subject, level, oldName, newName, context)
      onMessage('success', `Renamed in pickers and ${updated} saved question(s).`)
    } else if (count > 0) {
      queuePendingRename({
        kind: 'hierarchy',
        subject,
        level,
        oldName,
        newName,
        context,
      })
      refreshPending()
      onMessage('success', `Label updated. ${count} question(s) queued for sync later.`)
    } else {
      onMessage('success', 'Label updated in pickers.')
    }
    setRenameLevel('')
    setRenameOld('')
    setRenameNew('')
    onRefresh()
  }

  const requestHierarchyRename = () => {
    const level = renameLevel
    const oldName = renameOld.trim()
    const newName = renameNew.trim()
    if (!level || !oldName || !newName) {
      onMessage('error', 'Pick level, current name, and new name.')
      return
    }
    const context =
      level === 'chapter' ? { section } : level === 'topic' ? { section, chapter } : {}
    const count = countQuestionsForHierarchyRename(subject, level, oldName, context, bankQuestions)
    if (count === 0) {
      finishHierarchyRename(level, oldName, newName, context, true)
      return
    }
    openSyncDialog({
      title: 'Rename & sync questions?',
      message: `Change “${oldName}” to “${newName}” on saved questions?`,
      questionCount: count,
      onSyncNow: () => {
        finishHierarchyRename(level, oldName, newName, context, true)
        setSyncDialog(null)
      },
      onSyncLater: () => {
        finishHierarchyRename(level, oldName, newName, context, false)
        setSyncDialog(null)
      },
      onCancel: () => setSyncDialog(null),
    })
  }

  const handleAddSubject = () => {
    const r = registerCustomSubject(newSubjectName)
    if (!r.ok) {
      onMessage('error', r.error ?? 'Could not add subject.')
      return
    }
    setNewSubjectName('')
    setSubject(r.subject.id)
    onMessage('success', `Subject “${r.subject.label}” added.`)
    onRefresh()
  }

  const handleAddUnit = () => {
    const name = newUnitName.trim()
    if (!name || !subject) return
    registerCustomHierarchy(subject, name, '', '')
    setNewUnitName('')
    onMessage('success', `Unit “${name}” added for ${subject}.`)
    onRefresh()
  }

  const handleAddChapter = () => {
    const name = newChapterName.trim()
    if (!name || !section) return
    registerCustomHierarchy(subject, section, name, '')
    setNewChapterName('')
    onMessage('success', `Chapter “${name}” added.`)
    onRefresh()
  }

  const handleAddTopic = () => {
    const name = newTopicName.trim()
    if (!name || !chapter) return
    registerCustomHierarchy(subject, section, chapter, name)
    setNewTopicName('')
    onMessage('success', `Topic “${name}” added.`)
    onRefresh()
  }

  const handleAddExam = () => {
    const r = registerCustomExam(newExamName)
    if (!r.ok) {
      onMessage('error', r.error ?? 'Could not add exam.')
      return
    }
    setNewExamName('')
    onMessage('success', `Exam “${r.exam.name}” added.`)
    onRefresh()
  }

  const handleRenameType = () => {
    const r = renameQuestionTypeLabel(renameTypeId, newTypeLabel)
    if (!r.ok) {
      onMessage('error', r.error ?? 'Could not rename type.')
      return
    }
    setNewTypeLabel('')
    onMessage('success', 'Question type display name updated (all questions of this type).')
    onRefresh()
  }

  const handleRenameSubject = () => {
    const r = renameCustomSubjectLabel(renameSubjectId, renameNew.trim())
    if (!r.ok) {
      onMessage('error', r.error ?? 'Could not rename subject.')
      return
    }
    onMessage('success', 'Subject label updated in pickers.')
    setRenameNew('')
    onRefresh()
  }

  const handleRenameExam = () => {
    const r = renameCustomExam(renameExamId, renameNew.trim())
    if (!r.ok) {
      onMessage('error', r.error ?? 'Could not rename exam.')
      return
    }
    onMessage('success', 'Custom exam renamed.')
    setRenameNew('')
    onRefresh()
  }

  const syncOnePending = (entry) => {
    const n = applyPendingRename(entry)
    removePendingRename(entry.id)
    refreshPending()
    onRefresh()
    onMessage('success', `Synced ${n} question(s).`)
  }

  return (
    <div className="bank-meta-manager">
      <section className="card">
        <h3>Manage meta tags</h3>
        <p className="form-hint">
          Add subjects, units, chapters, topics, exams, and rename labels. Renaming hierarchy tags can
          update saved questions <strong>now</strong> or <strong>later</strong> (queued below).
        </p>

        <label className="metadata-field">
          <span className="metadata-label">Working subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({countIndex.subject(s.id)})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card bank-meta-tree">
        <h4>
          {subjectOptions.find((s) => s.id === subject)?.label ?? subject} — tag tree
        </h4>
        <p className="form-hint">All units, chapters, and topics (same as upload). Numbers = questions in bank.</p>
        {!showTree ? (
          <p className="form-hint">Loading chapter tags…</p>
        ) : tagTree.length === 0 ? (
          <p className="form-hint">No units yet for this subject.</p>
        ) : (
          tagTree.map((unitRow) => (
            <div key={unitRow.unit} className="bank-meta-tree-unit">
              <strong>
                {unitRow.unit}{' '}
                <span className="syllabus-meta-count">{unitRow.count}</span>
              </strong>
              <ul className="bank-meta-tree-chapters">
                {unitRow.chapters.map((chRow) => (
                  <li key={chRow.ch}>
                    {chRow.ch}{' '}
                    <span className="syllabus-meta-count">{chRow.count}</span>
                    {chRow.topics.length > 0 && (
                      <ul className="bank-meta-tree-topics">
                        {chRow.topics.map((tpRow) => (
                          <li key={tpRow.tp}>
                            {tpRow.tp}{' '}
                            <span className="syllabus-meta-count">{tpRow.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <div className="bank-meta-grid">
        <section className="card bank-meta-card">
          <h4>Add</h4>
          <div className="bank-meta-add-row">
            <input
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="New subject name"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddSubject}>
              + Subject
            </button>
          </div>
          <div className="bank-meta-add-row">
            <input
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              placeholder="New unit"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddUnit} disabled={!subject}>
              + Unit
            </button>
          </div>
          <div className="bank-meta-add-row">
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Pick unit…</option>
              {sectionOptions.map((u) => (
                <option key={u} value={u}>
                  {u} ({countIndex.section(subject, u)})
                </option>
              ))}
            </select>
            <input
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              placeholder="New chapter"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddChapter} disabled={!section}>
              + Chapter
            </button>
          </div>
          <div className="bank-meta-add-row">
            <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
              <option value="">Pick chapter…</option>
              {chapterOptions.map((c) => (
                <option key={c} value={c}>
                  {c} ({countIndex.chapter(subject, section, c)})
                </option>
              ))}
            </select>
            <input
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="New topic"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddTopic} disabled={!chapter}>
              + Topic
            </button>
          </div>
          <div className="bank-meta-add-row">
            <input
              value={newExamName}
              onChange={(e) => setNewExamName(e.target.value)}
              placeholder="New exam name"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddExam}>
              + Exam
            </button>
          </div>
          <div className="bank-meta-add-row">
            <select value={renameTypeId} onChange={(e) => setRenameTypeId(e.target.value)}>
              {CANONICAL_QUESTION_TYPE_IDS.map((id) => (
                <option key={id} value={id}>
                  {getQuestionType(id)?.name ?? id}
                </option>
              ))}
            </select>
            <input
              value={newTypeLabel}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              placeholder="New display name"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRenameType}>
              Rename type label
            </button>
          </div>
        </section>

        <section className="card bank-meta-card">
          <h4>Rename (unit / chapter / topic)</h4>
          <div className="bank-meta-rename-grid">
            <select value={renameLevel} onChange={(e) => setRenameLevel(e.target.value)}>
              <option value="">Level…</option>
              <option value="section">Unit</option>
              <option value="chapter">Chapter</option>
              <option value="topic">Topic</option>
            </select>
            {renameLevel === 'section' && (
              <select value={renameOld} onChange={(e) => setRenameOld(e.target.value)}>
                <option value="">Current unit…</option>
                {sectionOptions.map((u) => (
                  <option key={u} value={u}>
                    {u} ({countIndex.section(subject, u)})
                  </option>
                ))}
              </select>
            )}
            {renameLevel === 'chapter' && (
              <>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="">Unit…</option>
                  {sectionOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <select value={renameOld} onChange={(e) => setRenameOld(e.target.value)}>
                  <option value="">Current chapter…</option>
                  {chapterOptions.map((c) => (
                    <option key={c} value={c}>
                      {c} ({countIndex.chapter(subject, section, c)})
                    </option>
                  ))}
                </select>
              </>
            )}
            {renameLevel === 'topic' && (
              <>
                <select value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="">Unit…</option>
                  {sectionOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
                  <option value="">Chapter…</option>
                  {chapterOptions.map((c) => (
                    <option key={c} value={c}>
                      {c} ({countIndex.chapter(subject, section, c)})
                    </option>
                  ))}
                </select>
                <select value={renameOld} onChange={(e) => setRenameOld(e.target.value)}>
                  <option value="">Current topic…</option>
                  {topicOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} ({countIndex.topic(subject, section, chapter, t)})
                    </option>
                  ))}
                </select>
              </>
            )}
            <input
              value={renameNew}
              onChange={(e) => setRenameNew(e.target.value)}
              placeholder="New name"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={requestHierarchyRename}>
              Rename & sync
            </button>
          </div>

          <h4 className="bank-meta-subhead">Rename subject / exam label</h4>
          <div className="bank-meta-add-row">
            <select value={renameSubjectId} onChange={(e) => setRenameSubjectId(e.target.value)}>
              <option value="">Subject…</option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              value={renameNew}
              onChange={(e) => setRenameNew(e.target.value)}
              placeholder="New subject label"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRenameSubject}>
              Modify subject
            </button>
          </div>
          <div className="bank-meta-add-row">
            <select value={renameExamId} onChange={(e) => setRenameExamId(e.target.value)}>
              <option value="">Custom exam…</option>
              {exams
                .filter((e) => String(e?.id ?? '').startsWith('custom-'))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
            <input
              value={renameNew}
              onChange={(e) => setRenameNew(e.target.value)}
              placeholder="New exam name"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRenameExam}>
              Modify exam
            </button>
          </div>
        </section>
      </div>

      {pendingList.length > 0 && (
        <section className="card bank-pending-sync">
          <h4>Pending sync ({pendingList.length})</h4>
          <p className="form-hint">Renames saved for later — apply to update question records.</p>
          <ul className="bank-pending-list">
            {pendingList.map((p) => (
              <li key={p.id}>
                <span>
                  {p.kind === 'hierarchy'
                    ? `${p.subject} · ${p.level}: ${p.oldName} → ${p.newName}`
                    : JSON.stringify(p)}
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => syncOnePending(p)}>
                  Sync now
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    removePendingRename(p.id)
                    refreshPending()
                  }}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const n = applyAllPendingRenames()
              refreshPending()
              onRefresh()
              onMessage('success', `Synced ${n} question update(s).`)
            }}
          >
            Sync all now
          </button>
        </section>
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
    </div>
  )
}
