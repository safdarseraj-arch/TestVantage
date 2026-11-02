/**
 * Exam Pulse — curated feed + normalize helpers.
 * Run: node scripts/test-exam-pulse.mjs
 */
import assert from 'node:assert/strict'
import {
  EXAM_PULSE_CATEGORIES,
  EXAM_PULSE_CURATED,
  EXAM_PULSE_OFFICIAL_PORTALS,
  EXAM_PULSE_RSS_FEEDS,
} from '../src/data/examPulseCurated.js'
import {
  dedupeExamPulseItems,
  ensureWhyItMatters,
  examPulseBadgeLabel,
  guessExamPulseCategory,
  isStudentRelevant,
  normalizeExamPulseBadge,
} from '../src/utils/examPulseNormalize.js'

assert.ok(EXAM_PULSE_CURATED.length >= 10, 'curated briefing has enough cards')
assert.equal(EXAM_PULSE_CATEGORIES.length, 4)
assert.ok(EXAM_PULSE_OFFICIAL_PORTALS.some((p) => p.id === 'nta'))
assert.ok(EXAM_PULSE_RSS_FEEDS.every((f) => /^https:\/\//i.test(f.url)))

for (const item of EXAM_PULSE_CURATED) {
  assert.ok(item.id && item.title && item.summary && item.sourceUrl)
  assert.ok(['exams', 'admissions', 'placements', 'motivation'].includes(item.category))
  assert.ok(['official', 'ai', 'curated', 'news'].includes(item.badge))
  assert.ok(item.whyItMatters && item.whyItMatters.length >= 12, `${item.id} has whyItMatters`)
  assert.ok(/^https?:\/\//i.test(item.sourceUrl), `${item.id} has http(s) source`)
}

assert.equal(guessExamPulseCategory('JEE Main admit card', '', 'admissions'), 'exams')
assert.equal(guessExamPulseCategory('JoSAA seat allotment round', '', 'exams'), 'admissions')
assert.equal(guessExamPulseCategory('Campus placement internship tips', '', 'exams'), 'placements')
assert.equal(guessExamPulseCategory('Study habits for focus', '', 'exams'), 'motivation')

assert.equal(isStudentRelevant('NEET UG counselling dates', ''), true)
assert.equal(isStudentRelevant('Bollywood horoscope cricket score', ''), false)

assert.equal(normalizeExamPulseBadge('official'), 'official')
assert.equal(normalizeExamPulseBadge('AI'), 'ai')
assert.equal(normalizeExamPulseBadge('weird', 'curated'), 'curated')
assert.equal(examPulseBadgeLabel('official'), 'Official source')
assert.equal(examPulseBadgeLabel('ai'), 'AI summary')
assert.equal(examPulseBadgeLabel('curated'), 'Curated')

const why = ensureWhyItMatters('', 'Short summary for students about NTA.', 'exams')
assert.ok(why.includes('aspirants') || why.includes('official'), 'why fallback is student-facing')

const duped = dedupeExamPulseItems([
  { ...EXAM_PULSE_CURATED[0], id: 'a' },
  { ...EXAM_PULSE_CURATED[0], id: 'b' },
  EXAM_PULSE_CURATED[1],
])
assert.equal(duped.length, 2)

const cats = new Set(EXAM_PULSE_CURATED.map((i) => i.category))
assert.ok(cats.has('exams') && cats.has('admissions') && cats.has('placements') && cats.has('motivation'))

console.log('test-exam-pulse: ok')
