import assert from 'node:assert/strict'
import { CAREER_COMPASS_BASELINE } from '../src/data/careerCompassCatalog.js'
import { PLACEMENT_PACKAGE_FIELDS, PERCENTILE_CURVE_TITLE } from '../src/data/counsellingConstants.js'
import { TREND_GRID_YEARS } from '../src/data/ntaPublishedMarks.js'
import { COUNSELLING_PERCENTILE_GRIDS } from '../src/data/counsellingPercentileGrids.js'
import {
  applyCounsellingFillOverlay,
  buildRoundChanceBoard,
  getPercentileCurveTable,
  hasHalfPointPercentileLookup,
  lookupPercentileGrid,
} from '../src/utils/counsellingPredictor.js'
import { buildFormForecast } from '../src/utils/formForecast.js'

assert.equal(PLACEMENT_PACKAGE_FIELDS.length, 5)
assert.deepEqual(
  PLACEMENT_PACKAGE_FIELDS.map((f) => f.field),
  ['pctPlaced', 'avgLpa', 'medianLpa', 'lowestLpa', 'highestLpa'],
)

assert.ok(hasHalfPointPercentileLookup('jee-main', 99.0, '2024'), '99.0 lookup exists')
assert.ok(hasHalfPointPercentileLookup('jee-main', 99.5, '2024'), '99.5 lookup exists')
assert.ok(hasHalfPointPercentileLookup('jee-main', 99.5, '2022'))
assert.ok(hasHalfPointPercentileLookup('neet', 99.0, '2026'))

const row995 = lookupPercentileGrid('jee-main', 99.5, '2024')
assert.ok(row995, 'jee-main 99.5 row')
assert.equal(row995.percentile, 99.5)
assert.ok(row995.marks > 150, `99.5 marks should be high, got ${row995.marks}`)
assert.ok(row995.marksEasy > row995.marksTough, 'easy paper needs more marks than tough')
assert.ok(row995.air >= 1)

const row975y25 = lookupPercentileGrid('jee-main', 97.5, '2025')
assert.ok(row975y25.marks > 140 && row975y25.marks < 170, `2025 97.5 should be NTA session band, got ${row975y25.marks}`)
const row99y25 = lookupPercentileGrid('jee-main', 99, '2025')
assert.ok(row99y25.marks > 160 && row99y25.marks < 200, `2025 99 should be ~177 NTA, got ${row99y25.marks}`)
const row99y22 = lookupPercentileGrid('jee-main', 99, '2022')
if (row99y22?.marks != null) {
  assert.ok(row99y22.marks < 240, `2022 99 must not be an invented 280+ value, got ${row99y22.marks}`)
}

const gridYears = Object.keys(COUNSELLING_PERCENTILE_GRIDS['jee-main'])
assert.deepEqual(gridYears, ['2022', '2023', '2024', '2025', '2026'])

const curve = getPercentileCurveTable('jee-main', { highlightPercentile: 99.0, toughness: 'moderate', radius: 1 })
assert.ok(curve.rows.some((r) => r.percentile === 99))
assert.ok(curve.rows.some((r) => r.percentile === 99.5))
assert.ok(curve.rows.find((r) => r.percentile === 99)?.isHighlight)
assert.deepEqual(curve.trendYears, ['2024', '2025'])
assert.deepEqual(TREND_GRID_YEARS, ['2024', '2025'])
assert.ok(
  PERCENTILE_CURVE_TITLE.toLowerCase().includes('nta') ||
    PERCENTILE_CURVE_TITLE.toLowerCase().includes('0.5'),
)
assert.ok(!PERCENTILE_CURVE_TITLE.toLowerCase().includes('last 5 years'))
assert.ok(curve.sourceNote.includes('NTA') || curve.sourceNote.includes('compiled'))
assert.ok(curve.sourceNote.includes('2024'))
assert.ok(curve.sourceNote.includes('2025'))
assert.ok(!curve.sourceNote.toLowerCase().includes('last 5 years'))
assert.equal(curve.yearKind?.['2024'], 'nta')
assert.equal(curve.yearKind?.['2025'], 'nta')
assert.ok(curve.yearKind?.['2026'] === 'unknown' || curve.yearKind?.['2026'] === 'partial' || curve.yearKind?.['2026'] === 'nta')

