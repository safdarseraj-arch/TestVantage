/**
 * Choice Filling Guide — AI ordering (placement / salary / prefs) + local narrative.
 */
import assert from 'node:assert/strict'

const {
  CHOICE_FILLING_TAB,
  CHOICE_ORDER_PRINCIPLES,
  MAX_FILL_ADVICE,
  PAST_NOT_FUTURE_WARNING,
  buildChoiceFillingOrder,
  buildCounsellingGuideLocal,
  counsellingTypesForExam,
  defaultCounsellingTypeForExam,
  extractPlacementSignals,
  filterMatchesForCounselling,
  getCounsellingGuideSections,
  getCounsellingOfficialLinks,
  parsePositiveAir,
  scoreChoiceCandidate,
  sortBandByAiSignals,
  sortBandByPreference,
} = await import('../src/utils/careerCompassCounsellingGuide.js')

assert.match(MAX_FILL_ADVICE, /as many preferences|maximum/i)
assert.match(PAST_NOT_FUTURE_WARNING, /cannot guarantee/i)
assert.ok(CHOICE_ORDER_PRINCIPLES.some((p) => /maximum|as many/i.test(p)))
assert.ok(CHOICE_ORDER_PRINCIPLES.some((p) => /do not guarantee|cannot guarantee|not guarantee/i.test(p)))

assert.equal(parsePositiveAir('12500'), 12500)
assert.equal(parsePositiveAir(' 1 '), 1)
assert.equal(parsePositiveAir('0'), null)
assert.equal(parsePositiveAir('-3'), null)
assert.equal(parsePositiveAir('12.5'), null)
assert.equal(parsePositiveAir(''), null)
assert.equal(parsePositiveAir('abc'), null)

assert.equal(CHOICE_FILLING_TAB.name, 'Choice Filling Guide')
assert.match(CHOICE_FILLING_TAB.subtitle, /AI-guided/i)
assert.ok(CHOICE_ORDER_PRINCIPLES.length >= 4)

assert.equal(defaultCounsellingTypeForExam('neet'), 'mcc')
assert.equal(defaultCounsellingTypeForExam('jee-main'), 'josaa')
assert.equal(defaultCounsellingTypeForExam('jee-advanced'), 'josaa')

assert.deepEqual(
  counsellingTypesForExam('neet').map((t) => t.id),
  ['mcc'],
)
assert.ok(counsellingTypesForExam('jee-main').some((t) => t.id === 'josaa'))
assert.ok(counsellingTypesForExam('jee-main').some((t) => t.id === 'csab'))

const sample = [
  { band: 'dream', avgCutoff: 800, score: 20, trend: 'flat', college: { id: 'a', type: 'iit', shortName: 'IIT-A', name: 'IIT A', state: 'Uttar Pradesh' }, branch: { id: 'cse', name: 'CSE' } },
  { band: 'dream', avgCutoff: 1200, score: 18, trend: 'flat', college: { id: 'b', type: 'iit', shortName: 'IIT-B', name: 'IIT B', state: 'Maharashtra' }, branch: { id: 'cse', name: 'CSE' } },
  { band: 'reach', avgCutoff: 5000, score: 40, trend: 'up', college: { id: 'c', type: 'nit', shortName: 'NIT-C', name: 'NIT C', state: 'Rajasthan' }, branch: { id: 'cse', name: 'CSE' } },
  { band: 'match', avgCutoff: 15000, score: 70, trend: 'flat', college: { id: 'd', type: 'nit', shortName: 'NIT-D', name: 'NIT D', state: 'Delhi' }, branch: { id: 'ece', name: 'ECE' } },
  { band: 'match', avgCutoff: 12000, score: 75, trend: 'flat', college: { id: 'e', type: 'iiit', shortName: 'IIIT-E', name: 'IIIT E', state: 'Delhi' }, branch: { id: 'cse', name: 'CSE' } },
  { band: 'safe', avgCutoff: 40000, score: 90, trend: 'down', college: { id: 'f', type: 'gfti', shortName: 'GFTI-F', name: 'GFTI F', state: 'Goa' }, branch: { id: 'me', name: 'ME' } },
  { band: 'safe', avgCutoff: 35000, score: 88, trend: 'flat', college: { id: 'g', type: 'nit', shortName: 'NIT-G', name: 'NIT G', state: 'Kerala' }, branch: { id: 'ce', name: 'CE' } },
  { band: 'dream', avgCutoff: 900, score: 22, trend: 'flat', college: { id: 'med', type: 'medical', shortName: 'AIIMS', name: 'AIIMS', state: 'Delhi' }, branch: { id: 'mbbs', name: 'MBBS' } },
]

