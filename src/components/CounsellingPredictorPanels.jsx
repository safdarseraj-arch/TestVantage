/**
 * Shared counselling UI: 0.5 percentile curve, round chances, placement table, college facts.
 * All numbers are Indicative unless tagged Official.
 */

import {
  COUNSELLING_TREND_YEARS,
  PERCENTILE_CURVE_TITLE,
  PERCENTILE_GRID_SOURCE_NOTE,
  PERCENTILE_GRID_YEARS,
  PLACEMENT_PACKAGE_FIELDS,
  PLACEMENT_PACKAGE_NOTE,
  ROUND_CHANCE_SOURCE_NOTE,
  COLLEGE_DETAIL_SOURCE_NOTE,
  GEMINI_FILL_HINT,
} from '../data/counsellingConstants.js'
import { DATA_UNAVAILABLE_LABEL, formatPlacementLpa } from '../utils/careerCompassPredict.js'
import { provenanceBadgeLabel, resolvePlacementFieldProvenance } from '../utils/careerCompassProvenance.js'
import { getCounsellingFillMeta } from '../utils/counsellingPredictor.js'

function formatFillWhen(filledAt) {
  if (!filledAt) return 'not yet Gemini-refreshed'
  try {
    return new Date(filledAt).toLocaleString('en-IN')
  } catch {
    return 'unknown'
  }
}

export function CounsellingFillHint() {
  const meta = getCounsellingFillMeta()
  const sourceLabel =
    meta.source === 'gemini' ? 'Gemini fill' : meta.source === 'local-seed' ? 'compiled tables' : meta.source
  return (
    <p className="form-hint cc-fill-hint">
      Counselling tables: <strong>{sourceLabel}</strong>
      {meta.filledAt ? ` · last fill ${formatFillWhen(meta.filledAt)}` : ''}. {GEMINI_FILL_HINT}
    </p>
  )
}

