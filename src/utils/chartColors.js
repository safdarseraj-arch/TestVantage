/** Soft pastel palette for analysis charts — light, attractive bars. */
export const CHART_COLORS = {
  you: {
    fill: 'linear-gradient(180deg, #93c5fd 0%, #dbeafe 100%)',
    legend: '#93c5fd',
    border: '#60a5fa',
  },
  topper: {
    fill: 'linear-gradient(180deg, #f9a8d4 0%, #fce7f3 100%)',
    legend: '#f9a8d4',
    border: '#f472b6',
  },
  top10: {
    fill: 'linear-gradient(180deg, #fdba74 0%, #ffedd5 100%)',
    legend: '#fdba74',
    border: '#fb923c',
  },
  top25: {
    fill: 'linear-gradient(180deg, #c4b5fd 0%, #ede9fe 100%)',
    legend: '#c4b5fd',
    border: '#a78bfa',
  },
  allAvg: {
    fill: 'linear-gradient(180deg, #5eead4 0%, #ccfbf1 100%)',
    legend: '#5eead4',
    border: '#2dd4bf',
  },
  correct: {
    fill: 'linear-gradient(180deg, #86efac 0%, #dcfce7 100%)',
    legend: '#86efac',
    border: '#4ade80',
  },
  incorrect: {
    fill: 'linear-gradient(180deg, #fca5a5 0%, #fee2e2 100%)',
    legend: '#fca5a5',
    border: '#f87171',
  },
  wrong: {
    fill: 'linear-gradient(180deg, #fca5a5 0%, #fee2e2 100%)',
    legend: '#fca5a5',
    border: '#f87171',
  },
  unattempted: {
    fill: 'linear-gradient(180deg, #cbd5e1 0%, #f1f5f9 100%)',
    legend: '#cbd5e1',
    border: '#94a3b8',
  },
  skipped: {
    fill: 'linear-gradient(180deg, #cbd5e1 0%, #f1f5f9 100%)',
    legend: '#cbd5e1',
    border: '#94a3b8',
  },
  max: {
    fill: 'linear-gradient(180deg, #e2e8f0 0%, #f8fafc 100%)',
    legend: '#e2e8f0',
    border: '#cbd5e1',
  },
}

/** @param {string} key @returns {{ fill: string, legend: string, border: string }} */
export function chartColor(key) {
  return (
    CHART_COLORS[key] ?? {
      fill: 'linear-gradient(180deg, #c4b5fd 0%, #ede9fe 100%)',
      legend: '#c4b5fd',
      border: '#a78bfa',
    }
  )
}

/** @param {string} key @param {string} label */
export function chartSeries(key, label) {
  const c = chartColor(key)
  return { key, label, color: c.fill, legendColor: c.legend, borderColor: c.border }
}

export const COMPARE_SERIES_KEYS = ['you', 'topper', 'top10', 'top25', 'allAvg']

export const COMPARE_SERIES_LABELS = {
  you: 'You',
  topper: 'Local best',
  top10: 'Local top 10%',
  top25: 'Local top 25%',
  allAvg: 'Device avg',
}
