/**
 * Draft / publish state and modification history for bank questions.
 */

import { getCurrentUploadOperator } from './questionUploadMeta.js'
import { effectiveBankStatus } from './questionUploadFilter.js'

/** @typedef {{
 *   at: number
 *   byId: string
 *   byName: string
 *   byRole?: string
 *   action: 'created' | 'updated' | 'published' | 'unpublished' | 'metadata'
 *   summary?: string
 * }} QuestionHistoryEntry */

export const MAX_QUESTION_HISTORY = 40

const META_KEYS = new Set([
  'subject',
  'section',
  'chapter',
  'topic',
  'questionType',
  'examIds',
  'toughnessLevel',
  'source',
  'unit',
])

const CONTENT_KEYS = new Set([
  'text',
  'options',
  'passageText',
  'subQuestions',
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'matrixRows',
  'matrixCols',
  'matrixColLabels',
  'matrixAnswerKey',
  'questionImage',
  'optionsImage',
  'optionImages',
  'passageImage',
  'solution',
  'solutionImage',
  'marking',
  'msqMarking',
])

/** @param {import('../data/tests').Question} q */
export function appendQuestionHistory(q, entry) {
  const hist = Array.isArray(q?.updateHistory) ? [...q.updateHistory] : []
  hist.unshift({
    at: entry.at ?? Date.now(),
    byId: entry.byId,
    byName: entry.byName,
    byRole: entry.byRole,
    action: entry.action,
    summary: entry.summary,
  })
  return { ...q, updateHistory: hist.slice(0, MAX_QUESTION_HISTORY) }
}

/** @param {import('../data/tests').Question} prev @param {Partial<import('../data/tests').Question>} updates */
export function summarizeQuestionChanges(prev, updates) {
  const keys = Object.keys(updates).filter(
    (k) => !['updatedAt', 'savedAt', 'updateHistory', 'bankStatus', 'publishedAt', 'publishedById', 'publishedByName', 'syncStatus', 'syncError', 'serverSyncedAt'].includes(k),
  )
  if (!keys.length) return { hasChanges: false, action: 'updated', summary: '' }

  const metaOnly = keys.every((k) => META_KEYS.has(k))
  const parts = []
  if (keys.some((k) => CONTENT_KEYS.has(k) || k === 'options')) parts.push('content or answer')
  if (keys.some((k) => META_KEYS.has(k))) parts.push('metadata tags')

  const summary = parts.length ? `Changed ${parts.join(' and ')}` : `Updated ${keys.slice(0, 3).join(', ')}`
  return {
    hasChanges: true,
    action: metaOnly ? 'metadata' : 'updated',
    summary,
  }
}

/**
 * @param {import('../data/tests').Question} q
 * @param {Partial<import('../data/tests').Question>} updates
 * @param {{ publishAction?: boolean, unpublishAction?: boolean, silent?: boolean, operator?: import('./questionUploadMeta.js').UploadOperator }} [opts]
 */
export function applyQuestionHistoryOnUpdate(q, updates, opts = {}) {
  const op = opts.operator ?? getCurrentUploadOperator()
  if (opts.publishAction) {
    const silent = updates?.silentPublish === true || opts.silent === true
    let next = {
      ...q,
      ...updates,
      bankStatus: 'published',
      publishedAt: Date.now(),
      publishedById: op.id,
      publishedByName: op.name,
      silentPublish: silent,
    }
    return appendQuestionHistory(next, {
      byId: op.id,
      byName: op.name,
      byRole: op.role,
      action: 'published',
      summary: silent
        ? 'Published silently to main question bank'
        : 'Published to question bank',
    })
  }

  if (opts.unpublishAction) {
    let next = { ...q, ...updates, bankStatus: 'draft', silentPublish: false }
    return appendQuestionHistory(next, {
      byId: op.id,
      byName: op.name,
      byRole: op.role,
      action: 'unpublished',
      summary: 'Moved back to draft',
    })
  }

  const change = summarizeQuestionChanges(q, updates)
  if (!change.hasChanges) return { ...q, ...updates }

  let next = { ...q, ...updates }
  const wasPublished = effectiveBankStatus(q) === 'published'

  if (wasPublished) {
    next.bankStatus = 'draft'
    next = appendQuestionHistory(next, {
      byId: op.id,
      byName: op.name,
      byRole: op.role,
      action: 'updated',
      summary: `${change.summary} — moved back to draft for review`,
    })
  } else {
    next = appendQuestionHistory(next, {
      byId: op.id,
      byName: op.name,
      byRole: op.role,
      action: change.action,
      summary: change.summary,
    })
  }
  return next
}

/** @param {import('../data/tests').Question} q */
export function stampNewQuestionDraft(q) {
  const op = getCurrentUploadOperator()
  const now = Date.now()
  const withStatus = {
    ...q,
    bankStatus: q.bankStatus ?? 'draft',
    savedAt: q.savedAt ?? now,
  }
  if (Array.isArray(withStatus.updateHistory) && withStatus.updateHistory.length) {
    return withStatus
  }
  return appendQuestionHistory(withStatus, {
    at: withStatus.savedAt ?? now,
    byId: op.id,
    byName: op.name,
    byRole: op.role,
    action: 'created',
    summary: 'Saved to bank (draft)',
  })
}

/** @param {string} action */
export function historyActionLabel(action) {
  const map = {
    created: 'Created',
    updated: 'Updated',
    published: 'Published',
    unpublished: 'Back to draft',
    metadata: 'Tags updated',
  }
  return map[action] ?? action
}

export {
  bankStatusLabel,
  effectiveBankStatus,
  isQuestionPublished,
} from './questionUploadFilter.js'
