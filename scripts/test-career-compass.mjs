import assert from 'node:assert/strict'
import { CAREER_COMPASS_BASELINE } from '../src/data/careerCompassCatalog.js'
import {
  COUNSELLING_YEARS,
  HISTORY_YEARS,
  MARKS_RANK_HISTORY,
  NTA_MARKS_YEARS,
  RECENT_NTA_YEARS,
  TREND_NTA_YEARS,
} from '../src/data/careerCompassHistory.js'
import {
  JEE_MAIN_2024_PDF_BENCHMARKS,
  marksToPercentileFromSessions,
  JEE_MAIN_JAN_2024_SESSIONS,
  JEE_MAIN_APR_2024_SESSIONS,
} from '../src/data/jeeMain2024PdfCurves.js'
import {
  PLACEMENT_SALARY_ROWS,
  PREDICT_TARGET_YEAR,
  buildBranchCompareRows,
  buildBranchProfile,
  branchPlacementStats,
  computeRankPercentileRange,
  exploreCollegesByBranch,
  formatBranchLabel,
  formatPlacementField,
  formatPlacementLpa,
  getCollegeOfficialLinks,
  getCompassSourceById,
  getOfficialReferenceBundle,
  interpolateMarksToPercentile,
  placementSalaryValue,
  predictColleges,
  getMarksRankBands,
  predictRankPercentile,
  projectMarksToRank2027,
  avgCutoff,
} from '../src/utils/careerCompassPredict.js'
import { getAdaptiveMarksHistory } from '../src/utils/careerCompassBrain.js'
import { buildOfficialCareerCompassBundle, collegeHasOfficialCutoffTags } from '../src/utils/careerCompassOfficialMerge.js'

assert.equal(PREDICT_TARGET_YEAR, 2027)
assert.deepEqual(HISTORY_YEARS, COUNSELLING_YEARS)
assert.deepEqual(COUNSELLING_YEARS, ['2024', '2025', '2026'])
assert.equal(NTA_MARKS_YEARS.length, 11)
assert.equal(NTA_MARKS_YEARS[0], '2016')
assert.equal(NTA_MARKS_YEARS[NTA_MARKS_YEARS.length - 1], '2026')
assert.deepEqual(RECENT_NTA_YEARS, ['2024', '2025', '2026'])
assert.deepEqual(TREND_NTA_YEARS, ['2024', '2025'])
assert.ok(getAdaptiveMarksHistory()['jee-main'])

// --- Anchor sanity: monotonic marks → percentile per exam/year ---
for (const examId of ['jee-main', 'jee-advanced', 'neet']) {
  for (const year of NTA_MARKS_YEARS) {
    const curve = MARKS_RANK_HISTORY[examId]?.[year] ?? []
    assert.ok(curve.length >= 8, `${examId} ${year} has anchors`)
    for (let i = 1; i < curve.length; i++) {
      assert.ok(
        curve[i].marks > curve[i - 1].marks,
        `${examId} ${year} marks ascending at i=${i}`,
      )
      assert.ok(
        curve[i].percentile >= curve[i - 1].percentile,
        `${examId} ${year} percentile monotonic at marks ${curve[i].marks}`,
      )
      if (curve[i].air > 1 && curve[i - 1].air > 1) {
        assert.ok(
          curve[i].air <= curve[i - 1].air,
          `${examId} ${year} AIR improves with marks at ${curve[i].marks}`,
        )
      }
    }
    const top = curve[curve.length - 1]
    assert.equal(top.air, 1, `${examId} ${year} top anchor AIR 1`)
  }
}

const officialBundle = buildOfficialCareerCompassBundle()
assert.ok(officialBundle.colleges.length >= 80)
assert.ok(officialBundle.marksHistory['jee-main'])
assert.ok(officialBundle.sourcesUsed.includes('NTA'))
assert.ok(officialBundle.sourcesUsed.includes('JoSAA'))
assert.equal(officialBundle.ntaMarksYears.length, 11)
const taggedCollege = officialBundle.colleges.find((c) => c.type === 'nit')
assert.ok(taggedCollege?.dataSource === 'josaa')
assert.ok(collegeHasOfficialCutoffTags(taggedCollege))
const taggedBranch = taggedCollege.branches[0]
assert.equal(taggedBranch.cutoffSources['2026'], 'josaa')
assert.equal(taggedBranch.cutoffs['2026'], CAREER_COMPASS_BASELINE.find((c) => c.id === taggedCollege.id).branches[0].cutoffs['2026'])
const ntaAnchor = officialBundle.marksHistory['jee-main']['2026'].find((a) => a.marks === 180)
assert.equal(ntaAnchor?.source, 'nta')

