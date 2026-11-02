import assert from 'node:assert/strict'
import { autoRectifyUpload } from '../src/utils/uploadErrorBrain.js'
import { buildAiUploadReport, runAiUploadAssist } from '../src/utils/aiUploadAssist.js'
import {
  assessPostRepairStatus,
  buildRepairTicket,
} from '../src/utils/uploadRepairEscalation.js'

const garbledUnfixable =
  'gfl(x) sin ? x cos * x jlasamea Wx + x (A) | (s-a) | = bp (B) foo (C) bar (D) baz'

const initial = {
  stem: garbledUnfixable,
  options: ['| (s-a) | = bp', 'foo', 'bar', ''],
  rawOcr: garbledUnfixable,
  questionType: 'single_correct',
}

const rectified = autoRectifyUpload({ ...initial, maxPasses: 2 })
assert.ok(Array.isArray(rectified.repairAttempts), 'tracks repair attempts')
assert.ok(rectified.repairAttempts.length >= 1, 'logs at least one fix attempt')

const status = assessPostRepairStatus({
  stem: rectified.stem,
  options: rectified.options,
  rawOcr: rectified.rawOcr,
  questionType: rectified.questionType,
  repairSteps: rectified.steps,
  repairAttempts: rectified.repairAttempts,
  initialStem: initial.stem,
  initialOptions: initial.options,
  initialErrors: rectified.initialErrors,
})

assert.ok(status.needsAgentRepair, 'escalates when garbled OCR stays broken')
assert.ok(status.repairTicketText.includes('TestVantages upload repair ticket'))
assert.ok(status.repairTicketText.includes('Raw OCR'))
assert.match(status.escalationSummary, /Cursor/i)

const ticket = buildRepairTicket({
  stem: rectified.stem,
  options: rectified.options,
  rawOcr: garbledUnfixable,
  questionType: 'single_correct',
  quality: status.quality,
  unresolvedIssues: status.unresolvedIssues,
  repairSteps: rectified.steps,
  repairAttempts: rectified.repairAttempts,
  initialErrors: rectified.initialErrors,
})
assert.ok(ticket.id.startsWith('repair-'))
assert.ok(ticket.text.includes('repairRegistry.js'))

const assist = runAiUploadAssist(garbledUnfixable, { hasSourceImage: true })
const report = buildAiUploadReport(assist)
assert.ok(report.needsAgentRepair || report.confidence < 70, 'report flags bad upload')
if (report.needsAgentRepair) {
  assert.ok(report.repairTicketText?.length > 80)
  assert.equal(report.readyToSave, false)
}

const trigRaw = `Let f (x) = sin²x + cos⁴x + 2 and g (x) = cos (cos x) + cos (sin x). Also let fundamental period of f (x) and gfl(x) be T₁ and T₂ respectively then (A) T₁ = 2T₂ (B) 2T₁ = T₂ (C) T₁ = T₂ (D) T₁ = 4T₂`
const goodAssist = runAiUploadAssist(trigRaw, { hasSourceImage: true })
const goodReport = buildAiUploadReport(goodAssist)
assert.equal(goodReport.needsAgentRepair, false, 'does not escalate when repair succeeds')
assert.ok(goodReport.readyToSave || goodReport.confidence >= 65)

console.log('test-upload-repair-escalation: ok')
