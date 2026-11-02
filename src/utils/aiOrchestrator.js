/**
 * AI Orchestrator — single entry for TestVantages's five AI pillars:
 * 1. Upload (hybrid OCR + LaTeX + assist) — Cloud (Gemini) when ready, else Local
 * 2. Paper creation (aiPaperTuning + Mock Builder narrative)
 * 3. Test & practice selection (aiSessionPick + aiAdaptiveEngine)
 * 4. Result coach (resultInsights)
 * 5. Analytics & chapter strength (aiMastery + analytics)
 * 6. Career Compass explain (Official ranks local; Gemini wording optional)
 *
 * Pattern: Gemini first when key + ready → Local fallback → learn from Gemini on accept/save.
 * New question / similar / replica generation: use hybridAiClient.js (Hybrid AI), not /vision/scq-trial.
 */

export { runAiUploadAssist, buildAiUploadReport, aiReadinessCheck, enhanceMcqFromOcr } from './aiUploadAssist.js'
export { runAiAssistWithFallback, aiAssistBadgeLabel } from './aiProviderAssist.js'
export { explainCareerCompassPrediction, buildCareerCompassExplainLocal } from './careerCompassAiExplain.js'
export {
  explainCounsellingChoiceGuide,
  buildCounsellingGuideLocal,
  buildChoiceFillingOrder,
  scoreChoiceCandidate,
  sortBandByAiSignals,
} from './careerCompassCounsellingGuide.js'
export { narrateMockBuilderPlan, buildMockBuilderNarrativeLocal } from './mockBuilderAiAssist.js'
export {
  buildDocumentStructureFromSource,
  parseFromDocumentStructure,
  runStructureAwareParse,
} from './structureAwareUpload.js'
export { routeUploadExtract, routeUploadWithOnnxEnrich } from './uploadStructureRouter.js'
export { buildOnnxEnrichedStructure, structureHasOnnxMath } from './onnxStructureEnrich.js'
export { applyMcqParseRepairs, MCQ_PARSE_REPAIR_PLUGINS, runRepairPluginScan } from './repairRegistry.js'
export { runUploadIssueDetectors, uploadRepairUrgency } from './uploadIssueDetectors.js'
export { detectUploadErrors, autoRectifyUpload, assessUploadQualityFull } from './uploadErrorBrain.js'
export {
  assessPostRepairStatus,
  buildRepairTicket,
  listRepairTicketQueue,
  saveRepairTicketToQueue,
} from './uploadRepairEscalation.js'
export { aiTunePaper, AI_TUNE_PROFILES } from './aiPaperTuning.js'
export {
  pickAiPracticeQuestions,
  pickAiAdaptiveSectionQuestions,
  pickNextAiItemByAbility,
  buildAiSectionPickReport,
} from './aiSessionPick.js'
export {
  updateAbilityAfterItem,
  standingFromLiveAbility,
  abilityForNextSubject,
  nextSectionDifficulty,
} from './aiAdaptiveEngine.js'
export { buildResultCoachInsights, compareWithPreviousAttempt, computePerformanceGrade } from './resultInsights.js'
export { buildInsightCoachLocal, runInsightCoach } from './insightCoach.js'
export { buildUserAnalytics } from './analytics.js'
export {
  buildMasteryGraph,
  buildAiStudyPlan,
  pickWeakChaptersForStudy,
  recommendedToughnessFromMastery,
  savePracticePrefill,
  loadPracticePrefill,
  masteryPickBonus,
} from './aiMastery.js'
export {
  recordItemResponsesFromResult,
  getEffectiveQuestionToughness,
  getItemCalibrationReport,
} from './itemResponseStats.js'

/** Product-facing AI capability map (for docs / admin UI). */
export const AI_PILLARS = [
  {
    id: 'upload',
    label: 'Upload Question',
    features: [
      'Hybrid Tesseract + ONNX LaTeX OCR (nougat-latex)',
      'Mathpix-style line_data + word_data geometry MCQ split',
      'Document structure zones — stem / options / columns / passage / diagram (local)',
      'Word-level ONNX on math/garbled tokens + line retry',
      'PDF vector text with subscript/superscript from glyph positions',
      'Local quality boost — second ONNX pass, no cloud API',
      'AI type detection (SCQ / MSQ / IVQ / MTC / passage)',
      'Unified error brain — detect + auto-fix OCR/parsing issues',
      'Diagram + graph option auto-crop',
      'Quality gate before Save',
    ],
  },
  {
    id: 'paper',
    label: 'Test Paper Creation',
    features: [
      '16-attempt AI paper tuning',
      'JEE Main / Challenge / PYQ profiles',
      'TQS + syllabus coverage scoring',
      'Readiness-weighted question picks',
    ],
  },
  {
    id: 'selection',
    label: 'Question Selection',
    features: [
      'Weak-topic smart practice picks',
      'GRE-style item-level CAT (calibrated papers)',
      'Live ability score 1–10 during exam',
      'Section difficulty handoff',
    ],
  },
  {
    id: 'result',
    label: 'Result',
    features: [
      'AI performance coach',
      'Weak chapter diagnosis',
      'Compare vs previous attempt',
      'One-click practice prefill',
    ],
  },
  {
    id: 'analytics',
    label: 'Analysis',
    features: [
      'Chapter strength map',
      'Personalised learning path',
      'Percentile trend + activity',
      'Insight Coach — Form Forecast / Exam Fit / Precision Map narrative',
      'Closed-loop links to practice & mocks',
    ],
  },
]

import { buildAiStudyPlan } from './aiMastery.js'

/**
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 */
export function buildUnifiedAiSnapshot(attempts = []) {
  const plan = buildAiStudyPlan(attempts)
  return {
    pillars: AI_PILLARS,
    mastery: plan.mastery,
    studyPlan: plan,
    ready: attempts.length > 0,
  }
}
