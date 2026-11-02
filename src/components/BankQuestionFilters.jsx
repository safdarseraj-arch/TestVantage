import { useMemo } from 'react'
import {
  getChapterOptions,
  getSectionOptions,
  getTopicOptions,
} from '../utils/curriculumOptions.js'
import { getQuestionTypesForPicker } from '../data/questionTypes.js'
import { getSubjectOptionsForPicker } from '../utils/questionMetadata.js'
import { TOUGHNESS_BANDS } from '../utils/bankToughnessMix.js'
import {
  BANK_UNTAGGED_FILTER,
  BANK_EXAM_FILTER_OPTIONS,
  BANK_SOURCE_KIND_OPTIONS,
  BANK_FAMILY_KIND_OPTIONS,
  isBankCurriculumSubject,
  clearedBankListFilters,
  patchBankListFilters,
  collectQuestionTypesInBank,
  collectSourcesInBank,
  isQuestionMetaUntagged,
} from '../utils/bankListFilters.js'
import {
  collectPyqDatesInBank,
  collectPyqShiftsInBank,
  collectPyqPapersInBank,
  formatPyqDatePretty,
  JEE_ADV_PAPERS,
} from '../utils/pyqSlotMeta.js'
import { collectPyqYearsInBank } from '../utils/bankReviewFilters.js'
import {
  collectOperatorsInBank,
  effectiveBankStatus,
} from '../utils/questionUploadFilter.js'

/**
 * Browse / filter saved bank before scroll-review: exam, subject, chapter, topic, type, toughness, source.
 * @param {{
 *   questions: import('../data/tests').Question[]
 *   filters: import('../utils/bankListFilters.js').BankListFilters
 *   onFiltersChange: (next: import('../utils/bankListFilters.js').BankListFilters) => void
 *   matchCount: number
 *   totalCount: number
 *   hideBankStatusFilter?: boolean
 *   viewTab?: 'draft' | 'published'
 * }} props
 */