const sortedSafe = sortBandByPreference(sample.filter((m) => m.band === 'safe'))
assert.equal(sortedSafe[0].college.id, 'g', 'without placement, lower avg cutoff ranks first in band')

const josaa = buildChoiceFillingOrder(sample, { counsellingType: 'josaa', maxDream: 2, maxReach: 2, maxMatch: 2, maxSafe: 2 })
assert.ok(josaa.ordered.length >= 5)
assert.equal(josaa.ordered[0].band, 'dream')
assert.equal(josaa.ordered[0].preference, 1)
assert.ok(!josaa.ordered.some((r) => r.college.type === 'medical'), 'JoSAA excludes medical')
assert.ok(josaa.ordered[0].whyNotes?.length >= 1)
assert.ok(josaa.preferenceFit?.summary)
const bands = josaa.ordered.map((r) => r.band)
const firstSafe = bands.indexOf('safe')
const lastMatch = bands.lastIndexOf('match')
assert.ok(firstSafe === -1 || lastMatch < firstSafe, 'safe comes after match')

// Similar cutoffs: higher placement/salary should win inside the band
const lowPay = {
  band: 'match',
  avgCutoff: 20000,
  score: 70,
  trend: 'flat',
  college: { id: 'low', type: 'nit', shortName: 'NIT-Low', name: 'NIT Low', state: 'Bihar' },
  branch: { id: 'cse', name: 'Computer Science' },
  branchPlacement: { avgLpa: 9, medianLpa: 8, pctPlaced: 72, placementSource: 'indicative' },
}
const highPay = {
  band: 'match',
  avgCutoff: 20500,
  score: 68,
  trend: 'up',
  college: { id: 'high', type: 'nit', shortName: 'NIT-High', name: 'NIT High', state: 'Karnataka' },
  branch: { id: 'cse', name: 'Computer Science' },
  branchPlacement: { avgLpa: 28, medianLpa: 22, pctPlaced: 94, highestDomesticLpa: 60, placementSource: 'indicative' },
}
const placementOrder = buildChoiceFillingOrder([lowPay, highPay], { counsellingType: 'josaa' })
assert.equal(placementOrder.ordered[0].college.id, 'high', 'higher placement/salary boosts among similar cutoffs')
assert.match(placementOrder.ordered[0].whyNotes.join(' '), /Salary signal/i)
assert.equal(placementOrder.ordered[0].placementBadge, 'indicative')

const scoredHigh = scoreChoiceCandidate(highPay, { bandMedianCutoff: 20250 })
const scoredLow = scoreChoiceCandidate(lowPay, { bandMedianCutoff: 20250 })
assert.ok(scoredHigh.total > scoredLow.total, 'scoreChoiceCandidate prefers stronger placement')

const signals = extractPlacementSignals(highPay)
assert.equal(signals.avgLpa, 28)
assert.equal(signals.source, 'indicative')
assert.equal(extractPlacementSignals({ college: {} }).salaryLabel.includes('Not') || extractPlacementSignals({ college: {} }).avgLpa == null, true)

