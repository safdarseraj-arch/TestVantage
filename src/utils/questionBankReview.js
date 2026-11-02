import { isQuestionMetaUntagged } from './bankListFilters.js'
import { getPassageSetQuestions } from './passage.js'
import { bankListActionTargetId } from './passageBankList.js'
import { validateQuestionReadiness } from './questionReadiness.js'

/**
 * Embibe-style bank review state: first make the item searchable, then content-safe,
 * then publish-ready.
 * @param {import('../data/tests').Question} q
 */
export function getQuestionReviewState(q) {
  if (q?.needsAction === true) {
    return {
      id: 'needs-action',
      label: 'Needs action',
      tone: 'error',
      blockers: [
        'Needs action — this draft failed the completeness check. Fix it before approve. It stays a draft and does not get a final id.',
      ],
      warnings: [],
    }
  }
  if (String(q?.duplicateOfId ?? '').trim()) {
    return {
      id: 'possible-duplicate',
      label: 'Possible duplicate',
      tone: 'warn',
      blockers: ['Possible duplicate — compare with original before publishing.'],
      warnings: [],
    }
  }
  const readiness = validateQuestionReadiness(q)
  const errors = readiness.issues.filter((i) => i.severity === 'error')
  const warnings = readiness.issues.filter((i) => i.severity === 'warn')
  const untagged = isQuestionMetaUntagged(q)

  if (untagged) {
    return {
      id: 'needs-tags',
      label: 'Needs tags',
      tone: 'warn',
      blockers: ['Add subject, unit/chapter, and question type before publishing.'],
      warnings: readiness.issues.map((i) => i.message),
    }
  }
  if (errors.length) {
    return {
      id: 'needs-fix',
      label: 'Needs content fix',
      tone: 'error',
      blockers: errors.map((i) => i.message),
      warnings: warnings.map((i) => i.message),
    }
  }
  if (warnings.length) {
    return {
      id: 'needs-review',
      label: 'Review warning',
      tone: 'warn',
      blockers: [],
      warnings: warnings.map((i) => i.message),
    }
  }
  return {
    id: 'ready',
    label: 'Ready to publish',
    tone: 'ok',
    blockers: [],
    warnings: [],
  }
}

/** @param {string} message */
export function isPossibleDuplicateBlocker(message) {
  return /possible duplicate/i.test(String(message ?? ''))
}

/** Blockers that still stop publish. A duplicate match opens compare instead. */
export function blockersBesidesDuplicate(blockers) {
  return (blockers ?? []).filter((message) => !isPossibleDuplicateBlocker(message))
}

/** @param {import('../data/tests').Question} q */
export function getQuestionPublishBlockers(q) {
  return getQuestionReviewState(q).blockers
}

/**
 * Publish blockers for a bank row, including every question in a passage set.
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} [bank]
 */
export function getQuestionPublishBlockersForAction(q, bank = []) {
  const actionId = bankListActionTargetId(q)
  const parent = bank.find((row) => String(row.id) === String(actionId)) ?? q
  const set = getPassageSetQuestions(parent, bank.length ? bank : [q])
  const rows = set?.length ? set : [parent]
  /** @type {string[]} */
  const blockers = []
  for (const row of rows) {
    for (const msg of getQuestionPublishBlockers(row)) {
      if (!blockers.includes(msg)) blockers.push(msg)
    }
  }
  return blockers
}

/** @param {import('../data/tests').Question[]} questions */
export function summarizeQuestionReviewStates(questions) {
  const summary = {
    total: questions.length,
    needsTags: 0,
    needsFix: 0,
    needsReview: 0,
    ready: 0,
  }
  for (const q of questions) {
    const state = getQuestionReviewState(q)
    if (state.id === 'needs-tags') summary.needsTags += 1
    else if (state.id === 'needs-fix') summary.needsFix += 1
    else if (state.id === 'needs-review' || state.id === 'possible-duplicate') summary.needsReview += 1
    else summary.ready += 1
  }
  return summary
}
