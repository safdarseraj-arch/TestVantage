/**
 * Quick Revision — chapter sheets (definitions, formulas, important points).
 * Own localStorage key only. Never reads or writes the question bank.
 */

import { findExamPattern, getAllExamPatterns } from './customBankMeta.js'
import { getChapterOptions, getSectionOptions, getTopicOptions } from './curriculumOptions.js'
import { getSubjectOptionsForPicker } from './questionMetadata.js'
import { buildStarterPack } from '../data/quickRevisionStarters.js'
import { WATERMARK_BRAND, WATERMARK_NOTICE, WATERMARK_URL } from './watermark.js'

/** Sent to Gemini for a full chapter sheet. */
export const QUICK_REVISION_AI_INSTRUCTION = [
  'Return JSON only with MAXIMUM exam-useful coverage for this one chapter. Do not write a short summary sheet.',
  'Required keys: definitions, formulas, extraFormulas, points. extraFormulas must be a separate non-empty array.',
  'definitions: 14-20 items. Each meaning MUST be 2-4 full sentences: what it is, symbols/units, exam conditions, and one common mix-up. No one-line stubs.',
  'formulas: 12-20 STANDARD textbook formulas {name, latex, note} with KaTeX (no dollar signs) and when to use them.',
  'extraFormulas: REQUIRED 8-16 NON-STANDARD / less-common formulas {name, latex, note} — tricks, special cases, limits, JEE Advanced extras, NEET exceptions. Never leave this array empty. Do not repeat the standard list.',
  'points: 8-14 important points and pitfalls for this exam (sign errors, units, standard vs non-standard cases).',
  'Match the exam filter (JEE Main, JEE Advanced, or NEET). Everyday English. No invented ranks or cut-offs.',
].join(' ')

/** Staff one-click improve: keep what is already good, add missing exam-useful items. */
export const QUICK_REVISION_IMPROVE_INSTRUCTION = [
  'IMPROVE the given currentSheet. Keep every useful existing item. Add missing exam-useful coverage.',
  'Return JSON only with keys: definitions, formulas, extraFormulas, points.',
  'definitions: keep existing terms; lengthen short meanings to 2-4 sentences; add missing terms to reach 14-20.',
  'formulas: keep existing STANDARD formulas; add missing textbook formulas to reach 12-20. KaTeX, no dollar signs.',
  'extraFormulas: keep existing extras; add missing tricks / special cases / JEE Advanced extras / NEET exceptions to reach 8-16. Do not duplicate formulas.',
  'points: keep existing pitfalls; add missing ones to reach 8-14.',
  'Do not drop items that are already correct. Everyday English. No invented ranks or cut-offs.',
].join(' ')


export const QUICK_REVISION_STORE_KEY = 'testvantage-quick-revision-sheets'
export const QUESTION_BANK_STORE_KEY = 'testvantage-uploaded-questions'
export const FORMULA_POCKET_KEY = 'testvantage-formula-pocket'

export function revisionSheetKey(examId, subject, chapter) {
  return `${String(examId || '').trim()}::${String(subject || '').trim()}::${String(chapter || '').trim()}`
}

/** Same exam list as Question Bank metatags (built-in + custom). */
export function listRevisionExams() {
  return getAllExamPatterns().map((p) => ({ id: p.id, label: p.name }))
}

export const REVISION_EXAMS = listRevisionExams()

/** Same subject dropdown as Question Bank metatags for that exam. */
export function listRevisionSubjects(examId) {
  const id = String(examId || '').trim()
  if (!id || !findExamPattern(id)) return []
  return getSubjectOptionsForPicker([id])
}

/**
 * Same unit → chapter lists as Question Bank metatags (curriculumOptions).
 * Order is unit then chapter — not a second A–Z dump of every chapter.
 * @param {string} examId
 * @param {string} subject
 */
export function listRevisionChapters(examId, subject) {
  const exam = String(examId || '').trim()
  const subj = String(subject || '').trim()
  if (!exam || !subj) return []
  const allowed = new Set(listRevisionSubjects(exam).map((s) => s.id))
  if (!allowed.has(subj)) return []
  const rows = []
  for (const section of getSectionOptions(subj)) {
    for (const chapter of getChapterOptions(subj, section)) {
      rows.push({
        section,
        chapter,
        topics: getTopicOptions(subj, section, chapter),
      })
    }
  }
  return rows
}

