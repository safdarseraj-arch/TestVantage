/**
 * Smart local upload issue detectors — pattern + plugin-linked checks (no cloud API).
 * uploadErrorBrain merges these with generic quality gates.
 */

import { countRealMcqOptions } from './stemDiagramDetect.js'
import { detectBrokenBankStem } from './stemBankGuard.js'
import { looksLikeMinSinAbsGiPeriodMcq } from './repairMinSinAbsGiPeriodMcqOcr.js'
import { looksLikeSinGiPiOneOneOntoMcq } from './repairSinGiPiOneOneOntoMcqOcr.js'
import { looksLikeOddFunctionAlphaGiMcq } from './repairOddFunctionAlphaGiMcqOcr.js'
import { looksLikeAbsPiSinOneSidedLimitMcq } from './repairAbsPiSinOneSidedLimitMcqOcr.js'
import { looksLikeDomainGreatestIntegerMcq } from './repairDomainGreatestIntegerMcqOcr.js'
import { looksLikeTrigPeriodMcq } from './repairTrigPeriodMcqOcr.js'
import { looksLikeCompositionIdentityMcq } from './repairCompositionMcqOcr.js'
import { looksLikeFunctionPropertyMcq } from './repairFunctionPropertyMcqOcr.js'
import { looksLikeInverseFunctionMcq } from './repairInverseFunctionMcqOcr.js'
import { looksLikeF0MoebiusFunctionalMcq } from './repairF0MoebiusFunctionalMcqOcr.js'
import { looksLikeLimitGxQuestion } from './repairLimitGxStemOcr.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { looksLikePqrsPerpVectorMcq } from './repairPqrsPerpVectorMcqOcr.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'

/** @typedef {{ id: string, severity: 'error'|'warn'|'info', message: string, fixId: string, autoFixable: boolean }} UploadIssue */

