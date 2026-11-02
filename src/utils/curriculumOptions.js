import { CURRICULUM_TREE } from '../data/curriculum.js'
import { loadQuestionBank, saveQuestionBank } from './questionBank.js'

const CUSTOM_KEY = 'testvantage-curriculum-custom'

/** @typedef {'section' | 'chapter' | 'topic'} HierarchyLevel */

/**
 * @returns {Record<string, {
 *   sections?: string[],
 *   chapters?: Record<string, string[]>,
 *   topics?: Record<string, string[]>,
 *   hidden?: { sections?: string[], chapters?: string[], topics?: string[] }
 * }>}
 */
export function loadCustomCurriculum() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, unknown>} data */
export function saveCustomCurriculum(data) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(data))
}

/** @param {string} section @param {string} chapter */
export function topicKey(section, chapter) {
  return `${section}::${chapter}`
}

/** @param {Record<string, unknown>} data @param {string} subject */
function ensureSubjectEntry(data, subject) {
  if (!data[subject]) {
    data[subject] = { sections: [], chapters: {}, topics: {}, hidden: { sections: [], chapters: [], topics: [] } }
  }
  const sub = data[subject]
  sub.sections = sub.sections ?? []
  sub.chapters = sub.chapters ?? {}
  sub.topics = sub.topics ?? {}
  sub.hidden = sub.hidden ?? { sections: [], chapters: [], topics: [] }
  sub.hidden.sections = sub.hidden.sections ?? []
  sub.hidden.chapters = sub.hidden.chapters ?? []
  sub.hidden.topics = sub.hidden.topics ?? []
  return sub
}

/** @param {string} subject @param {HierarchyLevel} level @param {string} key */
function isHidden(subject, level, key) {
  const hidden = loadCustomCurriculum()[subject]?.hidden
  if (!hidden) return false
  if (level === 'section') return hidden.sections?.includes(key) ?? false
  if (level === 'chapter') return hidden.chapters?.includes(key) ?? false
  return hidden.topics?.includes(key) ?? false
}

/** @param {string} subject @param {string} section @param {string} chapter */
function chapterKey(section, chapter) {
  return topicKey(section, chapter)
}

/**
 * Rename a section, chapter, or topic in custom storage (and hide built-in originals when needed).
 * @returns {{ ok: boolean, error?: string }}
 */
export function renameHierarchyItem(subject, level, oldName, newName, context = {}) {
  const from = oldName?.trim()
  const to = newName?.trim()
  if (!subject || !from || !to) return { ok: false, error: 'Name cannot be empty.' }
  if (from === to) return { ok: false, error: 'New name is the same as the current name.' }

  const { section = '', chapter = '' } = context

  if (level === 'chapter' && !section) return { ok: false, error: 'Section is required to rename a chapter.' }
  if (level === 'topic' && (!section || !chapter)) {
    return { ok: false, error: 'Section and chapter are required to rename a topic.' }
  }

  const existing =
    level === 'section'
      ? getSectionOptions(subject)
      : level === 'chapter'
        ? getChapterOptions(subject, section)
        : getTopicOptions(subject, section, chapter)

  if (existing.includes(to)) return { ok: false, error: `"${to}" already exists.` }

  const data = loadCustomCurriculum()
  const sub = ensureSubjectEntry(data, subject)

  if (level === 'section') {
    const builtIn = CURRICULUM_TREE[subject]?.[from]
    if (builtIn) {
      if (!sub.hidden.sections.includes(from)) sub.hidden.sections.push(from)
      if (!sub.chapters[to]) sub.chapters[to] = []
      for (const [ch, topics] of Object.entries(builtIn)) {
        if (!sub.chapters[to].includes(ch)) sub.chapters[to].push(ch)
        const tk = topicKey(to, ch)
        if (!sub.topics[tk]) sub.topics[tk] = [...topics]
      }
    } else {
      sub.sections = sub.sections.map((s) => (s === from ? to : s))
      if (sub.chapters[from]) {
        sub.chapters[to] = sub.chapters[from]
        delete sub.chapters[from]
      }
      for (const key of Object.keys(sub.topics)) {
        if (key.startsWith(`${from}::`)) {
          sub.topics[key.replace(`${from}::`, `${to}::`)] = sub.topics[key]
          delete sub.topics[key]
        }
      }
    }
    if (!sub.sections.includes(to)) sub.sections.push(to)
  } else if (level === 'chapter') {
    const ck = chapterKey(section, from)
    const builtIn = CURRICULUM_TREE[subject]?.[section]?.[from]
    if (builtIn) {
      if (!sub.hidden.chapters.includes(ck)) sub.hidden.chapters.push(ck)
      if (!sub.chapters[section]) sub.chapters[section] = []
      if (!sub.chapters[section].includes(to)) sub.chapters[section].push(to)
      sub.topics[topicKey(section, to)] = [...builtIn]
    } else {
      if (sub.chapters[section]) {
        sub.chapters[section] = sub.chapters[section].map((c) => (c === from ? to : c))
      }
      const oldTk = topicKey(section, from)
      if (sub.topics[oldTk]) {
        sub.topics[topicKey(section, to)] = sub.topics[oldTk]
        delete sub.topics[oldTk]
      }
    }
  } else {
    const tk = topicKey(section, chapter)
    const fullKey = `${tk}::${from}`
    const builtIn = CURRICULUM_TREE[subject]?.[section]?.[chapter]?.includes(from)
    if (builtIn) {
      if (!sub.hidden.topics.includes(fullKey)) sub.hidden.topics.push(fullKey)
      if (!sub.topics[tk]) sub.topics[tk] = []
      if (!sub.topics[tk].includes(to)) sub.topics[tk].push(to)
    } else if (sub.topics[tk]) {
      sub.topics[tk] = sub.topics[tk].map((t) => (t === from ? to : t))
    }
  }

  saveCustomCurriculum(data)
  return { ok: true }
}

