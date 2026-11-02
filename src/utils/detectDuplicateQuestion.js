import { effectiveBankStatus } from './questionUploadFilter.js'

/**
 * Detect duplicate questions in the bank (same or near-same stem).
 *
 * Exact / 100% requires the *normalized* stem to match — LaTeX command names
 * (\sin vs \cos) are kept as tokens, not stripped. Short generic phrases
 * ("then:", "the value of") never unique-match the whole bank.
 */

const MIN_DISTINCTIVE_TOKENS = 3
const SIMILAR_THRESHOLD = 0.88

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'and',
  'or',
  'in',
  'on',
  'at',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'this',
  'that',
  'these',
  'those',
  'then',
  'than',
  'with',
  'from',
  'into',
  'onto',
  'as',
  'by',
  'it',
  'its',
  'if',
  'which',
  'what',
  'when',
  'where',
  'how',
  'also',
  'only',
  'not',
  'no',
  'so',
  'such',
  'given',
  'following',
  'shown',
  'above',
  'below',
  'find',
  'evaluate',
  'hence',
  'thus',
  'therefore',
  'equal',
  'equals',
  'value',
  'values',
  'let',
  'has',
  'have',
  'had',
  'does',
  'did',
  'do',
  'can',
  'will',
  'would',
  'should',
  'may',
  'must',
  'each',
  'any',
  'all',
  'both',
  'more',
  'most',
  'other',
  'some',
  'very',
  'just',
  'over',
  'under',
  'out',
  'up',
  'down',
  'about',
  'same',
  'after',
  'before',
  'between',
  'through',
  'during',
  'without',
  'within',
  'because',
  'while',
  'here',
  'there',
  'once',
  'question',
])

/** @param {string} s */
function stripQuestionNumberPrefixes(s) {
  let next = String(s ?? '').trim()
  let prev = ''
  while (next && next !== prev) {
    prev = next
    next = next
      .replace(/^(?:q(?:uestion)?(?:\s*\.|\s)?\s*\d+\s*[.):\-]?\s*)/i, '')
      .replace(/^\d+\s*[.):\-]\s*/, '')
      .trim()
  }
  return next
}

/**
 * Normalize stem for duplicate compare: strip $, whitespace, Q.12 prefixes;
 * keep math command names and distinctive tokens.
 * @param {string} text
 */
export function normalizeStemForDuplicate(text) {
  let s = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()

  s = stripQuestionNumberPrefixes(s)
  s = s.replace(/\$+/g, ' ')
  s = s.replace(/\\([a-z]+)/gi, ' $1 ')
  s = s.replace(/\\/g, ' ')
  s = s.replace(/[{}()[\]]/g, ' ')
  s = s.replace(/[_^]/g, ' ')
  s = s.replace(/([+\-=])/g, ' $1 ')
  s = s.replace(/[.,;:!?'"`#*/<>|&~]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return stripQuestionNumberPrefixes(s)
}

/** @param {string} text */
export function questionStemFingerprint(text) {
  return normalizeStemForDuplicate(text)
}

/** @param {string} normalized */
export function distinctiveStemTokens(normalized) {
  return String(normalized ?? '')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
}

/** @param {string} normalized */
function canUniqueMatch(normalized) {
  const n = String(normalized ?? '')
  if (!n) return false
  const distinctive = distinctiveStemTokens(n)
  if (distinctive.length >= MIN_DISTINCTIVE_TOKENS) return true
  return n.length >= 32 && distinctive.length >= 2
}

/** @param {string} a @param {string} b */
export function stemSimilarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1

  const da = distinctiveStemTokens(a)
  const db = distinctiveStemTokens(b)
  if (da.length < MIN_DISTINCTIVE_TOKENS || db.length < MIN_DISTINCTIVE_TOKENS) return 0

  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  if (short.length >= 40 && long.includes(short)) {
    const ds = short === a ? da : db
    if (ds.length >= MIN_DISTINCTIVE_TOKENS) return 0.95
  }

  const wa = new Set(da)
  const wb = new Set(db)
  let inter = 0
  wa.forEach((w) => {
    if (wb.has(w)) inter++
  })
  const union = wa.size + wb.size - inter
  const jaccard = union ? inter / union : 0
  if (jaccard >= 1) return 0.99
  return jaccard
}

/**
 * @param {import('../data/tests').Question} candidate
 * @param {import('../data/tests').Question[]} bank
 * @param {{ excludeId?: string, minSimilarity?: number }} [opts]
 * @returns {{ question: import('../data/tests').Question, similarity: number, match: 'exact' | 'similar' }[]}
 */
export function findDuplicateQuestions(candidate, bank, opts = {}) {
  const fp = questionStemFingerprint(candidate?.text)
  if (!canUniqueMatch(fp)) return []

  const exclude = new Set(
    [opts.excludeId, ...(opts.excludeIds ?? [])]
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  )
  const threshold = opts.minSimilarity ?? SIMILAR_THRESHOLD
  const out = []

  for (const q of bank ?? []) {
    if (!q?.text?.trim()) continue
    if (exclude.has(String(q.id))) continue

    const other = questionStemFingerprint(q.text)
    if (!other || !canUniqueMatch(other)) continue

    if (other === fp) {
      out.push({ question: q, similarity: 1, match: 'exact' })
      continue
    }

    const sim = stemSimilarity(fp, other)
    if (sim >= 1) {
      out.push({ question: q, similarity: 0.99, match: 'similar' })
      continue
    }
    if (sim >= threshold) {
      out.push({ question: q, similarity: Math.min(sim, 0.99), match: 'similar' })
    }
  }

  out.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity
    const aDup = a.question?.duplicateOfId ? 1 : 0
    const bDup = b.question?.duplicateOfId ? 1 : 0
    return aDup - bDup
  })
  return out
}

