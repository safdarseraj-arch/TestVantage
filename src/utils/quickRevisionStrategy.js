/**
 * Quick Revision - Problem solving strategy packs (concept to solve problems).
 * PYQ first. Own localStorage key. Never writes the question bank.
 */

import { WATERMARK_BRAND, WATERMARK_NOTICE, WATERMARK_URL } from './watermark.js'
import {
  asTrimmedText,
  canImproveRevisionSheet,
  findRevisionChapter,
  listRevisionSubjects,
} from './quickRevision.js'
import { findExamPattern } from './customBankMeta.js'
import { getSubjectOptionsForPicker } from './questionMetadata.js'
import { loadImportedPyqs } from './pyqStore.js'
import { isOfficialPyq, isPyqLike, isPyqStyleAi } from './pyqDetect.js'
import { peekUploadedQuestions } from './questionBank.js'
import { isQuestionPublished } from './questionUploadFilter.js'

export const STRATEGY_STORE_KEY = 'testvantage-quick-revision-strategies'

export const STRATEGY_AI_INSTRUCTION = [
  'Return JSON only. Cluster the given pyqQuestions into distinct strategy families (same method of attack).',
  'Use those PYQ stems MAXIMUM. Do not invent a dump of new MCQs.',
  'Required key: items (array). Count is not fixed. One item per family (or two PYQ if the family needs two). Often 25-45 if that many distinct strategies exist. Do not pad.',
  'Each item: {familyName, typeName, problem, options, steps, outline, source, questionId, pyqYear, paperLabel}.',
  'For each family pick real PYQ from pyqQuestions as the worked example. Copy the full stem and options. source must be "pyq". questionId must match the given PYQ.',
  'steps: 4-7 steps that solve THIS question and explain this family method.',
  'outline: 2-4 sentences of the working and the answer.',
  'Only if an important variation has NO PYQ in the list, add ONE extra question. source must be "extra". Do not invent a PYQ year or paper for extras.',
  'If pyqQuestions is empty, return only extras (source extra) and do not claim they are PYQ.',
  'Everyday English. No invented ranks.',
].join(' ')

export const STRATEGY_IMPROVE_INSTRUCTION = [
  'IMPROVE currentPack.items. Keep useful PYQ items. Prefer unused pyqQuestions for missing families.',
  'Add an extra (source extra) only when a needed variation has no PYQ. Do not invent PYQ years.',
  'Return JSON only with key items. Each item: {familyName, typeName, problem, options, steps, outline, source, questionId, pyqYear, paperLabel}.',
  'Do not dump new invented MCQs. Everyday English. No invented ranks.',
].join(' ')

function storageGet(key) {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}

