import { normalizeJsonQuestion } from './jsonImport.js'
import { stripCsvWatermarkLines } from './watermark.js'

/**
 * @param {Record<string, unknown>} item
 * @param {number} index
 */
export function normalizePyqItem(item, index) {
  const base = normalizeJsonQuestion(item, index)

  const year = Number(item.pyqYear ?? item.year ?? item.examYear)
  const examPatternId = String(item.examPatternId ?? item.exam ?? 'jee-main')
  const paperId = String(
    item.paperId ?? `${year}-${item.paper ?? item.shift ?? 'session-1'}`,
  )
  const pyqDate = item.pyqDate ? String(item.pyqDate) : item.examDate ? String(item.examDate) : ''
  const pyqShiftRaw = item.pyqShift ?? item.shift
  const pyqShift =
    pyqShiftRaw != null && pyqShiftRaw !== '' ? Number(pyqShiftRaw) : undefined
  const pyqSession = item.pyqSession ? String(item.pyqSession) : item.session ? String(item.session) : ''

  let paperLabel = String(item.paperLabel ?? item.paperName ?? '')
  if (!paperLabel && pyqDate && pyqShift) {
    const d = new Date(pyqDate + 'T12:00:00')
    const dateLabel = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    paperLabel = `${dateLabel} · Shift ${pyqShift}`
  }
  if (!paperLabel) paperLabel = `${year} Session`

  if (!base.text.trim()) return null
  if (!year || Number.isNaN(year)) {
    throw new Error(`Question ${index + 1}: pyqYear (or year) is required`)
  }

  return {
    ...base,
    id: String(item.id ?? `pyq-imp-${Date.now()}-${index}`),
    pyqYear: year,
    examPatternId,
    paperId,
    paperLabel,
    pyqDate: pyqDate || undefined,
    pyqShift: pyqShift != null && !Number.isNaN(pyqShift) ? pyqShift : undefined,
    pyqSession: pyqSession || undefined,
    chapter: String(item.chapter ?? 'General'),
    pyqSlot: item.pyqSlot != null ? Number(item.pyqSlot) : index + 1,
    imported: true,
  }
}

/**
 * @param {string} jsonStr
 */
export function parsePyqJson(jsonStr) {
  const data = JSON.parse(jsonStr)
  const arr = Array.isArray(data) ? data : data.questions
  if (!Array.isArray(arr)) throw new Error('JSON must be { "questions": [...] } or an array')
  const out = []
  arr.forEach((item, i) => {
    const q = normalizePyqItem(item, i)
    if (q) out.push(q)
  })
  return out
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
 * @param {string} csvText
 */
export function parsePyqCsv(csvText) {
  const lines = stripCsvWatermarkLines(csvText).trim().split('\n')
  if (lines.length < 2) throw new Error('CSV needs header + at least one row')

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, ''))
  const col = (name) => headers.indexOf(name)

  const out = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseCsvLine(lines[i])
    const get = (name) => cells[col(name)] ?? ''

    const item = {
      pyqYear: get('pyqyear') || get('year'),
      examPatternId: get('exampatternid') || get('exam'),
      paperId: get('paperid'),
      paperLabel: get('paperlabel'),
      pyqDate: get('pyqdate') || get('examdate'),
      pyqShift: get('pyqshift') || get('shift'),
      pyqSession: get('pyqsession') || get('session'),
      subject: get('subject'),
      chapter: get('chapter'),
      text: get('text'),
      optionA: get('optiona'),
      optionB: get('optionb'),
      optionC: get('optionc'),
      optionD: get('optiond'),
      correctIndex: get('correctindex'),
      solution: get('solution'),
    }
    const q = normalizePyqItem(item, i)
    if (q) out.push(q)
  }
  return out
}

/**
 * Turn bulk-parsed blocks into normalized PYQ rows (preview or import).
 * @param {Array<import('./parseBulkQuestions').ParsedBulkQuestion & { questionNumber?: number }>} parsed
 * @param {Record<string, unknown>} defaults
 * @param {number} [baseIndex]
 * @param {ReturnType<import('./pyqPaperParse.js').flattenPaperQuestionMap> | null} [slotMap]
 */
export function parsedBulkToPyqItems(parsed, defaults, baseIndex = 0, slotMap = null) {
  const out = []
  parsed.forEach((p, i) => {
    try {
      const qNum = p.questionNumber ?? baseIndex + i + 1
      const slot = slotMap?.find((s) => s.questionNumber === qNum)
      const q = normalizePyqItem(
        {
          ...defaults,
          subject: p.subject ?? slot?.subject ?? defaults.subject ?? 'physics',
          chapter: p.chapter ?? (p.text.slice(0, 40) || 'General'),
          text: p.text,
          options: p.options,
          correctIndex: p.correctIndex,
          correctIndices: p.correctIndices,
          solution: p.solution,
          questionType: p.questionType ?? slot?.questionTypeId,
          toughnessLevel: p.toughnessLevel ?? p.toughness,
          pyqSlot: qNum,
        },
        baseIndex + i,
      )
      if (q && p.correctIndex == null) delete q.correctIndex
      if (q && String(p.passageText ?? '').trim()) {
        for (const key of ['passageText', 'passageGroup', 'passageId', 'passageRole', 'passageSource']) {
          if (p[key] != null) q[key] = p[key]
        }
      }
      if (q) out.push(q)
    } catch {
      /* skip invalid rows in preview */
    }
  })
  return out
}

export const PYQ_JSON_TEMPLATE = JSON.stringify(
  {
    questions: [
      {
        pyqYear: 2024,
        examPatternId: 'jee-main',
        paperId: '2024-jan-24-s1',
        paperLabel: '24 Jan 2024 · Shift 1',
        pyqDate: '2024-01-24',
        pyqShift: 1,
        pyqSession: 'January Session',
        subject: 'physics',
        chapter: 'Kinematics',
        text: 'Your question text (use $LaTeX$). Source: your own file or NTA official material.',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        solution: 'Step-by-step solution',
      },
    ],
  },
  null,
  2,
)

/** Sample CSV for bulk PYQ import (header row + one example). */
export const PYQ_CSV_TEMPLATE = [
  'pyqYear,examPatternId,paperId,paperLabel,pyqDate,pyqShift,pyqSession,subject,chapter,text,optionA,optionB,optionC,optionD,correctIndex,solution',
  '2024,jee-main,2024-jan-24-s1,24 Jan 2024 · Shift 1,2024-01-24,1,January Session,physics,Kinematics,"A particle moves...",10 m/s,20 m/s,30 m/s,40 m/s,2,"Use v = u + at"',
].join('\n')
