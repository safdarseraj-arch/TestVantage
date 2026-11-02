const PYQ_IMPORT_KEY = 'testvantage-pyq-imported'

/** @typedef {import('../data/pyqCatalog').PyqQuestion} PyqQuestion */

function load() {
  try {
    const raw = localStorage.getItem(PYQ_IMPORT_KEY)
    return raw ? JSON.parse(raw) : { questions: [] }
  } catch {
    return { questions: [] }
  }
}

function save(data) {
  localStorage.setItem(PYQ_IMPORT_KEY, JSON.stringify(data))
}

export function loadImportedPyqs() {
  return load().questions
}

/** @param {PyqQuestion[]} questions @param {boolean} [merge] */
export function saveImportedPyqs(questions, merge = false) {
  const data = load()
  if (merge) {
    data.questions.push(...questions)
  } else {
    data.questions = questions
  }
  save(data)
  return data.questions.length
}

/** @param {PyqQuestion[]} items */
export function addImportedPyqs(items) {
  const data = load()
  data.questions.push(...items)
  save(data)
  return data.questions.length
}

/**
 * After Question Bank tag edits, keep the student PYQ copy in sync.
 * Matches the published bank id (and the new id if classification remints it).
 * @param {string} id
 * @param {Partial<PyqQuestion>} patch
 */
export function updateImportedPyqMeta(id, patch = {}) {
  const data = load()
  const oldId = String(id ?? '').trim()
  const nextId = String(patch.id ?? oldId).trim()
  let idx = data.questions.findIndex((q) => String(q?.id) === oldId)
  if (idx === -1 && nextId && nextId !== oldId) {
    idx = data.questions.findIndex((q) => String(q?.id) === nextId)
  }
  if (idx === -1) return null
  const prev = data.questions[idx]
  const next = {
    ...prev,
    id: nextId || prev.id,
    subject: patch.subject != null && String(patch.subject).trim() ? patch.subject : prev.subject,
    chapter: patch.chapter != null && String(patch.chapter).trim() ? patch.chapter : prev.chapter,
    questionType: patch.questionType != null && String(patch.questionType).trim()
      ? patch.questionType
      : prev.questionType,
  }
  if ('topic' in patch) next.topic = patch.topic
  if ('section' in patch) next.section = patch.section
  if ('toughnessLevel' in patch) next.toughnessLevel = patch.toughnessLevel
  if ('source' in patch) next.source = patch.source
  data.questions[idx] = next
  save(data)
  return next
}

export function clearImportedPyqs() {
  save({ questions: [] })
}

export function getImportedPyqCount() {
  return load().questions.length
}