/**
 * Update saved questions when a section, chapter, or topic is renamed.
 * @returns {number} count of updated questions
 */
export function renameQuestionsHierarchy(subject, level, oldName, newName, context = {}) {
  const bank = loadQuestionBank()
  let count = 0
  bank.questions = bank.questions.map((q) => {
    if (q.subject !== subject) return q
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    const next = { ...q, section: r.section || q.section, chapter: r.chapter || q.chapter, topic: r.topic || q.topic }

    if (level === 'section' && r.section === oldName) {
      next.section = newName
      count++
    } else if (level === 'chapter' && r.section === context.section && r.chapter === oldName) {
      next.chapter = newName
      count++
    } else if (
      level === 'topic' &&
      r.section === context.section &&
      r.chapter === context.chapter &&
      r.topic === oldName
    ) {
      next.topic = newName
      count++
    }
    return next
  })
  saveQuestionBank(bank)
  return count
}

/**
 * @param {string} subject
 * @param {string} section
 * @param {string} chapter
 * @param {string} topic
 */
export function registerCustomHierarchy(subject, section, chapter, topic) {
  if (!subject || !section?.trim()) return
  const data = loadCustomCurriculum()
  if (!data[subject]) data[subject] = { sections: [], chapters: {}, topics: {} }
  const sub = data[subject]
  sub.sections = sub.sections ?? []
  sub.chapters = sub.chapters ?? {}
  sub.topics = sub.topics ?? {}

  if (!sub.sections.includes(section)) sub.sections.push(section)
  if (chapter?.trim()) {
    if (!sub.chapters[section]) sub.chapters[section] = []
    if (!sub.chapters[section].includes(chapter)) sub.chapters[section].push(chapter)
    if (topic?.trim()) {
      const key = topicKey(section, chapter)
      if (!sub.topics[key]) sub.topics[key] = []
      if (!sub.topics[key].includes(topic)) sub.topics[key].push(topic)
    }
  }
  saveCustomCurriculum(data)
}

/** Backward-compatible alias */
export function registerCustomChapterTopic(subject, section, chapter, topic) {
  registerCustomHierarchy(subject, section, chapter, topic ?? '')
}

/** @param {import('../data/tests').Question[]} [questions] */
function questionsFromBank(questions) {
  return questions ?? loadQuestionBank().questions
}

/** @param {string} subject @param {string} chapter */
export function findSectionByChapter(subject, chapter) {
  if (!subject || !chapter) return null
  const tree = CURRICULUM_TREE[subject]
  if (tree) {
    for (const [section, chapters] of Object.entries(tree)) {
      if (chapter in chapters) return section
    }
  }
  const custom = loadCustomCurriculum()[subject]?.chapters ?? {}
  for (const [section, list] of Object.entries(custom)) {
    if (list.includes(chapter)) return section
  }
  return null
}

