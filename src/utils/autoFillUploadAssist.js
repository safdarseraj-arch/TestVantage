/**
 * After OCR/cloud parse: fill metatags, answer, and Solution field as much as possible.
 */

import { autoClassifyQuestion } from './autoClassifyQuestion.js'
import { enrichParsedWithAnswerProvenance } from './answerProvenance.js'
import { generateDeepSolution } from './deepSolutionGenerator.js'
import { findSimilarLocalAiExample } from './localAiLearningStore.js'
import { getSubjectsForExams } from './questionMetadata.js'

/**
 * Infer exam pattern ids from stem/options (suggestion only).
 * @param {{ text?: string, options?: string[], subject?: string }} q
 * @returns {string[]}
 */
export function suggestExamIdsFromQuestion(q) {
  const blob = `${q?.text ?? ''}\n${(q?.options ?? []).join(' ')}`.toLowerCase()
  const subject = String(q?.subject ?? '').toLowerCase()
  if (/neet|biology|photosynthesis|mitosis|enzyme|hormone/.test(blob) || subject === 'biology') {
    return ['neet']
  }
  if (
    /jee\s*advanced|paragraph|match the following|matrix match|more than one|correct options/i.test(
      blob,
    ) ||
    /\\begin\{vmatrix\}|determinant|adjoint|cofactor/.test(blob)
  ) {
    return ['jee-advanced']
  }
  if (/jee\s*main|single correct/i.test(blob)) return ['jee-main']
  if (subject === 'mathematics' || subject === 'physics' || subject === 'chemistry') {
    return ['jee-main', 'jee-advanced']
  }
  return []
}

/**
 * Sync enrich: provenance + auto-classify metatags (+ similar local AI example).
 * Does not overwrite fields the user has edited (`userLockedMeta`).
 * Fields still listed in `prevAiSuggestedMeta` may be refreshed by AI.
 * @param {Record<string, unknown>} parsed
 * @param {string} [rawOcr]
 * @param {{
 *   examIds?: string[]
 *   prevAiSuggestedMeta?: string[]
 *   userLockedMeta?: string[]
 *   currentMeta?: {
 *     subject?: string
 *     section?: string
 *     chapter?: string
 *     topic?: string
 *     toughnessLevel?: number | null
 *     examIds?: string[]
 *   }
 * }} [ctx]
 */
export function enrichUploadWithMetaAndAnswer(parsed, rawOcr = '', ctx = {}) {
  let out = enrichParsedWithAnswerProvenance({ ...parsed }, rawOcr || String(parsed?.text ?? ''))

  const similar = findSimilarLocalAiExample(
    `${out.text ?? ''}\n${rawOcr}\n${(out.options ?? []).join(' ')}`,
  )
  if (similar) {
    if (!out.solution && similar.cloudSolution) {
      out.solution = similar.cloudSolution
      out.solutionSource = out.solutionSource || 'draft'
      out.solutionConfidence = Math.min(70, Number(out.solutionConfidence ?? 60))
      out._localAiHint = 'similar_cloud_example'
    }
    if (out.correctIndex == null && !out.correctIndices?.length && similar.cloudAnswer) {
      const letter = String(similar.cloudAnswer).trim().toUpperCase().match(/[A-D]/)?.[0]
      if (letter) {
        const idx = letter.charCodeAt(0) - 65
        const opt = (out.options ?? [])[idx]
        if (opt && String(opt).trim()) {
          out.correctIndex = idx
          out.answerSource = out.answerSource === 'from_paper' ? 'from_paper' : 'draft'
          out.answerConfidence = Math.min(62, Number(out.answerConfidence ?? 55))
        }
      }
    }
  }

  const allowed = getSubjectsForExams(ctx.examIds ?? []).map((s) => s.id)
  const auto = autoClassifyQuestion({
    text: String(out.text ?? ''),
    options: /** @type {string[]} */ (out.options ?? []),
    allowedSubjects: allowed.length ? allowed : undefined,
  })

  const prevSuggested = new Set((ctx.prevAiSuggestedMeta ?? []).map(String))
  const userLocked = new Set((ctx.userLockedMeta ?? []).map(String))
  const current = ctx.currentMeta ?? {}

  /**
   * @param {string} field
   * @param {unknown} currentVal
   */
  const canAiFill = (field, currentVal) => {
    if (userLocked.has(field)) return false
    const empty =
      currentVal == null ||
      currentVal === '' ||
      (Array.isArray(currentVal) && currentVal.length === 0)
    if (empty) return true
    if (prevSuggested.has(field)) return true
    // Fresh form default subject is fillable until the user touches it.
    if (field === 'subject' && currentVal === 'mathematics') return true
    return false
  }

  /** @type {string[]} */
  const aiSuggestedFields = []

  if (userLocked.has('subject') && current.subject) {
    out.subject = current.subject
  } else if (canAiFill('subject', current.subject)) {
    if (!out.subject && auto.subject) {
      out.subject = auto.subject
      aiSuggestedFields.push('subject')
    } else if (out.subject) {
      aiSuggestedFields.push('subject')
    }
  } else if (current.subject) {
    out.subject = current.subject
  }

  if (userLocked.has('section') && current.section) {
    out.section = current.section
  } else if (canAiFill('section', current.section)) {
    if (!out.section && auto.section) {
      out.section = auto.section
      aiSuggestedFields.push('section')
    } else if (out.section) {
      aiSuggestedFields.push('section')
    }
  } else if (current.section) {
    out.section = current.section
  }

  if (userLocked.has('chapter') && current.chapter) {
    out.chapter = current.chapter
  } else if (canAiFill('chapter', current.chapter)) {
    if (!out.chapter && auto.chapter) {
      out.chapter = auto.chapter
      aiSuggestedFields.push('chapter')
    } else if (out.chapter) {
      aiSuggestedFields.push('chapter')
    }
  } else if (current.chapter) {
    out.chapter = current.chapter
  }

  if (userLocked.has('topic') && current.topic) {
    out.topic = current.topic
  } else if (canAiFill('topic', current.topic)) {
    if (!out.topic && auto.topic) {
      out.topic = auto.topic
      aiSuggestedFields.push('topic')
    } else if (out.topic) {
      aiSuggestedFields.push('topic')
    }
  } else if (current.topic) {
    out.topic = current.topic
  }

  if (userLocked.has('toughnessLevel') && current.toughnessLevel != null) {
    out.toughnessLevel = current.toughnessLevel
  } else if (canAiFill('toughnessLevel', current.toughnessLevel)) {
    if (out.toughnessLevel == null && auto.toughnessLevel != null) {
      out.toughnessLevel = auto.toughnessLevel
      aiSuggestedFields.push('toughnessLevel')
    } else if (out.toughnessLevel != null) {
      aiSuggestedFields.push('toughnessLevel')
    }
  } else if (current.toughnessLevel != null) {
    out.toughnessLevel = current.toughnessLevel
  }

  const examSuggest = suggestExamIdsFromQuestion({
    text: String(out.text ?? ''),
    options: /** @type {string[]} */ (out.options ?? []),
    subject: String(out.subject ?? ''),
  })
  if (userLocked.has('examIds') && Array.isArray(current.examIds) && current.examIds.length) {
    out.examIds = current.examIds
  } else if (canAiFill('examIds', current.examIds)) {
    if ((!out.examIds || !out.examIds.length) && examSuggest.length) {
      out.examIds = examSuggest
      aiSuggestedFields.push('examIds')
    } else if (Array.isArray(out.examIds) && out.examIds.length) {
      aiSuggestedFields.push('examIds')
    }
  } else if (Array.isArray(current.examIds) && current.examIds.length) {
    out.examIds = current.examIds
  }

  out.aiSuggestedMeta = aiSuggestedFields
  out.metaAiConfidence = auto.confidence ?? 0
  return out
}