function loadStore() {
  try {
    const raw = storageGet(STRATEGY_STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveStore(data) {
  storageSet(STRATEGY_STORE_KEY, JSON.stringify(data))
}

export function strategyPackKey(examId, subject, chapter) {
  return `${String(examId || '').trim()}::${String(subject || '').trim()}::${String(chapter || '').trim()}`
}

export function canEditStrategyPack(session) {
  return canImproveRevisionSheet(session)
}

function labelSubject(subject) {
  const row = getSubjectOptionsForPicker([]).find((s) => s.id === subject)
  if (row) return row.label
  const s = String(subject || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function asStep(row) {
  if (typeof row === 'string') return asTrimmedText(row)
  if (row && typeof row === 'object') return asTrimmedText(row.text ?? row.step ?? row.hint)
  return ''
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function namesMatchLoose(a, b) {
  const x = normKey(a)
  const y = normKey(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

function examMatches(q, examId) {
  if (!examId) return false
  if (String(q.examPatternId || '') === examId) return true
  const ids = Array.isArray(q.examIds) ? q.examIds : []
  return ids.map(String).includes(examId)
}

function questionStem(q) {
  return asTrimmedText(q?.text ?? q?.stem ?? q?.question ?? q?.problem)
}

function questionOptions(q) {
  if (Array.isArray(q?.options)) return q.options.map(asStep).filter(Boolean)
  return [q?.optionA, q?.optionB, q?.optionC, q?.optionD].map(asStep).filter(Boolean)
}

function isTaggedBankPyq(q) {
  if (!q || isPyqStyleAi(q)) return false
  return isOfficialPyq(q) || isPyqLike(q)
}

function toPyqRow(q, origin) {
  const problem = questionStem(q)
  if (!problem) return null
  return {
    id: asTrimmedText(q.id) || `${origin}-${normKey(problem).slice(0, 24)}`,
    subject: asTrimmedText(q.subject),
    chapter: asTrimmedText(q.chapter),
    topic: asTrimmedText(q.topic ?? q.subtopic),
    problem,
    options: questionOptions(q),
    solution: asTrimmedText(q.solution ?? q.explanation),
    pyqYear: q.pyqYear ?? q.year ?? null,
    paperLabel: asTrimmedText(q.paperLabel ?? q.paperId),
    examPatternId: asTrimmedText(q.examPatternId),
    examIds: Array.isArray(q.examIds) ? q.examIds : [],
    origin,
  }
}

export function listChapterStrategyPyqs(examId, subject, chapter) {
  const exam = asTrimmedText(examId)
  const sub = asTrimmedText(subject)
  const ch = asTrimmedText(chapter)
  if (!exam || !sub || !ch) return []
  const seen = new Set()
  const out = []
  const push = (row) => {
    if (!row) return
    if (!examMatches(row._raw || row, exam) && !examMatches(row, exam)) return
    if (row.subject && !namesMatchLoose(row.subject, sub)) return
    if (row.chapter && !namesMatchLoose(row.chapter, ch)) return
    const key = `${normKey(row.problem).slice(0, 80)}::${row.pyqYear || ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(row)
  }

  for (const q of loadImportedPyqs()) {
    if (!examMatches(q, exam)) continue
    if (q.subject && !namesMatchLoose(q.subject, sub)) continue
    if (q.chapter && !namesMatchLoose(q.chapter, ch)) continue
    const row = toPyqRow(q, 'import')
    if (row) push({ ...row, _raw: q })
  }

  let bank = []
  try {
    bank = peekUploadedQuestions() ?? []
  } catch {
    bank = []
  }
  if (!bank.length) {
    try {
      const raw = storageGet('testvantage-uploaded-questions')
      const parsed = raw ? JSON.parse(raw) : null
      bank = Array.isArray(parsed?.questions) ? parsed.questions : []
    } catch {
      bank = []
    }
  }
  for (const q of bank) {
    if (!isQuestionPublished(q) || !isTaggedBankPyq(q)) continue
    if (!examMatches(q, exam)) continue
    if (q.subject && !namesMatchLoose(q.subject, sub)) continue
    if (q.chapter && !namesMatchLoose(q.chapter, ch)) continue
    const row = toPyqRow(q, 'bank')
    if (row) push({ ...row, _raw: q })
  }

  return out
    .map(({ _raw, ...row }) => row)
    .sort((a, b) => Number(b.pyqYear || 0) - Number(a.pyqYear || 0))
}

export function compactPyqsForAssist(rows, limit = 36) {
  return (rows ?? []).slice(0, limit).map((q) => ({
    id: q.id,
    year: q.pyqYear ?? null,
    paper: String(q.paperLabel || '').slice(0, 80),
    topic: String(q.topic || '').slice(0, 80),
    problem: String(q.problem || '').slice(0, 280),
    options: (q.options ?? []).slice(0, 4).map((o) => String(o).slice(0, 80)),
  }))
}

function pickPyqRepresentatives(rows, max = 40) {
  const groups = new Map()
  for (const row of rows ?? []) {
    const key = normKey(row.topic) || 'this-chapter'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const picked = []
  for (const group of groups.values()) {
    picked.push(...group.slice(0, 2))
    if (picked.length >= max) break
  }
  return picked.slice(0, max)
}

export function asStrategyItem(row) {
  if (!row || typeof row !== 'object') return null
  const typeName = asTrimmedText(row.typeName ?? row.name ?? row.title ?? row.familyName)
  const familyName = asTrimmedText(row.familyName ?? row.group ?? typeName)
  const problem = asTrimmedText(row.problem ?? row.example ?? row.stem ?? row.question)
  const options = (Array.isArray(row.options) ? row.options : Array.isArray(row.choices) ? row.choices : [])
    .map(asStep)
    .filter(Boolean)
  const steps = (Array.isArray(row.steps) ? row.steps : Array.isArray(row.strategy) ? row.strategy : [])
    .map(asStep)
    .filter(Boolean)
  const outline = asTrimmedText(row.outline ?? row.worked ?? row.solution ?? row.walkthrough)
  if (!typeName || (!problem && !steps.length && !outline)) return null
  const extra = row.source === 'extra' || row.notPyq === true || row.extra === true
  const source = extra ? 'extra' : 'pyq'
  return {
    typeName,
    familyName: familyName || typeName,
    problem: problem || typeName,
    options,
    steps: steps.length
      ? steps
      : ['Read the given values.', 'Use the method for this group.', 'Finish the working for this question.'],
    outline: outline || 'Finish the working for this question and state the answer.',
    source,
    questionId: asTrimmedText(row.questionId ?? row.id),
    pyqYear: row.pyqYear ?? row.year ?? null,
    paperLabel: asTrimmedText(row.paperLabel ?? row.paper),
  }
}

export function attachPyqProvenance(items, pyqs) {
  const list = pyqs ?? []
  const byId = new Map(list.map((q) => [String(q.id), q]))
  return (items ?? []).map((item) => {
    const hit =
      (item.questionId && byId.get(String(item.questionId))) ||
      list.find((q) => normKey(q.problem).slice(0, 72) === normKey(item.problem).slice(0, 72))
    if (hit) {
      return {
        ...item,
        source: 'pyq',
        questionId: hit.id,
        pyqYear: hit.pyqYear ?? item.pyqYear,
        paperLabel: hit.paperLabel || item.paperLabel,
        problem: item.problem?.length >= 40 ? item.problem : hit.problem,
        options: item.options?.length ? item.options : hit.options,
      }
    }
    if (item.source === 'pyq' && !hit) {
      return { ...item, source: 'extra', pyqYear: null, paperLabel: '', questionId: '' }
    }
    return { ...item, source: item.source === 'pyq' ? 'pyq' : 'extra' }
  })
}

export function groupStrategyItems(items) {
  const map = []
  const seen = new Map()
  for (const item of items ?? []) {
    const key = normKey(item.familyName || item.typeName) || 'questions'
    if (!seen.has(key)) {
      const group = { name: item.familyName || item.typeName || 'Questions', items: [] }
      seen.set(key, group)
      map.push(group)
    }
    seen.get(key).items.push(item)
  }
  return map
}

export function normalizeStrategyPack(raw, fallback = {}) {
  if (!raw || typeof raw !== 'object') return null
  const examId = asTrimmedText(raw.examId ?? fallback.examId)
  const subject = asTrimmedText(raw.subject ?? fallback.subject)
  const chapter = asTrimmedText(raw.chapter ?? fallback.chapter)
  if (!examId || !subject || !chapter) return null
  const itemSrc = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.problems)
      ? raw.problems
      : Array.isArray(raw.strategies)
        ? raw.strategies
        : []
  const items = itemSrc.map(asStrategyItem).filter(Boolean)
  return {
    examId,
    examLabel: asTrimmedText(raw.examLabel ?? fallback.examLabel) || findExamPattern(examId)?.name || examId,
    subject,
    subjectLabel: asTrimmedText(raw.subjectLabel ?? fallback.subjectLabel) || labelSubject(subject),
    section: asTrimmedText(raw.section ?? fallback.section),
    chapter,
    topics: Array.isArray(raw.topics)
      ? raw.topics.map((t) => asTrimmedText(t)).filter(Boolean)
      : fallback.topics ?? [],
    items,
    pyqCount: Number(raw.pyqCount ?? fallback.pyqCount ?? items.filter((it) => it.source === 'pyq').length) || 0,
    source: raw.source === 'ai' || fallback.source === 'ai' ? 'ai' : 'starter',
    watermark: true,
    generatedAt: asTrimmedText(raw.generatedAt) || new Date().toISOString(),
    improvedAt: asTrimmedText(raw.improvedAt),
    previous: raw.previous ?? null,
  }
}

export function buildStarterStrategyPack(pick) {
  const examId = asTrimmedText(pick?.examId)
  const subject = asTrimmedText(pick?.subject)
  const chapter = asTrimmedText(pick?.chapter)
  const found = findRevisionChapter(examId, subject, chapter)
  if (!found) return null
  const allowed = listRevisionSubjects(examId).some((s) => s.id === subject)
  if (!allowed) return null
  const pyqs = listChapterStrategyPyqs(examId, subject, chapter)
  const picked = pickPyqRepresentatives(pyqs)
  const items = picked.map((q) =>
    asStrategyItem({
      typeName: q.topic || `${chapter} PYQ`,
      familyName: q.topic || chapter,
      problem: q.problem,
      options: q.options,
      steps: q.solution
        ? [q.solution]
        : ['This is a PYQ from the bank.', 'Teacher can click Generate questions to add step-by-step working.'],
      outline: q.solution || 'Working will be filled when a teacher generates the pack.',
      source: 'pyq',
      questionId: q.id,
      pyqYear: q.pyqYear,
      paperLabel: q.paperLabel,
    }),
  )
  return normalizeStrategyPack({
    examId,
    examLabel: findExamPattern(examId)?.name || examId,
    subject,
    subjectLabel: labelSubject(subject),
    section: found.section,
    chapter,
    topics: found.topics ?? [],
    items,
    pyqCount: pyqs.length,
    source: 'starter',
    watermark: true,
    generatedAt: new Date().toISOString(),
  })
}

export function loadSavedStrategyPack(examId, subject, chapter) {
  const raw = loadStore()[strategyPackKey(examId, subject, chapter)]
  return normalizeStrategyPack(raw)
}

export function saveStrategyPack(pack, opts = {}) {
  const normalized = normalizeStrategyPack(pack)
  if (!normalized) return null
  const store = loadStore()
  const key = strategyPackKey(normalized.examId, normalized.subject, normalized.chapter)
  if (opts.keepPrevious) {
    const current = opts.keepPrevious === true ? store[key] : opts.keepPrevious
    if (current && typeof current === 'object') {
      normalized.previous = {
        items: current.items ?? [],
        source: current.source,
        generatedAt: current.generatedAt,
      }
    }
    normalized.improvedAt = new Date().toISOString()
  }
  store[key] = normalized
  saveStore(store)
  return normalized
}

export function getDisplayedStrategyPack(examId, subject, chapter) {
  return loadSavedStrategyPack(examId, subject, chapter) || buildStarterStrategyPack({ examId, subject, chapter })
}

export function parseAiStrategyPack(payload, starter, pyqs = []) {
  let src = payload
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const jsonText = fence ? fence[1] : trimmed
    try {
      src = JSON.parse(jsonText)
    } catch {
      src = { text: trimmed }
    }
  }
  if (src && typeof src === 'object' && src.parsed && typeof src.parsed === 'object') src = src.parsed
  const merged = {
    ...starter,
    ...(src && typeof src === 'object' ? src : {}),
    examId: starter.examId,
    examLabel: starter.examLabel,
    subject: starter.subject,
    subjectLabel: starter.subjectLabel,
    section: starter.section,
    chapter: starter.chapter,
    topics: starter.topics,
    source: 'ai',
    watermark: true,
  }
  if (src && typeof src === 'object' && !Array.isArray(src.items) && typeof src.text === 'string' && src.text.trim().startsWith('{')) {
    try {
      const inner = JSON.parse(src.text.trim())
      if (Array.isArray(inner.items)) merged.items = inner.items
      else if (Array.isArray(inner.problems)) merged.items = inner.problems
    } catch {
      /* keep starter */
    }
  }
  const normalized = normalizeStrategyPack(merged, starter)
  if (!normalized) return null
  normalized.items = attachPyqProvenance(normalized.items, pyqs)
  normalized.pyqCount = pyqs.length || normalized.items.filter((it) => it.source === 'pyq').length
  normalized.source = 'ai'
  return normalized
}

function strategyItemKey(item) {
  const problem = String(item?.problem || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (problem.length >= 20) return problem
  return `${String(item?.typeName || '').toLowerCase()}::${problem}`
}

export function mergeImprovedStrategyPack(current, incoming) {
  if (!incoming) return current || null
  if (!current) return incoming
  const byName = new Map()
  for (const item of [...(current.items ?? []), ...(incoming.items ?? [])]) {
    if (!item?.problem && !item?.typeName) continue
    const key = strategyItemKey(item)
    const prev = byName.get(key)
    const score = (row) =>
      (row.steps?.length ?? 0) + String(row.outline || '').length + String(row.problem || '').length
    if (!prev || score(item) > score(prev)) byName.set(key, item)
  }
  const items = [...byName.values()]
  return {
    ...incoming,
    ...current,
    items,
    pyqCount: items.filter((it) => it.source === 'pyq').length,
    source: 'ai',
    watermark: true,
    generatedAt: incoming.generatedAt || current.generatedAt,
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildWatermarkedStrategyHtml(pack) {
  const normalized = normalizeStrategyPack(pack)
  if (!normalized) return ''
  const tiles = Array.from({ length: 24 }, () => `<span>${escapeHtml(WATERMARK_BRAND)}</span>`).join('')
  const groups = groupStrategyItems(normalized.items)
  const cards = groups
    .map((group) => {
      const inner = group.items
        .map((item, i) => {
          const steps = item.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')
          const opts = (item.options ?? [])
            .map((o, k) => `<li>(${String.fromCharCode(65 + k)}) ${escapeHtml(o)}</li>`)
            .join('')
          const optBlock = opts ? `<ol>${opts}</ol>` : ''
          const badge = item.source === 'pyq' ? 'PYQ' : 'extra (no PYQ yet)'
          const meta = [item.pyqYear, item.paperLabel].filter(Boolean).join(' · ')
          return `<article><p><strong>${escapeHtml(badge)}</strong>${meta ? ` · ${escapeHtml(String(meta))}` : ''}</p><h3>${i + 1}. ${escapeHtml(item.typeName)}</h3><p><strong>Question.</strong> ${escapeHtml(item.problem)}</p>${optBlock}<h4>How to solve this question</h4><ol>${steps}</ol><p><strong>Working.</strong> ${escapeHtml(item.outline)}</p></article>`
        })
        .join('')
      return `<section><h3>${escapeHtml(group.name)}</h3>${inner}</section>`
    })
    .join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(normalized.chapter)} - Problem solving strategy - ${escapeHtml(WATERMARK_BRAND)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; color: #0f172a; line-height: 1.55; }
    .wm-layer { position: fixed; inset: -15%; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 4rem 6rem; pointer-events: none; z-index: 0; opacity: 0.10; }
    .wm-layer span { font-size: 1.05rem; font-weight: 800; color: #4338ca; transform: rotate(-28deg); white-space: nowrap; }
    .content { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; padding: 2rem; background: rgba(255,255,255,0.94); }
    .banner { border: 2px solid #6366f1; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.25rem; background: #eef2ff; }
    article { margin: 1.2rem 0; padding-bottom: 0.8rem; border-bottom: 1px dashed #cbd5e1; page-break-inside: avoid; }
  </style>
</head>
<body>
  <div class="wm-layer" aria-hidden="true">${tiles}</div>
  <div class="content">
    <div class="banner"><strong>${escapeHtml(WATERMARK_BRAND)}</strong> - ${escapeHtml(WATERMARK_NOTICE)}</div>
    <h1>Problem solving strategy</h1>
    <p>Concept to Solve Problems · ${escapeHtml(normalized.examLabel)} · ${escapeHtml(normalized.subjectLabel)} · ${escapeHtml(normalized.chapter)}</p>
    <p>Questions grouped by how you solve them. PYQ first.</p>
    <h2>Questions</h2>
    ${cards || '<p>No PYQ in the bank for this chapter yet.</p>'}
    <footer>Downloaded from ${escapeHtml(WATERMARK_BRAND)} · ${escapeHtml(WATERMARK_URL)}</footer>
  </div>
</body>
</html>`
}

export function strategyPrintFileName(pack) {
  const slug = [pack?.examId, pack?.subject, pack?.chapter]
    .map((s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
    .join('-')
    .slice(0, 72)
  return `testvantage-problem-strategy-${slug || 'pack'}.html`
}
