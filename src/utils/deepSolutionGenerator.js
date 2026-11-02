/**
 * Deep step-by-step JEE solution drafts (local) + optional cloud upgrade.
 */

import { isUltraLowConfidenceOcr, scoreLocalOcrWeakness } from './cloudVisionParse.js'
import {
  FX_LIMIT_FINITE_SOLUTION,
  looksLikeFxLimitFiniteMcq,
} from './repairFxLimitFiniteMcqOcr.js'

/**
 * @typedef {'from_paper' | 'ai_generated' | 'draft' | 'manual' | 'unknown'} SolutionSource
 */

/**
 * Badge label for solution provenance.
 * @param {SolutionSource | string | undefined} source
 */
export function solutionSourceBadgeLabel(source) {
  switch (source) {
    case 'from_paper':
      return 'From paper'
    case 'ai_generated':
      return 'AI solution'
    case 'draft':
      return 'Draft'
    case 'manual':
      return 'Manual'
    default:
      return 'Needs check'
  }
}

/**
 * True when stem OCR is too broken to write a real solution (would copy garble).
 * @param {string} stem
 * @param {string[]} [options]
 */
export function stemTooGarbledForSolution(stem, options = []) {
  const s = String(stem ?? '').trim()
  if (!s) return true
  const blob = `${s}\n${(options ?? []).join('\n')}`
  if (/J\s*PEA|\/im\s*\$?f|lim\s+J\s+PEA|®\s*D\)|2\s*®D/i.test(blob)) return true
  if (/What is asked\?|Work it out\.|Substitute and simplify in 1-2 lines/i.test(s)) return true
  // High weakness AND missing math/prose structure — not just a short clean stem
  const weak = scoreLocalOcrWeakness(blob)
  if (weak >= 70 && isUltraLowConfidenceOcr(blob) && !/\$|\\lim|\\frac|\bthen\b|\bis\s+equal/i.test(s)) {
    return true
  }
  return false
}

/** True when solution is only answer + elim lines — no real math steps. */
export function solutionLooksLikeMinimalDraft(text) {
  const s = String(text ?? '').trim()
  if (!s) return false
  if (/What is asked\?|Work it out\.|Read the stem once/i.test(s)) return true
  if (/^\*\*Answer\.\*\*/m.test(s) && !/\*\*Step\s*1/i.test(s)) return true
  if (/Short draft — click \*\*Regenerate solution\*\*/i.test(s)) return true
  return false
}

/**
 * Known JEE MCQ patterns with hand-written concise solutions (no cloud).
 * @param {{ text?: string, options?: string[], correctIndex?: number }} q
 */
export function tryCanonicalMcqSolution(q) {
  const stem = String(q?.text ?? '').trim()
  const opts = (q?.options ?? []).map((o) => String(o ?? '').trim())
  const blob = `${stem}\n${opts.join('\n')}`
  if (looksLikeFxLimitFiniteMcq(blob)) {
    return {
      solution: FX_LIMIT_FINITE_SOLUTION(),
      solutionSource: /** @type {SolutionSource} */ ('ai_generated'),
      solutionConfidence: 90,
      quality: 'canonical',
      correctIndex: q?.correctIndex ?? 0,
    }
  }
  return null
}

/**
 * Build a short local solution (no cloud). Real math only — no essay instructions.
 * @param {{
 *   text?: string
 *   options?: string[]
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   answerSource?: string
 *   existingSolution?: string
 *   force?: boolean
 * }} q
 */
