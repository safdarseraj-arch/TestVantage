import { Fragment } from 'react'
import MathText from './MathText'
import { matchListRowPlan } from '../utils/parseMatchingListDisplay.js'

/**
 * Two-column List-I / List-II (or Column I / Column II) preview.
 * Rows stay side by side: (P) beside (1), (Q) beside (2).
 * An extra List-II item sits on the right only, with no blank List-I card.
 * Used by QuestionStem so exam, review, and official PYQ share one layout.
 * @param {{ parsed: import('../utils/parseMatchingListDisplay').MatchingListDisplay }} props
 */
export default function MatchListDisplay({ parsed }) {
  if (!parsed?.listI?.length) return null
  const intro = String(parsed.intro ?? '').trim()
  const outro = String(parsed.outro ?? '').trim()
  const rows = matchListRowPlan(parsed.listI, parsed.listII)
  const showRight = rows.some((row) => row.right)

  return (
    <div className="match-list-display">
      {intro ? (
        <div className="match-list-intro">
          <MathText text={intro} />
        </div>
      ) : null}
      <div className={`match-list-columns${showRight ? '' : ' match-list-columns--single'}`}>
        <h5 className="match-list-col-title">{parsed.listITitle}</h5>
        {showRight ? <h5 className="match-list-col-title">{parsed.listIITitle}</h5> : null}
        {rows.map((row, i) => {
          const left = row.left
          const item = row.right
          const key = left?.label || item?.label || `row-${i}`
          return (
            <Fragment key={key}>
              {row.leftCard ? (
                <div className="match-list-cell">
                  <span className="match-list-label">{left.label}</span>
                  <span className="match-list-item-body">
                    <MathText text={left.text} />
                  </span>
                </div>
              ) : (
                <div className="match-list-gap" data-testid="match-list-gap" />
              )}
              {showRight ? (
                item ? (
                  <div className="match-list-cell">
                    <span className="match-list-label">{item.label}</span>
                    <span className="match-list-item-body">
                      <MathText text={item.text} />
                    </span>
                  </div>
                ) : (
                  <div className="match-list-gap" />
                )
              ) : null}
            </Fragment>
          )
        })}
      </div>
      {outro
        ? outro.split(/\n\s*\n/).map((para, i) => (
            <div key={`outro-${i}`} className="match-list-intro match-list-outro">
              <MathText text={para} />
            </div>
          ))
        : null}
    </div>
  )
}