/**
 * Drop a field from the AI-suggested list after the user edits it.
 * @param {string[]} suggested
 * @param {string} field
 */
export function clearAiSuggestedMetaField(suggested = [], field) {
  return (suggested ?? []).filter((f) => f !== field)
}

/**
 * Async: if Solution empty and we have an answer (or cloud can solve), fill Solution field.
 * @param {Record<string, unknown>} q
 * @param {{
 *   preferCloud?: boolean
 *   solveCloud?: (q: object) => Promise<object>
 *   force?: boolean
 * }} [opts]
 */
export async function autofillSolutionAfterUpload(q, opts = {}) {
  const existing = String(q?.solution ?? q?.existingSolution ?? '').trim()
  if (existing.length >= 80 && !opts.force) {
    const essay =
      /What is asked\?|Work it out\.|Substitute and simplify in 1-2 lines|Read the stem once/i.test(
        existing,
      )
    if (!essay) {
      return {
        solution: existing,
        solutionSource: q.solutionSource || 'ai_generated',
        solutionConfidence: q.solutionConfidence ?? 75,
        quality: 'kept',
      }
    }
  }

  const deep = await generateDeepSolution(
    {
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
      correctIndices: q.correctIndices,
      correctInteger: q.correctInteger,
      correctNumerical: q.correctNumerical,
      answerSource: q.answerSource,
      existingSolution: existing,
      solutionSource: q.solutionSource,
      questionType: q.questionType,
    },
    {
      force: !!opts.force || existing.length < 40,
      preferCloud: opts.preferCloud !== false,
      solveCloud: opts.solveCloud,
    },
  )

  // If cloud also returned a correctIndex and we had none, surface it
  /** @type {Record<string, unknown>} */
  const extra = {}
  if (
    q.correctIndex == null &&
    !(Array.isArray(q.correctIndices) && q.correctIndices.length) &&
    deep.correctIndex != null
  ) {
    extra.correctIndex = deep.correctIndex
    extra.answerSource = 'ai_generated'
  }

  return { ...deep, ...extra }
}

/**
 * Format answer letter for learning store.
 * @param {Record<string, unknown>} q
 */
export function formatAnswerKeyForLearning(q) {
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) {
    return q.correctIndices.map((i) => String.fromCharCode(65 + Number(i))).join(',')
  }
  if (q.correctIndex != null) return String.fromCharCode(65 + Number(q.correctIndex))
  if (q.correctInteger != null) return String(q.correctInteger)
  if (q.correctNumerical != null) return String(q.correctNumerical)
  return ''
}
