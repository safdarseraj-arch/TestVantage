import { useMemo } from 'react'
import {
  ACADEMIC_STATUSES,
  TARGET_EXAMS,
  currentCalendarYear,
  yearOptions,
} from '../utils/userProfiles'

function toggleId(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/**
 * Shared student onboarding / profile fields. Validation lives in userProfiles.js.
 */
export default function StudentProfileFields({ values, onChange, disabled = false }) {
  const nowY = currentCalendarYear()
  const tenthYears = useMemo(() => yearOptions(nowY - 16, nowY), [nowY])
  const examYears = useMemo(() => yearOptions(nowY, nowY + 4).reverse(), [nowY])

  const set = (field) => (e) => onChange(field, e.target.value)

  return (
    <>
      <div className="onboarding-grid">
        <label>
          Date of Birth
          <input
            type="date"
            value={values.dob}
            onChange={set('dob')}
            required
            disabled={disabled}
          />
        </label>
        <label>
          Father’s name
          <input
            type="text"
            value={values.fatherName}
            onChange={set('fatherName')}
            required
            autoComplete="name"
            placeholder="Full name"
            disabled={disabled}
          />
        </label>
        <label>
          Father’s contact number
          <input
            type="tel"
            value={values.fatherPhone}
            onChange={set('fatherPhone')}
            required
            inputMode="numeric"
            placeholder="10-digit mobile"
            autoComplete="tel"
            disabled={disabled}
          />
        </label>
        <label>
          Class 10 — marks obtained
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={values.tenthMarks}
            onChange={set('tenthMarks')}
            required
            placeholder="Percentage (0–100)"
            disabled={disabled}
          />
        </label>
        <label>
          Class 10 — year of passing
          <select
            value={values.tenthYear}
            onChange={set('tenthYear')}
            required
            disabled={disabled}
          >
            <option value="">Select year</option>
            {tenthYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          School name
          <input
            type="text"
            value={values.school}
            onChange={set('school')}
            required
            placeholder="Current or last school"
            disabled={disabled}
          />
        </label>
      </div>

      <fieldset className="onboarding-fieldset">
        <legend>Current academic status</legend>
        <div className="onboarding-chips">
          {ACADEMIC_STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`onboarding-chip${values.academicStatus === s.id ? ' is-on' : ''}`}
              onClick={() => onChange('academicStatus', s.id)}
              disabled={disabled}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="onboarding-fieldset">
        <legend>Target exam(s)</legend>
        <div className="onboarding-chips">
          {TARGET_EXAMS.map((exam) => (
            <button
              key={exam.id}
              type="button"
              className={`onboarding-chip${values.targetExams.includes(exam.id) ? ' is-on' : ''}`}
              onClick={() => onChange('targetExams', toggleId(values.targetExams, exam.id))}
              disabled={disabled}
            >
              {exam.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        Year of target exam
        <select
          value={values.targetYear}
          onChange={set('targetYear')}
          required
          disabled={disabled}
        >
          {examYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