/** @param {string} examId @param {string} subject @param {string} chapter */
export function findRevisionChapter(examId, subject, chapter) {
  return listRevisionChapters(examId, subject).find((row) => row.chapter === chapter) ?? null
}

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
    const raw = storageGet(QUICK_REVISION_STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function saveStore(data) {
  storageSet(QUICK_REVISION_STORE_KEY, JSON.stringify(data))
}

export function asTrimmedText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function asDefinition(row) {
  if (!row) return null
  if (typeof row === 'string') {
    const text = asTrimmedText(row)
    if (!text) return null
    const idx = text.search(/[:]/)
    if (idx > 0) {
      return { term: asTrimmedText(text.slice(0, idx)), meaning: asTrimmedText(text.slice(idx + 1)) }
    }
    return { term: text, meaning: text }
  }
  if (typeof row !== 'object') return null
  const term = asTrimmedText(row.term ?? row.name ?? row.title)
  const meaning = asTrimmedText(row.meaning ?? row.definition ?? row.text ?? row.desc)
  if (!term || !meaning) return null
  return { term, meaning }
}

function asFormula(row) {
  if (!row) return null
  if (typeof row === 'string') {
    const text = asTrimmedText(row)
    if (!text) return null
    return { name: text, latex: text, note: '' }
  }
  if (typeof row !== 'object') return null
  const name = asTrimmedText(row.name ?? row.title ?? row.term)
  const latex = asTrimmedText(row.latex ?? row.formula ?? row.math ?? row.eq)
  const note = asTrimmedText(row.note ?? row.when ?? row.hint)
  if (!name && !latex) return null
  return { name: name || 'Formula', latex: latex || name, note }
}

function asPoint(row) {
  if (typeof row === 'string') return asTrimmedText(row)
  if (row && typeof row === 'object') return asTrimmedText(row.text ?? row.point ?? row.note)
  return ''
}

const EXTRA_FORMULA_HINT = /trick|special case|non-standard|less-common|advanced extra|rarely used|exceptional|not in ncert|jee advanced extra/i

/**
 * If Gemini dumped extras into the standard list, split them so the sheet still has two formula sections.
 * @param {ReturnType<typeof asFormula>[]} formulas
 * @param {ReturnType<typeof asFormula>[]} extraFormulas
 */
export function splitExtraFormulas(formulas, extraFormulas) {
  const extra = (extraFormulas ?? []).filter(Boolean)
  const standard = (formulas ?? []).filter(Boolean)
  if (extra.length) return { formulas: standard, extraFormulas: extra }

  const tagged = []
  const rest = []
  for (const f of standard) {
    const blob = `${f.name} ${f.note || ''} ${f.kind || ''}`
    if (EXTRA_FORMULA_HINT.test(blob)) tagged.push(f)
    else rest.push(f)
  }
  if (tagged.length >= 3) return { formulas: rest, extraFormulas: tagged }
  if (standard.length > 14) {
    return { formulas: standard.slice(0, 12), extraFormulas: standard.slice(12) }
  }
  return { formulas: standard, extraFormulas: extra }
}

function labelSubject(subject) {
  const row = getSubjectOptionsForPicker([]).find((s) => s.id === subject)
  if (row) return row.label
  const s = String(subject || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * @param {unknown} raw
 * @param {object} [fallback]
 */
export function normalizeRevisionSheet(raw, fallback = {}) {
  if (!raw || typeof raw !== 'object') return null
  const src = raw
  const examId = asTrimmedText(src.examId ?? fallback.examId)
  const subject = asTrimmedText(src.subject ?? fallback.subject)
  const chapter = asTrimmedText(src.chapter ?? fallback.chapter)
  if (!examId || !subject || !chapter) return null

  const examLabel =
    asTrimmedText(src.examLabel ?? fallback.examLabel) || findExamPattern(examId)?.name || examId
  const subjectLabel = asTrimmedText(src.subjectLabel ?? fallback.subjectLabel) || labelSubject(subject)
  const section = asTrimmedText(src.section ?? fallback.section)
  const topics = Array.isArray(src.topics)
    ? src.topics.map((t) => asTrimmedText(t)).filter(Boolean)
    : Array.isArray(fallback.topics)
      ? fallback.topics
      : []

  const definitions = (Array.isArray(src.definitions) ? src.definitions : []).map(asDefinition).filter(Boolean)
  const formulas = (Array.isArray(src.formulas) ? src.formulas : []).map(asFormula).filter(Boolean)
  const extraSrc = Array.isArray(src.extraFormulas)
    ? src.extraFormulas
    : Array.isArray(src.nonStandardFormulas)
      ? src.nonStandardFormulas
      : Array.isArray(src.nonstandardFormulas)
        ? src.nonstandardFormulas
        : Array.isArray(fallback.extraFormulas)
          ? fallback.extraFormulas
          : []
  const extraFormulasRaw = extraSrc.map(asFormula).filter(Boolean)
  const split = splitExtraFormulas(formulas, extraFormulasRaw)
  const extraFormulas = split.extraFormulas
  const standardFormulas = split.formulas
  const pointSrc = Array.isArray(src.points)
    ? src.points
    : Array.isArray(src.importantPoints)
      ? src.importantPoints
      : []
  const points = pointSrc.map(asPoint).filter(Boolean)

  if (!definitions.length && !formulas.length && !extraFormulas.length && !points.length) return null

  const source = src.source === 'ai' || fallback.source === 'ai' ? 'ai' : 'starter'

  return {
    examId,
    examLabel,
    subject,
    subjectLabel,
    section,
    chapter,
    topics,
    definitions,
    formulas: standardFormulas,
    extraFormulas,
    points,
    source,
    watermark: true,
    generatedAt: asTrimmedText(src.generatedAt) || new Date().toISOString(),
  }
}

export function revisionSheetHasWatermark(sheet) {
  return Boolean(sheet && sheet.watermark === true)
}

export function isRevisionSheetShape(sheet) {
  if (!sheet || typeof sheet !== 'object') return false
  return (
    typeof sheet.examId === 'string' &&
    typeof sheet.subject === 'string' &&
    typeof sheet.chapter === 'string' &&
    Array.isArray(sheet.definitions) &&
    Array.isArray(sheet.formulas) &&
    Array.isArray(sheet.extraFormulas) &&
    Array.isArray(sheet.points) &&
    revisionSheetHasWatermark(sheet)
  )
}

/**
 * Built-in starter for a chapter. Always includes watermark: true.
 * @param {{ examId: string, subject: string, chapter: string }} pick
 */
export function buildStarterRevisionSheet(pick) {
  const examId = asTrimmedText(pick?.examId)
  const subject = asTrimmedText(pick?.subject)
  const chapter = asTrimmedText(pick?.chapter)
  const found = findRevisionChapter(examId, subject, chapter)
  if (!found) return null
  const pack = buildStarterPack(subject, chapter, found.topics, examId)
  return normalizeRevisionSheet({
    examId,
    examLabel: findExamPattern(examId)?.name || examId,
    subject,
    subjectLabel: labelSubject(subject),
    section: found.section,
    chapter,
    topics: found.topics,
    definitions: pack.definitions,
    formulas: pack.formulas,
    extraFormulas: pack.extraFormulas ?? [],
    points: pack.points,
    source: 'starter',
    watermark: true,
    generatedAt: new Date().toISOString(),
  })
}

function snapshotRevisionLists(sheet) {
  if (!sheet || typeof sheet !== 'object') return null
  return {
    definitions: Array.isArray(sheet.definitions) ? sheet.definitions : [],
    formulas: Array.isArray(sheet.formulas) ? sheet.formulas : [],
    extraFormulas: Array.isArray(sheet.extraFormulas) ? sheet.extraFormulas : [],
    points: Array.isArray(sheet.points) ? sheet.points : [],
    source: sheet.source,
    generatedAt: sheet.generatedAt,
    improvedAt: sheet.improvedAt,
  }
}

export function loadSavedRevisionSheet(examId, subject, chapter) {
  const key = revisionSheetKey(examId, subject, chapter)
  const raw = loadStore()[key]
  const normalized = normalizeRevisionSheet(raw)
  if (!normalized || !raw || typeof raw !== 'object') return normalized
  if (raw.previous) normalized.previous = raw.previous
  if (raw.improvedAt) normalized.improvedAt = String(raw.improvedAt)
  return normalized
}

export function saveRevisionSheet(sheet, opts = {}) {
  const normalized = normalizeRevisionSheet(sheet)
  if (!normalized) return null
  const store = loadStore()
  const key = revisionSheetKey(normalized.examId, normalized.subject, normalized.chapter)
  if (opts.keepPrevious) {
    const current = opts.keepPrevious === true ? store[key] : opts.keepPrevious
    const snap = snapshotRevisionLists(current)
    if (snap) normalized.previous = snap
    normalized.improvedAt = new Date().toISOString()
  }
  store[key] = normalized
  saveStore(store)
  return normalized
}

/** Union current + incoming lists so an improve pass never drops good items. */
export function mergeImprovedSheet(current, incoming) {
  if (!incoming) return current || null
  if (!current) return incoming
  const defs = new Map()
  for (const d of [...(current.definitions ?? []), ...(incoming.definitions ?? [])]) {
    if (!d?.term) continue
    const key = String(d.term).toLowerCase()
    const prev = defs.get(key)
    if (!prev || String(d.meaning || '').length > String(prev.meaning || '').length) defs.set(key, d)
  }
  const formulaKey = (f) => `${String(f?.name || '').toLowerCase()}|${String(f?.latex || '')}`
  const formulas = new Map()
  for (const f of [...(current.formulas ?? []), ...(incoming.formulas ?? [])]) {
    if (!f) continue
    const key = formulaKey(f)
    if (!formulas.has(key)) formulas.set(key, f)
  }
  const extras = new Map()
  for (const f of [...(current.extraFormulas ?? []), ...(incoming.extraFormulas ?? [])]) {
    if (!f) continue
    const key = formulaKey(f)
    if (!extras.has(key) && !formulas.has(key)) extras.set(key, f)
  }
  const points = []
  const seen = new Set()
  for (const p of [...(current.points ?? []), ...(incoming.points ?? [])]) {
    const t = String(p || '').trim()
    const key = t.toLowerCase()
    if (!t || seen.has(key)) continue
    seen.add(key)
    points.push(t)
  }
  return {
    ...incoming,
    ...current,
    definitions: [...defs.values()],
    formulas: [...formulas.values()],
    extraFormulas: [...extras.values()],
    points,
    source: 'ai',
    watermark: true,
    generatedAt: incoming.generatedAt || current.generatedAt,
  }
}

export function getDisplayedRevisionSheet(examId, subject, chapter) {
  return (
    loadSavedRevisionSheet(examId, subject, chapter) ||
    buildStarterRevisionSheet({ examId, subject, chapter })
  )
}

/**
 * Parse Gemini / cloud assist JSON into a sheet. Merges with starter if partial.
 * @param {unknown} payload
 * @param {object} starter
 */
export function parseAiRevisionSheet(payload, starter) {
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
  if (src && typeof src === 'object' && src.parsed && typeof src.parsed === 'object') {
    src = src.parsed
  }
  let aiExtraFormulas
  if (src && typeof src === 'object') {
    if (Array.isArray(src.extraFormulas)) aiExtraFormulas = src.extraFormulas
    else if (Array.isArray(src.nonStandardFormulas)) aiExtraFormulas = src.nonStandardFormulas
  }
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
  if (src && typeof src === 'object' && !Array.isArray(src.definitions) && typeof src.text === 'string') {
    const text = src.text.trim()
    if (text.startsWith('{')) {
      try {
        const inner = JSON.parse(text)
        if (Array.isArray(inner.definitions)) merged.definitions = inner.definitions
        if (Array.isArray(inner.formulas)) merged.formulas = inner.formulas
        if (Array.isArray(inner.extraFormulas)) aiExtraFormulas = inner.extraFormulas
        if (Array.isArray(inner.nonStandardFormulas)) aiExtraFormulas = inner.nonStandardFormulas
        if (Array.isArray(inner.points)) merged.points = inner.points
      } catch {
        /* keep starter lists */
      }
    }
  }
  merged.extraFormulas = Array.isArray(aiExtraFormulas) && aiExtraFormulas.length ? aiExtraFormulas : []
  const normalized = normalizeRevisionSheet(merged, starter)
  if (!normalized) return null
  if (!normalized.definitions.length) normalized.definitions = starter.definitions
  if (!normalized.formulas.length) normalized.formulas = starter.formulas
  if (!normalized.extraFormulas.length && Array.isArray(starter.extraFormulas)) {
    normalized.extraFormulas = starter.extraFormulas
  }
  if (!normalized.points.length) normalized.points = starter.points
  normalized.source = 'ai'
  normalized.watermark = true
  return normalized
}

export function canRegenerateRevisionSheet(session) {
  const role = session?.role
  return role === 'admin' || role === 'teacher'
}

/** Same staff check as Question Bank / teacher home: admin or teacher only. */
export function canImproveRevisionSheet(session) {
  return canRegenerateRevisionSheet(session)
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Print-to-PDF HTML with a light repeating TestVantages name watermark.
 * @param {object} sheet
 */
export function buildWatermarkedRevisionHtml(sheet) {
  const normalized = normalizeRevisionSheet(sheet)
  if (!normalized) return ''
  const tiles = Array.from({ length: 24 }, () => `<span>${escapeHtml(WATERMARK_BRAND)}</span>`).join('')
  const defs = normalized.definitions
    .map((d) => `<li><strong>${escapeHtml(d.term)}</strong> - ${escapeHtml(d.meaning)}</li>`)
    .join('')
  const formulaItems = (list) =>
    list
      .map((f) => {
        const note = f.note ? `<div class="note">${escapeHtml(f.note)}</div>` : ''
        return `<li><strong>${escapeHtml(f.name)}</strong><div class="tex">${escapeHtml(f.latex)}</div>${note}</li>`
      })
      .join('')
  const formulas = formulaItems(normalized.formulas)
  const extraFormulas = formulaItems(normalized.extraFormulas ?? [])
  const extraBlock = extraFormulas
    ? `<h2>Extra / non-standard formulas</h2><ul>${extraFormulas}</ul>`
    : ''
  const points = normalized.points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(normalized.chapter)} - Quick Revision - ${escapeHtml(WATERMARK_BRAND)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; color: #0f172a; line-height: 1.55; }
    .wm-layer {
      position: fixed; inset: -15%; display: flex; flex-wrap: wrap;
      align-content: center; justify-content: center; gap: 4rem 6rem;
      pointer-events: none; z-index: 0; opacity: 0.10;
    }
    .wm-layer span {
      font-size: 1.05rem; font-weight: 800; color: #4338ca;
      transform: rotate(-28deg); white-space: nowrap;
    }
    .content { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; padding: 2rem 2rem 3rem; background: rgba(255,255,255,0.94); }
    h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
    .sub { color: #475569; margin: 0 0 1rem; }
    .banner { border: 2px solid #6366f1; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.25rem; background: #eef2ff; }
    h2 { font-size: 1.15rem; margin: 1.4rem 0 0.5rem; color: #1e3a8a; }
    ul { margin: 0; padding-left: 1.2rem; }
    li { margin: 0.4rem 0; page-break-inside: avoid; }
    .tex { font-family: Consolas, "Courier New", monospace; background: #f8fafc; padding: 0.35rem 0.5rem; border-radius: 6px; margin-top: 0.25rem; }
    .note { color: #64748b; font-size: 0.9rem; }
    footer { margin-top: 1.75rem; padding-top: 0.75rem; border-top: 1px dashed #94a3b8; font-size: 0.8rem; color: #64748b; text-align: center; }
    @media print {
      .wm-layer { opacity: 0.12; }
      .no-print { display: none; }
      .content { background: white; }
    }
  </style>
</head>
<body>
  <div class="wm-layer" aria-hidden="true">${tiles}</div>
  <div class="content">
    <div class="banner">
      <strong>${escapeHtml(WATERMARK_BRAND)}</strong> - ${escapeHtml(WATERMARK_NOTICE)}
    </div>
    <h1>${escapeHtml(normalized.chapter)}</h1>
    <p class="sub">${escapeHtml(normalized.examLabel)} · ${escapeHtml(normalized.subjectLabel)}${normalized.section ? ` · ${escapeHtml(normalized.section)}` : ''}</p>
    <p class="no-print">Use Print, then Save as PDF so the TestVantages name stays on every page.</p>
    <h2>Definitions</h2>
    <ul>${defs}</ul>
    <h2>Standard formulas</h2>
    <ul>${formulas}</ul>
    ${extraBlock}
    <h2>Important points</h2>
    <ul>${points}</ul>
    <footer>Downloaded from ${escapeHtml(WATERMARK_BRAND)} · ${escapeHtml(WATERMARK_URL)} · ${escapeHtml(new Date().toLocaleString())}</footer>
  </div>
</body>
</html>`
}

export function revisionPrintFileName(sheet) {
  const slug = [sheet?.examId, sheet?.subject, sheet?.chapter]
    .map((s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
    .join('-')
    .slice(0, 72)
  return `testvantage-quick-revision-${slug || 'sheet'}.html`
}

function emptyPocketStore() {
  return { byOwner: {} }
}

function loadPocketStore() {
  try {
    const raw = localStorage.getItem(FORMULA_POCKET_KEY)
    if (!raw) return emptyPocketStore()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyPocketStore()
    return { byOwner: parsed.byOwner && typeof parsed.byOwner === 'object' ? parsed.byOwner : {} }
  } catch {
    return emptyPocketStore()
  }
}

function savePocketStore(store) {
  localStorage.setItem(FORMULA_POCKET_KEY, JSON.stringify(store))
}

export function loadFormulaPins(ownerKey) {
  const key = String(ownerKey || 'guest')
  const list = loadPocketStore().byOwner[key]
  return Array.isArray(list) ? list : []
}

export function formulaPinId(row) {
  return [row.examId, row.chapter, row.name, row.latex]
    .map((p) => String(p || '').trim().toLowerCase())
    .join('|')
}

export function isFormulaPinned(ownerKey, row) {
  const id = formulaPinId(row)
  return loadFormulaPins(ownerKey).some((p) => p.id === id)
}

export function toggleFormulaPin(ownerKey, row) {
  const store = loadPocketStore()
  const key = String(ownerKey || 'guest')
  const current = Array.isArray(store.byOwner[key]) ? [...store.byOwner[key]] : []
  const id = formulaPinId(row)
  const idx = current.findIndex((p) => p.id === id)
  if (idx >= 0) current.splice(idx, 1)
  else {
    current.unshift({
      id,
      examId: String(row.examId || ''),
      examLabel: String(row.examLabel || ''),
      subject: String(row.subject || ''),
      subjectLabel: String(row.subjectLabel || ''),
      chapter: String(row.chapter || ''),
      name: String(row.name || 'Formula'),
      latex: String(row.latex || ''),
      note: String(row.note || ''),
      extra: Boolean(row.extra),
      pinnedAt: Date.now(),
    })
  }
  store.byOwner[key] = current.slice(0, 80)
  savePocketStore(store)
  return current
}

export function removeFormulaPin(ownerKey, pinId) {
  const store = loadPocketStore()
  const key = String(ownerKey || 'guest')
  const current = Array.isArray(store.byOwner[key]) ? store.byOwner[key] : []
  store.byOwner[key] = current.filter((p) => p.id !== pinId)
  savePocketStore(store)
  return store.byOwner[key]
}

export function buildFormulaPocketHtml(pins) {
  const tiles = Array.from({ length: 24 }, () => `<span>${escapeHtml(WATERMARK_BRAND)}</span>`).join('')
  const groups = new Map()
  for (const pin of pins) {
    const heading = `${pin.examLabel || pin.examId} · ${pin.chapter}`
    if (!groups.has(heading)) groups.set(heading, [])
    groups.get(heading).push(pin)
  }
  const blocks = [...groups.entries()]
    .map(([heading, items]) => {
      const lis = items
        .map((f) => {
          const note = f.note ? `<div class="note">${escapeHtml(f.note)}</div>` : ''
          return `<li><strong>${escapeHtml(f.name)}</strong><div class="tex">${escapeHtml(f.latex)}</div>${note}</li>`
        })
        .join('')
      return `<h2>${escapeHtml(heading)}</h2><ul>${lis}</ul>`
    })
    .join('')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>My Formula Sheet - ${escapeHtml(WATERMARK_BRAND)}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; color: #0f172a; line-height: 1.55; }
    .wm-layer { position: fixed; inset: -15%; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 4rem 6rem; pointer-events: none; z-index: 0; opacity: 0.10; }
    .wm-layer span { font-size: 1.05rem; font-weight: 800; color: #0f766e; transform: rotate(-28deg); white-space: nowrap; }
    .content { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; padding: 2rem; background: rgba(255,255,255,0.94); }
    .banner { border: 2px solid #0f766e; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.25rem; background: #f0fdfa; }
    h2 { font-size: 1.1rem; margin: 1.4rem 0 0.5rem; color: #115e59; }
    .tex { font-family: Consolas, monospace; background: #f8fafc; padding: 0.35rem 0.5rem; border-radius: 6px; margin-top: 0.25rem; }
    .note { color: #64748b; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="wm-layer" aria-hidden="true">${tiles}</div>
  <div class="content">
    <div class="banner"><strong>${escapeHtml(WATERMARK_BRAND)}</strong> - ${escapeHtml(WATERMARK_NOTICE)}</div>
    <h1>My Formula Sheet</h1>
    <p>Pinned from Quick Revision. ${pins.length} formula${pins.length === 1 ? '' : 's'}.</p>
    ${blocks || '<p>No formulas pinned yet.</p>'}
  </div>
</body>
</html>`
}
