/** Build exam URL — absolute in the browser so Cursor’s preview can navigate reliably. */
export function examPath(testId) {
  if (!testId) return '/tests'
  const path = `/exam/${encodeURIComponent(String(testId))}`
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`
  }
  return path
}

/** Full-page navigation when a link click does not work. */
export function goToExam(testId) {
  if (!testId || typeof window === 'undefined') return
  window.location.assign(examPath(testId))
}
