import { Link } from 'react-router-dom'
import AnalyticsDashboard from '../components/AnalyticsDashboard'
import InsightPageHero from '../components/InsightPageHero'
import { useAuth } from '../context/AuthContext'
import { buildUserAnalytics } from '../utils/analytics'
import { getAttemptsByOwner, getOwnerKey } from '../utils/attemptHistory'

export default function Analytics() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const attempts = getAttemptsByOwner(ownerKey)
  const stats = buildUserAnalytics(attempts)

  return (
    <div className="page analytics-page si-analytics-page insight-portal-page insight-portal-page--analytics student-portal-page">
      <InsightPageHero
        pageId="analytics"
        actions={
          <>
            <Link to="/my-results" className="btn btn-ghost btn-sm">
              My results
            </Link>
            <Link to="/form-forecast" className="btn btn-ghost btn-sm">
              Form Forecast
            </Link>
            <Link to="/mock-test" className="btn btn-primary btn-sm">
              AI Mock Builder
            </Link>
          </>
        }
      />

      {stats.totalAttempts === 0 ? (
        <div className="insight-empty-state">
          <div className="insight-empty-icon">📊</div>
          <h2>Your analytics unlock after your first mock</h2>
          <p>
            Take a timed test or build your own AI paper — then see percentile trends, weak chapters,
            and a study path here. Practice AIR and Exam Fit live on Form Forecast.
          </p>
          <div className="insight-empty-actions">
            <Link to="/mock-test" className="btn btn-primary">
              AI Mock Builder
            </Link>
            <Link to="/practice" className="btn btn-ghost">
              Syllabus practice
            </Link>
          </div>
        </div>
      ) : (
        <AnalyticsDashboard stats={stats} attempts={attempts} />
      )}
    </div>
  )
}
