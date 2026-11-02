/**
 * Upload finish state — when to show errors vs success (QuestionBank + AI banner).
 */

/** @param {{ readyToSave?: boolean, confidence?: number, issues?: { severity?: string }[] } | null | undefined} quality */
export function countUploadBlockingIssues(quality) {
  return (quality?.issues ?? []).filter((i) => i.severity === 'error').length
}

/**
 * @param {{ readyToSave?: boolean, confidence?: number, issues?: { severity?: string }[] } | null | undefined} quality
 * @param {{ needsAgentRepair?: boolean, confidence?: number } | null | undefined} [escalation]
 */
export function uploadNeedsReview(quality, escalation = null) {
  if (escalation?.needsAgentRepair) return true
  if (countUploadBlockingIssues(quality) > 0) return true
  if (quality?.readyToSave && (quality?.confidence ?? 0) >= 68) return false
  const conf = quality?.confidence ?? escalation?.confidence ?? 0
  if (conf < 58) return true
  return !quality?.readyToSave
}

/**
 * @param {{ readyToSave?: boolean, confidence?: number, issues?: { severity?: string }[] } | null | undefined} quality
 * @param {{ needsAgentRepair?: boolean } | null | undefined} [escalation]
 * @returns {'ok'|'warn'|'bad'}
 */
export function resolveUploadBannerTone(quality, escalation = null) {
  if (escalation?.needsAgentRepair) return 'bad'
  if (uploadNeedsReview(quality, escalation)) {
    return countUploadBlockingIssues(quality) > 0 || (quality?.confidence ?? 0) < 58 ? 'bad' : 'warn'
  }
  return 'ok'
}

/**
 * @param {'success'|'info'|'error'} fallback
 * @param {{ readyToSave?: boolean, confidence?: number, issues?: { severity?: string }[] } | null | undefined} quality
 * @param {{ needsAgentRepair?: boolean } | null | undefined} [escalation]
 */
export function resolveUploadMessageType(fallback, quality, escalation = null) {
  if (escalation?.needsAgentRepair) return 'error'
  if (countUploadBlockingIssues(quality) > 0) return 'error'
  if (uploadNeedsReview(quality, escalation)) return 'warn'
  if (fallback === 'success' && quality?.readyToSave) return 'success'
  return fallback === 'error' ? 'error' : 'info'
}

/**
 * @param {{
 *   found?: number
 *   quality?: { readyToSave?: boolean, confidence?: number, issues?: { severity?: string, message?: string }[] } | null
 *   escalation?: { needsAgentRepair?: boolean, escalationSummary?: string } | null
 * }} ctx
 */
/** Stricter bar for "save without review" messaging. */
export function uploadGoLiveReady(quality, escalation = null) {
  return !uploadNeedsReview(quality, escalation) && (quality?.confidence ?? 0) >= 78
}

export function buildUploadFinishHeadline(ctx = {}) {
  const found = ctx.found ?? 0
  const quality = ctx.quality
  const escalation = ctx.escalation
  const needsReview = uploadNeedsReview(quality, escalation)

  if (escalation?.needsAgentRepair) {
    return `AI could not fully repair this upload (${found}/4 options). Review the red AI panel — use **Copy for Cursor repair** if needed.`
  }
  if (needsReview) {
    const errN = countUploadBlockingIssues(quality)
    if (errN > 0) {
      return `Extracted ${found}/4 options — **${errN} issue(s) need fixing** before Save. See the AI panel below.`
    }
    return `Extracted ${found}/4 options — **please review** before Save (quality ${quality?.confidence ?? '?'}/100).`
  }
  if (found >= 4) {
    return 'Question + all 4 options extracted and math-repaired.'
  }
  if (found > 0) {
    return `Filled question + ${found}/4 options.`
  }
  return 'OCR text added.'
}
