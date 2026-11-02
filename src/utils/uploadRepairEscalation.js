/**
 * When local auto-repair fails, build a structured ticket for Cursor / manual plugin work.
 */

import { labelForUploadType } from './classifyUploadFromOcr.js'
import { countRealMcqOptions } from './stemDiagramDetect.js'
import { detectUploadErrors, assessUploadQualityFull } from './uploadErrorBrain.js'

export const REPAIR_QUEUE_STORAGE_KEY = 'tv-upload-repair-queue'

const MAX_RAW_OCR_CHARS = 2800
const MAX_STEM_CHARS = 900

/** Issue ids that should escalate if still present after repair attempts. */
const ESCALATE_IF_PERSISTENT = new Set([
  'options-incomplete',
  'latex-broken',
  'latex-broken-smart',
  'stem-ocr-garble',
  'stem-ocr-garble-smart',
  'stem-tabular-garbage',
  'options-false-split',
  'option-embedded-marker',
  'option-placeholder',
  'gi-bracket-mangled',
  'min-sin-abs-period',
  'sin-gi-pi-one-one-onto',
  'domain-gi-mcq',
  'trig-period-t1t2',
  'function-property',
  'passage-split',
])

/**
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n… [truncated ${t.length - max} chars]`
}

/**
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   quality?: ReturnType<typeof assessUploadQualityFull> | null
 *   unresolvedIssues?: { id?: string, message?: string }[]
 *   repairSteps?: string[]
 *   repairAttempts?: { fixId?: string, improved?: boolean, step?: string, errorsBefore?: number, errorsAfter?: number }[]
 *   initialErrors?: { id?: string, message?: string }[]
 * }} ctx
 */
export function buildRepairTicket(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const options = (ctx.options ?? []).slice(0, 6)
  const rawOcr = String(ctx.rawOcr ?? '').trim()
  const questionType = ctx.questionType ?? 'single_correct'
  const quality = ctx.quality
  const unresolved = ctx.unresolvedIssues ?? []
  const repairSteps = ctx.repairSteps ?? []
  const repairAttempts = ctx.repairAttempts ?? []
  const initialErrors = ctx.initialErrors ?? []
  const found = countRealMcqOptions(stem, options)
  const id = `repair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const createdAt = new Date().toISOString()

  const optLines = options
    .map((o, i) => `${String.fromCharCode(65 + i)}) ${String(o ?? '').trim() || '(empty)'}`)
    .join('\n')

  const unresolvedLines = unresolved.map((i) => `- [${i.id ?? 'issue'}] ${i.message ?? ''}`).join('\n')
  const initialLines = initialErrors
    .filter((e) => e.severity !== 'info')
    .map((i) => `- [${i.id ?? 'issue'}] ${i.message ?? ''}`)
    .join('\n')
  const attemptLines = repairAttempts.length
    ? repairAttempts
        .map(
          (a) =>
            `- ${a.fixId ?? '?'}: ${a.improved ? 'helped' : 'no change'} (${a.errorsBefore ?? '?'}→${a.errorsAfter ?? '?'} errors)${a.step ? ` — ${a.step}` : ''}`,
        )
        .join('\n')
    : '- (no fix attempts logged)'

  const text = `# TestVantages upload repair ticket

**ID:** ${id}
**Created:** ${createdAt}
**Type:** ${labelForUploadType(questionType)}
**Quality:** ${quality?.confidence ?? '?'} / 100 · options found ${found}/4

## Request for Cursor AI
Auto-repair ran but could not fully fix this upload. Please add or improve a **local OCR repair plugin** (see \`src/utils/repairRegistry.js\`) for this question pattern.

## Unresolved issues
${unresolvedLines || '- (none listed)'}

## Issues detected before repair
${initialLines || '- (none)'}

## Repair steps tried
${repairSteps.map((s) => `- ${s}`).join('\n') || '- (none)'}

## Fix attempts (by fixId)
${attemptLines}

## Current stem (after auto-repair)
${truncate(stem, MAX_STEM_CHARS)}

## Current options A–D
${optLines}

## Raw OCR (for pattern matching)
\`\`\`
${truncate(rawOcr, MAX_RAW_OCR_CHARS)}
\`\`\`

## Suggested files to touch
- \`src/utils/repair*McqOcr.js\` — new or extend detector + canonical stem/options
- \`src/utils/repairRegistry.js\` — register plugin
- \`src/utils/uploadIssueDetectors.js\` — link smart detector
- \`scripts/test-*-mcq-ocr.mjs\` — regression test with raw OCR above
`

  return {
    id,
    createdAt,
    questionType,
    confidence: quality?.confidence ?? 0,
    found,
    summary: `Upload repair needed — ${unresolved.length} issue(s), ${found}/4 options, quality ${quality?.confidence ?? '?'}/100`,
    text,
  }
}