export function PercentileCurveTable({ table, title }) {
  if (!table?.rows?.length) return null
  const heading = title ?? table.title ?? PERCENTILE_CURVE_TITLE
  const years = table.years ?? PERCENTILE_GRID_YEARS
  const trendYears = table.trendYears ?? []
  const trendSet = new Set(trendYears)
  const yearKind = table.yearKind ?? {}
  return (
    <details className="cc-history cc-percentile-curve" open>
      <summary>{heading}</summary>
      <p className="form-hint">{table.sourceNote ?? PERCENTILE_GRID_SOURCE_NOTE}</p>
      <p className="form-hint">
        Paper: <strong>{table.toughness ?? 'moderate'}</strong>. Easy paper needs more marks for the same
        percentile; tough paper needs fewer. Year columns labeled NTA are compiled session tables.
        Highlighted NTA years ({trendYears.join(' and ') || 'latest two complete'}) drive Est. AIR, easy
        marks, and tough marks (fitted, Indicative). Unpublished years show —.
      </p>
      <div className="cc-match-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th>Percentile</th>
              {years.map((y) => {
                const kind = yearKind[y] || (trendSet.has(y) ? 'nta' : 'unknown')
                const nta = kind === 'nta' || kind === 'partial'
                return (
                  <th key={y} className={trendSet.has(y) && nta ? 'cc-trend-year' : ''}>
                    {y} marks
                    {kind === 'nta' ? ' · NTA' : kind === 'partial' ? ' · partial' : ' · n/a'}
                  </th>
                )
              })}
              <th className="cc-trend-col">Est. AIR</th>
              <th className="cc-trend-col">Easy marks</th>
              <th className="cc-trend-col">Tough marks</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.percentile} className={row.isHighlight ? 'cc-band-highlight' : ''}>
                <td>{Number(row.percentile).toFixed(1)}</td>
                {years.map((y) => {
                  const kind = yearKind[y]
                  const nta = kind === 'nta' || kind === 'partial'
                  const marks = row.byYear?.[y]?.marks
                  return (
                    <td key={y} className={trendSet.has(y) && nta ? 'cc-trend-year' : ''}>
                      {marks != null && Number.isFinite(Number(marks)) ? marks : '—'}
                    </td>
                  )
                })}
                <td className="cc-trend-col">{row.air != null ? Number(row.air).toLocaleString('en-IN') : '—'}</td>
                <td className="cc-trend-col">{row.marksEasy ?? '—'}</td>
                <td className="cc-trend-col">{row.marksTough ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function RoundChanceChips({ board, compact = false }) {
  if (!board?.latestChips?.length) return null
  return (
    <div className={`cc-round-chips${compact ? ' cc-round-chips--compact' : ''}`}>
      {board.latestChips.map((chip) => (
        <span
          key={chip.id}
          className={`cc-band cc-band--${chip.band || 'match'}`}
          title={
            chip.closing != null
              ? `${chip.label} closing ~${Number(chip.closing).toLocaleString('en-IN')} (${board.latestYear})`
              : chip.label
          }
        >
          {chip.label.replace('Round ', 'R')}: {chip.chanceLabel}
        </span>
      ))}
    </div>
  )
}

export function RoundChanceTable({ board }) {
  if (!board?.rounds?.length) return null
  const years = board.years ?? COUNSELLING_TREND_YEARS
  return (
    <div className="cc-round-table-wrap">
      <h3 className="cc-section-title">Chances by counselling round</h3>
      <p className="form-hint">{board.sourceNote ?? ROUND_CHANCE_SOURCE_NOTE}</p>
      <div className="cc-match-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th>Round</th>
              {years.map((y) => (
                <th key={y}>{y} close / chance</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rounds.map((round) => (
              <tr key={round.id}>
                <td>{round.label}</td>
                {years.map((y) => {
                  const cell = round.byYear?.[y]
                  return (
                    <td key={y}>
                      <div className="cc-cutoff-round">
                        <span>
                          {cell?.closing != null ? Number(cell.closing).toLocaleString('en-IN') : '—'}
                        </span>
                        {cell?.band ? (
                          <span className={`cc-band cc-band--${cell.band}`}>{cell.chanceLabel}</span>
                        ) : null}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatPackageField(placement, field, kind) {
  const v = placement?.[field]
  if (v == null || !Number.isFinite(Number(v))) return DATA_UNAVAILABLE_LABEL
  if (kind === 'pct') return `${Math.round(Number(v))}%`
  return formatPlacementLpa(v)
}

export function PlacementPackageTable({ placement, branchLabel }) {
  const p = placement ?? {}
  const sourceBits = [p.sourceYear ? `year ${p.sourceYear}` : null, p.sourceUrl || null].filter(Boolean)
  return (
    <div className="cc-place-package">
      <h3 className="cc-section-title">
        Placement {branchLabel ? `· ${branchLabel}` : ''}
      </h3>
      <p className="cc-placement-disclaimer">{p.sourceNote ?? PLACEMENT_PACKAGE_NOTE}</p>
      {sourceBits.length > 0 && p.placementSource === 'official' && (
        <p className="form-hint">
          Source{p.sourceYear ? ` (${p.sourceYear})` : ''}:{' '}
          {p.sourceUrl ? (
            <a href={p.sourceUrl} target="_blank" rel="noreferrer noopener">
              {p.sourceUrl}
            </a>
          ) : (
            'published report'
          )}
        </p>
      )}
      <ul className="cc-place-package-list">
        {PLACEMENT_PACKAGE_FIELDS.map((row) => {
          const prov = resolvePlacementFieldProvenance(row.field, p)
          return (
            <li key={row.field}>
              <span>
                {row.label}{' '}
                <span className={`cc-prov-badge cc-prov-badge--${prov.status}`}>
                  {provenanceBadgeLabel(prov.status)}
                </span>
              </span>
              <strong>{formatPackageField(p, row.field, row.kind)}</strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function CollegeFactsPanel({ college }) {
  if (!college) return null
  const quotas = college.quotas?.length ? college.quotas.join(' · ') : '—'
  return (
    <div className="cc-info-card">
      <h3>College facts</h3>
      <p className="form-hint">{COLLEGE_DETAIL_SOURCE_NOTE}</p>
      <ul>
        <li>
          <span>Type</span>
          <strong>{college.typeLabel ?? college.type}</strong>
        </li>
        <li>
          <span>Location</span>
          <strong>
            {college.city}, {college.state}
          </strong>
        </li>
        <li>
          <span>Counselling</span>
          <strong>{college.counsellingBody ?? '—'}</strong>
        </li>
        <li>
          <span>Quotas</span>
          <strong>{quotas}</strong>
        </li>
        <li>
          <span>Annual fee</span>
          <strong>
            {college.feeAnnualLakh != null ? `₹${Number(college.feeAnnualLakh).toFixed(1)} L/yr` : '—'}
          </strong>
        </li>
        {college.hostelFeeLakh != null && (
          <li>
            <span>Hostel (indicative)</span>
            <strong>₹{Number(college.hostelFeeLakh).toFixed(1)} L/yr</strong>
          </li>
        )}
        {college.establishedYear != null && (
          <li>
            <span>Established</span>
            <strong>{college.establishedYear}</strong>
          </li>
        )}
        <li>
          <span>Website</span>
          <strong>
            {college.website ? (
              <a href={college.website} target="_blank" rel="noreferrer noopener">
                Open site
              </a>
            ) : (
              '—'
            )}
          </strong>
        </li>
        <li>
          <span>Branches listed</span>
          <strong>{college.branches?.length ?? 0}</strong>
        </li>
      </ul>
    </div>
  )
}
