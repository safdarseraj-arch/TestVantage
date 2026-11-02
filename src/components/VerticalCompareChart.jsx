/**
 * Clustered vertical bar chart — no external chart library.
 * @param {{
 *   title?: string
 *   subtitle?: string
 *   categories: { id: string, label: string, maxScore?: number }[]
 *   series: { key: string, label: string, color: string, values: Record<string, number> }[]
 *   valueSuffix?: string
 *   showMaxInLabel?: boolean
 * }} props
 */
export default function VerticalCompareChart({
  title,
  subtitle,
  categories,
  series,
  valueSuffix = '',
  showMaxInLabel = false,
}) {
  if (!categories?.length || !series?.length) {
    return (
      <div className="vchart-empty card">
        <p>No comparison data yet — take the test with more students on this device.</p>
      </div>
    )
  }

  const allValues = categories.flatMap((c) => series.map((s) => s.values[c.id] ?? 0))
  const chartMax = Math.max(...allValues, 1)
  const yTicks = 5
  const tickStep = Math.ceil(chartMax / yTicks / 5) * 5 || 1
  const yMax = Math.ceil(chartMax / tickStep) * tickStep || tickStep

  return (
    <div className="vchart card">
      {(title || subtitle) && (
        <div className="vchart-head">
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}

      <div className="vchart-body">
        <div className="vchart-y-axis">
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const val = yMax - (yMax / yTicks) * i
            return (
              <span key={val} className="vchart-y-tick">
                {Math.round(val)}
                {valueSuffix}
              </span>
            )
          })}
        </div>

        <div className="vchart-plot">
          <div className="vchart-grid">
            {Array.from({ length: yTicks + 1 }, (_, i) => (
              <div key={i} className="vchart-grid-line" />
            ))}
          </div>

          <div className="vchart-clusters">
            {categories.map((cat) => (
              <div key={cat.id} className="vchart-cluster">
                <div className="vchart-bars">
                  {series.map((s) => {
                    const val = s.values[cat.id] ?? 0
                    const h = yMax > 0 ? (val / yMax) * 100 : 0
                    const legend = s.legendColor ?? s.color
                    const border = s.borderColor ?? legend
                    return (
                      <div key={s.key} className="vchart-bar-wrap" title={`${s.label}: ${val}${valueSuffix}`}>
                        <span className="vchart-bar-val">{val}</span>
                        <div
                          className="vchart-bar"
                          style={{
                            height: `${Math.max(h, val > 0 ? 4 : 0)}%`,
                            background: s.color,
                            borderColor: border,
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <span className="vchart-x-label">
                  {cat.label}
                  {showMaxInLabel && cat.maxScore != null ? (
                    <>
                      <br />
                      <small>({cat.maxScore})</small>
                    </>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="vchart-legend">
          {series.map((s) => (
            <div key={s.key} className="vchart-legend-item">
              <span
                className="vchart-legend-dot"
                style={{ background: s.legendColor ?? s.color }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
