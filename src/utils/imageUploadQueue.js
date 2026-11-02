/**
 * Helpers for Question Bank multi-image upload queue (one-at-a-time OCR + review).
 */

/** @typedef {'pending'|'processing'|'ready'|'needs_review'|'saved'|'rejected'|'error'} ImageQueueStatus */

/**
 * @typedef {{
 *   id: string
 *   file: File
 *   name: string
 *   status: ImageQueueStatus
 *   errorMessage?: string
 * }} ImageQueueItem
 */

/** @param {File} file */
export function isQueueableQuestionImage(file) {
  if (!file) return false
  const n = String(file.name || '').toLowerCase()
  if (n.endsWith('.pdf') || n.endsWith('.docx') || n.endsWith('.doc')) return false
  const t = String(file.type || '').toLowerCase()
  if (t.includes('pdf') || t.includes('word') || t.includes('officedocument')) return false
  return t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(n)
}

/**
 * @param {FileList|File[]|null|undefined} list
 * @returns {File[]}
 */
export function pickQueueableImages(list) {
  return [...(list ?? [])].filter(isQueueableQuestionImage)
}

/** @param {File} file */
export function makeImageQueueItem(file) {
  return {
    id: `imgq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    name: file.name || 'image',
    status: /** @type {ImageQueueStatus} */ ('pending'),
    errorMessage: undefined,
  }
}

/**
 * @param {ImageQueueItem[]} queue
 * @param {string|null} [skipId]
 */
export function findNextPendingImage(queue, skipId = null) {
  return (queue ?? []).find(
    (item) => item.status === 'pending' && item.id !== skipId,
  ) ?? null
}

/**
 * Decide queue badge after OCR finishes.
 * Text present → ready / needs_review (never hard Error).
 * @param {{
 *   hasContent: boolean
 *   lowConfidence?: boolean
 *   cloudNote?: string
 *   errorMessage?: string
 * }} opts
 * @returns {{ status: ImageQueueStatus, errorMessage?: string }}
 */
export function resolveImageQueueOcrStatus(opts) {
  const hasContent = !!opts.hasContent
  const needsReview =
    !!opts.lowConfidence ||
    /needs review|rate limit|quota|garbled|weak|backup Local|review carefully|network|empty response|AI extract failed/i.test(
      String(opts.cloudNote ?? ''),
    )
  if (hasContent) {
    return {
      status: needsReview ? 'needs_review' : 'ready',
      errorMessage: undefined,
    }
  }
  return {
    status: 'error',
    errorMessage: String(opts.errorMessage || 'No text found').slice(0, 280),
  }
}

/**
 * @param {ImageQueueItem[]} queue
 */
export function countImageQueueByStatus(queue) {
  const counts = {
    pending: 0,
    processing: 0,
    ready: 0,
    needs_review: 0,
    saved: 0,
    rejected: 0,
    error: 0,
    total: 0,
  }
  for (const item of queue ?? []) {
    counts.total += 1
    if (item.status in counts) counts[item.status] += 1
  }
  return counts
}
