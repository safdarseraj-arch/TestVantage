/**
 * Parse localStorage JSON whether it is `{ questions }`, a bare array, or watermarked export.
 * @param {string} raw
 */
export function parseStoredBankJson(raw) {
  let data = JSON.parse(raw)
  // Double-encoded JSON string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  return normalizeParsedBankRoot(data)
}

/**
 * @param {unknown} data
 * @returns {{ settings?: object, questions: import('../data/tests').Question[] } | null}
 */
export function normalizeParsedBankRoot(data) {
  if (Array.isArray(data)) {
    return { settings: undefined, questions: coerceQuestionsList(data) }
  }
  if (!data || typeof data !== 'object') return null

  const root = /** @type {Record<string, unknown>} */ (data)

  if (Array.isArray(root.questions)) {
    return {
      settings: root.settings,
      questions: coerceQuestionsList(root.questions),
    }
  }

  if (root.questions && typeof root.questions === 'object' && !Array.isArray(root.questions)) {
    return {
      settings: root.settings,
      questions: coerceQuestionsList(Object.values(root.questions)),
    }
  }

  if (Array.isArray(root.uploadedQuestions)) {
    return {
      settings: root.settings,
      questions: coerceQuestionsList(root.uploadedQuestions),
    }
  }

  if (Array.isArray(root.items)) {
    return { settings: root.settings, questions: coerceQuestionsList(root.items) }
  }

  if (root.bank && typeof root.bank === 'object') {
    return normalizeParsedBankRoot(root.bank)
  }

  if (Array.isArray(root.data?.questions)) {
    return {
      settings: root.data.settings,
      questions: coerceQuestionsList(root.data.questions),
    }
  }

  if (Array.isArray(root.data)) {
    return { settings: root.settings, questions: coerceQuestionsList(root.data) }
  }

  return null
}

/** @param {unknown} list */
export function coerceQuestionsList(list) {
  if (!Array.isArray(list)) {
    if (list && typeof list === 'object') {
      return coerceQuestionsList(Object.values(list))
    }
    return []
  }
  return list.filter(isBankQuestionLike)
}

/** @param {unknown} q */
function isBankQuestionLike(q) {
  if (!q || typeof q !== 'object') return false
  const row = /** @type {Record<string, unknown>} */ (q)
  if (row.isPassageHeader) return true
  if (typeof row.text === 'string' && row.text.trim()) return true
  if (typeof row.passageText === 'string' && row.passageText.trim()) return true
  if (typeof row.questionImage === 'string' && row.questionImage.length > 20) return true
  if (typeof row.passageImage === 'string' && row.passageImage.length > 20) return true
  if (row.passageId) return true
  if (Array.isArray(row.matrixRows) && row.matrixRows.some((r) => String(r ?? '').trim())) return true
  if (row.correctInteger != null || row.correctNumerical != null) return true
  // Keep image / option-only rows (OCR may leave stem empty until repaired)
  if (Array.isArray(row.options) && row.options.some((o) => String(o ?? '').trim())) return true
  if (Array.isArray(row.optionImages) && row.optionImages.some((img) => !!img)) return true
  if (typeof row.id === 'string' && /^(uq-|MAQ|PHY|CHE|MAT)/i.test(row.id)) return true
  return false
}
