import { applyDownloadWatermark, stripCsvWatermarkLines } from './watermark.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'

/** @typedef {import('../data/tests').Question} Question */

function escapeCsvCell(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      cells.push(cur.trim())
      cur = ''
    } else cur += c
  }
  cells.push(cur.trim())
  return cells
}

/**
 * @param {Question[]} questions
 * @returns {string}
 */
export function questionsToCsv(questions) {
  const headers = [
    'id',
    'subject',
    'questionType',
    'text',
    'optionA',
    'optionB',
    'optionC',
    'optionD',
    'optionE',
    'optionF',
    'correctIndex',
    'correctIndices',
    'correctInteger',
    'correctNumerical',
    'numericalTolerance',
    'section',
    'chapter',
    'topic',
    'toughnessLevel',
    'source',
    'examIds',
    'passageText',
    'solution',
  ]
  const rows = questions.map((q) => [
    q.id,
    q.subject,
    q.questionType ?? 'single_correct',
    q.text,
    q.options?.[0] ?? '',
    q.options?.[1] ?? '',
    q.options?.[2] ?? '',
    q.options?.[3] ?? '',
    q.options?.[4] ?? '',
    q.options?.[5] ?? '',
    q.correctIndex ?? '',
    (q.correctIndices ?? []).join('|'),
    q.correctInteger ?? '',
    q.correctNumerical ?? '',
    q.numericalTolerance ?? '',
    q.section ?? '',
    q.chapter ?? '',
    q.topic ?? '',
    q.toughnessLevel ?? '',
    q.source ?? '',
    (q.examIds ?? []).join('|'),
    q.passageText ?? '',
    q.solution ?? '',
  ])
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

/** @param {string} csvText */
export function csvToQuestions(csvText) {
  const lines = stripCsvWatermarkLines(csvText).trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, ''))
  const col = (name) => headers.indexOf(name)

  const questions = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    if (cells.every((c) => !c)) continue

    const get = (name) => cells[col(name)] ?? ''

    const options = [
      get('optiona'),
      get('optionb'),
      get('optionc'),
      get('optiond'),
      get('optione'),
      get('optionf'),
    ].filter(Boolean)

    const correctIndicesRaw = get('correctindices')
    let correctIndices = []
    if (correctIndicesRaw) {
      correctIndices = correctIndicesRaw
        .split(/[|,]/)
        .map((s) => {
          const t = s.trim().toUpperCase()
          if (t >= 'A' && t <= 'F') return t.charCodeAt(0) - 65
          return parseInt(t, 10)
        })
        .filter((n) => !Number.isNaN(n) && n >= 0)
    }

    const correctIndexRaw = get('correctindex')
    let correctIndex = correctIndexRaw !== '' ? parseInt(correctIndexRaw, 10) : 0
    if (Number.isNaN(correctIndex) && correctIndexRaw) {
      const letter = correctIndexRaw.trim().toUpperCase()
      if (letter >= 'A' && letter <= 'F') correctIndex = letter.charCodeAt(0) - 65
    }

    const questionType = get('questiontype') || 'single_correct'

    const examIdsRaw = get('examids')
    let examIds = []
    if (examIdsRaw) {
      examIds = examIdsRaw
        .split(/[|,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    /** @type {Question} */
    const q = {
      id: get('id') || `csv-${Date.now()}-${i}`,
      subject: get('subject') || 'physics',
      questionType,
      text: get('text'),
      section: get('section') || undefined,
      chapter: get('chapter') || undefined,
      topic: get('topic') || undefined,
      toughnessLevel: (() => {
        const raw = get('toughnesslevel')
        if (raw === '') return undefined
        const n = Number(raw)
        return n >= 1 && n <= 10 ? n : undefined
      })(),
      source: get('source')?.trim() || undefined,
      examIds: examIds.length ? examIds : undefined,
      passageText: get('passagetext') || undefined,
      solution: get('solution') || undefined,
    }

    if (options.length) q.options = options
    if (questionType === 'multiple_correct') {
      q.correctIndices = correctIndices.length ? correctIndices : [0]
    } else if (questionType === 'integer') {
      q.correctInteger = parseInt(get('correctinteger'), 10)
    } else if (questionType === 'numerical') {
      q.correctNumerical = parseFloat(get('correctnumerical'))
      const tol = parseFloat(get('numericaltolerance'))
      if (!Number.isNaN(tol)) q.numericalTolerance = tol
    } else if (options.length) {
      q.correctIndex = correctIndex
    }

    if (q.text.trim()) questions.push(q)
  }

  return applyUploadQualityGuards(questions, '')
}

/**
 * @param {string} filename
 * @param {string} content
 * @param {string} [mime]
 * @param {{ skipWatermark?: boolean, label?: string }} [opts]
 */
export function downloadTextFile(filename, content, mime = 'text/plain', opts = {}) {
  const body = opts.skipWatermark
    ? content
    : applyDownloadWatermark(content, mime, opts.label ?? filename)
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** @param {Question[]} questions */
export function downloadQuestionsCsv(questions) {
  const csv = questionsToCsv(questions)
  downloadTextFile(
    `testvantage-questions-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    'text/csv',
    { label: 'Question bank export' },
  )
}

/** @param {Question[]} questions */
export function downloadQuestionsJson(questions) {
  const json = JSON.stringify({ questions }, null, 2)
  downloadTextFile(
    `testvantage-questions-${new Date().toISOString().slice(0, 10)}.json`,
    json,
    'application/json',
    { label: 'Question bank export' },
  )
}

/** Full localStorage backup shape: settings + questions (for port merge / restore). */
export function downloadFullBankBackup(bank) {
  const json = JSON.stringify(bank, null, 2)
  downloadTextFile(
    `testvantage-bank-backup-${new Date().toISOString().slice(0, 10)}.json`,
    json,
    'application/json',
    { label: 'Full question bank backup' },
  )
}