assert.equal(PLACEMENT_SALARY_ROWS.length, 5)
assert.equal(formatPlacementLpa(12.5), '₹12.5 L')

const samplePlacement = { lowestLpa: 7, avgLpa: 22, medianLpa: 17, highestDomesticLpa: 65, highestIntlLpa: 110 }
assert.equal(placementSalaryValue(samplePlacement, 'avgLpa'), 22)

assert.ok(CAREER_COMPASS_BASELINE.length >= 80)
const sample = CAREER_COMPASS_BASELINE[0].branches[0]
assert.ok(COUNSELLING_YEARS.every((y) => Number.isFinite(sample.cutoffs[y])), 'cutoffs use 2024–2026')

// JEE Main 180 — 2027 trend from latest two complete published years (2024+2025)
const marks180 = projectMarksToRank2027('jee-main', 180)
assert.ok(marks180.percentile >= 98.0 && marks180.percentile <= 99.7, `180 marks proj ~98-99.5%, got ${marks180.percentile}`)
assert.ok(marks180.air >= 5_000 && marks180.air <= 40_000, `180 marks AIR from 2024-2025 trend, got ${marks180.air}`)
assert.deepEqual(marks180.ntaYearsUsed, ['2024', '2025'], 'rank trend uses latest two complete published years')

// PDF-derived 2024 curve — must track Jan/Apr session tables within tight bands
const curve2024 = MARKS_RANK_HISTORY['jee-main']['2024']
for (const bench of JEE_MAIN_2024_PDF_BENCHMARKS) {
  const pct = interpolateMarksToPercentile(curve2024, bench.marks)
  assert.ok(
    Math.abs(pct - bench.moderate) <= 0.65,
    `2024 PDF moderate ${bench.marks} marks: expected ~${bench.moderate}%, got ${pct} (${bench.note})`,
  )
  const janPct = marksToPercentileFromSessions(JEE_MAIN_JAN_2024_SESSIONS, bench.marks)
  const aprPct = marksToPercentileFromSessions(JEE_MAIN_APR_2024_SESSIONS, bench.marks)
  assert.ok(
    Math.abs(janPct - bench.jan) <= 0.65,
    `Jan'24 PDF ${bench.marks} marks: expected ~${bench.jan}%, got ${janPct}`,
  )
  assert.ok(
    Math.abs(aprPct - bench.apr) <= 0.65,
    `Apr'24 PDF ${bench.marks} marks: expected ~${bench.apr}%, got ${aprPct}`,
  )
}

const easy180 = predictRankPercentile({ examId: 'jee-main', marks: 180, toughness: 'easy' })
const mod180 = predictRankPercentile({ examId: 'jee-main', marks: 180, toughness: 'moderate' })
const tough180 = predictRankPercentile({ examId: 'jee-main', marks: 180, toughness: 'tough' })

assert.ok(easy180.percentileMid < mod180.percentileMid, `easy (${easy180.percentileMid}) < moderate (${mod180.percentileMid})`)
assert.ok(mod180.percentileMid < tough180.percentileMid, `moderate < tough`)
assert.ok(easy180.rankMid > mod180.rankMid, 'easy rank worse than moderate')
assert.ok(mod180.rankMid > tough180.rankMid, 'moderate rank worse than tough')
assert.ok(easy180.percentileLow < tough180.percentileLow, 'easy percentile floor lower than tough')
assert.ok(easy180.rankLow > tough180.rankLow, 'easy rank floor worse than tough')

const fromMarks = projectMarksToRank2027('jee-main', 200)
assert.ok(fromMarks.percentile > 98.8)
assert.ok(fromMarks.air > 0 && fromMarks.air < 25_000)

