import { getAllPyqQuestions } from '../data/pyqCatalog.js'
import { getAllTests } from '../data/tests.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'

const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'and', 'or', 'what', 'how', 'why', 'when', 'which', 'this', 'that', 'with',
  'from', 'be', 'by', 'as', 'if', 'it', 'its', 'can', 'will', 'do', 'does', 'did',
])

/** @param {string} text */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\$+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text */
function tokenize(text) {
  const n = normalize(text)
  if (!n) return []
  return n.split(' ').filter((w) => w.length > 2 && !STOP.has(w))
}

/** @param {string[]} a @param {string[]} b */
function jaccard(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let inter = 0
  for (const w of setA) {
    if (setB.has(w)) inter++
  }
  const union = setA.size + setB.size - inter
  return union > 0 ? inter / union : 0
}

/** @param {string} hay @param {string} needle */
function substringBoost(hay, needle) {
  const h = normalize(hay)
  const n = normalize(needle)
  if (n.length < 12 || h.length < 12) return 0
  if (h.includes(n) || n.includes(h)) return 0.35
  const chunk = n.slice(0, Math.min(40, n.length))
  if (chunk.length >= 15 && h.includes(chunk)) return 0.25
  return 0
}

/**
 * @returns {Array<import('../data/tests').Question & { testTitle?: string, bankSource: string }>}
 */
export function getAllSearchableQuestions() {
  const seen = new Set()
  const out = []

  const uploaded = loadPublishedUploadedQuestions()
  for (const q of uploaded) {
    const key = normalize(q.text).slice(0, 80)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ ...q, testTitle: 'Question Bank', bankSource: 'uploaded' })
  }

  for (const q of getAllPyqQuestions()) {
    const key = normalize(q.text).slice(0, 80)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ ...q, testTitle: `${q.pyqYear} PYQ`, bankSource: 'pyq' })
  }

  for (const test of getAllTests()) {
    for (const q of test.questions) {
      if (q.isPassageHeader) continue
      const key = normalize(q.text).slice(0, 80)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push({ ...q, testTitle: test.title, bankSource: 'test' })
    }
  }

  return out
}

/**
 * Find similar questions with solutions in the bank.
 * @param {string} queryText - doubt title + body
 * @param {{ subject?: string, limit?: number, minScore?: number }} [opts]
 */
export function findSimilarBankQuestions(queryText, opts = {}) {
  const { subject, limit = 3, minScore = 0.28 } = opts
  const query = tokenize(queryText)
  if (query.length < 3) return []

  const pool = getAllSearchableQuestions().filter(
    (q) => q.solution?.trim() || q.videoSolution?.trim(),
  )

  const scored = []

  for (const q of pool) {
    if (subject && q.subject !== subject) continue

    const qTokens = tokenize(q.text)
    let score = jaccard(query, qTokens)
    score += substringBoost(q.text, queryText)
    score += substringBoost(queryText, q.text)

    if (q.subject === subject) score += 0.05

    if (score < minScore) continue

    let matchLabel = 'Similar wording'
    if (score >= 0.65) matchLabel = 'Very similar problem'
    else if (score >= 0.45) matchLabel = 'Similar problem'

    scored.push({
      question: q,
      score: Math.min(1, score),
      matchLabel,
      solution: q.solution?.trim() || '',
      videoSolution: q.videoSolution,
      questionPreview: q.text.slice(0, 200) + (q.text.length > 200 ? '…' : ''),
      testTitle: q.testTitle,
      bankSource: q.bankSource,
      chapter: q.chapter,
    })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