/**
 * Display percent. Fuzzy scores never show as 100%.
 * @param {{ similarity?: number, match?: string }} match
 */
export function duplicateMatchPercent(match) {
  if (match?.match === 'exact' && Number(match.similarity) >= 1) return 100
  const n = Math.round(Number(match?.similarity ?? 0) * 100)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(99, n)
}

/**
 * Everyday label for a match row.
 * @param {{ similarity?: number, match?: string }} match
 */
export function formatDuplicateMatchLabel(match) {
  if (match?.match === 'exact' && Number(match.similarity) >= 1) {
    return 'Same wording (100%)'
  }
  return `${duplicateMatchPercent(match)}% similar`
}

/**
 * @param {{ question: import('../data/tests').Question, similarity: number, match: string }[]} matches
 */
export function formatDuplicateAlarmMessage(matches) {
  if (!matches.length) return ''
  const exact = matches.filter((m) => m.match === 'exact').length
  const similar = matches.length - exact
  if (exact > 0 && similar > 0) {
    return 'Possible duplicate — compare with original. This copy is kept as a draft (not published).'
  }
  if (exact > 0) {
    return 'Possible duplicate — this matches a question already in your bank. Kept as a draft so you can compare.'
  }
  return 'Possible duplicate — stem looks very similar to a saved question. Kept as a draft so you can compare (not published).'
}

/** @param {import('../data/tests').Question} q */
export function questionPreviewLabel(q) {
  const t = String(q.text ?? '').replace(/\s+/g, ' ').trim()
  const preview = t.length > 72 ? `${t.slice(0, 72)}…` : t
  const subj = q.subject ? String(q.subject) : 'question'
  const type = q.questionType ?? 'single_correct'
  return `${subj} · ${type} · ${preview || '(no text)'}`
}

/** @param {unknown} q */
export function isDuplicateReviewItem(q) {
  return !!String(q?.duplicateOfId ?? '').trim()
}

/**
 * Save the new row as a draft linked to the best original match.
 * @param {object} entry
 * @param {{ question: import('../data/tests').Question, similarity: number, match: string }[]} matches
 */
export function attachDuplicateReviewFields(entry, matches) {
  const top = matches?.[0]
  const originalId = top?.question?.id
  if (!originalId) return { ...entry, bankStatus: 'draft' }
  return {
    ...entry,
    bankStatus: 'draft',
    duplicateOfId: String(originalId),
    duplicateSimilarity: top.similarity,
    duplicateMatch: top.match,
  }
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 */
export function findOriginalForDuplicate(q, bank) {
  const id = String(q?.duplicateOfId ?? '').trim()
  if (!id) return null
  const byId = new Map((bank ?? []).map((row) => [String(row.id), row]))
  const seen = new Set()
  let currentId = id
  let found = null
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const row = byId.get(currentId)
    if (!row) break
    found = row
    const next = String(row.duplicateOfId ?? '').trim()
    if (!next) break
    currentId = next
  }
  return found
}

/**
 * @param {import('../data/tests').Question} q
 * @param {import('../data/tests').Question[]} bank
 */
export function findDuplicateReviewCopies(q, bank) {
  const id = String(q?.id ?? '').trim()
  if (!id) return []
  return (bank ?? []).filter((row) => String(row.duplicateOfId ?? '').trim() === id)
}

/**
 * Keep possible-duplicate drafts immediately after their original in a list.
 * @param {import('../data/tests').Question[]} questions
 */
