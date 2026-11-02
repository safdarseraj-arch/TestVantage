import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getQuestionType } from '../../data/questionTypes'
import {
  buildBankListGroups,
  effectiveQuestionTypeId,
  filterBankQuestions,
} from '../../utils/bankListFilters'
import { filterQuestionsBySyllabus } from '../../utils/syllabusMeta'
import {
  autoAssemblePaper,
  countPoolForSlot,
  countSelectedForSlot,
  normalizeSlotTypeId,
  selectionProgressBySlot,
  summarizeSlots,
  totalSlotCount,
  validateManualSelection,
} from '../../utils/paperAssembly'
import { questionFamilyId } from '../../utils/questionFamily.js'
import MathText from '../MathText'
import BankPickQuestionPreview from './BankPickQuestionPreview'
import AiPaperTuningPanel from './AiPaperTuningPanel'
import { interleavePyqQuestions } from '../../utils/pyqTeacherPool.js'
import { questionBankUploadUrl } from '../../utils/questionBankUploadRoutes.js'

/**
 * @param {{
 *   mode: 'bank' | 'upload' | 'auto' | null
 *   onModeChange: (m: 'bank' | 'upload' | 'auto') => void
 *   pool: import('../../data/tests').Question[]
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   slots: import('../../data/examPatterns').QuestionTypeSlot[]
 *   examPatternId: string
 *   toughnessTarget: number
 *   onToughnessChange: (n: number) => void
 *   selectedIds: string[]
 *   onSelectedIdsChange: (ids: string[]) => void
 *   onAutoResult: (questions: import('../../data/tests').Question[]) => void
 *   autoPreview: import('../../data/tests').Question[]
 *   showBlueprint?: boolean
 *   pyqPercent?: number
 *   paperSource?: 'mixed' | 'pyq-only' | 'bank-only'
 * }} props
 */
