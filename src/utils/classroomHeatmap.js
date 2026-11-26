/**
 * B2B classroom diagnostic heatmap — cohort failure rate by chapter × subject
 * from school/teacher attempt rows (byChapter + bySubject).
 */

const SUBJECT_ALIASES = {
  physics: 'physics',
  phy: 'physics',
  chemistry: 'chemistry',
  chem: 'chemistry',
  mathematics: 'mathematics',
  maths: 'mathematics',
  math: 'mathematics',
  biology: 'biology',
  botany: 'botany',
  zoology: 'zoology',
}

function normSubject(raw) {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
  return SUBJECT_ALIASES[k] || k || 'other'
}

function labelSubject(id) {
  if (!id) return '—'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * Infer subject for a chapter from per-question rows or attempt bySubject keys.
 * @param {object} attempt
 * @param {string} chapter
 */
function subjectForChapter(attempt, chapter) {
  const perQ = attempt.resultSnapshot?.result?.perQuestion ?? attempt.perQuestion ?? []
  for (const pq of perQ) {
    if (String(pq.chapter || '').trim() === chapter && pq.subject) {
      return normSubject(pq.subject)
    }
  }
  const bySub = attempt.bySubject ?? attempt.resultSnapshot?.result?.bySubject ?? {}
  const keys = Object.keys(bySub)
  if (keys.length === 1) return normSubject(keys[0])
  return 'mixed'
}

/**
 * Build failure heatmap cells from cohort attempts.
 * Failure rate = wrong / (correct + wrong) when attempted; skips ignored for rate.
 *
 * @param {object[]} attempts
 * @param {{ testId?: string, minStudents?: number }} [opts]
 */
export function buildClassroomFailureHeatmap(attempts = [], opts = {}) {
  let rows = Array.isArray(attempts) ? attempts : []
  if (opts.testId) {
    rows = rows.filter((a) => a.testId === opts.testId)
  }

  /** @type {Map<string, { chapter: string, subject: string, wrong: number, correct: number, unattempted: number, students: Set<string> }>} */
  const map = new Map()

  for (const a of rows) {
    const chapters = a.byChapter ?? a.resultSnapshot?.result?.byChapter ?? {}
    const studentKey = a.ownerKey || a.userEmail || a.userName || a.id
    const chapterKeys = Object.keys(chapters)
    if (chapterKeys.length) {
      for (const [chapter, stats] of Object.entries(chapters)) {
        const ch = String(chapter).trim()
        if (!ch) continue
        const subject = subjectForChapter(a, ch)
        const key = `${subject}::${ch}`
        if (!map.has(key)) {
          map.set(key, {
            chapter: ch,
            subject,
            wrong: 0,
            correct: 0,
            unattempted: 0,
            students: new Set(),
          })
        }
        const cell = map.get(key)
        cell.wrong += Number(stats.wrong) || 0
        cell.correct += Number(stats.correct) || 0
        cell.unattempted += Number(stats.unattempted) || 0
        cell.students.add(studentKey)
      }
      continue
    }

    // Subject-only fallback when chapter tags missing (e.g. thin demo rows)
    const bySubject = a.bySubject ?? a.resultSnapshot?.result?.bySubject ?? {}
    for (const [subRaw, stats] of Object.entries(bySubject)) {
      const subject = normSubject(subRaw)
      const chapter = `${labelSubject(subject)} (paper)`
      const key = `${subject}::${chapter}`
      if (!map.has(key)) {
        map.set(key, {
          chapter,
          subject,
          wrong: 0,
          correct: 0,
          unattempted: 0,
          students: new Set(),
        })
      }
      const cell = map.get(key)
      cell.wrong += Number(stats.wrong) || 0
      cell.correct += Number(stats.correct) || 0
      cell.unattempted += Number(stats.unattempted) || 0
      cell.students.add(studentKey)
    }
  }

  const cells = [...map.values()].map((c) => {
    const attempted = c.correct + c.wrong
    const failRate = attempted > 0 ? Math.round((c.wrong / attempted) * 100) : null
    return {
      chapter: c.chapter,
      subject: c.subject,
      subjectLabel: labelSubject(c.subject),
      wrong: c.wrong,
      correct: c.correct,
      unattempted: c.unattempted,
      attempted,
      failRate,
      studentCount: c.students.size,
    }
  })

  cells.sort((a, b) => {
    const fa = a.failRate ?? -1
    const fb = b.failRate ?? -1
    return fb - fa || b.wrong - a.wrong
  })

  const subjects = [...new Set(cells.map((c) => c.subject))].sort()
  const chapters = [...new Set(cells.map((c) => c.chapter))]

  const studentIds = new Set(rows.map((a) => a.ownerKey || a.id))
  const minStudents = opts.minStudents ?? 1
  const ready = cells.some((c) => c.studentCount >= minStudents && c.attempted > 0)

  return {
    ready,
    attemptCount: rows.length,
    studentCount: studentIds.size,
    subjects,
    chapters,
    cells,
    /** Matrix for heatmap grid: subject → chapter → cell */
    matrix: Object.fromEntries(
      subjects.map((sub) => [
        sub,
        Object.fromEntries(
          chapters
            .map((ch) => {
              const cell = cells.find((c) => c.subject === sub && c.chapter === ch)
              return cell ? [ch, cell] : null
            })
            .filter(Boolean),
        ),
      ]),
    ),
    takeaway: ready
      ? `Hottest failure cells need a class redo — ${cells[0]?.chapter ?? 'top chapter'} leads at ${cells[0]?.failRate ?? 0}% wrong among attempted.`
      : 'Need cohort attempts with chapter or subject tags to draw a classroom failure heatmap.',
  }
}

/**
 * Heat colour for fail rate 0–100.
 * @param {number | null} failRate
 */
export function heatmapFailColor(failRate) {
  if (failRate == null) return '#f1f5f9'
  const t = Math.min(100, Math.max(0, failRate)) / 100
  // pale → amber → rose
  const r = Math.round(254 - t * 80)
  const g = Math.round(243 - t * 180)
  const b = Math.round(226 - t * 140)
  return `rgb(${r},${g},${b})`
}
