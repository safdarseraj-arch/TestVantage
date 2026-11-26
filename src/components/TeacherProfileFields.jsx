import {
  TEACHER_STANDARDS,
  TEACHER_SUBJECTS,
} from '../utils/userProfiles'
import {
  FACULTY_EXAM_SPECIALIZATIONS,
  FACULTY_MODE_LABELS,
  FACULTY_ONBOARDING_MODES,
  lookupSchoolInvite,
  personalVaultBlurb,
} from '../utils/facultyWorkbench'

function toggleId(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

function readSignatureFile(file, onChange) {
  if (!file) {
    onChange('signatureDataUrl', '')
    return
  }
  if (!String(file.type || '').startsWith('image/')) {
    onChange('signatureDataUrl', '')
    return
  }
  if (file.size > 320_000) {
    onChange('signatureDataUrl', '')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : ''
    onChange('signatureDataUrl', result)
  }
  reader.readAsDataURL(file)
}

/**
 * Shared teacher onboarding / profile fields.
 * Dual Path A (school invite) / Path B (independent B2T) from Faculty Workbench PDF.
 */
export default function TeacherProfileFields({
  values,
  onChange,
  disabled = false,
  showPathway = true,
}) {
  const mode = values.onboardingMode || FACULTY_ONBOARDING_MODES.INDEPENDENT
  const inviteHint = lookupSchoolInvite(values.schoolInviteCode)

  return (
    <>
      {showPathway ? (
        <fieldset className="onboarding-fieldset">
          <legend>How are you joining?</legend>
          <div className="onboarding-path-grid" role="radiogroup" aria-label="Faculty onboarding path">
            {[FACULTY_ONBOARDING_MODES.INDEPENDENT, FACULTY_ONBOARDING_MODES.SCHOOL].map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                className={`onboarding-path-card${mode === id ? ' is-on' : ''}`}
                onClick={() => onChange('onboardingMode', id)}
                disabled={disabled}
              >
                <strong>{FACULTY_MODE_LABELS[id]}</strong>
                <span>
                  {id === FACULTY_ONBOARDING_MODES.SCHOOL
                    ? 'Principal invited you — campus, department, and school bank rights.'
                    : 'Freelance / coaching — your Personal Vault, batches, and branded papers.'}
                </span>
              </button>
            ))}
          </div>
          <p className="form-hint onboarding-ip-hint">{personalVaultBlurb(mode)}</p>
        </fieldset>
      ) : null}

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

      {mode === FACULTY_ONBOARDING_MODES.SCHOOL ? (
        <>
          <label>
            School invite code
            <input
              type="text"
              value={values.schoolInviteCode || ''}
              onChange={(e) => onChange('schoolInviteCode', e.target.value)}
              placeholder="e.g. SCHOOL-DEMO"
              autoComplete="off"
              required
              disabled={disabled}
            />
          </label>
          {inviteHint ? (
            <p className="form-hint">
              Matches <strong>{inviteHint.campusName}</strong>
              {inviteHint.department ? ` · ${inviteHint.department}` : ''}. Classes:{' '}
              {(inviteHint.classes || []).join(', ')}.
            </p>
          ) : (
            <p className="form-hint">Ask your principal for the code. Demo: SCHOOL-DEMO or CAMPUS-TV.</p>
          )}
          <div className="onboarding-grid">
            <label>
              Campus / school
              <input
                type="text"
                value={values.campusName || ''}
                onChange={(e) => onChange('campusName', e.target.value)}
                placeholder="Filled from invite if blank"
                disabled={disabled}
              />
            </label>
            <label>
              Department
              <input
                type="text"
                value={values.department || ''}
                onChange={(e) => onChange('department', e.target.value)}
                placeholder="e.g. Physics"
                disabled={disabled}
              />
            </label>
          </div>
        </>
      ) : (
        <fieldset className="onboarding-fieldset">
          <legend>Exam specializations</legend>
          <div className="onboarding-chips">
            {FACULTY_EXAM_SPECIALIZATIONS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`onboarding-chip${(values.examSpecializations || []).includes(e.id) ? ' is-on' : ''}`}
                onClick={() =>
                  onChange('examSpecializations', toggleId(values.examSpecializations || [], e.id))
                }
                disabled={disabled}
              >
                {e.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="onboarding-grid">
        <label>
          Paper header text <span className="onboarding-optional">(optional)</span>
          <input
            type="text"
            value={values.paperHeaderText || ''}
            onChange={(e) => onChange('paperHeaderText', e.target.value)}
            maxLength={200}
            placeholder="School or coaching letterhead line"
            disabled={disabled}
          />
        </label>
        <label>
          PDF watermark <span className="onboarding-optional">(optional)</span>
          <input
            type="text"
            value={values.watermarkText || ''}
            onChange={(e) => onChange('watermarkText', e.target.value)}
            maxLength={120}
            placeholder="Your name · confidential"
            disabled={disabled}
          />
        </label>
      </div>

      <label>
        Digital signature <span className="onboarding-optional">(optional image)</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => readSignatureFile(e.target.files?.[0], onChange)}
          disabled={disabled}
        />
      </label>
      {values.signatureDataUrl ? (
        <p className="form-hint onboarding-signature-preview-wrap">
          <img
            src={values.signatureDataUrl}
            alt="Signature preview"
            className="onboarding-signature-preview"
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange('signatureDataUrl', '')}
            disabled={disabled}
          >
            Remove signature
          </button>
        </p>
      ) : (
        <p className="form-hint">PNG or JPG under ~300 KB. Used on branded paper exports later.</p>
      )}

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
