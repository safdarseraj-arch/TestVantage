/** Simple horizontal bar chart — no external deps */
export default function StatBar({ label, value, max = 100, color = 'var(--primary)' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="stat-bar-row">
      <span className="stat-bar-label">{label}</span>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="stat-bar-value">{typeof value === 'number' && value % 1 ? value.toFixed(1) : value}%</span>
    </div>
  )
}
