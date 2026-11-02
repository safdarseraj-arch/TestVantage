import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import InsightPageHero from '../components/InsightPageHero'
import { useAuth } from '../context/AuthContext'
import { CAREER_EXAMS, CAREER_COMPASS_SOURCES } from '../data/careerCompassCatalog.js'
import {
  formatCompassUpdatedAt,
  getCareerCompassMeta,
  getCareerCompassSources,
  refreshCareerCompassInBackground,
  scheduleCareerCompassBackgroundRefresh,
} from '../utils/careerCompassBrain.js'
import { explainCareerCompassPrediction } from '../utils/careerCompassAiExplain.js'
import { fetchCloudVisionStatus } from '../utils/cloudVisionClient.js'
import { loadOcrSettings } from '../utils/ocrSettings.js'
import {
  CHOICE_FILLING_DISCLAIMER,
  CHOICE_FILLING_TAB,
  CHOICE_ORDER_PRINCIPLES,
  MAX_FILL_ADVICE,
  OFFICIAL_VS_AI_NOTE,
  PAST_NOT_FUTURE_WARNING,
  buildChoiceFillingOrder,
  buildCounsellingGuideLocal,
  counsellingTypesForExam,
  defaultCounsellingTypeForExam,
  explainCounsellingChoiceGuide,
  getCounsellingGuideSections,
  getCounsellingOfficialLinks,
  getCounsellingTypeOption,
  parsePositiveAir,
} from '../utils/careerCompassCounsellingGuide.js'
import {
  BRANCH_OPTIONS,
  EXAM_TOUGHNESS_OPTIONS,
  HISTORY_YEARS,
  NTA_MARKS_YEARS,
  TREND_NTA_YEARS,
  NTA_DATA_SOURCES,
  INDIAN_STATES,
  PLACEMENT_SALARY_ROWS,
  PREDICT_TARGET_YEAR,
  bandHint,
  bandLabel,
  buildBranchCompareRows,
  buildBranchProfile,
  exploreCollegesByBranch,
  formatPlacementField,
  formatPlacementLpa,
  formatRange,
  getCategoryQuotaHint,
  getCollegeById,
  getCollegeCounsellingSource,
  getCollegeOfficialLinks,
  getCompassSourceById,
  getMarksRankBands,
  getOfficialReferenceBundle,
  GO_LIVE_DATA_POLICY,
  PLACEMENT_DISCLAIMER,
  placementSalaryValue,
  predictColleges,
  predictRankPercentile,
  provenanceBadgeLabel,
  RANK_PREDICTOR_DISCLAIMER,
  searchColleges,
  TOUGHNESS_DROPDOWN_HINT,
  DATA_UNAVAILABLE_LABEL,
  DATA_INDICATIVE_HINT,
} from '../utils/careerCompassPredict.js'
import { getPercentileCurveTable, buildRoundChanceBoard } from '../utils/counsellingPredictor.js'
import {
  CollegeFactsPanel,
  CounsellingFillHint,
  PercentileCurveTable,
  PlacementPackageTable,
  RoundChanceChips,
  RoundChanceTable,
} from '../components/CounsellingPredictorPanels.jsx'
import {
  COUNSELLING_UPDATE_TAB,
  fetchCounsellingUpdateStatus,
  startCounsellingAdminUpdate,
} from '../utils/counsellingAdminUpdate.js'

const CATEGORIES = [
  { id: 'general', label: 'General / UR' },
  { id: 'ews', label: 'EWS' },
  { id: 'obc', label: 'OBC-NCL' },
  { id: 'sc', label: 'SC' },
  { id: 'st', label: 'ST' },
]

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'iit', label: 'IIT' },
  { id: 'nit', label: 'NIT' },
  { id: 'iiit', label: 'IIIT' },
  { id: 'medical', label: 'Medical' },
]

const MAX_COMPARE = 5

function formatFee(n) {
  if (n == null) return '—'
  return `₹${Number(n).toFixed(1)} L/yr`
}

function pickKey(collegeId, branchId) {
  return `${collegeId}::${branchId}`
}

const WIZARD_STEPS = [
  { id: 'marks', label: 'Enter marks' },
  { id: 'rank', label: 'See rank' },
  { id: 'colleges', label: 'College matches' },
]

function ProvenanceBadge({ status, title }) {
  if (!status) return null
  return (
    <span className={`cc-prov-badge cc-prov-badge--${status}`} title={title}>
      {provenanceBadgeLabel(status)}
    </span>
  )
}

function formatNirfDisplay(profileOrCollege) {
  const prov = profileOrCollege?.provenance?.nirf
  if (prov) {
    return prov.status === 'official' && prov.value != null
      ? String(prov.value)
      : DATA_UNAVAILABLE_LABEL
  }
  return profileOrCollege?.nirfRank != null ? String(profileOrCollege.nirfRank) : DATA_UNAVAILABLE_LABEL
}

function CutoffRoundCell({ round }) {
  if (!round) return <span>{DATA_UNAVAILABLE_LABEL}</span>
  return (
    <div className="cc-cutoff-round">
      <div className="cc-cutoff-line">
        <span className="cc-cutoff-tag">Open</span>
        <span className="cc-cutoff-val">{round.openingLabel}</span>
      </div>
      <div className="cc-cutoff-line">
        <span className="cc-cutoff-tag cc-cutoff-tag--close">Close</span>
        <span className="cc-cutoff-val">{round.closingLabel}</span>
        {round.hasOfficialClosing && <ProvenanceBadge status="official" />}
      </div>
    </div>
  )
}

