/**
 * In-memory progress for PYQ replica paper batch jobs (polled by UI).
 */

/** @type {Record<string, object>} */
const jobs = {}

export function createReplicaJob(id, meta = {}) {
  const job = {
    id,
    ok: false,
    running: true,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    parentPaperId: meta.parentPaperId || '',
    parentPaperLabel: meta.parentPaperLabel || '',
    replicaCount: meta.replicaCount || 3,
    questionTotal: meta.questionTotal || 0,
    questionDone: 0,
    currentQuestionId: '',
    log: [],
    replicas: [],
    errors: [],
    ...meta,
  }
  jobs[id] = job
  return job
}

export function getReplicaJob(id) {
  return jobs[id] || null
}

export function appendReplicaLog(id, line) {
  const job = jobs[id]
  if (!job) return
  job.log = [...(job.log || []).slice(-120), String(line)]
  job.updatedAt = Date.now()
}

export function updateReplicaProgress(id, patch) {
  const job = jobs[id]
  if (!job) return
  Object.assign(job, patch, { updatedAt: Date.now() })
}

export function finishReplicaJob(id, result) {
  const job = jobs[id]
  if (!job) return
  Object.assign(job, result, { running: false, ok: Boolean(result?.ok), updatedAt: Date.now() })
}

export function getLatestReplicaJob() {
  const list = Object.values(jobs).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  return list[0] || null
}