/**
 * @param {ReturnType<typeof buildRepairTicket>} ticket
 */
export function saveRepairTicketToQueue(ticket) {
  if (!ticket?.id || typeof localStorage === 'undefined') return ticket
  try {
    const raw = localStorage.getItem(REPAIR_QUEUE_STORAGE_KEY)
    /** @type {object[]} */
    const queue = raw ? JSON.parse(raw) : []
    queue.unshift({
      id: ticket.id,
      createdAt: ticket.createdAt,
      summary: ticket.summary,
      confidence: ticket.confidence,
      found: ticket.found,
      text: ticket.text,
    })
    localStorage.setItem(REPAIR_QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(0, 12)))
  } catch {
    /* ignore quota / private mode */
  }
  return ticket
}

/** @returns {object[]} */
export function listRepairTicketQueue() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(REPAIR_QUEUE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * After auto-repair — decide if Cursor agent should take over.
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   repairSteps?: string[]
 *   repairAttempts?: { fixId?: string, improved?: boolean, step?: string, errorsBefore?: number, errorsAfter?: number }[]
 *   initialStem?: string
 *   initialOptions?: string[]
 *   initialErrors?: ReturnType<typeof detectUploadErrors>
 * }} ctx
 */
export function assessPostRepairStatus(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const options = [...(ctx.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')
  const rawOcr = String(ctx.rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  const questionType = ctx.questionType ?? 'single_correct'
  const repairSteps = ctx.repairSteps ?? []
  const repairAttempts = ctx.repairAttempts ?? []

  const initialErrors =
    ctx.initialErrors ??
    detectUploadErrors({
      stem: String(ctx.initialStem ?? stem).trim(),
      options: ctx.initialOptions ?? options,
      rawOcr,
      questionType,
    })

  const quality = assessUploadQualityFull({
    stem,
    options,
    rawOcr,
    questionType,
    detectedType: questionType,
  })
  const finalErrors = detectUploadErrors({ stem, options, rawOcr, questionType })
  const blocking = finalErrors.filter((e) => e.severity === 'error')
  const found = countRealMcqOptions(stem, options)
  const conf = quality.confidence ?? 0

  const persistedCritical = blocking.filter(
    (e) => ESCALATE_IF_PERSISTENT.has(e.id) && initialErrors.some((ie) => ie.id === e.id),
  )
  const failedAttempts = repairAttempts.filter((a) => !a.improved).length
  const anyRepairTried = repairSteps.length > 0 || repairAttempts.length > 0
  const cleanEnough = (quality.readyToSave || conf >= 70) && found >= 4

  const needsAgentRepair =
    !cleanEnough &&
    blocking.length > 0 &&
    (found < 4 ||
      conf < 62 ||
      persistedCritical.length > 0 ||
      (anyRepairTried && blocking.length >= 1 && failedAttempts >= 2) ||
      (anyRepairTried && persistedCritical.length > 0))

  let repairTicket = null
  if (needsAgentRepair) {
    repairTicket = saveRepairTicketToQueue(
      buildRepairTicket({
        stem,
        options,
        rawOcr,
        questionType,
        quality,
        unresolvedIssues: blocking,
        repairSteps,
        repairAttempts,
        initialErrors,
      }),
    )
  }

  const escalationSummary = needsAgentRepair
    ? `Auto-repair could not fix ${blocking.length} issue(s) — use **Copy for Cursor repair** below and paste in chat.`
    : ''

  return {
    needsAgentRepair,
    unresolvedIssues: blocking,
    persistedCritical,
    repairAttempts,
    repairTicket,
    repairTicketText: repairTicket?.text ?? '',
    escalationSummary,
    quality,
    found,
    confidence: conf,
  }
}