export default function BankQuestionFilters({
  questions,
  filters,
  onFiltersChange,
  matchCount,
  totalCount,
  hideBankStatusFilter = false,
  viewTab = 'draft',
}) {
  const untaggedCount = useMemo(
    () => questions.filter((q) => isQuestionMetaUntagged(q)).length,
    [questions],
  )

  const subjectOptions = useMemo(
    () => getSubjectOptionsForPicker([], questions),
    [questions],
  )

  const curriculumSubject = isBankCurriculumSubject(filters.subject)

  const sectionOptions = useMemo(
    () =>
      curriculumSubject ? getSectionOptions(filters.subject, questions) : [],
    [curriculumSubject, filters.subject, questions],
  )

  const chapterOptions = useMemo(
    () =>
      curriculumSubject && filters.section
        ? getChapterOptions(filters.subject, filters.section, questions)
        : [],
    [curriculumSubject, filters.subject, filters.section, questions],
  )

  const topicOptions = useMemo(
    () =>
      curriculumSubject && filters.section && filters.chapter
        ? getTopicOptions(filters.subject, filters.section, filters.chapter, questions)
        : [],
    [curriculumSubject, filters.subject, filters.section, filters.chapter, questions],
  )

  const typeOptions = useMemo(() => {
    const inBank = new Set(collectQuestionTypesInBank(questions))
    return getQuestionTypesForPicker().filter((t) => inBank.has(t.id))
  }, [questions])

  const sourceOptions = useMemo(() => collectSourcesInBank(questions), [questions])

  const pyqYears = useMemo(() => collectPyqYearsInBank(questions), [questions])
  const pyqDates = useMemo(() => collectPyqDatesInBank(questions), [questions])
  const pyqShifts = useMemo(() => collectPyqShiftsInBank(questions), [questions])
  const pyqPapers = useMemo(() => {
    const inBank = collectPyqPapersInBank(questions)
    return inBank.length ? inBank : JEE_ADV_PAPERS
  }, [questions])

  const examId = filters.examId ?? ''
  const showMainSlot = !examId || examId === 'jee-main'
  const showAdvPaper = !examId || examId === 'jee-advanced'
  const showYearSlot = !examId || examId === 'neet' || examId === 'jee-advanced' || examId === 'jee-main'

  const operatorOptions = useMemo(() => collectOperatorsInBank(questions), [questions])

  const draftCount = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === 'draft').length,
    [questions],
  )
  const publishedCount = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === 'published').length,
    [questions],
  )

  const subjectLabel =
    filters.subject === BANK_UNTAGGED_FILTER
      ? 'Untagged'
      : subjectOptions.find((s) => s.id === filters.subject)?.label ?? filters.subject

  const set = (patch) => onFiltersChange(patchBankListFilters(filters, patch))

  const clearAll = () =>
    onFiltersChange(
      clearedBankListFilters(filters, { hideBankStatusFilter, viewTab }),
    )

  return (
    <div className="bank-list-filters card-inner">
      <div className="bank-list-filters-head">
        <h4>Browse bank</h4>
        <p className="form-hint">
          Filter <strong>before</strong> you review: exam, subject, chapter, topic, type, toughness
          (Easy / Moderate / Tough), source (Gemini / upload / PYQ), and parent vs similar (C1).
          For PYQ also use date + shift (JEE Main), paper (JEE Advanced), or year (NEET). Combine
          any of them, then scroll the list — 10 cards per page on Review so the page stays smooth.
          Empty list means nothing matches.
        </p>
      </div>

      <label className="metadata-field bank-id-search-field">
        <span className="metadata-label">Search by Question ID</span>
        <input
          type="search"
          value={filters.questionIdQuery ?? ''}
          onChange={(e) => set({ questionIdQuery: e.target.value })}
          placeholder="e.g. MAQ00001, MAQ00001C1, MAQ00001A2024"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="form-hint metadata-cascade-hint">
          Type part of an ID (C1 or A2024 works). Paste several IDs with commas for bulk filter / publish
        </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">Parent / similar</span>
          <select
            value={filters.familyKind ?? ''}
            onChange={(e) => set({ familyKind: e.target.value })}
          >
            <option value="">All (parents and children)</option>
            {BANK_FAMILY_KIND_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            Originals are parents. Similar C1/C2 and replica papers are children — they never share
            a practice paper with the original.
          </span>
        </label>

        <div className="bank-list-filters-grid question-metadata-grid">
        <label className="metadata-field">
          <span className="metadata-label">Exam</span>
          <select value={filters.examId ?? ''} onChange={(e) => set({ examId: e.target.value })}>
            <option value="">All exams</option>
            {BANK_EXAM_FILTER_OPTIONS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        {showYearSlot ? (
          <label className="metadata-field">
            <span className="metadata-label">PYQ year</span>
            <select
              value={filters.pyqYear ?? ''}
              onChange={(e) => set({ pyqYear: e.target.value })}
            >
              <option value="">All years</option>
              {pyqYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            <span className="form-hint metadata-cascade-hint">
              NEET and Advanced use year. Main also keeps the year of the sitting.
            </span>
          </label>
        ) : null}

        {showMainSlot ? (
          <label className="metadata-field">
            <span className="metadata-label">JEE Main date</span>
            <select
              value={filters.pyqDate ?? ''}
              onChange={(e) => set({ pyqDate: e.target.value })}
            >
              <option value="">All dates</option>
              {pyqDates.map((d) => (
                <option key={d} value={d}>
                  {formatPyqDatePretty(d)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showMainSlot ? (
          <label className="metadata-field">
            <span className="metadata-label">JEE Main shift</span>
            <select
              value={filters.pyqShift ?? ''}
              onChange={(e) => set({ pyqShift: e.target.value })}
            >
              <option value="">All shifts</option>
              {(pyqShifts.length ? pyqShifts : [1, 2]).map((s) => (
                <option key={s} value={String(s)}>
                  Shift {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showAdvPaper ? (
          <label className="metadata-field">
            <span className="metadata-label">JEE Advanced paper</span>
            <select
              value={filters.pyqPaper ?? ''}
              onChange={(e) => set({ pyqPaper: e.target.value })}
            >
              <option value="">All papers</option>
              {pyqPapers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="metadata-field">
          <span className="metadata-label">1. Subject</span>
          <select
            value={filters.subject}
            onChange={(e) => set({ subject: e.target.value })}
          >
            <option value="">All subjects</option>
            {untaggedCount > 0 && (
              <option value={BANK_UNTAGGED_FILTER}>
                Untagged ({untaggedCount})
              </option>
            )}
            {subjectOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">2. Unit</span>
          <select
            value={filters.section}
            onChange={(e) => set({ section: e.target.value })}
            disabled={!curriculumSubject}
          >
            <option value="">All units</option>
            {sectionOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {filters.subject === BANK_UNTAGGED_FILTER
              ? 'Unit filter not used for Untagged'
              : curriculumSubject
                ? `Units in ${subjectLabel}`
                : 'Select subject first'}
          </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">3. Chapter</span>
          <select
            value={filters.chapter}
            onChange={(e) => set({ chapter: e.target.value })}
            disabled={!filters.section}
          >
            <option value="">All chapters</option>
            {chapterOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {filters.section ? `Chapters in “${filters.section}”` : 'Select unit first'}
          </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">4. Topic</span>
          <select
            value={filters.topic}
            onChange={(e) => set({ topic: e.target.value })}
            disabled={!filters.chapter}
          >
            <option value="">All topics</option>
            {topicOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            {filters.chapter ? `Topics in “${filters.chapter}”` : 'Select chapter first'}
          </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">5. Type of question</span>
          <select
            value={filters.questionType}
            onChange={(e) => set({ questionType: e.target.value })}
          >
            <option value="">All types</option>
            {typeOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.shortName} — {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">6. Toughness</span>
          <select
            value={filters.toughnessBand ?? ''}
            onChange={(e) => set({ toughnessBand: e.target.value, toughnessLevel: '' })}
          >
            <option value="">All toughness</option>
            {TOUGHNESS_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.hint})
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            Easy = T1-T3 · Moderate = T4-T7 · Tough = T8-T10
          </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">7. Source</span>
          <select
            value={filters.sourceKind ?? ''}
            onChange={(e) => set({ sourceKind: e.target.value, source: '' })}
          >
            <option value="">All sources</option>
            {BANK_SOURCE_KIND_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            Gemini, upload, or PYQ (official and PYQ-style AI). Pick an exact label below to narrow further.
          </span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">Exact source label</span>
          <select
            value={filters.source ?? ''}
            onChange={(e) => set({ source: e.target.value, sourceKind: '' })}
            disabled={Boolean(filters.sourceKind)}
          >
            <option value="">All labels</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">8. Upload date from</span>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => set({ dateFrom: e.target.value })}
          />
          <span className="form-hint metadata-cascade-hint">First saved on or after this day</span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">9. Upload date to</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => set({ dateTo: e.target.value })}
          />
          <span className="form-hint metadata-cascade-hint">First saved on or before this day</span>
        </label>

        <label className="metadata-field">
          <span className="metadata-label">10. Teacher / operator</span>
          <select
            value={filters.uploadedBy ?? ''}
            onChange={(e) => set({ uploadedBy: e.target.value })}
          >
            <option value="">All operators</option>
            {operatorOptions.map((op) => (
              <option key={op.id} value={op.id}>
                {op.label} ({op.count})
              </option>
            ))}
          </select>
          <span className="form-hint metadata-cascade-hint">
            Who saved the question (from your login name)
          </span>
        </label>

        {!hideBankStatusFilter && (
        <label className="metadata-field">
          <span className="metadata-label">11. Bank status</span>
          <select
            value={filters.bankStatus ?? ''}
            onChange={(e) => set({ bankStatus: e.target.value })}
          >
            <option value="">All ({questions.length})</option>
            <option value="draft">Draft only ({draftCount})</option>
            <option value="published">Published only ({publishedCount})</option>
          </select>
          <span className="form-hint metadata-cascade-hint">
            Draft questions stay hidden from papers until someone with publish rights approves them
          </span>
        </label>
        )}
      </div>

      <div className="bank-list-filters-footer">
        <span className="form-hint">
          Showing <strong>{matchCount}</strong> of <strong>{totalCount}</strong> questions
        </span>
        {(filters.examId ||
          filters.subject ||
          filters.section ||
          filters.chapter ||
          filters.topic ||
          filters.questionType ||
          filters.toughnessBand ||
          filters.toughnessLevel ||
          filters.sourceKind ||
          filters.source ||
          filters.pyqYear ||
          filters.pyqDate ||
          filters.pyqShift ||
          filters.pyqPaper ||
          filters.dateFrom ||
          filters.dateTo ||
          filters.uploadedBy ||
          filters.bankStatus ||
          filters.questionIdQuery ||
          filters.familyKind) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
