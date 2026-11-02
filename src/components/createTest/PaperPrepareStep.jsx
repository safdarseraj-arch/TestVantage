import { useMemo } from 'react'
import PatternBlueprint from '../PatternBlueprint'
import QuestionPickStep from './QuestionPickStep'
import { totalSlotCount } from '../../utils/paperAssembly'
import { isPyqLike } from '../../utils/pyqDetect.js'

/**
 * Blueprint review + choose how to fill the paper (bank / auto / upload).
 *
 * @param {{
 *   pattern: import('../../data/examPatterns').ExamPattern
 *   slots: import('../../data/examPatterns').QuestionTypeSlot[]
 *   durationMinutes: number
 *   pickMode: 'bank' | 'upload' | 'auto' | null
 *   onModeChange: (m: 'bank' | 'upload' | 'auto') => void
 *   pool: import('../../data/tests').Question[]
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   examPatternId: string
 *   toughnessTarget: number
 *   onToughnessChange: (n: number) => void
 *   selectedIds: string[]
 *   onSelectedIdsChange: (ids: string[]) => void
 *   onAutoResult: (questions: import('../../data/tests').Question[]) => void
 *   autoPreview: import('../../data/tests').Question[]
 *   pyqPercent?: number
 *   onPyqPercentChange?: (n: number) => void
 *   paperSource?: 'mixed' | 'pyq-only' | 'bank-only'
 *   onPaperSourceChange?: (s: 'mixed' | 'pyq-only' | 'bank-only') => void
 *   syllabusPool?: import('../../data/tests').Question[]
 * }} props
 */
export default function PaperPrepareStep({
  pattern,
  slots,
  durationMinutes,
  pickMode,
  onModeChange,
  pool,
  syllabus,
  examPatternId,
  toughnessTarget,
  onToughnessChange,
  selectedIds,
  onSelectedIdsChange,
  onAutoResult,
  autoPreview,
  pyqPercent = 15,
  onPyqPercentChange,
  paperSource = 'mixed',
  onPaperSourceChange,
  syllabusPool = [],
}) {
  const blueprintPattern = useMemo(
    () => ({
      ...pattern,
      questionSlots: slots,
      totalMinutes: durationMinutes,
    }),
    [pattern, slots, durationMinutes],
  )

  const needTotal = totalSlotCount(slots)
  const poolPyqCount = syllabusPool.filter(isPyqLike).length
  const poolBankCount = syllabusPool.length - poolPyqCount

  return (
    <>
      <section className="create-section card pyq-paper-mix-panel">
        <h2>PYQ mix for this paper</h2>
        <p className="form-hint">
          Choose how much of the paper comes from previous-year questions. Auto-generate spreads PYQ
          through the paper in that order. Assign published papers to students from Edit Test.
        </p>
        <div className="pyq-paper-mix-grid">
          <label>
            Question source
            <select
              value={paperSource}
              onChange={(e) =>
                onPaperSourceChange?.(/** @type {'mixed' | 'pyq-only' | 'bank-only'} */ (e.target.value))
              }
            >
              <option value="mixed">Bank + PYQ mix</option>
              <option value="pyq-only">100% PYQ paper</option>
              <option value="bank-only">Question bank only</option>
            </select>
          </label>
          {paperSource === 'mixed' && (
            <label>
              PYQ share (%)
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={pyqPercent}
                onChange={(e) => onPyqPercentChange?.(Number(e.target.value))}
              />
              <span className="form-hint">
                Target <strong>{pyqPercent}%</strong> PYQ · pool has {poolPyqCount} PYQ /{' '}
                {poolBankCount} bank ({syllabusPool.length} total)
              </span>
            </label>
          )}
          {paperSource === 'pyq-only' && (
            <p className="form-hint">
              <strong>{poolPyqCount}</strong> PYQ questions available for this exam &amp; syllabus.
            </p>
          )}
        </div>
      </section>

      <section className="create-section card instructions-box">
        <h2>Exam pattern blueprint</h2>
        <p className="form-hint">
          Your paper needs <strong>{needTotal}</strong> questions in this order. Choose how
          TestVantages should fill it.
        </p>
        <PatternBlueprint pattern={blueprintPattern} />
      </section>

      <QuestionPickStep
        mode={pickMode}
        onModeChange={onModeChange}
        pool={syllabusPool.length ? syllabusPool : pool}
        syllabus={syllabus}
        slots={slots}
        examPatternId={examPatternId}
        toughnessTarget={toughnessTarget}
        onToughnessChange={onToughnessChange}
        selectedIds={selectedIds}
        onSelectedIdsChange={onSelectedIdsChange}
        onAutoResult={onAutoResult}
        autoPreview={autoPreview}
        showBlueprint={false}
        pyqPercent={paperSource === 'mixed' ? pyqPercent : paperSource === 'pyq-only' ? 100 : 0}
        paperSource={paperSource}
      />
    </>
  )
}
