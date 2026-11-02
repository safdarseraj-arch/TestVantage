const STEPS = [
  { id: 'type', label: 'Paper type' },
  { id: 'syllabus', label: 'Syllabus' },
  { id: 'exam', label: 'Exam' },
  { id: 'blueprint', label: 'Question types' },
  { id: 'marking', label: 'Marking' },
  { id: 'prepare', label: 'Prepare paper' },
  { id: 'summary', label: 'Summary' },
  { id: 'review', label: 'Review & publish' },
]

/**
 * @param {{ step: number, maxStep: number, onGo: (n: number) => void, testTypeId?: string }} props
 */
export default function CreateTestStepper({ step, maxStep, onGo, testTypeId = 'chapter' }) {
  const stepLabel = (s, _i) => {
    if (testTypeId === 'speed' && s.id === 'blueprint') return 'Duration'
    if (testTypeId === 'speed' && (s.id === 'marking' || s.id === 'prepare')) return null
    return s.label
  }

  return (
    <nav className="create-wizard-steps" aria-label="Create test steps">
      {STEPS.map((s, i) => {
        const label = stepLabel(s, i)
        if (label === null) return null
        const done = i < step
        const active = i === step
        const reachable = i <= maxStep
        return (
          <button
            key={s.id}
            type="button"
            className={`create-wizard-step${active ? ' active' : ''}${done ? ' done' : ''}`}
            disabled={!reachable}
            onClick={() => reachable && onGo(i)}
          >
            <span className="create-wizard-step-num">{i + 1}</span>
            <span className="create-wizard-step-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export { STEPS as CREATE_TEST_STEPS }
