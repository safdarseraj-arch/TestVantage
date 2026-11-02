import { TEACHER_STANDARDS, TEACHER_SUBJECTS } from '../utils/userProfiles'

function toggleId(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/**
 * Shared teacher onboarding / profile fields. Validation lives in userProfiles.js.
 */
export default function TeacherProfileFields({ values, onChange, disabled = false }) {
  return (
    <>
      <label>
        Date of Birth
        <input
          type="date"
          value={values.dob}
          onChange={(e) => onChange('dob', e.target.value)}
          required
          disabled={disabled}
        />
      </label>

      <fieldset className="onboarding-fieldset">
        <legend>Subject(s) you teach</legend>
        <div className="onboarding-chips">
          {TEACHER_SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`onboarding-chip${values.subjects.includes(s.id) ? ' is-on' : ''}`}
              onClick={() => onChange('subjects', toggleId(values.subjects, s.id))}
              disabled={disabled}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="onboarding-fieldset">
        <legend>Standard(s) you teach</legend>
        <div className="onboarding-chips">
          {TEACHER_STANDARDS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`onboarding-chip${values.standards.includes(s.id) ? ' is-on' : ''}`}
              onClick={() => onChange('standards', toggleId(values.standards, s.id))}
              disabled={disabled}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label>
        Academic / past experience <span className="onboarding-optional">(optional)</span>
        <textarea
          value={values.experience}
          onChange={(e) => onChange('experience', e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Schools, coaching, years taught — optional"
          disabled={disabled}
        />
      </label>
    </>
  )
}
