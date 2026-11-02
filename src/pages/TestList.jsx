import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import { getAssignedTestIdsForClasses } from '../utils/assignmentsStore'
import { getClassesForStudent } from '../utils/classesStore'
import { getUserById } from '../utils/users'
import PatternBlueprint from '../components/PatternBlueprint'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getExamPattern, getPatternMarkingLabel } from '../data/examPatterns'
import { QUESTION_TYPES } from '../data/questionTypes'
import { TEST_TYPES } from '../data/testTypes'
import { getTestType } from '../data/testTypes'
import { filterTests } from '../data/tests'
import { examPath } from '../utils/examNavigation.js'
import { loadCustomTests, removeCustomTest } from '../utils/customTests.js'
import { isTestPublished, getTestPublishStatus } from '../utils/paperPublish.js'
import StudentNotificationsBanner from '../components/StudentNotificationsBanner.jsx'
import PreparePageHero from '../components/PreparePageHero'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS, STAFF_WORKING_TEST_ID } from '../utils/demoStudentAccess.js'

export default function TestList() {
  const { session, isUser, isTeacher, hasPermission } = useAuth()
  const [examFilter, setExamFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expandedPattern, setExpandedPattern] = useState('')
  const [showReference, setShowReference] = useState(false)
  const [testsRevision, setTestsRevision] = useState(0)

  useEffect(() => {
    loadCustomTests()
    setTestsRevision((n) => n + 1)
  }, [])

  const studentClassIds = useMemo(() => {
    if (!isUser || !session?.userId) return []
    const user = getUserById(session.userId)
    if (user?.classIds?.length) return user.classIds
    return getClassesForStudent(session.userId).map((c) => c.id)
  }, [isUser, session?.userId])

  const assignedTestIds = useMemo(
    () => getAssignedTestIdsForClasses(studentClassIds),
    [studentClassIds],
  )

  const canCreate = session?.role === 'admin' || hasPermission(PERMS.CREATE_PAPER)
  const isStudentView = isUser && !isTeacher && session?.role !== 'admin'
  const demoStudent = isDemoStudentIdentity(session)
  const hasAssignedView = isUser && studentClassIds.length > 0 && !demoStudent

  const [viewMode, setViewMode] = useState('all')

  const allTests = useMemo(
    () => filterTests({ examPatternId: examFilter || undefined, testTypeId: typeFilter || undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examFilter, typeFilter, testsRevision],
  )

  const displayedTests = useMemo(() => {
    let list = allTests.filter((t) => {
      if (isStudentView && t.id === STAFF_WORKING_TEST_ID) return false
      return true
    })
    if (viewMode === 'assigned' && hasAssignedView) {
      list = list.filter((t) => assignedTestIds.includes(t.id))
    }
    if (!canCreate && !demoStudent && studentClassIds.length > 0) {
      list = list.filter((t) => {
        if (!t.id?.startsWith('custom-')) return true
        return isTestPublished(t) && assignedTestIds.includes(t.id)
      })
    } else if (!canCreate) {
      list = list.filter((t) => !t.id?.startsWith('custom-') || isTestPublished(t))
    }
    if (demoStudent && viewMode === 'all') {
      const sampleSet = new Set(DEMO_SAMPLE_TEST_IDS)
      list = [...list].sort((a, b) => {
        const aSample = sampleSet.has(a.id) ? 0 : 1
        const bSample = sampleSet.has(b.id) ? 0 : 1
        return aSample - bSample
      })
    }
    return list
  }, [allTests, assignedTestIds, hasAssignedView, viewMode, canCreate, studentClassIds, isStudentView, demoStudent])

  const handleDeletePaper = (test) => {
    if (!test?.id?.startsWith('custom-')) return
    const ok = window.confirm(
      `Delete "${test.title}"?\n\nThis only removes the paper from your test list. Questions stay in the Question Bank.`,
    )
    if (!ok) return
    removeCustomTest(test.id)
    setTestsRevision((n) => n + 1)
  }

  return (
    <div
      className={`page tests-page tests-page-pro${isStudentView ? ' student-portal-page prepare-mode-page prepare-mode-page--official-mocks' : ''}`}
    >
      {isStudentView ? (
        <PreparePageHero
          modeId="official-mocks"
          lead="Teacher assignments and NTA-style sample papers (labelled Sample — not official NTA PYQ). Filter by exam or type, then start. Want a custom syllabus? Use AI Mock Builder."
          actions={
            <Link to="/mock-test" className="btn btn-primary btn-sm">
              AI Mock Builder
            </Link>
          }
        />
      ) : (
        <header className="tests-hero">
          <div>
            <p className="tests-eyebrow">Mock tests</p>
            <h1>Choose your paper</h1>
            <p className="tests-lead">
              NTA-style blueprints with accurate marking. Filter by exam or series type, then start
              when you are ready.
            </p>
          </div>
          <div className="tests-hero-actions">
            <Link to="/home" className="btn btn-ghost btn-sm">
              ← Dashboard
            </Link>
            {canCreate && (
              <>
                <Link to="/create-test" className="btn btn-primary">
                  + Create test
                </Link>
                <Link to="/edit-test" className="btn btn-secondary">
                  Edit test
                </Link>
              </>
            )}
          </div>
        </header>
      )}

      {isStudentView && (
        <div className="sp-build-mock-banner">
          <div>
            <strong>
              <span className="ai-tune-badge">AI</span> AI Mock Builder
            </strong>
            <p>Pick exam, syllabus &amp; paper type — no teacher paper needed.</p>
          </div>
          <Link to="/mock-test" className="sp-btn sp-btn-primary sp-btn-sm">
            AI Mock Builder →
          </Link>
        </div>
      )}

      {isUser && session?.userId && (
        <StudentNotificationsBanner userId={session.userId} compact />
      )}

      {hasAssignedView && (
        <div className="tests-view-toggle">
          <button
            type="button"
            className={`tests-toggle-btn ${viewMode === 'assigned' ? 'active' : ''}`}
            onClick={() => setViewMode('assigned')}
          >
            Assigned to me
            <span className="tests-toggle-count">{assignedTestIds.length}</span>
          </button>
          <button
            type="button"
            className={`tests-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            All mock tests
          </button>
        </div>
      )}

      <div className="tests-filter-bar card">
        <label className="tests-filter-field">
          <span>Exam pattern</span>
          <select value={examFilter} onChange={(e) => setExamFilter(e.target.value)}>
            <option value="">All exams</option>
            {EXAM_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tests-filter-field">
          <span>Paper type</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {TEST_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {(examFilter || typeFilter) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm tests-clear-filters"
            onClick={() => {
              setExamFilter('')
              setTypeFilter('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="tests-result-count">
        {displayedTests.length} test{displayedTests.length === 1 ? '' : 's'} available
      </p>

      <ul className="tests-grid tests-grid-cards">
        {displayedTests.length === 0 ? (
          <li className="tests-empty card">
            <span className="tests-empty-icon">📝</span>
            <strong>No tests here yet</strong>
            <p>
              {viewMode === 'assigned'
                ? 'No tests assigned to your class yet. Build your own mock or browse all papers.'
                : 'No tests match these filters. Try clearing filters or build an AI mock.'}
            </p>
            <div className="sp-empty-actions">
              {viewMode === 'assigned' && (
                <button
                  type="button"
                  className="sp-btn sp-btn-outline sp-btn-sm"
                  onClick={() => setViewMode('all')}
                >
                  Browse all mocks
                </button>
              )}
              {isStudentView && (
                <Link to="/mock-test" className="sp-btn sp-btn-primary sp-btn-sm">
                  Build your mock
                </Link>
              )}
            </div>
          </li>
        ) : (
          displayedTests.map((test) => {
            const pattern = getExamPattern(test.examPatternId)
            const type = getTestType(test.testTypeId)
            const isAssigned = assignedTestIds.includes(test.id)
            const isCustomPaper = test.id?.startsWith('custom-')
            const isDraft = isCustomPaper && getTestPublishStatus(test) === 'draft'
            return (
              <li
                key={test.id}
                className="test-card-pro"
                style={{ '--card-accent': pattern.color }}
              >
                <div className="test-card-pro-top">
                  <div className="test-badges">
                    <span className="badge badge-exam" style={{ background: pattern.color }}>
                      {pattern.shortName}
                    </span>
                    <span className="badge badge-type">
                      {type.icon} {type.name}
                    </span>
                    {isAssigned && <span className="badge badge-assigned">Assigned</span>}
                    {test.isSample && <span className="demo-badge">Sample paper</span>}
                    {isDraft && <span className="badge badge-draft">Draft</span>}
                    {isCustomPaper && !isDraft && test.qualityScore != null && (
                      <span className="badge badge-published">TQS {test.qualityScore}</span>
                    )}
                  </div>
                  <h3>
                    <a href={examPath(test.id)} className="test-card-title-link">
                      {test.title}
                    </a>
                  </h3>
                  <ul className="test-card-meta">
                    <li>{test.totalQuestions} questions</li>
                    <li>{test.durationMinutes} min</li>
                    <li>{getPatternMarkingLabel(pattern)}</li>
                  </ul>
                </div>
                <a href={examPath(test.id)} className={isStudentView ? 'sp-btn sp-btn-primary sp-btn-sm test-card-cta' : 'btn btn-primary test-card-cta'}>
                  Start test →
                </a>
                {canCreate && isCustomPaper && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm test-card-delete"
                    onClick={() => handleDeletePaper(test)}
                  >
                    Delete paper
                  </button>
                )}
                {!isStudentView && (
                  <p className="form-hint test-card-open-hint">
                    Button stuck? Click the paper name above, or copy:{' '}
                    <a href={examPath(test.id)} className="test-card-url-link">
                      open exam link
                    </a>
                  </p>
                )}
              </li>
            )
          })
        )}
      </ul>

      <div className="tests-reference-toggle">
        <button
          type="button"
          className="tests-ref-btn"
          onClick={() => setShowReference((v) => !v)}
          aria-expanded={showReference}
        >
          {showReference ? 'Hide' : 'Show'} exam format reference
          <span aria-hidden="true">{showReference ? ' ▲' : ' ▼'}</span>
        </button>
      </div>

      {showReference && (
        <div className="tests-reference-panel">
          <section className="marking-reference card">
            <h2>Exam patterns (blueprint)</h2>
            {EXAM_PATTERNS.map((p) => (
              <div key={p.id} className="pattern-expand-block">
                <button
                  type="button"
                  className="pattern-expand-head"
                  onClick={() => setExpandedPattern(expandedPattern === p.id ? '' : p.id)}
                  style={{ borderLeftColor: p.color }}
                >
                  <strong>{p.name}</strong>
                  <span>{getPatternMarkingLabel(p)}</span>
                  <span className="expand-hint">{expandedPattern === p.id ? '▲' : '▼'} details</span>
                </button>
                {expandedPattern === p.id && <PatternBlueprint pattern={p} />}
              </div>
            ))}
          </section>

          <section className="test-type-legend card">
            <h2>Question types</h2>
            <div className="type-legend-grid">
              {QUESTION_TYPES.map((t) => (
                <div key={t.id} className="type-legend-item">
                  <strong>{t.name}</strong>
                  <span className="type-marking-badge">{t.markingLabel}</span>
                  <p>{t.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="test-type-legend card">
            <h2>Test paper types</h2>
            <div className="type-legend-grid">
              {TEST_TYPES.map((t) => (
                <div key={t.id} className="type-legend-item">
                  <span>{t.icon}</span> <strong>{t.name}</strong>
                  <p>{t.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