// Preferred branch boost among similar cutoffs
const prefOrder = buildChoiceFillingOrder(
  [
    { ...lowPay, college: { ...lowPay.college, id: 'ece-camp' }, branch: { id: 'ece', name: 'Electronics' }, branchPlacement: { avgLpa: 20, pctPlaced: 90, placementSource: 'indicative' } },
    { ...highPay, college: { ...highPay.college, id: 'cse-camp' }, avgCutoff: 20800, branchPlacement: { avgLpa: 18, pctPlaced: 88, placementSource: 'indicative' } },
  ],
  { counsellingType: 'josaa', preferredBranchId: 'cse' },
)
assert.equal(prefOrder.ordered[0].college.id, 'cse-camp', 'preferred branch boosts when salaries are close')
assert.ok(prefOrder.ordered[0].preferenceLabels.includes('Preferred branch'))

const aiSorted = sortBandByAiSignals([lowPay, highPay])
assert.equal(aiSorted[0].match.college.id, 'high')

const csab = buildChoiceFillingOrder(sample, { counsellingType: 'csab' })
assert.ok(csab.ordered.every((r) => ['nit', 'iiit', 'gfti'].includes(r.college.type)))
assert.ok(!csab.ordered.some((r) => r.college.type === 'iit'))

const mcc = buildChoiceFillingOrder(sample, { counsellingType: 'mcc' })
assert.ok(mcc.ordered.every((r) => r.college.type === 'medical'))
assert.equal(mcc.counts.total, 1)

const filtered = filterMatchesForCounselling(sample, 'csab')
assert.ok(filtered.every((m) => m.college.type !== 'iit' && m.college.type !== 'medical'))

const sections = getCounsellingGuideSections('josaa')
assert.ok(sections.some((s) => s.id === 'what'))
assert.ok(sections.some((s) => s.id === 'options'))
assert.ok(sections.find((s) => s.id === 'options').body.some((b) => /Freeze/i.test(b)))

const mccSections = getCounsellingGuideSections('mcc')
assert.ok(mccSections.find((s) => s.id === 'rounds').body.some((b) => /MCC/i.test(b)))

const links = getCounsellingOfficialLinks('josaa')
assert.equal(links.length, 1)
assert.equal(links[0].id, 'josaa')
assert.ok(/^https:\/\//.test(links[0].url))

const allLinks = getCounsellingOfficialLinks()
assert.ok(allLinks.some((l) => l.id === 'csab'))
assert.ok(allLinks.some((l) => l.id === 'mcc'))

const local = buildCounsellingGuideLocal({
  counsellingLabel: 'JoSAA',
  examLabel: 'JEE Main',
  rank: 25000,
  category: 'General / UR',
  stateLabel: 'Uttar Pradesh',
  preferredBranchLabel: 'CSE',
  order: placementOrder,
})
assert.match(local.text, /Choice Filling Guide/)
assert.match(local.text, /Predicted AIR/)
assert.match(local.text, /25,000/)
assert.match(local.text, /\(AI\)/)
assert.match(local.text, /Suggested fill order/)
assert.match(local.text, /CSE/)
assert.match(local.text, /Fill as many as you can/i)
assert.match(local.text, /as many preferences|maximum/i)
assert.match(local.text, /cannot guarantee/i)
assert.ok(local.disclaimer)
assert.match(local.disclaimer, /not official counselling/i)
assert.match(local.disclaimer, /cannot guarantee/i)
assert.doesNotMatch(local.text, /Local AI|Gemini|Cloud \(Gemini\)/)

const localActual = buildCounsellingGuideLocal({
  counsellingLabel: 'JoSAA',
  examLabel: 'JEE Main',
  rank: 8901,
  rankSource: 'actual',
  categoryRank: 2100,
  percentile: 98.5,
  category: 'OBC-NCL',
  order: placementOrder,
})
assert.match(localActual.text, /Actual AIR/)
assert.match(localActual.text, /8,901/)
assert.match(localActual.text, /Category rank/)
assert.match(localActual.text, /2,100/)
assert.match(localActual.text, /98\.50/)
assert.doesNotMatch(localActual.text, /Predicted AIR/)

const prefs = josaa.ordered.map((r) => r.preference)
assert.deepEqual(prefs, prefs.map((_, i) => i + 1))

console.log('test-career-compass-counselling-guide: ok')
