/**
 * Shared Hybrid AI tag maps (Postgres pool <-> browser question bank).
 * Keep in sync with hybrid_metadata.py.
 * Unit/chapter names come from the Main bank curriculum (src/data/curriculum.js).
 */
import { CURRICULUM_TREE } from '../data/curriculum.js'

export const HYBRID_CANONICAL_EXAMS = /** @type {const} */ ([
  'JEE Main',
  'JEE Advanced',
  'NEET',
])

export const HYBRID_CANONICAL_SUBJECT_LABELS = /** @type {const} */ ([
  'Physics',
  'Chemistry',
  'Mathematics',
  'Botany',
  'Zoology',
])

export const HYBRID_QUESTION_TYPE_CODES = /** @type {const} */ (['SCQ', 'MSQ', 'NVQ'])

export const EXAM_SLUG_TO_HYBRID_LABEL = {
  'jee-main': 'JEE Main',
  'jee-advanced': 'JEE Advanced',
  neet: 'NEET',
}

export const HYBRID_EXAM_LABEL_TO_SLUG = {
  'JEE Main': 'jee-main',
  'JEE Advanced': 'jee-advanced',
  NEET: 'neet',
}

export const SUBJECT_SLUG_TO_HYBRID_LABEL = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
}

export const HYBRID_SUBJECT_LABEL_TO_SLUG = {
  Physics: 'physics',
  Chemistry: 'chemistry',
  Mathematics: 'mathematics',
  Botany: 'biology',
  Zoology: 'biology',
}

/** @param {unknown} examId */
export function mapExamSlugToHybridLabel(examId) {
  const key = String(examId ?? 'jee-main').trim().toLowerCase()
  return EXAM_SLUG_TO_HYBRID_LABEL[key] || 'JEE Main'
}

/** @param {unknown} examLabel */
export function mapHybridExamLabelToSlug(examLabel) {
  const key = String(examLabel ?? '').trim()
  return HYBRID_EXAM_LABEL_TO_SLUG[key] || 'jee-main'
}

/** @param {unknown} subjectSlug @param {unknown} [chapter] */
export function mapSubjectSlugToHybridLabel(subjectSlug, chapter) {
  const key = String(subjectSlug ?? '').trim().toLowerCase()
  if (SUBJECT_SLUG_TO_HYBRID_LABEL[key]) return SUBJECT_SLUG_TO_HYBRID_LABEL[key]
  if (key === 'biology') {
    const c = String(chapter ?? '')
    if (/zoology|human|animal|reproduction|health|biotechnology/i.test(c)) return 'Zoology'
    return 'Botany'
  }
  const raw = String(subjectSlug ?? 'General').trim()
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'General'
}

/** @param {unknown} subjectLabel */
export function mapHybridSubjectLabelToSlug(subjectLabel) {
  const key = String(subjectLabel ?? '').trim()
  return HYBRID_SUBJECT_LABEL_TO_SLUG[key] || String(subjectLabel ?? 'general').trim().toLowerCase() || 'general'
}

/** @param {unknown} rawType @param {unknown[]} options */
export function mapHybridPoolQuestionTypeToBankId(rawType, options) {
  const t = String(rawType ?? '').trim().toUpperCase()
  const opts = Array.isArray(options) ? options : []
  if (t === 'TF' || t === 'TRUE_FALSE' || t === 'T/F') return 'true_false'
  if (t === 'MTC' || t.includes('MATCH')) return 'matrix_match'
  if (t === 'PSC' || t === 'PSCQ' || t === 'PASSAGE_SCQ') return 'passage_scq'
  if (t === 'PNVQ' || t === 'PIVQ' || t === 'PASSAGE_INTEGER') return 'passage_integer'
  if (t === 'MSQ' || t.includes('MULTIPLE')) return 'multiple_correct'
  if (t === 'IVQ' || t === 'INTEGER') return 'integer'
  if (t === 'NVQ' || t.includes('NUM')) {
    return opts.length ? 'numerical' : 'integer'
  }
  if (t === 'SCQ' || t === 'MCQ' || t.includes('SINGLE')) return 'single_correct'
  return 'single_correct'
}

/** UI / trial types -> Postgres SCQ|MSQ|NVQ */
export function mapTrialTypeMixToHybridCode(typeMix) {
  if (typeMix === 'all' || typeMix == null) return 'SCQ'
  const list = Array.isArray(typeMix) ? typeMix : [typeMix]
  for (const raw of list) {
    const id = String(raw ?? '').trim()
    if (id === 'multiple_correct') return 'MSQ'
    if (id === 'numerical' || id === 'integer') return 'NVQ'
    if (id === 'single_correct' || id === 'true_false' || id === 'matrix_match') return 'SCQ'
  }
  return 'SCQ'
}