export function generateDeepSolutionLocal(q) {
  const existing = String(q?.existingSolution ?? '').trim()
  if (existing && !q.force) {
    const looksEssay =
      /What is asked\?|Work it out\.|Substitute and simplify in 1-2 lines|Read the stem once/i.test(
        existing,
      )
    if (!looksEssay && !solutionLooksLikeMinimalDraft(existing)) {
      const looksDeep =
        existing.length >= 80 ||
        /(?:^|\n)\s*(?:\d+[\.\)]|step\s*\d|why\s+(?:correct|others))/i.test(existing)
      return {
        solution: existing,
        solutionSource: /** @type {SolutionSource} */ (
          q.answerSource === 'from_paper' ? 'from_paper' : 'ai_generated'
        ),
        solutionConfidence: looksDeep ? 85 : 70,
        quality: looksDeep ? 'deep' : 'short',
      }
    }
  }

  const opts = (q?.options ?? []).map((o) => String(o ?? '').trim())
  const stem = String(q?.text ?? '').trim()

  const canonical = tryCanonicalMcqSolution({ ...q, text: stem, options: opts })
  if (canonical?.solution) {
    return canonical
  }

  if (stemTooGarbledForSolution(stem, opts) && !q.force) {
    return {
      solutionSource: 'unknown',
      solutionConfidence: 0,
      quality: 'none',
      skippedReason: 'garbled_stem',
    }
  }

  /** @type {number[]} */
  let correctIdxs = []
  if (Array.isArray(q?.correctIndices) && q.correctIndices.length) {
    correctIdxs = [...q.correctIndices]
  } else if (q?.correctIndex != null) {
    correctIdxs = [q.correctIndex]
  }

  if (q?.correctInteger != null) {
    const steps = [
      '**Step 1.** Set up the equation from the stem and solve for the integer.',
      `**Correct:** $${q.correctInteger}$`,
    ]
    return {
      solution: steps.join('\n\n'),
      solutionSource: /** @type {SolutionSource} */ (
        q.answerSource === 'from_paper' ? 'from_paper' : 'draft'
      ),
      solutionConfidence: q.answerSource === 'from_paper' ? 72 : 58,
      quality: 'deep',
    }
  }

  if (q?.correctNumerical != null) {
    const steps = [
      '**Step 1.** Set up the equation from the stem and solve.',
      `**Correct:** $${q.correctNumerical}$`,
    ]
    return {
      solution: steps.join('\n\n'),
      solutionSource: /** @type {SolutionSource} */ (
        q.answerSource === 'from_paper' ? 'from_paper' : 'draft'
      ),
      solutionConfidence: 60,
      quality: 'deep',
    }
  }

  if (!correctIdxs.length) {
    return {
      solutionSource: 'unknown',
      solutionConfidence: 0,
      quality: 'none',
    }
  }

  const correctLabels = correctIdxs.map((i) => `(${String.fromCharCode(65 + i)})`)
  const correctBodies = correctIdxs.map((idx) => {
    const body = opts[idx] || ''
    return body ? `(${String.fromCharCode(65 + idx)}) ${body}` : `(${String.fromCharCode(65 + idx)})`
  })

  const wrongLines = opts
    .map((body, i) => ({ body, i }))
    .filter(({ body, i }) => !correctIdxs.includes(i) && body && !/\(Graph\/diagram/i.test(body))
    .map(({ body, i }) => {
      const L = String.fromCharCode(65 + i)
      const short = body.length > 40 ? `${body.slice(0, 40)}…` : body
      return `- **(${L})** ${short}`
    })

  const steps = [
    `**Answer.** ${correctBodies.join('; ')}`,
    wrongLines.length ? `**Quick eliminations:**\n${wrongLines.slice(0, 3).join('\n')}` : null,
    q.answerSource === 'from_paper'
      ? '*(From printed key — replace with full working before publish if needed.)*'
      : '*(Short draft — click **Regenerate solution** for a real Gemini explanation when the API key is set.)*',
    `**Correct:** ${correctLabels.join(', ')}`,
  ].filter(Boolean)

  return {
    solution: steps.join('\n\n'),
    solutionSource: /** @type {SolutionSource} */ ('draft'),
    solutionConfidence: q.answerSource === 'from_paper' ? 68 : 55,
    quality: 'deep',
  }
}

/**
 * Prefer cloud deep solve when available; otherwise local deep draft.
 * @param {object} q
 * @param {{
 *   preferCloud?: boolean
 *   force?: boolean
 *   solveCloud?: (q: object) => Promise<object>
 * }} [opts]
 */
export async function generateDeepSolution(q, opts = {}) {
  const force = !!opts.force
  const existing = String(q?.existingSolution ?? '').trim()
  const essayExisting =
    /What is asked\?|Work it out\.|Substitute and simplify in 1-2 lines|Read the stem once/i.test(
      existing,
    )
  const minimalExisting = solutionLooksLikeMinimalDraft(existing)
  if (existing && !force && existing.length >= 120 && !essayExisting && !minimalExisting) {
    return {
      solution: existing,
      solutionSource: q.solutionSource || (q.answerSource === 'from_paper' ? 'from_paper' : 'ai_generated'),
      solutionConfidence: 80,
      quality: 'kept',
    }
  }

  const stem = String(q?.text ?? '')
  const options = /** @type {string[]} */ (q?.options ?? [])

  const canonicalEarly = tryCanonicalMcqSolution({ ...q, text: stem, options })
  if (canonicalEarly?.solution && (force || minimalExisting || !existing)) {
    return canonicalEarly
  }

  if (stemTooGarbledForSolution(stem, options) && !force) {
    return {
      solutionSource: 'unknown',
      solutionConfidence: 0,
      quality: 'none',
      skippedReason: 'garbled_stem',
    }
  }

  if (opts.preferCloud !== false && typeof opts.solveCloud === 'function') {
    try {
      const cloud = await opts.solveCloud({
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        correctIndices: q.correctIndices,
        correctInteger: q.correctInteger,
        correctNumerical: q.correctNumerical,
        questionType: q.questionType,
      })
      if (cloud?.solution?.trim()) {
        return {
          solution: cloud.solution.trim(),
          solutionSource: 'ai_generated',
          solutionConfidence: cloud.solutionConfidence ?? 78,
          quality: 'cloud',
          provider: cloud.provider,
          correctIndex: cloud.correctIndex,
          correctIndices: cloud.correctIndices,
          correctInteger: cloud.correctInteger,
          correctNumerical: cloud.correctNumerical,
        }
      }
    } catch {
      /* fall through to local */
    }
  }

  return generateDeepSolutionLocal({ ...q, force })
}
