import { Link } from 'react-router-dom'
import PreparePageHero from '../components/PreparePageHero'
import { getExamPattern } from '../data/examPatterns'
import { getTestSeries } from '../data/testSeries'
import { getTestById } from '../data/tests'

function formatSeriesDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function TestSeries() {
  const series = getTestSeries()

  return (
    <div className="page test-series-page prepare-mode-page">
      <PreparePageHero
        modeId="test-series"
        lead="Week-by-week mocks on a date calendar. Sample papers until your teacher publishes a series — not another institute’s All-India brand."
        actions={
          <Link to="/leaderboard" className="btn btn-ghost btn-sm">
            Leaderboard
          </Link>
        }
      />

      {series.map((s) => {
        const pattern = getExamPattern(s.examPatternId)
        return (
          <section key={s.id} className="card series-card">
            <div className="series-card-head" style={{ borderColor: s.color }}>
              <div>
                <h2>{s.name}</h2>
                <p className="form-hint">{s.description}</p>
                <span className="badge badge-exam" style={{ background: pattern.color }}>
                  {pattern.name}
                </span>
              </div>
            </div>
            <ol className="series-schedule">
              {s.tests.map((item, idx) => {
                const test = getTestById(item.testId)
                if (!test) return null
                return (
                  <li key={item.testId} className="series-week-item">
                    <span className="series-week">
                      Week {item.week}
                      {item.date ? (
                        <>
                          <br />
                          <small>{formatSeriesDate(item.date)}</small>
                        </>
                      ) : null}
                    </span>
                    <div className="series-week-body">
                      <strong>{item.label}</strong>
                      <span>
                        {test.totalQuestions} Q · {test.durationMinutes} min · {item.type}
                      </span>
                    </div>
                    <Link to={`/exam/${item.testId}`} className="btn btn-sm btn-primary">
                      {idx === 0 ? 'Start series' : 'Take test'}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