/** @param {string} subject @param {string} name */
export function findLocationByName(subject, name) {
  if (!name) return null
  const tree = CURRICULUM_TREE[subject]
  if (!tree) return null
  for (const [section, chapters] of Object.entries(tree)) {
    if (section === name) return { section, chapter: '', topic: '' }
    for (const [chapter, topics] of Object.entries(chapters)) {
      if (chapter === name) return { section, chapter, topic: '' }
      if (topics.includes(name)) return { section, chapter, topic: name }
    }
  }
  return null
}

/**
 * @param {string} subject
 * @param {string} [section]
 * @param {string} [chapter]
 * @param {string} [topic]
 */
export function resolveQuestionHierarchy(subject, section, chapter, topic) {
  let sec = section?.trim() ?? ''
  let ch = chapter?.trim() ?? ''
  let top = topic?.trim() ?? ''

  if (sec && ch && CURRICULUM_TREE[subject]?.[sec]?.[ch]) {
    return { section: sec, chapter: ch, topic: top }
  }

  // Legacy: section in chapter field, chapter in topic field
  if (!sec && ch && top && CURRICULUM_TREE[subject]?.[ch]?.[top]) {
    return { section: ch, chapter: top, topic: '' }
  }

  // Legacy: chapter field holds section name
  if (!sec && ch && CURRICULUM_TREE[subject]?.[ch] && !top) {
    return { section: ch, chapter: '', topic: '' }
  }

  if (!sec && ch) {
    const foundSec = findSectionByChapter(subject, ch)
    if (foundSec) return { section: foundSec, chapter: ch, topic: top }
  }

  if (!sec && ch && !top) {
    const loc = findLocationByName(subject, ch)
    if (loc) return loc
  }

  if (!sec && top && !ch) {
    const loc = findLocationByName(subject, top)
    if (loc) return loc
  }

  return { section: sec, chapter: ch, topic: top }
}

/** @deprecated — use resolveQuestionHierarchy */
export function resolveChapterTopic(subject, chapter, topic) {
  return resolveQuestionHierarchy(subject, '', chapter, topic)
}

/**
 * @param {string} subject
 * @param {import('../data/tests').Question[]} [questions]
 */
export function getSectionOptions(subject, questions) {
  if (!subject) return []
  const set = new Set()
  const tree = CURRICULUM_TREE[subject]
  if (tree) Object.keys(tree).forEach((s) => set.add(s))

  loadCustomCurriculum()[subject]?.sections?.forEach((s) => set.add(s))

  for (const q of questionsFromBank(questions)) {
    if (q.subject !== subject) continue
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    if (r.section) set.add(r.section)
  }

  return [...set].filter((s) => !isHidden(subject, 'section', s)).sort((a, b) => a.localeCompare(b))
}

/**
 * @param {string} subject
 * @param {string} section
 * @param {import('../data/tests').Question[]} [questions]
 */
export function getChapterOptions(subject, section, questions) {
  if (!subject || !section) return []

  const set = new Set()
  const treeChapters = CURRICULUM_TREE[subject]?.[section]
  if (treeChapters) Object.keys(treeChapters).forEach((c) => set.add(c))

  loadCustomCurriculum()[subject]?.chapters?.[section]?.forEach((c) => set.add(c))

  for (const q of questionsFromBank(questions)) {
    if (q.subject !== subject) continue
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    if (r.section === section && r.chapter) set.add(r.chapter)
  }

  return [...set]
    .filter((c) => !isHidden(subject, 'chapter', chapterKey(section, c)))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * @param {string} subject
 * @param {string} section
 * @param {string} chapter
 * @param {import('../data/tests').Question[]} [questions]
 */
export function getTopicOptions(subject, section, chapter, questions) {
  if (!subject || !section || !chapter) return []

  const set = new Set()
  const treeTopics = CURRICULUM_TREE[subject]?.[section]?.[chapter]
  if (treeTopics) treeTopics.forEach((t) => set.add(t))

  loadCustomCurriculum()[subject]?.topics?.[topicKey(section, chapter)]?.forEach((t) =>
    set.add(t),
  )

  for (const q of questionsFromBank(questions)) {
    if (q.subject !== subject) continue
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    if (r.section === section && r.chapter === chapter && r.topic) set.add(r.topic)
  }

  const tk = topicKey(section, chapter)
  return [...set]
    .filter((t) => !isHidden(subject, 'topic', `${tk}::${t}`))
    .sort((a, b) => a.localeCompare(b))
}