function WizardSteps({ activeStep }) {
  const stepIndex = activeStep === 'marks' ? 0 : activeStep === 'rank' ? 1 : 2
  return (
    <ol className="cc-wizard-steps" aria-label="Prediction steps">
      {WIZARD_STEPS.map((s, i) => (
        <li
          key={s.id}
          className={
            i < stepIndex ? 'cc-wizard-step is-done' : i === stepIndex ? 'cc-wizard-step is-active' : 'cc-wizard-step'
          }
        >
          <span className="cc-wizard-num">{i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  )
}

function PlacementSalaryList({ placement, provenance, showPctPlaced = true, showDisclaimer = true }) {
  const prov = provenance ?? placement?.provenance?.placement
  return (
    <>
      {showDisclaimer && (
        <p className="cc-placement-disclaimer form-hint">
          {prov?.status === 'indicative' ? DATA_INDICATIVE_HINT : PLACEMENT_DISCLAIMER}
        </p>
      )}
      <ul>
        {PLACEMENT_SALARY_ROWS.map((row) => {
          const fieldProv = prov?.fields?.[row.field]
          return (
            <li key={row.field}>
              <span>
                {row.label}{' '}
                <ProvenanceBadge status={fieldProv?.status ?? 'unavailable'} />
              </span>
              <strong>{formatPlacementField(placement, row.field)}</strong>
            </li>
          )
        })}
        {showPctPlaced && (
          <li>
            <span>
              % placed <ProvenanceBadge status={prov?.fields?.pctPlaced?.status ?? 'unavailable'} />
            </span>
            <strong>
              {prov?.fields?.pctPlaced?.status !== 'unavailable' && placement?.pctPlaced != null
                ? `${placement.pctPlaced}%`
                : DATA_UNAVAILABLE_LABEL}
            </strong>
          </li>
        )}
      </ul>
    </>
  )
}

function PlacementSalaryStack({ placement, provenance }) {
  const stats = placement
  const prov = provenance ?? stats?.provenance?.placement
  const overallStatus =
    prov?.status ??
    (stats?.placementSource === 'official'
      ? 'official'
      : stats?.placementSource === 'indicative'
        ? 'indicative'
        : 'unavailable')
  return (
    <div className="cc-salary-stack">
      {PLACEMENT_SALARY_ROWS.map((row) => (
        <div key={row.field} className="cc-salary-line">
          <span className="cc-salary-label">{row.label}</span>
          <strong>{formatPlacementField(stats, row.field)}</strong>
        </div>
      ))}
      <ProvenanceBadge
        status={overallStatus}
        title={overallStatus === 'indicative' ? DATA_INDICATIVE_HINT : undefined}
      />
    </div>
  )
}

function VerifyOfficialLink({ source, className = '' }) {
  if (!source) return null
  const href = source.verifyUrl ?? source.url
  const label = source.verifyLabel ?? 'Verify on official site'
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`cc-verify-link${className ? ` ${className}` : ''}`}
    >
      {label} ↗
    </a>
  )
}

function OfficialReferencePanel({ examId, context = 'colleges', college = null, compact = false }) {
  const bundle = college
    ? {
        title: `Official reference — ${college.shortName}`,
        note: `Cutoffs from ${HISTORY_YEARS.join('–')} ${getCollegeCounsellingSource(college).fullLabel ?? 'counselling'} reports. Verify before you choose.`,
        links: getCollegeOfficialLinks(college),
      }
    : {
        ...getOfficialReferenceBundle(examId, context),
        links: getOfficialReferenceBundle(examId, context).sources.map((s) => ({
          id: s.id,
          label: s.fullLabel ?? s.label,
          url: s.url,
          verifyUrl: s.verifyUrl ?? s.url,
          verifyLabel: s.verifyLabel,
          description: s.description,
        })),
      }

  return (
    <aside
      className={`cc-official-ref${compact ? ' cc-official-ref--compact' : ''}`}
      aria-label="Official data references"
    >
      <h3 className="cc-official-ref-title">{bundle.title}</h3>
      <p className="cc-official-ref-note">{bundle.note}</p>
      <ul className="cc-official-ref-list">
        {bundle.links.map((link) => (
          <li key={link.id}>
            <a href={link.url} target="_blank" rel="noreferrer noopener" className="cc-official-ref-main">
              {link.label}
            </a>
            {link.description && <span className="cc-sub cc-official-ref-desc">{link.description}</span>}
            {link.verifyUrl && (
              <span className="cc-official-ref-verify">
                <VerifyOfficialLink source={link} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function CutoffVerifyNote({ college }) {
  const source = getCollegeCounsellingSource(college)
  return (
    <p className="cc-verify-note">
      Closing ranks sourced from official {source.fullLabel ?? source.label} counselling reports (
      {HISTORY_YEARS.join('–')}). <VerifyOfficialLink source={source} />
    </p>
  )
}

function CompareSideBySide({ rows }) {
  if (rows.length < 2) return null
  return (
    <div className="cc-compare-block">
      <h3 className="cc-section-title">Side-by-side comparison</h3>
      <p className="form-hint">
        Official JoSAA/CSAB/MCC closing ranks ({HISTORY_YEARS.join('–')}) vs indicative placement
        from college TPO / NIRF reports.
      </p>
      <p className="cc-verify-note">
        <strong>Cutoffs (official):</strong> from counselling closing-rank reports.{' '}
        <VerifyOfficialLink source={getCompassSourceById('josaa')} />
      </p>
      <p className="cc-placement-disclaimer">
        <strong>Placement (indicative):</strong> {PLACEMENT_DISCLAIMER}
      </p>
      <div className="cc-match-table-wrap cc-compare-scroll">
        <table className="cc-table cc-compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              {rows.map((r) => (
                <th key={`${r.collegeId}::${r.branchId}`}>
                  {r.branchLabel ?? r.name}
                  <div className="cc-sub">{r.branchName}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>City / State</td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  {r.city}, {r.state}
                </td>
              ))}
            </tr>
            <tr>
              <td>Type</td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>{String(r.type).toUpperCase()}</td>
              ))}
            </tr>
            <tr>
              <td>
                NIRF rank <ProvenanceBadge status="official" />
              </td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  <strong>{formatNirfDisplay(r)}</strong>
                </td>
              ))}
            </tr>
            <tr>
              <td>Annual fee</td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>{formatFee(r.feeAnnualLakh)}</td>
              ))}
            </tr>
            {PLACEMENT_SALARY_ROWS.map((row) => (
              <tr key={row.field}>
                <td>
                  {row.label}
                  <ProvenanceBadge status="indicative" />
                </td>
                {rows.map((r) => (
                  <td key={`${r.collegeId}::${r.branchId}`}>
                    {formatPlacementField(r.placement, row.field)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>
                % placement
                <ProvenanceBadge status={rows[0]?.provenance?.placement?.fields?.pctPlaced?.status ?? 'indicative'} />
              </td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  {r.provenance?.placement?.fields?.pctPlaced?.status !== 'unavailable' &&
                  r.placement?.pctPlaced != null
                    ? `${r.placement.pctPlaced}%`
                    : DATA_UNAVAILABLE_LABEL}
                </td>
              ))}
            </tr>
            <tr>
              <td>Verify on official site</td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  {(r.officialLinks ?? [])
                    .filter((l) => l.kind === 'placement' || l.kind === 'nirf' || l.kind === 'college')
                    .slice(0, 3)
                    .map((link) => (
                      <div key={link.id}>
                        <VerifyOfficialLink source={link} className="cc-verify-link--stacked" />
                      </div>
                    ))}
                </td>
              ))}
            </tr>
            {HISTORY_YEARS.map((y) => (
              <tr key={y}>
                <td>
                  Cutoff {y} (Open / Close)
                  <ProvenanceBadge status="official" />
                </td>
                {rows.map((r) => (
                  <td key={`${r.collegeId}::${r.branchId}`}>
                    <CutoffRoundCell round={r.cutoffRounds?.[y]} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>3-yr avg cutoff <span className="cc-sub">(official)</span></td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  {r.avgCutoff != null ? r.avgCutoff.toLocaleString('en-IN') : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td>Cutoff trend</td>
              {rows.map((r) => (
                <td key={`${r.collegeId}::${r.branchId}`}>
                  {r.trend === 'up' ? '↑ harder' : r.trend === 'down' ? '↓ easier' : '→ stable'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CareerCompass() {
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const bootExam = (() => {
    const q = searchParams.get('exam')
    if (q && CAREER_EXAMS.some((e) => e.id === q)) return q
    return 'jee-main'
  })()
  const bootMarks = (() => {
    const m = Number(searchParams.get('marks'))
    return Number.isFinite(m) && m >= 0 ? String(Math.round(m)) : ''
  })()

  const [examId, setExamId] = useState(bootExam)
  const [marks, setMarks] = useState(bootMarks)
  const [percentile, setPercentile] = useState('')
  const [rank, setRank] = useState('')
  const [category, setCategory] = useState('general')
  const [stateId, setStateId] = useState('uttar-pradesh')
  const [typeFilter, setTypeFilter] = useState('all')
  const [meta, setMeta] = useState(() => getCareerCompassMeta())
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState(
    /** @type {'predict'|'compare'|'colleges'|'info'|'choice-guide'|'update-data'} */ ('predict'),
  )
  const [branchId, setBranchId] = useState('cse')
  const [toughness, setToughness] = useState('moderate')
  const [preferredBranchId, setPreferredBranchId] = useState('all')
  const [preferredCollege, setPreferredCollege] = useState('')
  /** @type {string[]} collegeId::branchId */
  const [compareKeys, setCompareKeys] = useState([])
  const [aiExplain, setAiExplain] = useState(/** @type {{ text: string, badge: string, disclaimer?: string, cloudError?: string } | null} */ (null))
  const [aiExplainLoading, setAiExplainLoading] = useState(false)
  const [counsellingType, setCounsellingType] = useState(
    /** @type {import('../utils/careerCompassCounsellingGuide.js').CounsellingTypeId} */ ('josaa'),
  )
  const [choiceGuideAi, setChoiceGuideAi] = useState(
    /** @type {{ text: string, badge: string, disclaimer?: string, cloudError?: string, provider?: string } | null} */ (null),
  )
  const [choiceGuideAiLoading, setChoiceGuideAiLoading] = useState(false)
  /** @type {'predicted' | 'actual'} */
  const [choiceRankMode, setChoiceRankMode] = useState('predicted')
  const [actualAir, setActualAir] = useState('')
  const [actualCategoryRank, setActualCategoryRank] = useState('')
  const [actualPercentile, setActualPercentile] = useState('')
  /** Gemini / cloud assist readiness from /api/vision/status (same as Question Bank). */
  const [geminiReady, setGeminiReady] = useState(false)
  const choiceGuideRunId = useRef(0)
  const [adminUpdate, setAdminUpdate] = useState(
    /** @type {Awaited<ReturnType<typeof fetchCounsellingUpdateStatus>> | null} */ (null),
  )
  const [adminUpdateBusy, setAdminUpdateBusy] = useState(false)
  const adminUpdatePoll = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null))

  useEffect(() => {
    const qExam = searchParams.get('exam')
    if (qExam && CAREER_EXAMS.some((e) => e.id === qExam)) setExamId(qExam)
    const qMarks = Number(searchParams.get('marks'))
    if (Number.isFinite(qMarks) && qMarks >= 0) setMarks(String(Math.round(qMarks)))
  }, [searchParams])

  useEffect(() => {
    scheduleCareerCompassBackgroundRefresh()
    const t = setTimeout(() => setMeta(getCareerCompassMeta()), 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    const refreshGeminiStatus = () => {
      const preferCloud = loadOcrSettings().useCloudVision !== false
      fetchCloudVisionStatus({ force: panel === 'choice-guide' }).then((st) => {
        if (cancelled) return
        setGeminiReady(!!preferCloud && !!st.configured && st.ready !== false)
      })
    }
    refreshGeminiStatus()
    return () => {
      cancelled = true
    }
  }, [panel])

  const stopAdminUpdatePoll = useCallback(() => {
    if (adminUpdatePoll.current) {
      clearInterval(adminUpdatePoll.current)
      adminUpdatePoll.current = null
    }
  }, [])

  const applyAdminUpdateJob = useCallback(
    async (job) => {
      setAdminUpdate(job)
      if (job?.status === 'done') {
        stopAdminUpdatePoll()
        setAdminUpdateBusy(false)
        try {
          await refreshCareerCompassInBackground({ force: true })
          setMeta(getCareerCompassMeta())
        } catch {
          /* catalog refresh is best-effort after fill */
        }
      } else if (job?.status === 'failed') {
        stopAdminUpdatePoll()
        setAdminUpdateBusy(false)
      }
    },
    [stopAdminUpdatePoll],
  )

  const runAdminCounsellingUpdate = useCallback(async () => {
    if (!isAdmin) return
    if (adminUpdateBusy || adminUpdate?.status === 'running') return
    setAdminUpdateBusy(true)
    setAdminUpdate((prev) => ({
      ...(prev ?? {
        ok: true,
        started: true,
        alreadyRunning: false,
        status: 'running',
        engine: 'gemini',
        engineLabel: 'Gemini',
        model: null,
        cloud: true,
        error: null,
        hint: '',
        collegeCount: 0,
        cloudFilled: 0,
        source: '',
        batch: null,
      }),
      status: 'running',
      message: prev?.engineLabel ? `Updating with ${prev.engineLabel}...` : 'Updating counselling data...',
    }))
    try {
      const started = await startCounsellingAdminUpdate()
      await applyAdminUpdateJob(started)
      if (started.status === 'running' || started.started || started.alreadyRunning) {
        stopAdminUpdatePoll()
        adminUpdatePoll.current = setInterval(() => {
          fetchCounsellingUpdateStatus()
            .then(applyAdminUpdateJob)
            .catch((err) => {
              stopAdminUpdatePoll()
              setAdminUpdateBusy(false)
              setAdminUpdate((prev) => ({
                ...(prev ?? started),
                status: 'failed',
                ok: false,
                error: err instanceof Error ? err.message : 'Update failed',
                message: err instanceof Error ? err.message : 'Update failed',
              }))
            })
        }, 2000)
      }
    } catch (err) {
      stopAdminUpdatePoll()
      setAdminUpdateBusy(false)
      setAdminUpdate((prev) => ({
        ...(prev ?? {
          ok: false,
          started: false,
          alreadyRunning: false,
          status: 'failed',
          engine: 'local',
          engineLabel: 'local AI',
          model: null,
          cloud: false,
          hint: '',
          collegeCount: 0,
          cloudFilled: 0,
          source: '',
          batch: null,
        }),
        status: 'failed',
        ok: false,
        error: err instanceof Error ? err.message : 'Update failed',
        message: err instanceof Error ? err.message : 'Update failed',
      }))
    }
  }, [adminUpdate?.status, adminUpdateBusy, applyAdminUpdateJob, isAdmin, stopAdminUpdatePoll])

  useEffect(() => {
    if (!isAdmin) {
      stopAdminUpdatePoll()
      return undefined
    }
    let cancelled = false
    fetchCounsellingUpdateStatus()
      .then((job) => {
        if (!cancelled) setAdminUpdate(job)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      stopAdminUpdatePoll()
    }
  }, [isAdmin, stopAdminUpdatePoll])

  useEffect(() => {
    const opts = BRANCH_OPTIONS[examId] ?? BRANCH_OPTIONS['jee-main']
    if (!opts.some((o) => o.id === branchId)) {
      setBranchId(opts[0]?.id ?? 'cse')
    }
    if (examId === 'neet') setTypeFilter('medical')
    else if (typeFilter === 'medical') setTypeFilter('all')
    const allowed = counsellingTypesForExam(examId)
    const nextType = defaultCounsellingTypeForExam(examId)
    if (!allowed.some((t) => t.id === counsellingType)) {
      setCounsellingType(nextType)
    }
  }, [examId])

  const examMeta = CAREER_EXAMS.find((e) => e.id === examId) ?? CAREER_EXAMS[0]
  const branchOpts = BRANCH_OPTIONS[examId] ?? BRANCH_OPTIONS['jee-main']

  const prediction = useMemo(
    () =>
      predictRankPercentile({
        examId,
        marks: marks === '' ? null : Number(marks),
        percentile: percentile === '' ? null : Number(percentile),
        rank: rank === '' ? null : Number(rank),
        category,
        stateId,
        toughness,
        targetYear: PREDICT_TARGET_YEAR,
      }),
    [examId, marks, percentile, rank, category, stateId, toughness],
  )

  const marksBands = useMemo(
    () =>
      getMarksRankBands(examId, marks === '' ? undefined : Number(marks)),
    [examId, marks],
  )

  const percentileCurve = useMemo(
    () =>
      getPercentileCurveTable(examId, {
        highlightPercentile: prediction.percentileMid ?? prediction.percentile ?? null,
        toughness,
        radius: 2.5,
      }),
    [examId, prediction.percentileMid, prediction.percentile, toughness],
  )

  const rankCardCount =
    2 +
    (prediction.supportsStateRank ? 1 : 0) +
    (prediction.categoryRankMid != null ? 1 : 0) +
    1

  const hasRankPrediction = prediction.rank != null && prediction.rank > 0

  const matches = useMemo(() => {
    if (!hasRankPrediction) return []
    return predictColleges(prediction.rank, examId, {
      category,
      type: typeFilter,
      rankLow: prediction.rankLow ?? prediction.rank,
      rankHigh: prediction.rankHigh ?? prediction.rank,
      preferredBranchId: preferredBranchId !== 'all' ? preferredBranchId : undefined,
      preferredCollegeQuery: preferredCollege.trim() || undefined,
      limit: 40,
    })
  }, [
    hasRankPrediction,
    prediction.rank,
    prediction.rankLow,
    prediction.rankHigh,
    examId,
    category,
    typeFilter,
    preferredBranchId,
    preferredCollege,
  ])

  const parsedActualAir = useMemo(() => parsePositiveAir(actualAir), [actualAir])
  const parsedActualCategoryRank = useMemo(
    () => parsePositiveAir(actualCategoryRank),
    [actualCategoryRank],
  )
  const parsedActualPercentile = useMemo(() => {
    const s = String(actualPercentile ?? '').trim()
    if (s === '') return null
    const n = Number(s)
    if (!Number.isFinite(n) || n < 0 || n > 100) return null
    return n
  }, [actualPercentile])
  const actualAirError =
    choiceRankMode === 'actual' && actualAir.trim() !== '' && parsedActualAir == null
      ? 'Enter a whole number AIR of 1 or higher.'
      : null

  /** Rank that drives Choice Filling Guide (predicted from Step 1, or typed actual AIR). */
  const guideRank =
    choiceRankMode === 'actual' ? parsedActualAir : hasRankPrediction ? prediction.rank : null
  const hasGuideRank = guideRank != null && guideRank > 0
  const guideRankLow =
    choiceRankMode === 'actual' ? guideRank : (prediction.rankLow ?? prediction.rank)
  const guideRankHigh =
    choiceRankMode === 'actual' ? guideRank : (prediction.rankHigh ?? prediction.rank)
  const guideCategoryRank =
    choiceRankMode === 'actual'
      ? parsedActualCategoryRank
      : (prediction.categoryRankMid ?? prediction.categoryRank ?? null)
  const guidePercentile =
    choiceRankMode === 'actual'
      ? parsedActualPercentile
      : (prediction.percentileMid ?? prediction.percentile ?? null)

  /** Broader pool for choice filling (not limited by browse type filter). */
  const choiceMatches = useMemo(() => {
    if (!hasGuideRank) return []
    return predictColleges(guideRank, examId, {
      category,
      type: 'all',
      rankLow: guideRankLow ?? guideRank,
      rankHigh: guideRankHigh ?? guideRank,
      preferredBranchId: preferredBranchId !== 'all' ? preferredBranchId : undefined,
      preferredCollegeQuery: preferredCollege.trim() || undefined,
      limit: 60,
    })
  }, [
    hasGuideRank,
    guideRank,
    guideRankLow,
    guideRankHigh,
    examId,
    category,
    preferredBranchId,
    preferredCollege,
  ])

  const choiceOrder = useMemo(
    () =>
      buildChoiceFillingOrder(choiceMatches, {
        counsellingType,
        maxTotal: 28,
        preferredBranchId: preferredBranchId !== 'all' ? preferredBranchId : undefined,
        preferredCollegeQuery: preferredCollege.trim() || undefined,
        homeStateLabel: INDIAN_STATES.find((s) => s.id === stateId)?.label ?? stateId,
        homeStateId: stateId,
        categoryLabel: CATEGORIES.find((c) => c.id === category)?.label ?? category,
      }),
    [choiceMatches, counsellingType, preferredBranchId, preferredCollege, stateId, category],
  )

  const counsellingTypeOpts = useMemo(() => counsellingTypesForExam(examId), [examId])
  const counsellingMeta = getCounsellingTypeOption(counsellingType)
  const choiceGuideSections = useMemo(
    () => getCounsellingGuideSections(counsellingType),
    [counsellingType],
  )
  const choiceOfficialLinks = useMemo(
    () => getCounsellingOfficialLinks(counsellingType),
    [counsellingType],
  )
  const stateLabel = INDIAN_STATES.find((s) => s.id === stateId)?.label ?? stateId
  const categoryLabel = CATEGORIES.find((c) => c.id === category)?.label ?? category
  const preferredBranchLabel =
    preferredBranchId !== 'all'
      ? (branchOpts.find((b) => b.id === preferredBranchId)?.label ?? preferredBranchId)
      : null

  const localChoiceNarrative = useMemo(
    () =>
      buildCounsellingGuideLocal({
        counsellingLabel: counsellingMeta.label,
        examLabel: examMeta.label,
        rank: guideRank,
        rankSource: choiceRankMode,
        categoryRank: guideCategoryRank,
        percentile: guidePercentile,
        category: categoryLabel,
        stateLabel,
        preferredBranchLabel,
        preferredCollegeQuery: preferredCollege.trim() || null,
        order: choiceOrder,
      }),
    [
      counsellingMeta.label,
      examMeta.label,
      guideRank,
      choiceRankMode,
      guideCategoryRank,
      guidePercentile,
      categoryLabel,
      stateLabel,
      preferredBranchLabel,
      preferredCollege,
      choiceOrder,
    ],
  )

  const runChoiceGuideAi = useCallback(async () => {
    const runId = ++choiceGuideRunId.current
    setChoiceGuideAiLoading(true)
    try {
      // Refresh Gemini readiness from the same /api/vision/status used elsewhere.
      const preferCloud = loadOcrSettings().useCloudVision !== false
      const st = await fetchCloudVisionStatus()
      if (runId === choiceGuideRunId.current) {
        setGeminiReady(!!preferCloud && !!st.configured && st.ready !== false)
      }
      const result = await explainCounsellingChoiceGuide({
        examId,
        examLabel: examMeta.label,
        counsellingType,
        counsellingLabel: counsellingMeta.label,
        rank: guideRank,
        rankSource: choiceRankMode,
        categoryRank: guideCategoryRank,
        percentile: guidePercentile,
        category: categoryLabel,
        stateLabel,
        preferredBranchLabel,
        preferredCollegeQuery: preferredCollege.trim() || null,
        order: choiceOrder,
      })
      if (runId === choiceGuideRunId.current) {
        setChoiceGuideAi({
          ...result,
          // Student-facing label stays generic; provider stays on the object for internals.
          badge: 'AI',
        })
        if (result.provider === 'cloud-vision') setGeminiReady(true)
      }
    } catch {
      if (runId === choiceGuideRunId.current) {
        setChoiceGuideAi({
          text: localChoiceNarrative.text,
          badge: 'AI',
          disclaimer: localChoiceNarrative.disclaimer,
          provider: 'local',
        })
      }
    } finally {
      if (runId === choiceGuideRunId.current) setChoiceGuideAiLoading(false)
    }
  }, [
    examId,
    examMeta.label,
    counsellingType,
    counsellingMeta.label,
    guideRank,
    choiceRankMode,
    guideCategoryRank,
    guidePercentile,
    categoryLabel,
    stateLabel,
    preferredBranchLabel,
    preferredCollege,
    choiceOrder,
    localChoiceNarrative.text,
    localChoiceNarrative.disclaimer,
  ])

  useEffect(() => {
    if (panel !== 'choice-guide') return
    if (!hasGuideRank) {
      setChoiceGuideAi(null)
      return
    }
    // Local narrative first; cloud/local assist still runs under the hood.
    setChoiceGuideAi({
      text: localChoiceNarrative.text,
      badge: 'AI',
      disclaimer: localChoiceNarrative.disclaimer,
      provider: undefined,
    })
    runChoiceGuideAi()
  }, [
    panel,
    hasGuideRank,
    counsellingType,
    guideRank,
    choiceRankMode,
    preferredBranchId,
    preferredCollege,
    stateId,
    category,
    examId,
    runChoiceGuideAi,
    localChoiceNarrative.text,
    localChoiceNarrative.disclaimer,
  ])

  const branchExplore = useMemo(() => {
    return exploreCollegesByBranch(examId, branchId, {
      rank: prediction.rank,
      category,
      type: typeFilter,
      limit: 40,
    })
  }, [examId, branchId, prediction.rank, category, typeFilter])

  const comparePicks = useMemo(
    () =>
      compareKeys.map((k) => {
        const [collegeId, bId] = k.split('::')
        return { collegeId, branchId: bId }
      }),
    [compareKeys],
  )

  const compareRows = useMemo(() => buildBranchCompareRows(comparePicks), [comparePicks])

  const collegeList = useMemo(() => {
    const list = searchColleges(search, examId)
    if (typeFilter === 'all') return list
    return list.filter((c) => c.type === typeFilter)
  }, [search, examId, typeFilter])

  const selected = selectedId ? getCollegeById(selectedId) : null
  const detailBranch = selected?.branches?.find((b) => b.id === preferredBranchId && preferredBranchId !== 'all')
    || selected?.branches?.find((b) => b.id === branchId)
    || selected?.branches?.[0]
    || null

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshCareerCompassInBackground({ force: true })
      setMeta(getCareerCompassMeta())
    } finally {
      setRefreshing(false)
    }
  }

  const openCollege = (id) => {
    setSelectedId(id)
    setPanel('info')
  }

  const toggleCompare = (collegeId, bId) => {
    const key = pickKey(collegeId, bId)
    setCompareKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= MAX_COMPARE) return prev
      return [...prev, key]
    })
  }

  const isCompared = (collegeId, bId) => compareKeys.includes(pickKey(collegeId, bId))

  return (
    <div className="page career-compass-page insight-portal-page student-portal-page">
      <InsightPageHero
        pageId="career-compass"
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Updating…' : 'Refresh data'}
            </button>
            <Link to="/form-forecast" className="btn btn-ghost btn-sm">
              Form Forecast
            </Link>
            <Link to="/analytics" className="btn btn-primary btn-sm">
              My analytics
            </Link>
          </>
        }
      />

      <div className="cc-adaptive-bar" role="status">
        <span className="cc-adaptive-badge">AI Adaptive</span>
        <span className="cc-adaptive-detail">
          Data from:{' '}
          <strong>{(meta.sourcesUsed ?? ['NTA', 'JoSAA', 'CSAB', 'MCC']).join(' / ')}</strong>
          {' · '}
          Last updated: {formatCompassUpdatedAt(meta.updatedAt || meta.officialPulledAt)}
          {' · '}
          Quality: {meta.dataQuality ?? 'curated-official-benchmarks'}
        </span>
        <span className="cc-adaptive-links">
          {getCareerCompassSources()
            .filter((s) => ['nta', 'josaa', 'csab', 'mcc'].includes(s.id))
            .map((s) => (
              <a key={s.id} href={s.verifyUrl ?? s.url} target="_blank" rel="noreferrer noopener">
                {s.label} ↗
              </a>
            ))}
        </span>
      </div>

      <p className="cc-meta form-hint">
        <strong>{PREDICT_TARGET_YEAR}</strong> rank from latest two years (
        <strong>{TREND_NTA_YEARS.join('–')}</strong>) · colleges from JoSAA / CSAB / MCC · {meta.collegeCount}{' '}
        colleges · updated{' '}
        {formatCompassUpdatedAt(meta.updatedAt)}
      </p>

      <div className="cc-tabs" role="tablist" aria-label="Career Compass sections">
        {[
          { id: 'predict', label: '1 · Rank & college' },
          { id: 'compare', label: '2 · Compare by branch' },
          { id: 'colleges', label: '3 · Browse colleges' },
          { id: 'info', label: '4 · College details' },
          { id: CHOICE_FILLING_TAB.id, label: CHOICE_FILLING_TAB.label },
          ...(isAdmin ? [{ id: COUNSELLING_UPDATE_TAB.id, label: COUNSELLING_UPDATE_TAB.label, admin: true }] : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={panel === t.id}
            className={`cc-tab${panel === t.id ? ' is-active' : ''}${t.admin ? ' cc-tab--admin' : ''}`}
            onClick={() => {
              setPanel(t.id)
              if (t.id === COUNSELLING_UPDATE_TAB.id) {
                runAdminCounsellingUpdate()
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {panel === 'predict' && (
        <section className="cc-panel" aria-label="Rank and college predictor">
          <WizardSteps activeStep={hasRankPrediction ? (matches.length ? 'colleges' : 'rank') : 'marks'} />
          <div className="cc-session-note" role="note">
            <strong>{PREDICT_TARGET_YEAR} session</strong> · Rank trend from {TREND_NTA_YEARS.join('–')} NTA
            curves
            {prediction.toughnessLabel ? ` · Paper: ${prediction.toughnessLabel}` : ''}
            {prediction.poolSize ? ` · Pool ~${(prediction.poolSize / 1_000_000).toFixed(1)}M` : ''}
          </div>
          <div className="cc-step">
            <h2 className="cc-step-title">Step 1 — Predict rank from marks</h2>
            <p className="form-hint">
              Enter marks first. Rank trend uses the latest two complete NTA years (
              {TREND_NTA_YEARS.join(' and ')}), projected for {PREDICT_TARGET_YEAR} — with a range that
              depends on paper toughness. Older years stay in the history table.
            </p>

            <div className="cc-form-grid">
              <label className="cc-field">
                Exam
                <select value={examId} onChange={(e) => setExamId(e.target.value)}>
                  {CAREER_EXAMS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              {(examId === 'jee-main' || examId === 'neet') && (
                <label className="cc-field">
                  Home state (for State Rank)
                  <select value={stateId} onChange={(e) => setStateId(e.target.value)}>
                    {INDIAN_STATES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="cc-field">
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <span className="form-hint cc-quota-hint">{getCategoryQuotaHint(category)}</span>
              </label>
              <label className="cc-field cc-field--primary">
                Marks (/{examMeta.marksMax}) — start here
                <input
                  type="number"
                  min={0}
                  max={examMeta.marksMax}
                  placeholder={`e.g. 200 for ${PREDICT_TARGET_YEAR}`}
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                />
              </label>
              {(examId === 'jee-main' || examId === 'jee-advanced' || examId === 'neet') && (
                <label className="cc-field">
                  Paper toughness
                  <select value={toughness} onChange={(e) => setToughness(e.target.value)}>
                    {EXAM_TOUGHNESS_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="form-hint cc-toughness-dropdown-hint">{TOUGHNESS_DROPDOWN_HINT}</span>
                </label>
              )}
              <label className="cc-field">
                Official percentile <span className="cc-optional">(optional)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="if you have scorecard"
                  value={percentile}
                  onChange={(e) => setPercentile(e.target.value)}
                />
              </label>
              <label className="cc-field">
                {examMeta.rankLabel} <span className="cc-optional">(optional)</span>
                <input
                  type="number"
                  min={1}
                  placeholder="most accurate"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                />
              </label>
            </div>

            {prediction.toughnessHint && marks !== '' && (
              <p className="form-hint cc-toughness-hint">{prediction.toughnessHint}</p>
            )}

            <div
              className="cc-rank-cards"
              style={{ '--cc-rank-cols': rankCardCount }}
            >
              <div className="cc-stat">
                <span className="cc-stat-label">Est. percentile ({PREDICT_TARGET_YEAR})</span>
                {prediction.percentileMid != null ? (
                  <>
                    <strong className="cc-stat-value">
                      {Number(prediction.percentileMid).toFixed(2)}
                    </strong>
                    <span className="cc-stat-range">
                      Range:{' '}
                      {formatRange(
                        prediction.percentileLow,
                        prediction.percentileHigh,
                        (n) => Number(n).toFixed(2),
                      )}
                    </span>
                  </>
                ) : (
                  <strong className="cc-stat-value">—</strong>
                )}
              </div>
              <div className="cc-stat">
                <span className="cc-stat-label">All India Rank (AIR)</span>
                {prediction.rankMid != null ? (
                  <>
                    <strong className="cc-stat-value">
                      {prediction.rankMid.toLocaleString('en-IN')}
                    </strong>
                    <span className="cc-stat-range">
                      Range: {formatRange(prediction.rankLow, prediction.rankHigh)}
                    </span>
                  </>
                ) : (
                  <strong className="cc-stat-value">—</strong>
                )}
              </div>
              {prediction.supportsStateRank && (
                <div className="cc-stat">
                  <span className="cc-stat-label">State Rank ({prediction.stateLabel})</span>
                  {prediction.stateRankMid != null ? (
                    <>
                      <strong className="cc-stat-value">
                        {prediction.stateRankMid.toLocaleString('en-IN')}
                      </strong>
                      <span className="cc-stat-range">
                        Range:{' '}
                        {formatRange(prediction.stateRankLow, prediction.stateRankHigh)}
                      </span>
                    </>
                  ) : (
                    <strong className="cc-stat-value">—</strong>
                  )}
                </div>
              )}
              {prediction.categoryRankMid != null && (
                <div className="cc-stat">
                  <span className="cc-stat-label">Est. {prediction.categoryLabel} rank</span>
                  <strong className="cc-stat-value">
                    {prediction.categoryRankMid.toLocaleString('en-IN')}
                  </strong>
                  <span className="cc-stat-range">
                    Range:{' '}
                    {formatRange(prediction.categoryRankLow, prediction.categoryRankHigh)}
                  </span>
                </div>
              )}
              <div className="cc-stat">
                <span className="cc-stat-label">Confidence</span>
                <strong className="cc-stat-value cc-stat-value--sm">{prediction.confidence}</strong>
              </div>
            </div>
            <p className="cc-rank-disclaimer form-hint">{RANK_PREDICTOR_DISCLAIMER}</p>
            <p className="form-hint">{prediction.note}</p>
            {hasRankPrediction && (
              <div className="cc-ai-explain" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={aiExplainLoading}
                  onClick={async () => {
                    setAiExplainLoading(true)
                    try {
                      const result = await explainCareerCompassPrediction({
                        examId,
                        examLabel: examMeta?.name,
                        prediction: {
                          marks: prediction.marksMid ?? (marks === '' ? null : Number(marks)),
                          percentile: prediction.percentileMid,
                          rank: prediction.rankMid ?? prediction.rank,
                          bandHint: prediction.note,
                          category,
                        },
                        topMatches: matches.slice(0, 5).map((m) => ({
                          name: m.college?.name ?? m.name,
                          branch: m.branch?.name ?? m.branchLabel ?? m.branch,
                          chance: bandLabel(m.band),
                          reason: m.note,
                        })),
                      })
                      setAiExplain(result)
                    } catch {
                      setAiExplain({
                        text: 'Could not build explanation. Rank numbers above are still from Official curves.',
                        badge: 'Local AI',
                      })
                    } finally {
                      setAiExplainLoading(false)
                    }
                  }}
                >
                  {aiExplainLoading ? 'Writing…' : 'Explain result (AI)'}
                </button>
                {aiExplain && (
                  <div className="card-inner" style={{ marginTop: '0.5rem' }}>
                    <span className="ocr-engine-badge" data-engine={aiExplain.badge?.includes('Cloud') ? 'cloud' : 'local'}>
                      {aiExplain.badge}
                    </span>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0.5rem 0 0' }}>
                      {aiExplain.text}
                    </pre>
                    {aiExplain.disclaimer && (
                      <p className="form-hint">{aiExplain.disclaimer}</p>
                    )}
                    {aiExplain.cloudError && (
                      <p className="form-hint" style={{ color: 'var(--danger, #b33)' }}>
                        Cloud tried and failed — showing Local AI. {aiExplain.cloudError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {prediction.percentileMid != null && prediction.percentileMid >= 99.99 && prediction.rankMid > 1 && (
              <p className="form-hint cc-rank-consistency-note">
                Percentile capped at 99.99 for AIR {prediction.rankMid?.toLocaleString('en-IN')} (only rank 1 shows
                100.00).
              </p>
            )}

            {percentileCurve.rows?.length > 0 && (
              <PercentileCurveTable table={percentileCurve} />
            )}

            {marksBands.length > 0 && (
              <details className="cc-history">
                <summary>Marks vs rank guide ({NTA_MARKS_YEARS[NTA_MARKS_YEARS.length - 1]} NTA curve)</summary>
                <p className="form-hint">
                  Reference bands from our curve. Your row is highlighted.
                </p>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Marks</th>
                      <th>Est. percentile</th>
                      <th>Est. AIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksBands.map((row) => (
                      <tr key={row.marks} className={row.isHighlight ? 'cc-band-highlight' : ''}>
                        <td>{row.marks}</td>
                        <td>{row.percentile.toFixed(2)}</td>
                        <td>{row.air.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {prediction.historyAtMarks && (
              <details className="cc-history">
                <summary>
                  NTA years in this curve ({NTA_MARKS_YEARS[0]}–{NTA_MARKS_YEARS[NTA_MARKS_YEARS.length - 1]}{' '}
                  history; trend {TREND_NTA_YEARS.join('–')})
                </summary>
                <p className="form-hint">
                  {NTA_DATA_SOURCES[examId] ?? NTA_DATA_SOURCES['jee-main']} Rank / percentile trend uses{' '}
                  {TREND_NTA_YEARS.join(' and ')} only. Older years are history. Indicative — not a live NTA API.
                </p>
              </details>
            )}

            {prediction.historyAtMarks && (
              <details className="cc-history">
                <summary>
                  How {TREND_NTA_YEARS.join(' / ')} marks mapped (trend used for {PREDICT_TARGET_YEAR})
                </summary>
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Percentile at your marks</th>
                      <th>AIR at your marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TREND_NTA_YEARS.map((y) => (
                      <tr key={y} className="cc-trend-year">
                        <td>{y}</td>
                        <td>
                          {prediction.historyAtMarks[y]
                            ? prediction.historyAtMarks[y].percentile.toFixed(2)
                            : '—'}
                        </td>
                        <td>
                          {prediction.historyAtMarks[y]
                            ? Math.round(prediction.historyAtMarks[y].air).toLocaleString('en-IN')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            <OfficialReferencePanel examId={examId} context="rank" compact />
          </div>

          {!hasRankPrediction ? (
            <div className="insight-empty-state cc-empty">
              <h2>Enter your marks above</h2>
              <p>
                {PREDICT_TARGET_YEAR} percentile &amp; rank ranges use the latest two NTA years (
                {TREND_NTA_YEARS.join(' and ')}). Step 2 shows college matches from JoSAA / CSAB / MCC closing
                ranks.
              </p>
            </div>
          ) : (
            <div className="cc-step cc-match-list">
              <h2 className="cc-step-title">Step 2 — College &amp; branch matches</h2>
              <p className="form-hint">{prediction.counsellingNote}</p>
              <OfficialReferencePanel examId={examId} context="colleges" />

              <div className="cc-form-grid">
                <label className="cc-field">
                  Preferred branch
                  <select
                    value={preferredBranchId}
                    onChange={(e) => setPreferredBranchId(e.target.value)}
                  >
                    <option value="all">Any branch</option>
                    {branchOpts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cc-field">
                  Preferred college
                  <input
                    type="search"
                    placeholder="e.g. IIT Bombay, NIT Trichy…"
                    value={preferredCollege}
                    onChange={(e) => setPreferredCollege(e.target.value)}
                  />
                </label>
                <label className="cc-field">
                  College type
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    {TYPE_FILTERS.filter((t) =>
                      examId === 'neet' ? t.id === 'all' || t.id === 'medical' : t.id !== 'medical',
                    ).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="cc-section-row">
                <p className="form-hint">
                  Sorted by closest closing rank to your AIR (official {HISTORY_YEARS.join('–')}{' '}
                  counselling reports). Tick up to {MAX_COMPARE} to compare. Selected:{' '}
                  <strong>{compareKeys.length}</strong> / {MAX_COMPARE}
                  {compareKeys.length > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCompareKeys([])}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </p>
                {compareKeys.length >= 2 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setPanel('compare')}
                  >
                    Full compare tab →
                  </button>
                )}
              </div>

              <div className="cc-match-table-wrap">
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Compare</th>
                      <th>Band</th>
                      <th>Program (branch @ college)</th>
                      <th>Avg cutoff</th>
                      <th>Salaries</th>
                      <th>Trend</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const checked = isCompared(m.college.id, m.branch.id)
                      return (
                        <tr key={`${m.college.id}-${m.branch.id}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && compareKeys.length >= MAX_COMPARE}
                              onChange={() => toggleCompare(m.college.id, m.branch.id)}
                              aria-label={`Compare ${m.college.shortName} ${m.branch.name}`}
                            />
                          </td>
                          <td>
                            <span
                              className={`cc-band cc-band--${m.band}`}
                              title={bandHint(m.band)}
                            >
                              {bandLabel(m.band)}
                            </span>
                          </td>
                          <td>
                            <strong>{m.branchProfile?.branchLabel ?? `${m.branch.name} @ ${m.college.shortName}`}</strong>
                            <div className="cc-sub">{m.college.city}</div>
                            <RoundChanceChips board={m.roundChances} compact />
                          </td>
                          <td>{m.avgCutoff.toLocaleString('en-IN')}</td>
                          <td>
                            <PlacementSalaryStack
                              placement={m.branchProfile?.placement ?? m.branchPlacement}
                              provenance={m.branchProfile?.provenance?.placement}
                            />
                          </td>
                          <td>
                            {m.trend === 'up'
                              ? '↑ harder'
                              : m.trend === 'down'
                                ? '↓ easier'
                                : '→ stable'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openCollege(m.college.id)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {compareRows.length >= 2 && <CompareSideBySide rows={compareRows} />}
              {compareRows.length === 1 && (
                <p className="form-hint">Select one more college above to compare side-by-side.</p>
              )}
            </div>
          )}
        </section>
      )}

      {panel === 'compare' && (
        <section className="cc-panel" aria-label="Compare colleges by branch">
          <h2 className="cc-section-title">Explore & compare by branch</h2>
          <p className="form-hint">
            Pick a branch (e.g. CSE). Tick up to {MAX_COMPARE} colleges, then compare NIRF, fees,
            salary, placement %, and {HISTORY_YEARS.join('/')} cutoffs side-by-side.
          </p>
          <OfficialReferencePanel examId={examId} context="compare" />

          <div className="cc-form-grid">
            <label className="cc-field">
              Exam
              <select value={examId} onChange={(e) => setExamId(e.target.value)}>
                {CAREER_EXAMS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              Branch
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branchOpts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              College type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                {TYPE_FILTERS.filter((t) =>
                  examId === 'neet' ? t.id === 'all' || t.id === 'medical' : t.id !== 'medical',
                ).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="form-hint">
            {prediction.rank
              ? `Showing options near your AIR ${prediction.rank.toLocaleString('en-IN')}.`
              : 'Enter marks/AIR in tab 1 to filter by your rank — or browse all cutoffs below.'}{' '}
            Selected for compare: <strong>{compareKeys.length}</strong> / {MAX_COMPARE}
            {compareKeys.length > 0 && (
              <>
                {' '}
                ·{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompareKeys([])}>
                  Clear
                </button>
              </>
            )}
          </p>

          <div className="cc-match-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Compare</th>
                  <th>Program</th>
                  <th>NIRF</th>
                  <th>Avg fee</th>
                  <th>Salaries</th>
                  <th>% placed</th>
                  <th>Cutoff avg</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {branchExplore.map((m) => {
                  const checked = isCompared(m.college.id, m.branch.id)
                  return (
                    <tr key={`${m.college.id}-${m.branch.id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && compareKeys.length >= MAX_COMPARE}
                          onChange={() => toggleCompare(m.college.id, m.branch.id)}
                          aria-label={`Compare ${m.college.shortName}`}
                        />
                      </td>
                      <td>
                        <strong>
                          {m.branchProfile?.branchLabel ??
                            `${m.branch.name} @ ${m.college.shortName}`}
                        </strong>
                        <div className="cc-sub">
                          {m.college.city}, {m.college.state}
                        </div>
                        {m.band && prediction.rank ? (
                          <span className={`cc-band cc-band--${m.band}`}>{bandLabel(m.band)}</span>
                        ) : null}
                      </td>
                      <td>{formatNirfDisplay(m.branchProfile ?? m.college)}</td>
                      <td>{formatFee(m.college.feeAnnualLakh)}</td>
                      <td>
                        <PlacementSalaryStack
                          placement={m.branchProfile?.placement ?? m.branchPlacement}
                          provenance={m.branchProfile?.provenance?.placement}
                        />
                      </td>
                      <td>
                        {m.branchProfile?.provenance?.placement?.fields?.pctPlaced?.status !==
                          'unavailable' && m.branchProfile?.placement?.pctPlaced != null
                          ? `${m.branchProfile.placement.pctPlaced}%`
                          : DATA_UNAVAILABLE_LABEL}
                      </td>
                      <td>{m.avgCutoff ? m.avgCutoff.toLocaleString('en-IN') : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openCollege(m.college.id)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {compareRows.length >= 2 && <CompareSideBySide rows={compareRows} />}

          {compareRows.length === 1 && (
            <p className="form-hint">Select at least one more college to see the comparison table.</p>
          )}
        </section>
      )}

      {panel === 'colleges' && (
        <section className="cc-panel" aria-label="Browse colleges">
          <div className="cc-browse-bar">
            <input
              type="search"
              className="cc-search"
              placeholder="Search college, city, or state…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              {CAREER_EXAMS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              {TYPE_FILTERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="cc-college-grid">
            {collegeList.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cc-college-card"
                onClick={() => openCollege(c.id)}
              >
                <span className={`cc-type-pill cc-type-pill--${c.type}`}>{c.type.toUpperCase()}</span>
                <strong>{c.shortName}</strong>
                <span className="cc-sub">
                  {c.city}, {c.state}
                </span>
                <span className="cc-sub">
                  NIRF {formatNirfDisplay(c)} · {c.branches.length} branches
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === 'info' && (
        <section className="cc-panel" aria-label="College information">
          {!selected ? (
            <div className="insight-empty-state cc-empty">
              <h2>Pick a college</h2>
              <p>Open Details from a prediction, compare tab, or browse the list.</p>
              <button type="button" className="btn btn-primary" onClick={() => setPanel('colleges')}>
                Browse colleges
              </button>
            </div>
          ) : (
            <div className="cc-detail">
              <header className="cc-detail-head">
                <div>
                  <span className={`cc-type-pill cc-type-pill--${selected.type}`}>
                    {selected.type.toUpperCase()}
                  </span>
                  <h2>{selected.name}</h2>
                  <p className="cc-sub">
                    {selected.city}, {selected.state}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel('compare')}>
                  Compare by branch
                </button>
              </header>

              <OfficialReferencePanel college={selected} compact />

              <div className="cc-info-grid">
                <CollegeFactsPanel college={selected} />
                <div className="cc-info-card">
                  <h3>Institute overview</h3>
                  <p className="form-hint">
                    Fees and NIRF are college-level. Salaries, cutoffs, and % placed below are shown{' '}
                    <strong>per branch</strong> (e.g. CSE vs ME differ).
                  </p>
                  <ul>
                    <li>
                      <span>Annual fee (shared)</span>
                      <strong>{formatFee(selected.feeAnnualLakh)}</strong>
                    </li>
                    <li>
                      <span>
                        NIRF rank ({selected.nirfYear ?? '—'}) <ProvenanceBadge status="official" />
                      </span>
                      <strong>{formatNirfDisplay(selected)}</strong>
                    </li>
                  </ul>
                </div>
              </div>

              {detailBranch && (
                <>
                  <PlacementPackageTable
                    placement={buildBranchProfile(selected, detailBranch).placement}
                    branchLabel={buildBranchProfile(selected, detailBranch).branchLabel}
                  />
                  {hasRankPrediction && (
                    <RoundChanceTable
                      board={buildRoundChanceBoard(prediction.rank, selected, detailBranch)}
                    />
                  )}
                </>
              )}

              <h3 className="cc-section-title">
                All parameters by branch ({HISTORY_YEARS.join('–')})
              </h3>
              <CutoffVerifyNote college={selected} />
              <p className="cc-placement-disclaimer">{PLACEMENT_DISCLAIMER}</p>
              <div className="cc-match-table-wrap cc-branch-detail-scroll">
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>NIRF</th>
                      <th>Fee</th>
                      <th>Avg salary</th>
                      <th>Median</th>
                      <th>Lowest</th>
                      <th>Highest</th>
                      <th>% placed</th>
                      {HISTORY_YEARS.map((y) => (
                        <th key={y}>
                          {y} Open/Close <ProvenanceBadge status="official" />
                        </th>
                      ))}
                      <th>Avg cutoff</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.branches.map((b) => {
                      const bp = buildBranchProfile(selected, b)
                      return (
                        <tr key={b.id}>
                          <td>
                            <strong>{bp.branchLabel}</strong>
                            <div className="cc-sub">{bp.branchName}</div>
                          </td>
                          <td>{formatNirfDisplay(bp)}</td>
                          <td>{formatFee(bp.feeAnnualLakh)}</td>
                          <td>{formatPlacementField(bp.placement, 'avgLpa')}</td>
                          <td>{formatPlacementField(bp.placement, 'medianLpa')}</td>
                          <td>{formatPlacementField(bp.placement, 'lowestLpa')}</td>
                          <td>{formatPlacementField(bp.placement, bp.placement?.highestLpa != null ? 'highestLpa' : 'highestDomesticLpa')}</td>
                          <td>
                            {bp.provenance?.placement?.fields?.pctPlaced?.status !== 'unavailable' &&
                            bp.placement?.pctPlaced != null
                              ? `${bp.placement.pctPlaced}%`
                              : DATA_UNAVAILABLE_LABEL}
                          </td>
                          {HISTORY_YEARS.map((y) => (
                            <td key={y}>
                              <CutoffRoundCell round={bp.cutoffRounds?.[y]} />
                            </td>
                          ))}
                          <td>
                            {bp.avgCutoff != null ? bp.avgCutoff.toLocaleString('en-IN') : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setBranchId(b.id)
                                toggleCompare(selected.id, b.id)
                                setPanel('compare')
                              }}
                            >
                              Compare
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="cc-verify-note">
                {getCollegeOfficialLinks(selected)
                  .filter((l) => l.kind === 'placement' || l.kind === 'nirf' || l.kind === 'counselling')
                  .map((link) => (
                    <span key={link.id} className="cc-verify-link-wrap">
                      <VerifyOfficialLink source={link} className="cc-verify-link--inline" />
                    </span>
                  ))}
              </p>
            </div>
          )}
        </section>
      )}

      {panel === 'choice-guide' && (
        <section className="cc-panel cc-choice-guide" aria-label={CHOICE_FILLING_TAB.name}>
          <header className="cc-choice-guide-head">
            <h2 className="cc-section-title">{CHOICE_FILLING_TAB.name}</h2>
            <p className="form-hint">{CHOICE_FILLING_TAB.subtitle}</p>
            <div className="cc-choice-badges" role="group" aria-label="Data vs advice">
              <span className="cc-prov-badge cc-prov-badge--official">Official cutoff data</span>
              <span className="cc-prov-badge cc-prov-badge--indicative">Indicative placement</span>
              <span className="ocr-engine-badge" title="AI guide">
                AI
              </span>
              <span className="cc-choice-badge-ai">AI advice — not a guarantee</span>
            </div>
            <div className="cc-choice-callouts" aria-label="Important advice">
              <p className="cc-choice-callout cc-choice-callout--fill">
                <strong>Fill the maximum list.</strong> {MAX_FILL_ADVICE}
              </p>
              <p className="cc-choice-callout cc-choice-callout--past">
                <strong>Past ≠ future.</strong> {PAST_NOT_FUTURE_WARNING}
              </p>
            </div>
            <p className="cc-rank-disclaimer form-hint">{CHOICE_FILLING_DISCLAIMER}</p>
            <p className="form-hint">{OFFICIAL_VS_AI_NOTE}</p>
          </header>

          <div className="cc-step">
            <h3 className="cc-step-title">Your inputs</h3>
            <p className="form-hint">
              Choose predicted rank from Step 1, or type your actual AIR from the scorecard. Category and
              home state still come from Rank &amp; college.
            </p>

            <fieldset className="cc-rank-source">
              <legend className="cc-rank-source-legend">Which rank should drive this guide?</legend>
              <div className="cc-rank-source-options" role="radiogroup" aria-label="Rank source">
                <label
                  className={`cc-rank-source-option${choiceRankMode === 'predicted' ? ' is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="choice-rank-source"
                    value="predicted"
                    checked={choiceRankMode === 'predicted'}
                    onChange={() => setChoiceRankMode('predicted')}
                  />
                  <span className="cc-rank-source-title">Predicted rank</span>
                  <span className="cc-rank-source-hint">From Step 1 marks prediction</span>
                </label>
                <label
                  className={`cc-rank-source-option${choiceRankMode === 'actual' ? ' is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="choice-rank-source"
                    value="actual"
                    checked={choiceRankMode === 'actual'}
                    onChange={() => {
                      setChoiceRankMode('actual')
                      // Prefill from Step 1 AIR field if student already typed one there.
                      if (actualAir.trim() === '' && rank.trim() !== '') setActualAir(rank.trim())
                      if (actualPercentile.trim() === '' && percentile.trim() !== '') {
                        setActualPercentile(percentile.trim())
                      }
                    }}
                  />
                  <span className="cc-rank-source-title">Actual rank</span>
                  <span className="cc-rank-source-hint">I already know my AIR</span>
                </label>
              </div>
            </fieldset>

            {choiceRankMode === 'actual' && (
              <div className="cc-form-grid cc-actual-rank-grid">
                <label className="cc-field cc-field--primary">
                  Your actual AIR
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="e.g. 12500"
                    value={actualAir}
                    onChange={(e) => setActualAir(e.target.value)}
                    aria-invalid={actualAirError ? true : undefined}
                    aria-describedby={actualAirError ? 'cc-actual-air-error' : undefined}
                  />
                </label>
                <label className="cc-field">
                  Category rank <span className="cc-optional">(optional)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="if on scorecard"
                    value={actualCategoryRank}
                    onChange={(e) => setActualCategoryRank(e.target.value)}
                  />
                </label>
                <label className="cc-field">
                  Percentile <span className="cc-optional">(optional)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="e.g. 98.50"
                    value={actualPercentile}
                    onChange={(e) => setActualPercentile(e.target.value)}
                  />
                </label>
              </div>
            )}
            {actualAirError && (
              <p id="cc-actual-air-error" className="form-hint" role="alert" style={{ color: 'var(--danger, #b33)' }}>
                {actualAirError}
              </p>
            )}

            <p className="cc-guide-rank-banner" role="status">
              {hasGuideRank ? (
                <>
                  Guide is using{' '}
                  <strong>
                    {choiceRankMode === 'actual' ? 'actual AIR' : 'predicted AIR'}{' '}
                    {guideRank.toLocaleString('en-IN')}
                  </strong>
                  {guideCategoryRank != null && guideCategoryRank > 0
                    ? ` · category rank ${guideCategoryRank.toLocaleString('en-IN')}`
                    : ''}
                  {guidePercentile != null ? ` · percentile ${Number(guidePercentile).toFixed(2)}` : ''}
                </>
              ) : choiceRankMode === 'actual' ? (
                <>Enter your actual AIR above to build the choice-filling guide.</>
              ) : (
                <>No predicted rank yet — open Rank &amp; college and enter marks (or AIR).</>
              )}
            </p>

            <div className="cc-form-grid">
              <label className="cc-field">
                Counselling type
                <select
                  value={counsellingType}
                  onChange={(e) =>
                    setCounsellingType(/** @type {typeof counsellingType} */ (e.target.value))
                  }
                >
                  {counsellingTypeOpts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cc-field">
                <span>Exam</span>
                <strong>{examMeta.label}</strong>
              </div>
              <div className="cc-field">
                <span>{choiceRankMode === 'actual' ? 'AIR in use' : 'Predicted AIR'}</span>
                <strong>
                  {hasGuideRank
                    ? guideRank.toLocaleString('en-IN')
                    : choiceRankMode === 'actual'
                      ? '— type above'
                      : '— from Step 1'}
                </strong>
              </div>
              <div className="cc-field">
                <span>Category</span>
                <strong>{categoryLabel}</strong>
              </div>
              <div className="cc-field">
                <span>Home state</span>
                <strong>{stateLabel}</strong>
              </div>
              <div className="cc-field">
                <span>Preferred branch</span>
                <strong>{preferredBranchLabel ?? 'Any'}</strong>
              </div>
              <div className="cc-field">
                <span>Preferred college</span>
                <strong>{preferredCollege.trim() || 'Any'}</strong>
              </div>
            </div>
            {!hasGuideRank && choiceRankMode === 'predicted' && (
              <p className="cc-session-note" role="status">
                Tip: open{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel('predict')}>
                  1 · Rank &amp; college
                </button>{' '}
                and enter marks or AIR — the AI guide runs automatically when a predicted rank is ready.
              </p>
            )}
            {!hasGuideRank && choiceRankMode === 'actual' && (
              <p className="cc-session-note" role="status">
                Tip: type your All India Rank (whole number, 1 or higher). Category and home state stay as set
                in Rank &amp; college.
              </p>
            )}
          </div>

          <div className="cc-step">
            <div className="cc-section-row">
              <h3 className="cc-step-title">Suggested fill order</h3>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={choiceGuideAiLoading || !hasGuideRank}
                onClick={() => runChoiceGuideAi()}
              >
                {choiceGuideAiLoading ? 'Refreshing…' : 'Refresh AI guide'}
              </button>
            </div>
            <p className="form-hint">{choiceOrder.strategy}</p>
            <p className="cc-session-note">
              Use this table as a starting order, then keep adding honest preferences on the official portal
              up to the <strong>maximum</strong> the site allows.
            </p>
            {hasGuideRank && choiceOrder.counts.total > 0 ? (
              <>
                <div className="cc-choice-band-summary" aria-label="Band mix">
                  {(
                    [
                      ['dream', choiceOrder.counts.dream],
                      ['reach', choiceOrder.counts.reach],
                      ['match', choiceOrder.counts.match],
                      ['safe', choiceOrder.counts.safe],
                    ]
                  ).map(([band, n]) => (
                    <span key={band} className={`cc-band cc-band--${band}`}>
                      {bandLabel(band)} · {n}
                    </span>
                  ))}
                </div>
                <div className="cc-match-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>College · branch</th>
                        <th>Band</th>
                        <th>Cutoff</th>
                        <th>Placement / salary</th>
                        <th>Why this order</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {choiceOrder.ordered.map((row) => (
                        <tr key={`${row.college?.id}-${row.branch?.id}-${row.preference}`}>
                          <td>{row.preference}</td>
                          <td>
                            <strong>{row.college?.shortName ?? row.college?.name}</strong>
                            <div className="cc-sub">{row.branch?.name}</div>
                            {row.preferenceLabels?.length > 0 && (
                              <div className="cc-sub cc-choice-pref-tags">
                                {row.preferenceLabels.join(' · ')}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`cc-band cc-band--${row.band}`}>{row.bandLabel}</span>
                          </td>
                          <td>
                            {row.avgCutoff != null
                              ? Number(row.avgCutoff).toLocaleString('en-IN')
                              : DATA_UNAVAILABLE_LABEL}
                            <ProvenanceBadge status="official" title="From counselling cutoff snapshot" />
                          </td>
                          <td>
                            <div className="cc-sub">{row.placementSignals?.salaryLabel}</div>
                            <div className="cc-sub">{row.placementSignals?.pctLabel}</div>
                            <ProvenanceBadge
                              status={row.placementBadge === 'unavailable' ? 'unavailable' : row.placementBadge}
                              title={
                                row.placementBadge === 'official'
                                  ? 'Official placement figure'
                                  : row.placementBadge === 'indicative'
                                    ? 'Indicative placement / salary'
                                    : 'No placement figure in catalog'
                              }
                            />
                          </td>
                          <td>
                            <ul className="cc-choice-why">
                              {(row.whyNotes ?? []).slice(0, 3).map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                if (row.college?.id) openCollege(row.college.id)
                              }}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="cc-empty">
                No cutoff-based list yet.{' '}
                {choiceRankMode === 'actual'
                  ? 'Enter a valid actual AIR above, or switch counselling type if your exam does not match (e.g. MCC for NEET).'
                  : 'Predict a rank first, or switch counselling type if your exam does not match (e.g. MCC for NEET).'}
              </p>
            )}
          </div>

          <div className="cc-step">
            <h3 className="cc-step-title">Preference fit</h3>
            <p className="form-hint">{choiceOrder.preferenceFit?.summary}</p>
            {(preferredBranchLabel || preferredCollege.trim()) && (
              <p className="cc-session-note">
                Using{preferredBranchLabel ? ` branch “${preferredBranchLabel}”` : ''}
                {preferredBranchLabel && preferredCollege.trim() ? ' and' : ''}
                {preferredCollege.trim() ? ` college hint “${preferredCollege.trim()}”` : ''} from Rank &amp;
                college.
              </p>
            )}
          </div>

          <div className="cc-step">
            <h3 className="cc-step-title">AI counselling narrative</h3>
            <p className="form-hint">
              Runs automatically when this tab opens. Uses the predicted or actual rank you selected
              above. Refresh to regenerate.
            </p>
            {choiceGuideAiLoading && !choiceGuideAi && (
              <p className="cc-session-note" role="status">
                Building your AI choice-filling guide…
              </p>
            )}
            {(choiceGuideAi || localChoiceNarrative) && (
              <div className="card-inner cc-choice-narrative" style={{ marginTop: '0.5rem' }}>
                <span className="ocr-engine-badge" title="AI guide">
                  AI
                </span>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0.5rem 0 0' }}>
                  {choiceGuideAi?.text ?? localChoiceNarrative.text}
                </pre>
                <p className="form-hint">
                  {choiceGuideAi?.disclaimer ?? localChoiceNarrative.disclaimer}
                </p>
              </div>
            )}
          </div>

          <div className="cc-step">
            <h3 className="cc-step-title">Order principles</h3>
            <ul className="cc-choice-principles">
              {CHOICE_ORDER_PRINCIPLES.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="cc-step">
            <h3 className="cc-step-title">Mini guide — {counsellingMeta.short}</h3>
            <div className="cc-choice-guide-sections">
              {choiceGuideSections.map((sec) => (
                <article key={sec.id} className="cc-choice-guide-card">
                  <h4>{sec.title}</h4>
                  <ul>
                    {sec.body.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="cc-step">
            <h3 className="cc-step-title">Official links</h3>
            <ul className="cc-official-ref-list">
              {choiceOfficialLinks.map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noreferrer noopener" className="cc-official-ref-main">
                    {link.label}
                  </a>
                  {link.description && <span className="cc-sub cc-official-ref-desc">{link.description}</span>}
                  <span className="cc-official-ref-verify">
                    <VerifyOfficialLink source={link} />
                  </span>
                </li>
              ))}
              {getCounsellingOfficialLinks().map((link) =>
                choiceOfficialLinks.some((c) => c.id === link.id) ? null : (
                  <li key={`all-${link.id}`}>
                    <a href={link.url} target="_blank" rel="noreferrer noopener" className="cc-official-ref-main">
                      {link.label}
                    </a>
                    <span className="cc-official-ref-verify">
                      <VerifyOfficialLink source={link} />
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </section>
      )}

      {isAdmin && panel === COUNSELLING_UPDATE_TAB.id && (
        <section className="cc-panel" aria-label="Update counselling data">
          <div className="cc-step">
            <h2 className="cc-step-title">Update counselling data</h2>
            <p className="form-hint">
              Admin only. Uses Gemini when <code>GEMINI_API_KEY</code> is set (
              <code>GEMINI_TEXT_MODEL=gemini-3.5-flash-lite</code>), else OpenAI if{' '}
              <code>OPENAI_API_KEY</code> is set, else the same local AI tables used for rank prediction.
              Placement % and packages stay published-source only — unknown stays Not available. Rank /
              percentile trend stays the latest two years. All figures are Indicative.
            </p>
            <div
              className={`cc-update-status${
                adminUpdate?.status === 'running'
                  ? ' is-running'
                  : adminUpdate?.status === 'done'
                    ? ' is-done'
                    : adminUpdate?.status === 'failed'
                      ? ' is-failed'
                      : ''
              }`}
              role="status"
            >
              <strong>
                {adminUpdateBusy || adminUpdate?.status === 'running'
                  ? `Updating with ${adminUpdate?.engineLabel || 'AI'}...`
                  : adminUpdate?.message || 'Ready to update counselling data.'}
              </strong>
              {adminUpdate?.model ? (
                <p className="form-hint" style={{ margin: '0.4rem 0 0' }}>
                  Engine: {adminUpdate.engineLabel}
                  {adminUpdate.model ? ` · ${adminUpdate.model}` : ''}
                  {adminUpdate.collegeCount ? ` · ${adminUpdate.collegeCount} colleges` : ''}
                </p>
              ) : adminUpdate?.engineLabel ? (
                <p className="form-hint" style={{ margin: '0.4rem 0 0' }}>
                  Engine: {adminUpdate.engineLabel}
                </p>
              ) : null}
              {adminUpdate?.hint ? <p className="form-hint">{adminUpdate.hint}</p> : null}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => runAdminCounsellingUpdate()}
              disabled={adminUpdateBusy || adminUpdate?.status === 'running'}
            >
              {adminUpdateBusy || adminUpdate?.status === 'running' ? 'Updating…' : 'Update counselling now'}
            </button>
          </div>
        </section>
      )}

      <footer className="cc-sources cc-official-ref cc-official-ref--footer">
        <h3>Official reference — verify before you choose</h3>
        <p className="cc-official-ref-note">{GO_LIVE_DATA_POLICY}</p>
        <p className="cc-official-ref-note">
          Cutoffs show official <strong>closing</strong> ranks from counselling ({HISTORY_YEARS.join('–')}
          ). Opening ranks are not in our snapshot — labelled Not available. Rank predictions use NTA-style
          curves with percentile ↔ AIR tied to exam pool size.
        </p>
        <ul className="cc-official-ref-list">
          {CAREER_COMPASS_SOURCES.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="cc-official-ref-main">
                {s.label} ({s.years ?? HISTORY_YEARS.join('–')})
              </a>
              {s.description && <span className="cc-sub cc-official-ref-desc">{s.description}</span>}
              <span className="cc-official-ref-verify">
                <VerifyOfficialLink source={s} />
              </span>
            </li>
          ))}
        </ul>
        <p className="form-hint">
          Guidance only — confirm final allotment on JoSAA / CSAB / MCC and your NTA scorecard (AIR
          + State Rank). Percentile tables and round chances are Indicative compiled data, not a live NTA API.
        </p>
        <CounsellingFillHint />
      </footer>
    </div>
  )
}