const pred = predictRankPercentile({
  examId: 'jee-main',
  marks: 200,
  stateId: 'maharashtra',
  toughness: 'moderate',
})
assert.ok(pred.rank > 0)
assert.equal(pred.rankMid, pred.rank)
assert.equal(pred.percentileMid, pred.percentile)
assert.equal(pred.ntaMarksYears.length, 11)
assert.deepEqual(pred.ntaTrendYears, ['2024', '2025'])

const toughRange = computeRankPercentileRange({
  examId: 'jee-main',
  rank: 50_000,
  percentile: 97,
  toughness: 'tough',
  stateId: 'maharashtra',
})
const modRange = computeRankPercentileRange({
  examId: 'jee-main',
  rank: 50_000,
  percentile: 97,
  toughness: 'moderate',
  stateId: 'maharashtra',
})
assert.ok(toughRange.percentileMid > modRange.percentileMid, 'tough shifts percentile up')
assert.ok(toughRange.rankMid < modRange.rankMid, 'tough shifts rank down (better)')

const durgapur = CAREER_COMPASS_BASELINE.find((c) => c.id === 'nit-durgapur')
const meghalaya = CAREER_COMPASS_BASELINE.find((c) => c.id === 'nit-meghalaya')
assert.ok(durgapur && meghalaya)
const durgapurMe = branchPlacementStats(durgapur.placement, 'me')
const meghalayaCse = branchPlacementStats(meghalaya.placement, 'cse')
assert.ok(Number.isFinite(meghalayaCse.avgLpa) && Number.isFinite(durgapurMe.avgLpa), 'branch placement stats exist')
assert.notEqual(durgapur.placement.lowestLpa, meghalaya.placement.lowestLpa, 'lowest varies by college')

const trichy = CAREER_COMPASS_BASELINE.find((c) => c.id === 'nit-trichy')
const cseBranch = trichy.branches.find((b) => b.id === 'cse')
const profile = buildBranchProfile(trichy, cseBranch)
assert.equal(profile.branchLabel, formatBranchLabel(trichy, cseBranch))
assert.ok(profile.placement.avgLpa > trichy.placement.avgLpa * 0.9, 'branch profile has CSE-adjusted salary')
assert.ok(profile.avgCutoff > 0)

const matches = predictColleges(pred.rank, 'jee-main', { limit: 10, rankLow: pred.rankLow, rankHigh: pred.rankHigh })
assert.ok(matches.length > 0)
assert.ok(matches[0].branchProfile?.branchLabel, 'predictor includes branch profile')

const cse = exploreCollegesByBranch('jee-main', 'cse', { limit: 15 })
assert.ok(cse.length >= 5)

const picks = cse.slice(0, 3).map((m) => ({ collegeId: m.college.id, branchId: m.branch.id }))
const rows = buildBranchCompareRows(picks)
assert.equal(rows.length, 3)
assert.ok(rows[0].branchLabel.includes('@'), 'compare row uses branch @ college label')
if (placementSalaryValue(rows[0].placement, 'lowestLpa') != null) {
  assert.ok(Number(placementSalaryValue(rows[0].placement, 'lowestLpa')) > 0)
}

const josaa = getCompassSourceById('josaa')
assert.ok(josaa?.verifyUrl)

// NEET 690 — NTA Re-NEET 2026 press: 138 scored >690; ~99.87% / AIR ~2.5k
const neet690mod = predictRankPercentile({
  examId: 'neet',
  marks: 690,
  toughness: 'moderate',
  stateId: 'uttar-pradesh',
})
assert.ok(neet690mod.percentileMid < 100, `NEET 690 moderate pct < 100, got ${neet690mod.percentileMid}`)
assert.ok(neet690mod.percentileMid >= 99.85 && neet690mod.percentileMid <= 99.89, `NEET 690 pct ~99.85–99.89, got ${neet690mod.percentileMid}`)
assert.ok(neet690mod.rankMid >= 2000 && neet690mod.rankMid <= 2600, `NEET 690 AIR ~2k–2.6k (NTA 2026), got ${neet690mod.rankMid}`)
assert.ok(neet690mod.poolSize === 2_050_000, 'NEET 2027 pool 2.05M')

const neet690tough = predictRankPercentile({
  examId: 'neet',
  marks: 690,
  toughness: 'tough',
  stateId: 'uttar-pradesh',
})
assert.ok(neet690tough.percentileMid < 100, `NEET 690 tough never 100.00, got ${neet690tough.percentileMid}`)
assert.ok(neet690tough.rankMid < neet690mod.rankMid, 'tough paper → better (lower) AIR')
assert.ok(neet690tough.percentileMid > neet690mod.percentileMid, 'tough paper → higher percentile')

