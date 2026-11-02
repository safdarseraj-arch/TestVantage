import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import InsightPageHero from '../components/InsightPageHero'
import { useAuth } from '../context/AuthContext'
import { getAllTests } from '../data/tests'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  getLeaderboardForTest,
  getLeaderboardForTestAsync,
  getUserRank,
  leaderboardHasRealData,
} from '../utils/leaderboard'
import { scoreToPercentile } from '../utils/percentile'
import { allowAutoDemoSeed } from '../utils/prodSafety'

export default function Leaderboard() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const tests = getAllTests()
  const [testId, setTestId] = useState(tests[0]?.id ?? '')
  const [board, setBoard] = useState(() => getLeaderboardForTest(testId))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getLeaderboardForTestAsync(testId)
      .then((rows) => {
        if (!cancelled) setBoard(rows)
      })
      .catch(() => {
        if (!cancelled) setBoard(getLeaderboardForTest(testId))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [testId])

  const myEntries = board.filter((e) => e.ownerKey === ownerKey)
  const myBest = myEntries[0]
  const myRankInfo = myBest ? getUserRank(testId, myBest.score, ownerKey) : null
  const selectedTest = tests.find((t) => t.id === testId)
  const hasReal = leaderboardHasRealData(testId) || board.some((e) => !e.isDemo)
  const showingDevSeed = allowAutoDemoSeed() && board.some((e) => e.isDemo)

  return (
    <div className="page leaderboard-page insight-portal-page insight-portal-page--leaderboard student-portal-page">
      <InsightPageHero
        pageId="leaderboard"
        actions={
          <>
            <Link to="/form-forecast" className="btn btn-ghost btn-sm">
              Form Forecast
            </Link>
            <Link to="/my-results" className="btn btn-ghost btn-sm">
              My results
            </Link>
          </>
        }
      />

      <div className="insight-filter-bar">
        <label>
          Select test
          <select value={testId} onChange={(e) => setTestId(e.target.value)}>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        {selectedTest && (
          <p className="form-hint insight-filter-hint">
            {loading ? 'Loading…' : `${board.length} ranked attempt${board.length !== 1 ? 's' : ''}`}
            {hasReal ? ' · real scores' : ''}
          </p>
        )}
      </div>

      {showingDevSeed && (
        <p className="form-hint insight-hint-bar">
          Dev seed rows are marked <strong>Demo</strong> — live mode shows only real attempts.
        </p>
      )}

      {!hasReal && !showingDevSeed && board.length === 0 && (
        <p className="form-hint insight-hint-bar">
          No scored attempts for this test yet. Take it to open the board — ranks use real submits
          only (this browser + server when the API is up). Never a fake All-India list.
        </p>
      )}

      {myRankInfo && myBest && (
        <div className="insight-rank-hero">
          <div className="insight-rank-stat">
            <span className="insight-rank-label">Your best rank</span>
            <strong className="insight-rank-value">#{myRankInfo.rank}</strong>
            <span className="insight-rank-sub">of {myRankInfo.total} attempts</span>
          </div>
          <div className="insight-rank-stat">
            <span className="insight-rank-label">Score</span>
            <strong className="insight-rank-value insight-rank-value--sm">
              {myBest.score}/{myBest.maxScore}
            </strong>
            <span className="insight-rank-sub">
              {scoreToPercentile(myBest.score, myBest.maxScore).toFixed(1)} percentile
            </span>
          </div>
          <Link to={`/result/${testId}`} className="btn btn-primary btn-sm">
            View analysis
          </Link>
        </div>
      )}

      <div className="insight-table-card">
        <div className="insight-table-card-head">
          <h2>Attempt leaderboard</h2>
          <span>{selectedTest?.title ?? 'Select a test'}</span>
        </div>
        <div className="insight-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Student</th>
                <th>Score</th>
                <th>Percentile</th>
              </tr>
            </thead>
            <tbody>
              {board.map((e, i) => (
                <tr key={e.id} className={e.ownerKey === ownerKey ? 'leaderboard-you' : ''}>
                  <td>
                    {i < 3 ? (
                      <span className={`rank-medal rank-${i + 1}`}>{i + 1}</span>
                    ) : (
                      i + 1
                    )}
                  </td>
                  <td>
                    {e.userName}
                    {e.ownerKey === ownerKey && <span className="you-badge">You</span>}
                    {e.isDemo && <span className="demo-badge">Demo</span>}
                  </td>
                  <td>
                    <strong>
                      {e.score}/{e.maxScore}
                    </strong>
                  </td>
                  <td>{scoreToPercentile(e.score, e.maxScore).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!myBest && (
        <p className="insight-hint-bar">
          Take this test to appear on the board.{' '}
          <Link to={`/exam/${testId}`}>Start now →</Link>
        </p>
      )}
    </div>
  )
}