/** Generator dashboard labels -> SCQ|MSQ|NVQ */
export function mapGeneratorQuestionTypeLabelToCode(label) {
  const folded = String(label ?? '').toLowerCase()
  if (folded.includes('multiple')) return 'MSQ'
  if (folded.includes('numer')) return 'NVQ'
  return 'SCQ'
}

const FOLD_ALIASES = {
  'vector and 3d': 'vectors and 3d',
  'vector 3d': 'vectors and 3d',
  'vectors 3d': 'vectors and 3d',
}

/** @param {unknown} name */
export function foldCurriculumName(name) {
  const folded = String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return FOLD_ALIASES[folded] || folded
}

/** @param {unknown} subject */
export function curriculumTreeKeysForHybridSubject(subject) {
  const raw = String(subject ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
  if (raw === 'mathematics' || raw === 'math' || raw === 'maths') return ['mathematics']
  if (raw === 'physics' || raw === 'phy') return ['physics']
  if (raw === 'chemistry' || raw === 'chem') return ['chemistry']
  if (raw === 'botany') return ['botany', 'biology']
  if (raw === 'zoology') return ['zoology', 'biology']
  if (raw === 'biology') return ['biology', 'botany', 'zoology']
  const slug = mapHybridSubjectLabelToSlug(subject)
  if (slug === 'biology') return ['biology', 'botany', 'zoology']
  if (CURRICULUM_TREE[slug]) return [slug]
  if (CURRICULUM_TREE[raw]) return [raw]
  return []
}

/** @param {unknown} subject */
function treesForSubject(subject) {
  const trees = []
  for (const key of curriculumTreeKeysForHybridSubject(subject)) {
    const node = CURRICULUM_TREE[key]
    if (node && typeof node === 'object') trees.push(node)
  }
  return trees
}

/** @param {unknown} subject */
export function curriculumUnitsForSubject(subject) {
  /** @type {string[]} */
  const units = []
  for (const node of treesForSubject(subject)) {
    for (const unit of Object.keys(node)) {
      if (!units.includes(unit)) units.push(unit)
    }
  }
  return units
}

/**
 * @param {Record<string, Record<string, string[]>>[]} trees
 * @param {string} name
 */
function chapterHits(trees, name) {
  const folded = foldCurriculumName(name)
  if (!folded) return []
  /** @type {{ unit: string, chapter: string, topics: string[] }[]} */
  const hits = []
  for (const node of trees) {
    for (const [unit, chapters] of Object.entries(node)) {
      for (const [chapter, topics] of Object.entries(chapters || {})) {
        if (foldCurriculumName(chapter) === folded) {
          hits.push({ unit, chapter, topics: Array.isArray(topics) ? topics : [] })
        }
      }
    }
  }
  return hits
}

/**
 * @param {Record<string, Record<string, string[]>>[]} trees
 * @param {string} name
 * @param {string} [preferUnit]
 */
function uniqueChapterPrefix(trees, name) {
  const folded = foldCurriculumName(name)
  if (folded.length < 6) return null
  /** @type {{ unit: string, chapter: string, topics: string[] }[]} */
  const hits = []
  for (const node of trees) {
    for (const [unit, chapters] of Object.entries(node)) {
      for (const [chapter, topics] of Object.entries(chapters || {})) {
        if (foldCurriculumName(chapter).startsWith(`${folded} `)) {
          hits.push({ unit, chapter, topics: Array.isArray(topics) ? topics : [] })
        }
      }
    }
  }
  const keys = new Set(hits.map((hit) => `${hit.unit}\0${hit.chapter}`))
  if (keys.size === 1) return hits[0]
  return null
}

function pickChapterHit(trees, name, preferUnit) {
  const hits = chapterHits(trees, name)
  if (!hits.length) return null
  const pref = foldCurriculumName(preferUnit)
  if (pref) {
    const match = hits.find((hit) => foldCurriculumName(hit.unit) === pref)
    if (match) return match
  }
  return hits[0]
}

/**
 * @param {Record<string, Record<string, string[]>>[]} trees
 * @param {string} name
 */
function topicHits(trees, name) {
  const folded = foldCurriculumName(name)
  if (!folded) return []
  /** @type {{ unit: string, chapter: string, topics: string[], topic: string }[]} */
  const hits = []
  for (const node of trees) {
    for (const [unit, chapters] of Object.entries(node)) {
      for (const [chapter, topics] of Object.entries(chapters || {})) {
        for (const topic of topics || []) {
          if (foldCurriculumName(topic) === folded) {
            hits.push({ unit, chapter, topics: topics || [], topic: String(topic) })
          }
        }
      }
    }
  }
  return hits
}

/**
 * @param {Record<string, Record<string, string[]>>[]} trees
 * @param {string} name
 * @param {string} [preferUnit]
 */
function pickTopicHit(trees, name, preferUnit) {
  const hits = topicHits(trees, name)
  if (!hits.length) return null
  const pref = foldCurriculumName(preferUnit)
  if (pref) {
    const narrowed = hits.filter((hit) => foldCurriculumName(hit.unit) === pref)
    const keys = new Set(narrowed.map((hit) => `${hit.unit}\0${hit.chapter}`))
    if (keys.size === 1) return narrowed[0]
  }
  const keys = new Set(hits.map((hit) => `${hit.unit}\0${hit.chapter}`))
  if (keys.size === 1) return hits[0]
  return null
}

/**
 * @param {Record<string, Record<string, string[]>>[]} trees
 * @param {string} name
 */
function canonicalUnit(trees, name) {
  const folded = foldCurriculumName(name)
  if (!folded) return ''
  for (const node of trees) {
    for (const unit of Object.keys(node)) {
      if (foldCurriculumName(unit) === folded) return unit
    }
  }
  return ''
}

/**
 * @param {{ topics?: string[] }} hit
 * @param {string} name
 */
function topicUnder(hit, name) {
  const folded = foldCurriculumName(name)
  if (!folded) return ''
  for (const topic of hit.topics || []) {
    if (foldCurriculumName(topic) === folded) return String(topic)
  }
  return ''
}

/**
 * Main-bank unit + chapter. A chapter name in the unit field becomes its parent unit.
 * Unknown chapters stay unset and are not copied into the unit.
 * @param {unknown} subject
 * @param {{ section?: unknown, unit?: unknown, chapter?: unknown, topic?: unknown }} [fields]
 */
export function resolveHybridCurriculumTags(subject, fields = {}) {
  const rawUnit = String(fields.unit ?? fields.section ?? '').trim()
  let rawChapter = String(fields.chapter ?? '').trim()
  let rawTopic = String(fields.topic ?? '').trim()
  if (rawTopic && rawChapter && foldCurriculumName(rawTopic) === foldCurriculumName(rawChapter)) {
    rawTopic = ''
  }
  const trees = treesForSubject(subject)
  let hit = pickChapterHit(trees, rawChapter, rawUnit)
  if (!hit && rawTopic) hit = pickChapterHit(trees, rawTopic, rawUnit || rawChapter)
  if (!hit && rawUnit) hit = pickChapterHit(trees, rawUnit, '')
  if (!hit) {
    hit =
      uniqueChapterPrefix(trees, rawChapter) ||
      uniqueChapterPrefix(trees, rawTopic) ||
      uniqueChapterPrefix(trees, rawUnit)
  }
  if (!hit) {
    const topicHit =
      pickTopicHit(trees, rawChapter, rawUnit) ||
      pickTopicHit(trees, rawTopic, rawUnit || rawChapter) ||
      pickTopicHit(trees, rawUnit, '')
    if (topicHit) {
      hit = topicHit
      if (!rawTopic) rawTopic = topicHit.topic || ''
    }
  }
  if (hit) {
    let topicOut = topicUnder(hit, rawTopic) || topicUnder(hit, rawChapter)
    if (
      !topicOut &&
      rawTopic &&
      !chapterHits(trees, rawTopic).length &&
      !canonicalUnit(trees, rawTopic) &&
      foldCurriculumName(rawTopic) !== foldCurriculumName(hit.chapter) &&
      foldCurriculumName(rawTopic) !== foldCurriculumName(hit.unit)
    ) {
      topicOut = rawTopic
    }
    return { mapped: true, unit: hit.unit, chapter: hit.chapter, topic: topicOut || '' }
  }
  return { mapped: false, unit: canonicalUnit(trees, rawUnit), chapter: '', topic: '' }
}

/**
 * @param {unknown} subject
 * @param {{ section?: unknown, unit?: unknown, chapter?: unknown, topic?: unknown }} [fields]
 */
/**
 * Topic names under one Main-bank chapter. Empty when that chapter has none.
 * @param {unknown} subject
 * @param {unknown} chapter
 * @returns {string[]}
 */
export function curriculumTopicsForChapter(subject, chapter) {
  const tags = resolveHybridCurriculumTags(subject, { chapter })
  if (!tags.mapped || !tags.unit || !tags.chapter) return []
  for (const node of treesForSubject(subject)) {
    const chapters = node[tags.unit]
    if (!chapters || typeof chapters !== 'object') continue
    const topics = chapters[tags.chapter]
    if (Array.isArray(topics)) return topics.map((topic) => String(topic))
  }
  return []
}

export function applyHybridCurriculumTags(subject, fields = {}) {
  const tags = resolveHybridCurriculumTags(subject, fields)
  const rawChapter = String(fields.chapter ?? '').trim()
  if (tags.mapped) {
    return { mapped: true, section: tags.unit, chapter: tags.chapter, topic: tags.topic || '' }
  }
  // Unknown chapter: do not copy it into the unit. Leave the chapter text so the card can be fixed.
  return {
    mapped: false,
    section: tags.unit || '',
    chapter: rawChapter,
    topic: String(fields.topic ?? '').trim(),
  }
}
