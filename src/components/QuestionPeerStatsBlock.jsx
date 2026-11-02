/**
 * Per-question peer response and time comparison tables.
 * @param {{
 *   peer: {
 *     appearedTo: number
 *     correct: number
 *     wrong: number
 *     skipped: number
 *     correctPct: number
 *     wrongPct: number
 *     skippedPct: number
 *     studentCount: number
 *     avgTimeSeconds: number | null
 *     top10TimeSeconds: number | null
 *     top25TimeSeconds: number | null
 *     top50TimeSeconds: number | null
 *     timeSampleSize: number
 *   } | null | undefined
 *   yourTimeSeconds?: number | null
 * }} props
 */
export default function QuestionPeerStatsBlock({ peer, yourTimeSeconds }) {
  const yourSec = Number(yourTimeSeconds ?? 0)
  const hasYourTime = yourSec > 0

  const formatSec = (val) => {
    if (val == null || val <= 0) return '—'
    if (val < 60) return `${val}s`
    const m = Math.floor(val / 60)
    const s = val % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }

  const cohortHint =
    !peer || peer.studentCount <= 1
      ? 'When more students complete this test on the same device, these numbers update automatically.'
      : peer.timeSampleSize <= 1
        ? 'Time benchmarks need more timed attempts on this question.'
        : null

  const appeared = peer?.appearedTo ?? 0

  return (
    <div className="rqw-peer-stats">
      <section className="rqw-peer-section">
        <h4>How students on this device responded</h4>
        <div className="rqw-peer-table-wrap">
          <table className="rqw-peer-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="rqw-peer-num">Count</th>
                <th className="rqw-peer-num">Percentage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Question appeared to</td>
                <td className="rqw-peer-num">
                  <strong>{appeared || peer?.studentCount || '—'}</strong>
                </td>
                <td className="rqw-peer-num">—</td>
              </tr>
              <tr className="rqw-peer-row-correct">
                <td>Marked correct</td>
                <td className="rqw-peer-num">{peer?.correct ?? '—'}</td>
                <td className="rqw-peer-num">{peer ? `${peer.correctPct}%` : '—'}</td>
              </tr>
              <tr className="rqw-peer-row-wrong">
                <td>Marked incorrect</td>
                <td className="rqw-peer-num">{peer?.wrong ?? '—'}</td>
                <td className="rqw-peer-num">{peer ? `${peer.wrongPct}%` : '—'}</td>
              </tr>
              <tr className="rqw-peer-row-skipped">
                <td>Skipped</td>
                <td className="rqw-peer-num">{peer?.skipped ?? '—'}</td>
                <td className="rqw-peer-num">{peer ? `${peer.skippedPct}%` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rqw-peer-section">
        <h4>Time comparison</h4>
        <div className="rqw-peer-table-wrap">
          <table className="rqw-peer-table">
            <thead>
              <tr>
                <th>Benchmark</th>
                <th className="rqw-peer-num">Time taken</th>
              </tr>
            </thead>
            <tbody>
              <tr className="rqw-peer-row-you">
                <td>Time taken by you</td>
                <td className="rqw-peer-num">
                  <strong>{hasYourTime ? formatSec(yourSec) : '—'}</strong>
                </td>
              </tr>
              <tr>
                <td>Average time taken</td>
                <td className="rqw-peer-num">{formatSec(peer?.avgTimeSeconds)}</td>
              </tr>
              <tr>
                <td>Fastest 10% on this device</td>
                <td className="rqw-peer-num">{formatSec(peer?.top10TimeSeconds)}</td>
              </tr>
              <tr>
                <td>Fastest 25% on this device</td>
                <td className="rqw-peer-num">{formatSec(peer?.top25TimeSeconds)}</td>
              </tr>
              <tr>
                <td>Fastest 50% on this device</td>
                <td className="rqw-peer-num">{formatSec(peer?.top50TimeSeconds)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="form-hint rqw-peer-time-hint">
          Fastest-% rows are local device times only — not a national rank.
        </p>
      </section>

      {cohortHint && <p className="form-hint rqw-peer-cohort-hint">{cohortHint}</p>}
    </div>
  )
}
