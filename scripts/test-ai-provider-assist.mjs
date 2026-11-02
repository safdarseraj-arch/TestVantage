/**
 * Provider fallback + Career/Mock local explain + learning store.
 */
import assert from 'node:assert/strict'

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  }
}

const {
  buildCareerCompassExplainLocal,
} = await import('../src/utils/careerCompassAiExplain.js')
const {
  buildMockBuilderNarrativeLocal,
} = await import('../src/utils/mockBuilderAiAssist.js')
const {
  recordLocalAiLearningExample,
  getLocalAiLearningStats,
  clearLocalAiLearningStore,
  findSimilarLocalAiExample,
  applyLocalAiLearnedCorrections,
} = await import('../src/utils/localAiLearningStore.js')
const { classifyMcqImageLayout } = await import('../src/utils/mcqImageLayoutPlan.js')
const { aiAssistBadgeLabel } = await import('../src/utils/aiProviderAssist.js')

clearLocalAiLearningStore()

const cc = buildCareerCompassExplainLocal({
  examLabel: 'JEE Main',
  prediction: { marks: 180, percentile: 97.5, rank: 25000, bandHint: 'strong band', category: 'general' },
  topMatches: [{ name: 'NIT Example', branch: 'CSE', chance: 'Match', reason: 'Near cutoff' }],
})
assert.match(cc.text, /Official numbers/i)
assert.match(cc.text, /25000/)
assert.match(cc.text, /NIT Example/)
assert.ok(cc.disclaimer)

const {
  buildCounsellingGuideLocal,
  buildChoiceFillingOrder,
} = await import('../src/utils/careerCompassCounsellingGuide.js')
const order = buildChoiceFillingOrder([
  { band: 'match', avgCutoff: 20000, score: 70, college: { id: 'n1', type: 'nit', shortName: 'NIT-1', name: 'NIT 1' }, branch: { id: 'cse', name: 'CSE' } },
  { band: 'safe', avgCutoff: 50000, score: 90, college: { id: 'n2', type: 'nit', shortName: 'NIT-2', name: 'NIT 2' }, branch: { id: 'me', name: 'ME' } },
], { counsellingType: 'josaa' })
const guide = buildCounsellingGuideLocal({
  counsellingLabel: 'JoSAA',
  examLabel: 'JEE Main',
  rank: 22000,
  order,
})
assert.match(guide.text, /Choice Filling Guide/i)
assert.match(guide.text, /22,000/)
assert.ok(guide.disclaimer)

const mock = buildMockBuilderNarrativeLocal({
  profileLabel: 'Balanced',
  questionCount: 30,
  syllabusCoverage: 80,
  chapterHints: ['Matrices', 'Electrostatics'],
})
assert.match(mock.text, /Mock paper plan/i)
assert.match(mock.text, /Matrices/)

assert.equal(aiAssistBadgeLabel('cloud-vision'), 'Cloud (Gemini)')
assert.equal(aiAssistBadgeLabel('local'), 'Local AI')

recordLocalAiLearningExample({
  cloudStem: 'career:jee-main:25000:180',
  cloudSolution: cc.text,
  provider: 'cloud-vision',
  topic: 'career_compass_explain',
})
recordLocalAiLearningExample({
  cloudStem: 'mock:jee-main:Balanced:30',
  cloudSolution: mock.text,
  provider: 'cloud-vision',
  topic: 'mock_builder_narrative',
})
const stats = getLocalAiLearningStats()
assert.ok(stats.exampleCount >= 2, 'learning store keeps career + mock examples')

const similar = findSimilarLocalAiExample('career:jee-main:25000:180 explain ranks')
assert.ok(similar, 'find similar career learning example')

// Mock Gemini failure path: runAiAssistWithFallback with useCloudVision false
const { saveOcrSettings, loadOcrSettings } = await import('../src/utils/ocrSettings.js')
const prev = loadOcrSettings()
saveOcrSettings({ useCloudVision: false })
const { runAiAssistWithFallback } = await import('../src/utils/aiProviderAssist.js')
const fb = await runAiAssistWithFallback({
  task: 'test_fallback',
  localText: 'Local only text',
  localDisclaimer: 'local',
  recordLearning: false,
})
assert.equal(fb.provider, 'local')
assert.equal(fb.text, 'Local only text')
assert.equal(fb.cloudAttempted, false)
saveOcrSettings(prev)

// Adaptive layout still classifies figure_text
const fig = classifyMcqImageLayout({
  stem: 'In the circuit shown, A and B are equal resistances. When S is closed, the capacitor C charges',
  options: [
    'During charging, more heat is produced in A than in B.',
    'In the steady state, heat is produced at the same rate in A and B.',
    'In the steady state, energy stored in C is $1/4 CE^2$.',
    'In the steady state, energy stored in C is $1/8 CE^2$.',
  ],
  extractedRaw: 'In the circuit shown, A and B are equal resistances.',
})
assert.equal(fig.kind, 'figure_text')

console.log('test-ai-provider-assist: ok')