const TABULAR_RE = /\\begin\{tabular\}|\\text\{begin\}\{tabular\}|\\backslash\\text\{begin\}|(?:\\hline){2,}/i
const STEM_GARBLE_RE =
  /\bgfl\s*\(|sin\s*\?\s*x|cos\s*\*\s*x|jlasamea|Wx\s*\+\s*x|a'\s*\(\s*s-a|\bAABC\b|\\min\s*\\\{\s*\\sin\s*x\s*,\s*b\s*\\\}/i

/**
 * @param {string} blob
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 * }} ctx
 * @returns {UploadIssue[]}
 */
export function runUploadIssueDetectors(blob, ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const options = [...(ctx.options ?? ['', '', '', ''])]
  const found = countRealMcqOptions(stem, options)
  const displayBlob = `${stem}\n${options.join('\n')}`
  /** @type {UploadIssue[]} */
  const issues = []

  const push = (id, message, severity = 'error', fixId = 'repair-registry') => {
    issues.push({ id, severity, message, fixId, autoFixable: true })
  }

  const stillBroken =
    found < 4 ||
    STEM_GARBLE_RE.test(displayBlob) ||
    TABULAR_RE.test(displayBlob) ||
    // lim C/D truncated after polish (lost "does not exist")
    (looksLikeAbsPiSinOneSidedLimitMcq(blob) &&
      options.some(
        (o) => /\\lim|\blim\b/i.test(String(o ?? '')) && !/\bdoes\s+not\s+exist\b/i.test(String(o ?? '')),
      ))

  if (TABULAR_RE.test(displayBlob)) {
    push('stem-tabular-garbage', 'Tabular LaTeX leaked into text — AI will strip and re-parse.')
  }

  if (STEM_GARBLE_RE.test(displayBlob)) {
    push('stem-ocr-garble-smart', 'Stem OCR looks garbled — AI repair plugins will run.', 'warn')
  }

  if (
    /\\frac\{x\}\{(?:\\?pi|π)\}\s*-\s*\\frac\{x\}\{(?:\\?pi|π)\}/i.test(displayBlob) &&
    /greatest\s+integer/i.test(displayBlob)
  ) {
    push('gi-bracket-mangled', 'Greatest-integer bracket mangled — AI will restore [x/π].')
  }

  if (looksLikeMinSinAbsGiPeriodMcq(blob) && stillBroken) {
    push('min-sin-abs-period', 'min{sin x,|x|} period MCQ — AI will restore stem and π options.')
  }

  if (looksLikeSinGiPiOneOneOntoMcq(blob) && (stillBroken || /\\newcommand/i.test(stem))) {
    push('sin-gi-pi-one-one-onto', 'One-one / onto function MCQ — AI will restore stem and A–D.')
  }

  if (looksLikeOddFunctionAlphaGiMcq(blob) && (stillBroken || /Leen|x\^\\circ|\\lambda/i.test(stem))) {
    push('odd-fn-alpha-gi', 'Odd function + α parameter MCQ — AI will restore stem and α options.')
  }

  if (looksLikeAbsPiSinOneSidedLimitMcq(blob) && stillBroken) {
    push(
      'abs-pi-sin-one-sided-limit',
      '|x+π|/sin x one-sided limit MCQ — AI will restore stem and A–D text.',
    )
  }

  if (
    found >= 3 &&
    mcqLaterOptionsLookTruncated(options, blob) &&
    !issues.some((i) => i.id === 'abs-pi-sin-one-sided-limit')
  ) {
    push(
      'options-cd-truncated',
      'Options C/D look incomplete — AI will restore full text lines.',
    )
  }

  if (looksLikeDomainGreatestIntegerMcq(blob) && found < 4) {
    push('domain-gi-mcq', 'Domain + greatest-integer MCQ — AI will fill interval options.')
  }

  if (looksLikeTrigPeriodMcq(blob) && found < 4) {
    push('trig-period-t1t2', 'T₁/T₂ period MCQ — AI will restore canonical options.')
  }

  if (looksLikeCompositionIdentityMcq(blob) && found < 4) {
    push('composition-identity', 'Composition identity MCQ — AI repair.')
  }

  if (looksLikeFunctionPropertyMcq(blob) && found < 4) {
    push('function-property', 'f(x) property MCQ — AI repair.')
  }

  if (looksLikeInverseFunctionMcq(blob) && found < 4) {
    push('inverse-function', 'Inverse function MCQ — AI repair.')
  }

  if (looksLikeF0MoebiusFunctionalMcq(blob) && found < 4) {
    push('f0-moebius', 'f(0) Möbius functional equation — AI repair.')
  }

  if (looksLikeLimitGxQuestion(blob) && found < 4) {
    push('limit-gx', 'Limit g(x) MCQ — AI repair.')
  }

  if (looksLikeDeterminantQuestion(blob) && found < 4 && !looksLikePqrsPerpVectorMcq(blob)) {
    push('determinant-integer', 'Determinant integer MCQ — AI repair.')
  }

  if (stem.length > 40 && /\\\s+text\s*\{|\\\\text\{/i.test(stem)) {
    push('escaped-latex-text', 'Escaped \\text{} in stem — AI will normalize LaTeX.', 'warn')
  }

  if (/\bis\s*-\s*\\frac\s*\{\s*1\s*\}\s*\{\s*2\s*\}/i.test(stem) && /period\s+of/i.test(stem)) {
    push('spurious-half-tail', 'Spurious −1/2 tail on period stem — AI will remove.', 'warn')
  }

  for (const label of detectBrokenBankStem(stem)) {
    if (!issues.some((i) => i.id === 'latex-broken-smart')) {
      push('latex-broken-smart', `LaTeX needs fix: ${label}`)
    }
  }

  const seen = new Set()
  return issues.filter((i) => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
}

/**
 * Score how much repair is still needed (0 = clean, 100 = broken).
 * @param {{ stem?: string, options?: string[], rawOcr?: string, questionType?: string }} ctx
 */
export function uploadRepairUrgency(ctx = {}) {
  const blob = `${ctx.stem ?? ''}\n${(ctx.options ?? []).join('\n')}\n${ctx.rawOcr ?? ''}`
  const issues = runUploadIssueDetectors(blob, ctx)
  const found = countRealMcqOptions(ctx.stem, ctx.options)
  let score = issues.filter((i) => i.severity === 'error').length * 18
  score += issues.filter((i) => i.severity === 'warn').length * 8
  if (found < 4) score += (4 - found) * 12
  return Math.min(100, score)
}