assert.equal(profile.provenance?.nirf?.status, 'official')
assert.equal(profile.provenance?.placement?.status, 'indicative')
assert.ok(profile.cutoffRounds?.['2026']?.hasOfficialClosing)

const aiims = CAREER_COMPASS_BASELINE.find((c) => c.id === 'aiims-delhi')
const aiimsBp = buildBranchProfile(aiims, aiims.branches[0])
assert.equal(aiimsBp.provenance?.placement?.status, 'unavailable')
assert.equal(formatPlacementField(aiimsBp.placement, 'avgLpa'), 'Not available')

const neetBands = getMarksRankBands('neet', 690)
assert.ok(neetBands.some((b) => b.isHighlight), 'marks band table highlights user marks')
assert.ok(neetBands.every((b) => b.percentile < 100 || b.air === 1), 'bands never show false 100%')

const neetObc = predictRankPercentile({
  examId: 'neet',
  marks: 690,
  category: 'obc',
  toughness: 'moderate',
})
assert.ok(neetObc.categoryRankMid != null && neetObc.categoryRankMid < neetObc.rankMid, 'OBC category rank < AIR')

// JEE 250 — PDF moderate ~99.85% / AIR ~1k–2.5k projected 2027
const jee250 = predictRankPercentile({ examId: 'jee-main', marks: 250, toughness: 'moderate' })
assert.ok(jee250.percentileMid >= 99.8, `JEE 250 → 99.8+ %ile, got ${jee250.percentileMid}`)
assert.ok(jee250.rankMid >= 800 && jee250.rankMid <= 2800, `JEE 250 AIR ~0.8k–2.8k (PDF-calibrated), got ${jee250.rankMid}`)

const jeeMainPool = predictRankPercentile({ examId: 'jee-main', marks: 180, toughness: 'moderate' })
assert.ok(jeeMainPool.poolSize === 1_520_000, 'JEE Main 2027 pool 15.2L')

const neet600 = predictRankPercentile({ examId: 'neet', marks: 600, toughness: 'moderate' })
assert.ok(neet600.percentileMid >= 98.2 && neet600.percentileMid <= 98.6, `NEET 600 pct ~98.3, got ${neet600.percentileMid}`)
assert.ok(neet600.rankMid >= 25_000 && neet600.rankMid <= 40_000, `NEET 600 AIR ~25k–40k (NTA 2026), got ${neet600.rankMid}`)

const neet650 = predictRankPercentile({ examId: 'neet', marks: 650, toughness: 'moderate' })
assert.ok(neet650.rankMid >= 8_000 && neet650.rankMid <= 14_000, `NEET 650 AIR ~8k–14k, got ${neet650.rankMid}`)

const neet720 = predictRankPercentile({ examId: 'neet', marks: 720, toughness: 'moderate' })
assert.equal(neet720.rankMid, 1, 'NEET 720 → AIR 1')
assert.equal(neet720.percentileMid, 100, 'NEET 720 → 100 percentile')

// Interpolation helpers — 2026 base matches PDF-calibrated 2024 moderate curve
const jee2026 = MARKS_RANK_HISTORY['jee-main']['2026']
assert.ok(Math.abs(interpolateMarksToPercentile(jee2026, 180) - 98.36) < 0.15)
assert.ok(Math.abs(interpolateMarksToPercentile(jee2026, 100) - 88.67) < 0.75, '100 marks ~88–89% per PDF blend')

const refBundle = getOfficialReferenceBundle('jee-main', 'rank')
assert.ok(refBundle.note.includes('2025'))
assert.ok(refBundle.note.includes('2026'))
assert.ok(refBundle.note.includes('2027'))
assert.ok(refBundle.note.includes('Indicative'))
assert.ok(!refBundle.note.includes('2016'))

console.log(
  `test-career-compass: ok (180mod=${mod180.percentileMid}% AIR=${mod180.rankMid}, 250=${jee250.percentileMid}%/${jee250.rankMid}, NEET690=${neet690mod.percentileMid}%/${neet690mod.rankMid})`,
)
