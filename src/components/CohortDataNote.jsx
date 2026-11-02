/**
 * Honest label for local cohort comparisons (device-only until go-live).
 * @param {{ studentCount?: number, className?: string }} props
 */
export default function CohortDataNote({ studentCount = 0, className = '' }) {
  if (studentCount > 1) {
    return (
      <p className={`si-cohort-note ${className}`.trim()}>
        <span className="si-cohort-badge">Local cohort</span>
        Compared with <strong>{studentCount}</strong> attempt{studentCount === 1 ? '' : 's'} saved on
        this device. Server-wide peer stats arrive after go-live.
      </p>
    )
  }

  return (
    <p className={`si-cohort-note si-cohort-note--solo ${className}`.trim()}>
      <span className="si-cohort-badge">Your data</span>
      Cohort averages need more attempts on this device — only your score is shown until then.
      National peer benchmarks come after go-live.
    </p>
  )
}
