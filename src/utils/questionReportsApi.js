/**
 * Optional server copy of question reports. Local storage is the source of truth
 * when the API is offline.
 */
import { API_BASE } from '../config/platform.js'
import { mergeQuestionReports, normalizeStoredReport } from './questionReports.js'

async function reportsFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(opts.timeout ?? 8000),
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Reports API ${res.status}`)
  return data
}

/** @param {object} report */
export async function pushQuestionReportRemote(report) {
  const data = await reportsFetch('/question-reports', {
    method: 'POST',
    body: JSON.stringify({ report }),
  })
  return normalizeStoredReport(data?.report) ?? report
}

export async function fetchQuestionReportsRemote() {
  const data = await reportsFetch('/question-reports')
  const list = Array.isArray(data?.reports) ? data.reports : []
  return list.map(normalizeStoredReport).filter(Boolean)
}

/** @param {string} id @param {'open' | 'reviewed'} status */
export async function patchQuestionReportRemote(id, status) {
  const data = await reportsFetch(`/question-reports/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  return normalizeStoredReport(data?.report)
}

export async function refreshQuestionReportsFromRemote() {
  try {
    const remote = await fetchQuestionReportsRemote()
    return mergeQuestionReports(remote)
  } catch {
    return null
  }
}

export async function submitQuestionReportRemote(report) {
  try {
    await pushQuestionReportRemote(report)
  } catch {
    /* local copy already saved */
  }
}

export async function markQuestionReportReviewedRemote(id) {
  try {
    await patchQuestionReportRemote(id, 'reviewed')
  } catch {
    /* local copy already updated */
  }
}