export default function QuestionPickStep({
  mode,
  onModeChange,
  pool,
  syllabus,
  slots,
  examPatternId,
  toughnessTarget,
  onToughnessChange,
  selectedIds,
  onSelectedIdsChange,
  onAutoResult,
  autoPreview,
  showBlueprint = true,
  pyqPercent,
  paperSource,
}) {
  const [activeSlotIndex, setActiveSlotIndex] = useState(0)
  const [pickHint, setPickHint] = useState('')
  const syllabusPool = useMemo(
    () => filterQuestionsBySyllabus(pool, syllabus),
    [pool, syllabus],
  )
  const slotSummaries = summarizeSlots(slots).filter((s) => s.count > 0)
  const activeSlot = slotSummaries[activeSlotIndex]
  const needTotal = totalSlotCount(slots)

  const slotCandidates = useMemo(() => {
    if (!activeSlot) return []
    const types = normalizeSlotTypeId(activeSlot.questionTypeId)
    return filterBankQuestions(syllabusPool, {}).filter((q) =>
      types.includes(effectiveQuestionTypeId(q)),
    )
  }, [syllabusPool, activeSlot])

  const groups = buildBankListGroups(slotCandidates, {})

  const selectedQuestions = pool.filter((q) => selectedIds.includes(q.id))
  const selectedFamilyIds = useMemo(() => {
    const set = new Set()
    for (const id of selectedIds) {
      const q = pool.find((x) => x.id === id)
      if (q) set.add(questionFamilyId(q) || String(id))
    }
    return set
  }, [selectedIds, pool])
  const manualErrors = validateManualSelection(selectedQuestions, slots)
  const slotProgress = selectionProgressBySlot(selectedQuestions, slots)
  const activeSlotSelected = activeSlot
    ? countSelectedForSlot(selectedQuestions, activeSlot)
    : 0

  const selectedForActiveSlot = useMemo(() => {
    if (!activeSlot) return []
    const types = normalizeSlotTypeId(activeSlot.questionTypeId)
    return selectedQuestions.filter((q) => types.includes(effectiveQuestionTypeId(q)))
  }, [activeSlot, selectedQuestions])

  const toggleQuestion = (id) => {
    setPickHint('')
    const q = pool.find((x) => x.id === id)
    if (!q || !activeSlot) return

    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((x) => x !== id))
      return
    }

    const types = normalizeSlotTypeId(activeSlot.questionTypeId)
    const eff = effectiveQuestionTypeId(q)
    if (!types.includes(eff)) {
      const def = getQuestionType(activeSlot.questionTypeId)
      setPickHint(
        `This question is ${getQuestionType(eff).shortName}, not ${def.shortName}. Switch to the ${getQuestionType(eff).shortName} tab to select it.`,
      )
      return
    }
    if (activeSlotSelected >= activeSlot.count) {
      const def = getQuestionType(activeSlot.questionTypeId)
      setPickHint(
        `${def.shortName} is full (${activeSlot.count}/${activeSlot.count}). Uncheck one selected ${def.shortName} below to pick a different question.`,
      )
      return
    }

    const fam = questionFamilyId(q) || String(id)
    if (selectedFamilyIds.has(fam)) {
      setPickHint(
        'This question’s original or similar (C1/C2) is already in the paper. Pick a different family.',
      )
      return
    }

    const next = [...selectedIds, id]
    onSelectedIdsChange(next)

    if (activeSlotSelected + 1 >= activeSlot.count && activeSlotIndex < slotSummaries.length - 1) {
      setActiveSlotIndex(activeSlotIndex + 1)
    }
  }

  const runAuto = () => {
    const { questions, gaps } = autoAssemblePaper(syllabusPool, slots, syllabus, {
      toughnessTarget,
      examPatternId,
      difficultySpread: 'balanced',
    })
    if (gaps.length) {
      const msg = gaps
        .map((g) => `${g.slot.questionTypeId}: short by ${g.short}`)
        .join('; ')
      window.alert(
        `Auto-fill could not complete the blueprint (${msg}). Upload more questions or pick manually.`,
      )
      onAutoResult([])
      return gaps
    }
    onAutoResult(questions)
    return gaps
  }

  return (
    <section className="create-section card">
      <h2>How should we fill this paper?</h2>
      {showBlueprint && (
        <p className="form-hint">
          Paper needs <strong>{needTotal}</strong> questions across{' '}
          <strong>{slotSummaries.length}</strong> type(s).
        </p>
      )}

      <div className="create-pick-modes create-pick-modes-large">
        <label className={mode === 'bank' ? 'active' : ''}>
          <input
            type="radio"
            name="pickMode"
            checked={mode === 'bank'}
            onChange={() => onModeChange('bank')}
          />
          <span className="create-pick-num">1</span>
          <strong>Select questions from bank</strong>
          <span>
            Questions appear by syllabus and pattern — pick {slotSummaries[0]?.typeLabel ?? 'SCQ'}{' '}
            first, then the next type, and so on.
          </span>
        </label>
        <label className={mode === 'auto' ? 'active' : ''}>
          <input
            type="radio"
            name="pickMode"
            checked={mode === 'auto'}
            onChange={() => onModeChange('auto')}
          />
          <span className="create-pick-num">2</span>
          <strong>AI tune paper</strong>
          <span>AI tries many combinations and picks the best paper for difficulty, syllabus, and quality.</span>
        </label>
        <label className={mode === 'upload' ? 'active' : ''}>
          <input
            type="radio"
            name="pickMode"
            checked={mode === 'upload'}
            onChange={() => onModeChange('upload')}
          />
          <span className="create-pick-num">3</span>
          <strong>Upload questions for paper</strong>
          <span>Upload each question type to match the blueprint counts below.</span>
        </label>
      </div>

      {mode === 'upload' ? (
        <div className="create-upload-panel">
          <h3>Upload as per blueprint</h3>
          <p className="form-hint">
            Upload each type with the right Subject, Unit, Chapter, and Exam tags. When a row is
            complete, move to the next type.
          </p>
          <ul className="create-blueprint-upload-list">
            {slotProgress.map(({ slot, need, have }, i) => {
              const def = getQuestionType(slot.questionTypeId)
              const inBank = countPoolForSlot(syllabusPool, slot)
              const done = have >= need
              return (
                <li key={i} className={done ? 'done' : ''}>
                  <div className="create-blueprint-upload-head">
                    <strong>
                      {def.shortName} — {def.name}
                    </strong>
                    <span className={done ? 'badge badge-success' : 'badge'}>
                      {have}/{need} selected · {inBank} in bank
                    </span>
                  </div>
                  <p className="form-hint">
                    Upload <strong>{need}</strong> {def.shortName} question{need === 1 ? '' : 's'} for
                    this paper.
                  </p>
                  <Link
                    to={questionBankUploadUrl({
                      tab: 'single',
                      type: slot.questionTypeId,
                      owner: 'teacher',
                      from: 'create-paper',
                    })}
                    className="btn btn-secondary btn-sm"
                  >
                    Upload {def.shortName}
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="form-hint">
            After uploading, choose <strong>Select questions from bank</strong> above to pick them, or
            use <strong>Auto prepare</strong> to fill gaps.
          </p>
          <Link to="/question-bank" className="btn btn-primary">
            Open Question Bank
          </Link>
        </div>
      ) : null}

      {mode === 'auto' ? (
        <div className="create-auto-panel">
          <p className="form-hint">
            Blueprint: {slotSummaries.map((s) => `${s.count} ${s.typeLabel}`).join(', ')}.
          </p>
          <AiPaperTuningPanel
            pool={syllabusPool}
            slots={slots}
            syllabus={syllabus}
            examPatternId={examPatternId}
            toughnessTarget={toughnessTarget}
            onToughnessChange={onToughnessChange}
            onResult={(questions) =>
              onAutoResult(
                interleavePyqQuestions(
                  questions,
                  paperSource === 'mixed'
                    ? pyqPercent ?? 15
                    : paperSource === 'pyq-only'
                      ? 100
                      : 0,
                ),
              )
            }
            previewCount={autoPreview.length}
            pyqPercent={
              paperSource === 'mixed' ? pyqPercent : paperSource === 'pyq-only' ? 100 : 0
            }
          />
          <p className="form-hint create-auto-quick">
            Need a quick fill without AI scoring?{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => runAuto()}>
              Quick auto prepare
            </button>
          </p>
        </div>
      ) : null}

      {mode === 'bank' ? (
        <div className="create-bank-pick">
          <h3>
            Select {activeSlot?.count ?? 0} {activeSlot?.typeLabel ?? ''} question
            {(activeSlot?.count ?? 0) === 1 ? '' : 's'}
          </h3>
          <p className="form-hint">
            Step {activeSlotIndex + 1} of {slotSummaries.length} · {activeSlotSelected}/
            {activeSlot?.count ?? 0} chosen for this type · {selectedIds.length}/{needTotal} total
          </p>

          <div className="create-slot-tabs">
            {slotSummaries.map((s, i) => {
              const have = countSelectedForSlot(selectedQuestions, s)
              const complete = have >= s.count
              return (
                <button
                  key={i}
                  type="button"
                  className={`create-slot-tab${i === activeSlotIndex ? ' active' : ''}${complete ? ' complete' : ''}`}
                  onClick={() => {
                    setActiveSlotIndex(i)
                    setPickHint('')
                  }}
                >
                  {s.typeLabel} ({have}/{s.count})
                </button>
              )
            })}
          </div>

          {pickHint && <div className="create-pick-hint">{pickHint}</div>}

          {activeSlotSelected >= (activeSlot?.count ?? 0) && (activeSlot?.count ?? 0) > 0 && (
            <div className="create-pick-hint create-pick-hint-info">
              {activeSlot?.typeLabel} quota full ({activeSlot?.count}/{activeSlot?.count}). Uncheck
              one selected question below to swap in a different one.
            </div>
          )}

          {manualErrors.length > 0 && (
            <div className="upload-error create-pick-warn">
              {manualErrors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}

          {selectedForActiveSlot.length > 0 && (
            <div className="create-slot-selected-summary">
              <strong>Selected {activeSlot?.typeLabel}:</strong>
              <ul>
                {selectedForActiveSlot.map((q, i) => (
                  <li key={q.id}>
                    <span className="create-slot-selected-num">Q{i + 1}</span>
                    <MathText text={q.text ?? ''} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleQuestion(q.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="form-hint">
            Showing {slotCandidates.length} {activeSlot?.typeLabel} candidates. Read the full question
            below before ticking the box.
          </p>

          <div className="create-bank-pick-list">
            {groups.map((g) => (
              <div key={g.id} className="create-bank-group">
                {g.title && <h4>{g.title}</h4>}
                {g.questions.map((q) => {
                  const h = [q.section, q.chapter, q.topic].filter(Boolean).join(' · ')
                  const checked = selectedIds.includes(q.id)
                  const eff = effectiveQuestionTypeId(q)
                  const typeDef = getQuestionType(eff)
                  const slotFull =
                    !checked && activeSlotSelected >= (activeSlot?.count ?? 0)
                  const familyBlocked =
                    !checked && selectedFamilyIds.has(questionFamilyId(q) || String(q.id))
                  return (
                    <div
                      key={q.id}
                      className={`create-bank-row${checked ? ' picked' : ''}${slotFull || familyBlocked ? ' slot-full' : ''}`}
                    >
                      <label className="create-bank-row-head">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={slotFull || familyBlocked}
                          title={
                            familyBlocked
                              ? 'Original and similar cannot be in the same paper'
                              : undefined
                          }
                          onChange={() => toggleQuestion(q.id)}
                        />
                        <span className="create-bank-meta">
                          <span className="badge">{q.subject}</span>
                          <span className="badge">{typeDef.shortName}</span>
                          {h && <span className="form-hint">{h}</span>}
                          {q.toughnessLevel != null && (
                            <span className="badge">Lv {q.toughnessLevel}</span>
                          )}
                        </span>
                      </label>
                      <div className="create-bank-stem">
                        <BankPickQuestionPreview question={q} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            {slotCandidates.length === 0 && (
              <p className="form-hint">
                No {activeSlot?.typeLabel} questions match this syllabus.{' '}
                <Link
                  to={questionBankUploadUrl({
                    tab: 'single',
                    type: activeSlot?.questionTypeId ?? 'single_correct',
                    owner: 'teacher',
                    from: 'create-paper',
                  })}
                >
                  Upload some
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