export function placeDuplicateReviewsBesideOriginals(questions) {
  const list = [...(questions ?? [])]
  if (list.length < 2) return list
  const byId = new Map(list.map((q) => [String(q.id), q]))
  const placed = new Set()
  const out = []

  for (const q of list) {
    const id = String(q.id ?? '')
    if (!id || placed.has(id)) continue
    const dupOf = String(q.duplicateOfId ?? '').trim()
    if (dupOf && byId.has(dupOf)) continue
    out.push(q)
    placed.add(id)
    for (const other of list) {
      const oid = String(other.id ?? '')
      if (!oid || placed.has(oid)) continue
      if (String(other.duplicateOfId ?? '').trim() === id) {
        out.push(other)
        placed.add(oid)
      }
    }
  }

  for (const q of list) {
    const id = String(q.id ?? '')
    if (id && !placed.has(id)) out.push(q)
  }
  return out
}

/** Fingerprint only when the stem is long enough to be one specific question. */
export function uniqueStemFingerprint(text) {
  const fp = questionStemFingerprint(text)
  if (!fp || !canUniqueMatch(fp)) return ''
  return fp
}

/** Exact same question. Near-misses (88%) are not treated as the same stored copy. */
export function stemsAreSameQuestion(aText, bText) {
  const a = uniqueStemFingerprint(aText)
  const b = uniqueStemFingerprint(bText)
  return Boolean(a) && a === b
}

/**
 * Whole bank, every sub-bank. The question is not a duplicate of itself.
 * @param {import('../data/tests').Question} candidate
 * @param {import('../data/tests').Question[]} bank
 * @param {{ excludeIds?: string[], excludeId?: string, minSimilarity?: number }} [opts]
 */
export function findWholeBankPublishDuplicates(candidate, bank, opts = {}) {
  const excludeIds = [opts.excludeId, candidate?.id, ...(opts.excludeIds ?? [])]
  return findDuplicateQuestions(candidate, bank ?? [], {
    excludeIds,
    minSimilarity: opts.minSimilarity,
  })
}

/**
 * What to do when publish finds a match.
 * No match → publish this row.
 * Match and the user has not chosen → open compare, do not publish.
 * Keep original → delete the duplicate draft. Do not publish it. Do not delete the original.
 * Keep both → publish this row once.
 * @param {boolean} hasDuplicate
 * @param {'keep-both' | 'keep-original' | null | undefined} choice
 */
export function decidePublishDuplicateChoice(hasDuplicate, choice) {
  if (!hasDuplicate) return { action: 'publish', publish: true, keepBoth: false }
  if (choice === 'keep-both') return { action: 'publish', publish: true, keepBoth: true }
  if (choice === 'keep-original') return { action: 'delete-duplicate', publish: false, keepBoth: false }
  return { action: 'compare', publish: false, keepBoth: false }
}

/** Everyday name for which part of the bank a row lives in. */
export function questionBankPlaceLabel(q) {
  const raw = String(q?.sub_bank_type ?? q?.subBankType ?? '').trim().toLowerCase()
  if (raw === 'ai' || raw === 'hybrid' || raw === 'hybrid_ai') return 'Hybrid AI'
  if (raw === 'pyq' || raw === 'official_pyq' || q?.officialPyq === true) return 'Official PYQ'
  if (raw === 'similar_pyq' || raw === 'similar') return 'Similar PYQ'
  if (String(q?.bankSource ?? '') === 'official_pyq') return 'Official PYQ'
  return 'Main'
}

/** Fields shown side by side when a publish match is reviewed. */
export function questionCompareFacts(q) {
  const options = Array.isArray(q?.options) ? q.options : []
  const lines = options.slice(0, 8).map((opt, i) => {
    const text = typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? '')
    return `${String.fromCharCode(65 + i)}. ${text}`
  })
  let answer = '—'
  if (q?.correctIndex != null && Number.isFinite(Number(q.correctIndex))) {
    answer = String.fromCharCode(65 + Number(q.correctIndex))
  } else if (Array.isArray(q?.correctIndices) && q.correctIndices.length) {
    answer = q.correctIndices.map((i) => String.fromCharCode(65 + Number(i))).join(', ')
  } else if (q?.correctInteger != null && q.correctInteger !== '') {
    answer = String(q.correctInteger)
  } else if (q?.correctNumerical != null && q.correctNumerical !== '') {
    answer = String(q.correctNumerical)
  }
  const status = effectiveBankStatus(q)
  return {
    id: String(q?.id ?? ''),
    status,
    statusLabel: status === 'published' ? 'Published' : 'Draft',
    subBank: questionBankPlaceLabel(q),
    options: lines,
    answer,
  }
}
