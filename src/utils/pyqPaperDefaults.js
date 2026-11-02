import { getJeeMainPaperSlots } from '../data/pyqCatalog.js'

/**
 * @typedef {Object} PyqPaperDefaults
 * @property {number} pyqYear
 * @property {string} examPatternId
 * @property {string} paperId
 * @property {string} paperLabel
 * @property {string} [pyqDate]
 * @property {number} [pyqShift]
 * @property {string} [pyqSession]
 * @property {string} [subject]
 * @property {string} [chapter]
 */

/** @param {number} year */
export function jeeMainPaperSlotOptions(year) {
  return getJeeMainPaperSlots(year)
}

/**
 * Build paperId + label from exam/year/date/shift.
 * @param {{
 *   pyqYear: number
 *   examPatternId: string
 *   pyqDate?: string
 *   pyqShift?: number
 *   pyqSession?: string
 *   paperId?: string
 *   paperLabel?: string
 * }} input
 * @returns {Pick<PyqPaperDefaults, 'paperId' | 'paperLabel' | 'pyqDate' | 'pyqShift' | 'pyqSession'>}
 */
export function buildPyqPaperIds(input) {
  const year = Number(input.pyqYear)
  if (input.paperId?.trim() && input.paperLabel?.trim()) {
    return {
      paperId: input.paperId.trim(),
      paperLabel: input.paperLabel.trim(),
      pyqDate: input.pyqDate || undefined,
      pyqShift: input.pyqShift,
      pyqSession: input.pyqSession || undefined,
    }
  }

  if (input.examPatternId === 'jee-main' && input.pyqDate && input.pyqShift) {
    const slot = jeeMainPaperSlotOptions(year).find(
      (s) => s.pyqDate === input.pyqDate && s.pyqShift === input.pyqShift,
    )
    if (slot) {
      return {
        paperId: slot.paperId,
        paperLabel: slot.paperLabel,
        pyqDate: slot.pyqDate,
        pyqShift: slot.pyqShift,
        pyqSession: slot.pyqSession,
      }
    }
    const d = new Date(`${input.pyqDate}T12:00:00`)
    const dateLabel = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return {
      paperId: `${year}-${input.pyqDate}-s${input.pyqShift}`,
      paperLabel: `${dateLabel} · Shift ${input.pyqShift}`,
      pyqDate: input.pyqDate,
      pyqShift: input.pyqShift,
      pyqSession: input.pyqSession || undefined,
    }
  }

  if (input.examPatternId === 'jee-advanced') {
    const session = input.pyqSession?.trim() || 'Paper 1'
    const slug = session.toLowerCase().replace(/\s+/g, '-')
    return {
      paperId: `${year}-adv-${slug}`,
      paperLabel: `${year} JEE Advanced ${session}`,
      pyqSession: session,
    }
  }

  return {
    paperId: `${year}-neet-s1`,
    paperLabel: `NEET ${year}`,
    pyqSession: undefined,
  }
}

/**
 * @param {Partial<PyqPaperDefaults>} input
 * @returns {{ ok: true, value: PyqPaperDefaults } | { ok: false, error: string }}
 */
export function validatePyqPaperSetup(input) {
  const year = Number(input.pyqYear)
  if (!year || Number.isNaN(year) || year < 1990 || year > 2100) {
    return { ok: false, error: 'Enter a valid exam year.' }
  }
  const examPatternId = String(input.examPatternId ?? '').trim()
  if (!examPatternId) return { ok: false, error: 'Pick an exam.' }

  if (examPatternId === 'jee-main') {
    if (!input.pyqDate?.trim()) {
      return { ok: false, error: 'JEE Main needs an exam date.' }
    }
    if (input.pyqShift !== 1 && input.pyqShift !== 2) {
      return { ok: false, error: 'JEE Main needs Shift 1 or Shift 2.' }
    }
  }

  const ids = buildPyqPaperIds({
    pyqYear: year,
    examPatternId,
    pyqDate: input.pyqDate,
    pyqShift: input.pyqShift,
    pyqSession: input.pyqSession,
    paperId: input.paperId,
    paperLabel: input.paperLabel,
  })

  return {
    ok: true,
    value: {
      pyqYear: year,
      examPatternId,
      ...ids,
      subject: input.subject?.trim() || undefined,
      chapter: input.chapter?.trim() || undefined,
    },
  }
}