const row99 = curve.rows.find((r) => r.percentile === 99)
assert.ok(row99)
const yPrev = row99.byYear[curve.trendYears[0]]
const yLast = row99.byYear[curve.trendYears[1]]
assert.ok(yPrev && yLast, 'trend year history columns present')
assert.ok(yPrev.marks != null && yLast.marks != null, 'trend years have published marks')
assert.ok(yLast.marks < 250, `99 percentile marks must be a real JEE Main table, got ${yLast.marks}`)
const expectedAir = Math.max(1, Math.round(yLast.air + (yLast.air - yPrev.air) * 0.35))
const expectedEasy = Math.round((yLast.marksEasy + (yLast.marksEasy - yPrev.marksEasy) * 0.35) * 10) / 10
const expectedTough = Math.round((yLast.marksTough + (yLast.marksTough - yPrev.marksTough) * 0.35) * 10) / 10
assert.equal(row99.air, expectedAir, 'Est. AIR uses latest two complete published years, not five-year blend')
assert.equal(row99.marksEasy, expectedEasy, 'Easy marks uses two-year trend')
assert.equal(row99.marksTough, expectedTough, 'Tough marks uses two-year trend')
assert.ok(row99.byYear['2022'], 'older years remain as history columns')
assert.ok(row99.byYear['2024']?.marks > 150 && row99.byYear['2024']?.marks < 230, '2024 99pct is NTA PDF band')
assert.ok(row99.byYear['2025']?.marks > 150 && row99.byYear['2025']?.marks < 220, '2025 99pct is NTA session band')
if (curve.yearKind?.['2026'] === 'unknown') {
  assert.equal(row99.byYear['2026']?.marks ?? null, null, 'unpublished 2026 is not a fake NTA column')
}

const trichy = CAREER_COMPASS_BASELINE.find((c) => c.id === 'nit-trichy')
assert.ok(trichy)
const [enriched] = applyCounsellingFillOverlay([trichy])
assert.equal(enriched.website, 'https://www.nitt.edu')
assert.ok(enriched.quotas?.length)
assert.ok(enriched.counsellingBody)
const cse = enriched.branches.find((b) => b.id === 'cse')
assert.ok(cse?.placement, 'CSE placement object exists')
assert.ok(
  cse.placement.placementSource === 'official' ||
    cse.placement.placementSource === 'unverified' ||
    cse.placement.placementSource === 'indicative',
  'placement is official, unverified, or indicative — not a silent guess',
)
if (cse.placement.placementSource === 'official') {
  assert.ok(
    ['pctPlaced', 'avgLpa', 'medianLpa', 'lowestLpa', 'highestLpa'].some(
      (f) => cse.placement[f] != null && Number.isFinite(Number(cse.placement[f])),
    ),
    'official placement has at least one published field',
  )
  assert.ok(String(cse.placement.sourceUrl || '').startsWith('https://'), 'official placement cites https source')
}
assert.ok(cse.roundCutoffs?.['2026']?.r1)
assert.ok(cse.roundCutoffs['2026'].r1 < cse.roundCutoffs['2026'].r6, 'R1 closes better than R6')

const board = buildRoundChanceBoard(2000, enriched, cse)
assert.ok(board.rounds.length >= 6)
assert.ok(board.latestChips.some((c) => c.id === 'r1'))
assert.ok(board.latestChips.every((c) => c.chanceLabel))

const emptyForecast = buildFormForecast([])
assert.equal(emptyForecast.hasAnyData, false)

console.log(
  `test-counselling-predictor: ok (99.5 marks=${row995.marks}, AIR=${row995.air}, trichy CSE placement ${cse.placement.placementSource})`,
)
