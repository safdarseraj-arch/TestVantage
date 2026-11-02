import { useCallback, useEffect, useMemo, useState } from 'react'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getPaperPatternSlotTotal, validatePaperPattern } from '../data/paperPatterns'
import { QUESTION_TYPES, formatMarkingLabel } from '../data/questionTypes'
import {
  clonePaperPattern,
  deletePaperPattern,
  listPaperPatterns,
  resetPaperPatternsToDefaults,
  upsertPaperPattern,
} from '../utils/paperPatternStore'

const EMPTY_SLOT = () => ({
  section: 'Section',
  questionTypeId: 'single_correct',
  count: 1,
  marking: { correct: 4, wrong: -1, unattempted: 0 },
})

function newPatternId(base) {
  return `${base}-custom-${Date.now()}`
}

export default function PaperPatternDesigner() {
  const [baseExam, setBaseExam] = useState('jee-advanced')
  const [refresh, setRefresh] = useState(0)
// eslint-disable-next-line react-hooks/exhaustive-deps
  const patterns = useMemo(() => listPaperPatterns(baseExam), [baseExam, refresh])
  const [selectedId, setSelectedId] = useState(patterns[0]?.id ?? '')
  const [draft, setDraft] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const loadDraft = useCallback((p) => {
    if (!p) {
      setDraft(null)
      return
    }
    setDraft({
      ...p,
      slots: p.slots.map((s) => ({
        ...s,
        marking: { ...s.marking },
      })),
    })
  }, [])

  useEffect(() => {
    const p = patterns.find((x) => x.id === selectedId) ?? patterns[0]
    if (p) {
      if (p.id !== selectedId) setSelectedId(p.id)
      loadDraft(p)
    } else {
      setDraft(null)
    }
  }, [patterns, selectedId, loadDraft, refresh])

  const slotSum = draft ? getPaperPatternSlotTotal(draft) : 0

  const bump = () => setRefresh((k) => k + 1)

  const handleNew = () => {
    const base = EXAM_PATTERNS.find((p) => p.id === baseExam)
    const d = {
      id: newPatternId(baseExam),
      baseExamPatternId: baseExam,
      name: `Custom ${base?.shortName ?? baseExam} paper`,
      description: '',
      totalMinutes: base?.totalMinutes ?? 180,
      totalCap: 18,
      durationMinutes: 40,
      isBuiltIn: false,
      slots: [EMPTY_SLOT(), { ...EMPTY_SLOT(), questionTypeId: 'numerical', section: 'Numerical' }],
    }
    setSelectedId(d.id)
    setDraft(d)
    setMsg({ type: '', text: '' })
  }

  const updateSlot = (index, field, value) => {
    if (!draft) return
    const slots = [...draft.slots]
    const slot = { ...slots[index] }
    if (field === 'count') {
      slot.count = Math.max(1, parseInt(String(value), 10) || 1)
    } else if (field.startsWith('marking.')) {
      const key = field.split('.')[1]
      slot.marking = { ...slot.marking, [key]: parseFloat(String(value)) || 0 }
    } else {
      slot[field] = value
    }
    slots[index] = slot
    setDraft({ ...draft, slots })
  }

  const addSlot = () => {
    if (!draft) return
    setDraft({ ...draft, slots: [...draft.slots, EMPTY_SLOT()] })
  }

  const removeSlot = (index) => {
    if (!draft || draft.slots.length <= 1) return
    setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) })
  }

  const syncCapToSlots = () => {
    if (!draft) return
    setDraft({ ...draft, totalCap: slotSum })
  }

  const handleSave = () => {
    if (!draft) return
    const toSave = { ...draft, totalCap: draft.totalCap ?? slotSum }
    const check = validatePaperPattern(toSave)
    if (!check.ok) {
      setMsg({ type: 'error', text: check.error ?? 'Invalid pattern' })
      return
    }
    const result = upsertPaperPattern(toSave)
    if (!result.ok) {
      setMsg({ type: 'error', text: result.error ?? 'Save failed' })
      return
    }
    setMsg({ type: 'success', text: 'Paper pattern saved.' })
    setSelectedId(result.pattern.id)
    bump()
  }

  const handleDelete = () => {
    if (!draft) return
    const result = deletePaperPattern(draft.id)
    if (!result.ok) {
      setMsg({ type: 'error', text: result.error ?? 'Delete failed' })
      return
    }
    setMsg({ type: 'success', text: 'Deleted.' })
    bump()
    const next = listPaperPatterns(baseExam)[0]
    setSelectedId(next?.id ?? '')
    loadDraft(next)
  }

  const handleClone = () => {
    if (!selectedId) return
    const result = clonePaperPattern(selectedId)
    if (!result.ok) {
      setMsg({ type: 'error', text: result.error ?? 'Clone failed' })
      return
    }
    setMsg({ type: 'success', text: 'Cloned — edit and save.' })
    setSelectedId(result.pattern.id)
    loadDraft(result.pattern)
    bump()
  }

  return (
    <div className="paper-pattern-designer">
      <p className="lead">
        Design how many questions of each type appear on a paper and their marking (+ve / −ve / unattempted).
        Essential for <strong>JEE Advanced</strong> where Paper 1 and Paper 2 differ.
      </p>

      <label className="pattern-base-select">
        Base exam
        <select value={baseExam} onChange={(e) => { setBaseExam(e.target.value); bump() }}>
          {EXAM_PATTERNS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="pattern-designer-layout">
        <aside className="pattern-list-panel card">
          <div className="pattern-list-head">
            <h3>Paper patterns</h3>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleNew}>
              + New
            </button>
          </div>
          <ul className="pattern-list">
            {patterns.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`pattern-list-item ${selectedId === p.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedId(p.id)
                    loadDraft(p)
                  }}
                >
                  <strong>{p.name}</strong>
                  <span>
                    {getPaperPatternSlotTotal(p)} Q · {p.slots.length} slots
                    {p.isBuiltIn ? ' · template' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {patterns.length === 0 && (
            <p className="form-hint">No patterns yet. Click New to create one.</p>
          )}
        </aside>

        <div className="pattern-editor-panel card">
          {!draft ? (
            <p className="form-hint">Select or create a paper pattern.</p>
          ) : (
            <>
              <div className="pattern-editor-meta">
                <label>
                  Pattern name
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label>
                  Description
                  <input
                    type="text"
                    value={draft.description ?? ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="e.g. 2024 Paper 1 — Section A–E"
                  />
                </label>
                <label>
                  Total questions (cap)
                  <input
                    type="number"
                    min={1}
                    value={draft.totalCap ?? slotSum}
                    onChange={(e) =>
                      setDraft({ ...draft, totalCap: parseInt(e.target.value, 10) || slotSum })
                    }
                  />
                  <span className="form-hint">
                    Slots sum: <strong>{slotSum}</strong>
                    {slotSum !== (draft.totalCap ?? slotSum) && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={syncCapToSlots}>
                        Match cap to slots
                      </button>
                    )}
                  </span>
                </label>
                <label>
                  Duration (chapter PYQ, min)
                  <input
                    type="number"
                    min={5}
                    value={draft.durationMinutes ?? 40}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        durationMinutes: parseInt(e.target.value, 10) || 40,
                      })
                    }
                  />
                </label>
                <label>
                  Full paper duration (min)
                  <input
                    type="number"
                    min={30}
                    value={draft.totalMinutes ?? 180}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        totalMinutes: parseInt(e.target.value, 10) || 180,
                      })
                    }
                  />
                </label>
              </div>

              <h3>Question slots</h3>
              <table className="pyq-pattern-table pattern-slot-editor">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Type</th>
                    <th>Count</th>
                    <th>+Correct</th>
                    <th>−Wrong</th>
                    <th>Unattempted</th>
                    <th>Partial</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {draft.slots.map((slot, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="text"
                          value={slot.section ?? ''}
                          onChange={(e) => updateSlot(i, 'section', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={slot.questionTypeId}
                          onChange={(e) => updateSlot(i, 'questionTypeId', e.target.value)}
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.shortName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={slot.count}
                          onChange={(e) => updateSlot(i, 'count', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={slot.marking.correct}
                          onChange={(e) => updateSlot(i, 'marking.correct', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={slot.marking.wrong}
                          onChange={(e) => updateSlot(i, 'marking.wrong', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={slot.marking.unattempted}
                          onChange={(e) => updateSlot(i, 'marking.unattempted', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="MSQ"
                          value={slot.marking.partial ?? ''}
                          onChange={(e) => updateSlot(i, 'marking.partial', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeSlot(i)}
                          title="Remove slot"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="form-hint">
                Preview:{' '}
                {draft.slots.map((s) => `${s.count}×${s.questionTypeId} (${formatMarkingLabel(s.marking)})`).join(' · ')}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addSlot}>
                + Add slot
              </button>

              <div className="pattern-editor-actions">
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                  Save pattern
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleClone}>
                  Clone selected
                </button>
                {!draft.isBuiltIn && (
                  <button type="button" className="btn btn-ghost" onClick={handleDelete}>
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    resetPaperPatternsToDefaults()
                    bump()
                    setMsg({ type: 'success', text: 'Reset to built-in templates.' })
                  }}
                >
                  Reset templates
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {msg.text && (
        <p className={msg.type === 'error' ? 'upload-error' : 'form-hint'}>{msg.text}</p>
      )}
    </div>
  )
}

