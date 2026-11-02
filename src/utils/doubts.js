import { allowAutoDemoSeed } from './prodSafety.js'

const DOUBTS_KEY = 'testvantage-doubts'

/** @typedef {{ fileName?: string, sourceType?: 'text' | 'word' | 'pdf' | 'image' | 'voice', audioId?: string, durationMs?: number }} ContentSource */

/** @typedef {{ id: string, body: string, authorId: string, authorName: string, createdAt: number, source?: ContentSource, audioId?: string, voiceDurationMs?: number }} DoubtSolution */

/** @typedef {{ id: string, title: string, body: string, subject: string, authorId: string, authorName: string, createdAt: number, source?: ContentSource, audioId?: string, voiceDurationMs?: number, solutions: DoubtSolution[], questionId?: string, chapter?: string }} Doubt */

function load() {
  try {
    const raw = localStorage.getItem(DOUBTS_KEY)
    return raw ? JSON.parse(raw) : { doubts: [] }
  } catch {
    return { doubts: [] }
  }
}

function save(data) {
  localStorage.setItem(DOUBTS_KEY, JSON.stringify(data))
}

export function loadDoubts() {
  const doubts = load().doubts.sort((a, b) => b.createdAt - a.createdAt)
  if (allowAutoDemoSeed()) return doubts
  return doubts.filter((d) => !String(d.authorId ?? '').startsWith('demo-user'))
}

/** @param {string} [subject] */
export function loadDoubtsBySubject(subject) {
  const all = loadDoubts()
  if (!subject) return all
  return all.filter((d) => d.subject === subject)
}

/**
 * @param {{ title: string, body: string, subject: string, authorId: string, authorName: string, source?: ContentSource, audioId?: string, voiceDurationMs?: number, questionId?: string, chapter?: string }} data
 */
export function addDoubt(data) {
  const store = load()
  const audioId = data.audioId ?? data.source?.audioId
  const voiceDurationMs = data.voiceDurationMs ?? data.source?.durationMs
  const questionId = String(data.questionId ?? '').trim()
  const chapter = String(data.chapter ?? '').trim()
  const doubt = {
    id: `doubt-${Date.now()}`,
    title: data.title.trim(),
    body: data.body.trim(),
    subject: data.subject,
    authorId: data.authorId,
    authorName: data.authorName,
    createdAt: Date.now(),
    source: data.source,
    audioId,
    voiceDurationMs,
    solutions: [],
    ...(questionId ? { questionId } : {}),
    ...(chapter ? { chapter } : {}),
  }
  store.doubts.unshift(doubt)
  save(store)
  return doubt
}

/**
 * @param {string} doubtId
 * @param {{ body: string, authorId: string, authorName: string, source?: ContentSource, audioId?: string, voiceDurationMs?: number }} data
 */
export function addSolution(doubtId, data) {
  const store = load()
  const doubt = store.doubts.find((d) => d.id === doubtId)
  if (!doubt) return { ok: false, error: 'Doubt not found' }
  const audioId = data.audioId ?? data.source?.audioId
  const voiceDurationMs = data.voiceDurationMs ?? data.source?.durationMs
  const solution = {
    id: `sol-${Date.now()}`,
    body: data.body.trim(),
    authorId: data.authorId,
    authorName: data.authorName,
    createdAt: Date.now(),
    source: data.source,
    audioId,
    voiceDurationMs,
  }
  doubt.solutions.push(solution)
  save(store)
  return { ok: true, solution }
}

/** @param {string} doubtId */
export function getDoubtById(doubtId) {
  return load().doubts.find((d) => d.id === doubtId) ?? null
}

/** @param {string} doubtId @param {string} authorId */
export function deleteDoubt(doubtId, authorId) {
  const store = load()
  const idx = store.doubts.findIndex((d) => d.id === doubtId && d.authorId === authorId)
  if (idx === -1) return { ok: false }
  store.doubts.splice(idx, 1)
  save(store)
  return { ok: true }
}

export function seedDemoDoubts() {
  if (!allowAutoDemoSeed()) return
  if (load().doubts.length > 0) return
  const demo = [
    {
      title: 'Why is $\\Delta G = \\Delta H - T\\Delta S$ used for spontaneity?',
      body: 'In thermodynamics we use this but I confuse when $\\Delta H$ dominates vs entropy term.',
      subject: 'chemistry',
      authorName: 'Demo Student',
      authorId: 'demo-user-1',
    },
    {
      title: 'Projectile motion — time of flight formula',
      body: 'For projection at angle $\\theta$, is $T = \\frac{2u\\sin\\theta}{g}$ always valid?',
      subject: 'physics',
      authorName: 'Priya M.',
      authorId: 'demo-user-2',
    },
  ]
  demo.forEach((d) => {
    const doubt = addDoubt(d)
    addSolution(doubt.id, {
      body: 'Yes — at same level of projection. If heights differ, use $T = \\frac{u\\sin\\theta + \\sqrt{u^2\\sin^2\\theta + 2gh}}{g}$ (when landing below launch).',
      authorName: 'Rohan K.',
      authorId: 'demo-user-3',
    })
  })
}
