/**
 * Stamp teacher / operator on new saves.
 */

import { getSession } from './auth.js'

/** @typedef {{ id: string, name: string, role?: string }} UploadOperator */

/** @returns {UploadOperator} */
export function getCurrentUploadOperator() {
  if (typeof sessionStorage === 'undefined') {
    return { id: 'local', name: 'Local operator', role: '' }
  }
  const session = getSession()
  if (!session) {
    return { id: 'local', name: 'Local operator', role: '' }
  }
  const name = String(session.name ?? session.email ?? 'Operator').trim() || 'Operator'
  const id = String(session.userId ?? session.email ?? session.role ?? name).trim() || name
  return { id, name, role: session.role ?? '' }
}

/**
 * Stamp operator on a new save (keeps existing meta on edits/imports).
 * @param {import('../data/tests').Question} q
 * @param {{ operator?: UploadOperator }} [opts]
 */
export function stampNewQuestionUploadMeta(q, opts = {}) {
  const op = opts.operator ?? getCurrentUploadOperator()
  const next = { ...q }
  if (!next.uploadedById) next.uploadedById = op.id
  if (!next.uploadedByName) next.uploadedByName = op.name
  if (!next.uploadedByRole && op.role) next.uploadedByRole = op.role
  return next
}

export {
  collectOperatorsInBank,
  formatQuestionUploadDate,
  questionFirstSavedTimestamp,
  questionMatchesOperatorFilter,
  questionMatchesUploadDateFilter,
  questionUploadOperatorLabel,
  questionUploadTimestamp,
} from './questionUploadFilter.js'
