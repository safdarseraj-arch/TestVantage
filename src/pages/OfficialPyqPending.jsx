/**
 * Official previous-year papers — pending approval bank.
 * Import official PDFs/JSON → review → Approve & publish (PYQ + Question Bank)
 * or Reject (stays out of student PYQ).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { isAdminLoggedIn } from '../utils/auth.js'
import { LOCAL_QUALITY_REVISION } from '../utils/officialPyqLocalQuality.js'
import {
  OFFICIAL_PYQ_EXAMS,
  OFFICIAL_PYQ_PORTALS,
  listOfficialPyqSourceSlots,
  getOfficialPyqExamLabel,
} from '../data/officialPyqSources'
import {
  listOfficialPyqPendingSummaries,
  hydrateOfficialPyqPendingSummariesIfEmpty,
  pendingPaperFromSourceSlot,
  findOfficialPyqPendingBySourceSlot,
  getOfficialPyqPendingPaper,
  getOfficialPyqPendingPreviewPaper,
  getOfficialPyqPendingOcrText,
  updateOfficialPyqPendingPaper,
  countOfficialPyqPendingReview,
  officialPyqPaperToSummary,
  recoverOfficialPyqQuestionsFromStore,
  findOfficialPyqSiblingWithQuestions,
  countFilledOfficialPyqQuestions,
  officialPyqPaperQuestionCount,
} from '../utils/officialPyqPendingStore'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import OfficialPyqReplicaControls from '../components/OfficialPyqReplicaControls.jsx'
import OfficialPyqPendingFill from '../components/OfficialPyqPendingFill.jsx'
import OfficialPyqTabList from './OfficialPyqTabList.jsx'
import OfficialPyqPreviewPager from './OfficialPyqPreviewPager.jsx'
import { resetOfficialPyqSplitWorker, peekOfficialPyqSplitKeep } from '../utils/officialPyqSplitWorker.js'
import {
  listOfficialPyqMissingSlots,
  officialPyqExpectedTotal,
  reserveOfficialPyqMissingSlots,
} from '../utils/officialPyqMissingSlots.js'
import { buildLiteExtractionSummary } from '../utils/pyqOcrCountLite.js'
import { applyOfficialPyqPublicSnapshotOnce } from '../utils/applyOfficialPyqPublicSnapshot.js'

const ExtractionSummaryTable = lazy(() => import('../components/ExtractionSummaryTable.jsx'))
const OfficialPyqOriginalComparePanel = lazy(() => import('../components/OfficialPyqOriginalComparePanel.jsx'))
const OfficialPyqPaperFactsForm = lazy(() => import('../components/OfficialPyqPaperFactsForm.jsx'))
const OFFICIAL_PYQ_CARD_CHANGED_EVENT = 'testvantage:official-pyq-card-changed'


const OFFICIAL_PYQ_UI_KEY = 'testvantage-official-pyq-ui'

function readOfficialPyqUi() {
  try {
    const raw = sessionStorage.getItem(OFFICIAL_PYQ_UI_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeOfficialPyqUi(patch) {
  try {
    sessionStorage.setItem(OFFICIAL_PYQ_UI_KEY, JSON.stringify({ ...readOfficialPyqUi(), ...patch }))
  } catch {
    /* ignore quota */
  }
}

/** Run heavy sync work after paint so clicks stay responsive. */
async function runHeavyWork(fn) {
  await yieldToUi()
  if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
    await scheduler.yield()
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn())
      } catch (err) {
        reject(err)
      }
    }, 0)
  })
}

const OcrOutputFormatPicker = lazy(() => import('../components/OcrOutputFormatPicker.jsx'))

const API_BASE = ''
const API_FETCH_MS = 8000
/** Red-banner lines that come from the per-card content check; replaced, never stacked, on each re-check. */
const CARD_REVIEW_LINE = /The marked part is the problem|missing a list|^Go to Q /
/** Local Mathpix re-parse only — no Gemini wait on this button. */
const RE_PARSE_LOCAL_MS = 45_000

/** @param {string} label */
function isReParseProgressLabel(label) {
  return /re-pars|gemini split|stored ocr|healing question|keeping stored|copying answers|saving cards|splitting stored/i.test(String(label ?? ''))
}

/** Let React paint busy/spinner before heavy dynamic imports. */
function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

/** @param {'jee-main' | 'jee-advanced' | 'neet'} exam */
function expectedMinOfficialPyqCount(exam) {
  if (exam === 'jee-advanced') return 40
  if (exam === 'jee-main') return 20
  if (exam === 'neet') return 30
  return 8
}

function paperHasStoredOcr(paper) {
  if (String(paper?.preparedText ?? '').trim().length >= 80) return true
  return /prepared OCR|PDF text|vision text|Mathpix/i.test(String(paper?.notes ?? ''))
}

function extractSummaryFromNotes(notes) {
  const m = String(notes ?? '').match(/^Extract summary:[^\n]+/im)
  return m ? m[0].replace(/^Extract summary:\s*/i, '').trim() : ''
}

function loadOfficialPyqApproval() {
  return import('../utils/officialPyqApproval.js')
}

function loadOfficialPyqExtractHelpers() {
  return import('../utils/pyqGeminiExtract.js')
}

function loadOfficialPyqHeal() {
  return import('../utils/extendTruncatedStem.js')
}

/** Run work after paint; prefer idle time so row clicks stay responsive. */
function scheduleIdleWork(fn, { timeoutMs = 1500, fallbackMs = 48 } = {}) {
  let cancelled = false
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => {
      if (!cancelled) fn()
    }, { timeout: timeoutMs })
    return () => {
      cancelled = true
      cancelIdleCallback(id)
    }
  }
  const id = setTimeout(() => {
    if (!cancelled) fn()
  }, fallbackMs)
  return () => {
    cancelled = true
    clearTimeout(id)
  }
}

/** @param {{ id?: string, paperId?: string, paperLabel?: string } | null | undefined} paper */
function paperRowKey(paper) {
  return String(paper?.id || paper?.paperId || paper?.paperLabel || '').trim()
}

function lastOpenedOfficialPyqId() {
  return String(readOfficialPyqUi().openId ?? '').trim()
}

function lookupSavedPaperSummary(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return null
  try {
    hydrateOfficialPyqPendingSummariesIfEmpty()
    return (
      listOfficialPyqPendingSummaries('all').find((p) => paperRowKey(p) === needle) ?? null
    )
  } catch {
    return null
  }
}

export default function OfficialPyqPending() {
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  const [exam, setExam] = useState(/** @type {'jee-main' | 'jee-advanced' | 'neet'} */ ('jee-advanced'))
  const [year, setYear] = useState(2024)
  const [session, setSession] = useState('Paper 1')
  const [pyqDate, setPyqDate] = useState('2024-01-27')
  const [pyqShift, setPyqShift] = useState(1)
  const [sourceUrl, setSourceUrl] = useState('https://jeeadv.ac.in/archive.html')
  const [sourceLabel, setSourceLabel] = useState('Official JEE Advanced archive')
  const [paperLabel, setPaperLabel] = useState('')
  const [selectedId, setSelectedId] = useState(() => lastOpenedOfficialPyqId() || null)
  const [previewOpen, setPreviewOpen] = useState(() => Boolean(lastOpenedOfficialPyqId()))
  const [openedPaper, setOpenedPaper] = useState(() => {
    const id = lastOpenedOfficialPyqId()
    if (!id) return null
    return (
      lookupSavedPaperSummary(id) || {
        id,
        paperLabel: 'Paper',
        status: 'pending_review',
        exam: 'jee-advanced',
        questionCount: 0,
      }
    )
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reParseBusy, setReParseBusy] = useState(false)
  const [qualityBusyId, setQualityBusyId] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [extractSummary, setExtractSummary] = useState('')
  const [listError, setListError] = useState('')
  const [previewMeta, setPreviewMeta] = useState({ count: 0, filled: 0 })
  const [previewReload, setPreviewReload] = useState(0)
  const [cardEditTick, setCardEditTick] = useState(0)
  const onPreviewMeta = useCallback((meta) => {
    setPreviewMeta({
      count: Number(meta?.count) || 0,
      filled: Number(meta?.filled) || 0,
    })
  }, [])
  const previewRef = useRef(null)
  const openPreviewIdRef = useRef(selectedId)
  openPreviewIdRef.current = selectedId
  const geminiStallRef = useRef(null)
  const reParseWatchdogRef = useRef(null)
  const reparseAbortRef = useRef(/** @type {AbortController | null} */ (null))
  const workGenRef = useRef(0)
  const ocrRestoreTriedRef = useRef('')
  const persistedHealRef = useRef('')

  function bumpWorkGen() {
    workGenRef.current += 1
    return workGenRef.current
  }

  function isWorkStale(gen) {
    return gen !== workGenRef.current
  }

  /** Fresh copy from IndexedDB after heal/re-parse saves. */
  function resolveFreshPaper(paperOrId) {
    const id =
      typeof paperOrId === 'object' && paperOrId != null
        ? String(paperOrId.id ?? '').trim()
        : String(paperOrId ?? '').trim()
    if (!id) return null
    return getOfficialPyqPendingPaper(id)
  }

  const openOfficialPaper = useCallback((paperOrId) => {
    const summary =
      paperOrId && typeof paperOrId === 'object' ? officialPyqPaperToSummary(paperOrId) : null
    const id = summary ? paperRowKey(summary) : String(paperOrId ?? '').trim()
    if (!id) return
    if (id === selectedId) {
      setPreviewOpen((open) => !open)
      return
    }
    bumpWorkGen()
    setReParseBusy(false)
    setProgressPct(0)
    setProgressLabel('')
    setOpenedPaper(
      summary || {
        id,
        paperLabel: 'Paper',
        status: 'pending_review',
        exam: 'jee-advanced',
        questionCount: 0,
      },
    )
    setSelectedId(id)
    setPreviewOpen(true)
    writeOfficialPyqUi({ openId: id })
  }, [selectedId])

  useEffect(() => {
    return () => resetOfficialPyqSplitWorker()
  }, [])

  useEffect(() => {
    const onCardChanged = (ev) => {
      const id = String(ev?.detail?.paperId ?? '')
      if (!id) return
      bump()
      setCardEditTick((n) => n + 1)
      setOpenedPaper((prev) => (prev?.id === id ? lookupSavedPaperSummary(id) || prev : prev))
    }
    window.addEventListener(OFFICIAL_PYQ_CARD_CHANGED_EVENT, onCardChanged)
    return () => window.removeEventListener(OFFICIAL_PYQ_CARD_CHANGED_EVENT, onCardChanged)
  }, [bump])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await applyOfficialPyqPublicSnapshotOnce()
        if (cancelled || !result?.ok || result.skipped) return
        writeOfficialPyqUi({ filter: 'pending_review', openId: readOfficialPyqUi().openId })
        const loaded = Array.isArray(result.papers) ? result.papers : []
        const brief = loaded
          .map((p) => `${p.year || ''} ${p.session || 'Paper'} (${p.questionCount || 0} Q)`)
          .filter((s) => s.trim())
          .join(', ')
        setMessage(
          `Loaded stored papers into Pending approval` +
            (brief ? `: ${brief}` : '') +
            `. Not approved.`,
        )
        bump()
      } catch {
        /* snapshot optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bump])

  useEffect(() => {
    try {
      hydrateOfficialPyqPendingSummariesIfEmpty()
      void listOfficialPyqPendingSummaries('all')
      setListError('')
    } catch {
      setListError('Could not load — retry')
    }
    const savedId = lastOpenedOfficialPyqId()
    if (savedId) {
      const row = lookupSavedPaperSummary(savedId)
      if (row) setOpenedPaper(row)
      setSelectedId((cur) => cur || savedId)
      setPreviewOpen(true)
    }
    if (listOfficialPyqPendingSummaries('all').length) {
      bump()
      return undefined
    }
    let cancelled = false
    const run = () => {
      if (cancelled) return
      try {
        hydrateOfficialPyqPendingSummariesIfEmpty()
      } catch {
        /* Retry button still available */
      }
      if (!cancelled) bump()
    }
    const later =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 2500 })
        : setTimeout(run, 400)
    return () => {
      cancelled = true
      if (typeof cancelIdleCallback === 'function' && typeof later === 'number') {
        cancelIdleCallback(later)
      } else {
        clearTimeout(later)
      }
    }
  }, [bump])

  useEffect(() => {
    if (!busy || progressPct < 60) {
      if (geminiStallRef.current) {
        clearTimeout(geminiStallRef.current)
        geminiStallRef.current = null
      }
      return undefined
    }
    if (geminiStallRef.current) return undefined
    geminiStallRef.current = setTimeout(() => {
      geminiStallRef.current = null
      setError(
        'Gemini split stalled. The button is unlocked. Use Re-parse stored OCR if the PDF text was saved, or upload again. Do not Approve.',
      )
      setBusy(false)
      setProgressPct(0)
      setProgressLabel('')
    }, 15000)
    return undefined
  }, [busy, progressPct])

  useEffect(() => {
    if (!reParseBusy) {
      if (reParseWatchdogRef.current) {
        clearTimeout(reParseWatchdogRef.current)
        reParseWatchdogRef.current = null
      }
      return undefined
    }
    if (reParseWatchdogRef.current) return undefined
    reParseWatchdogRef.current = setTimeout(() => {
      reParseWatchdogRef.current = null
      reparseAbortRef.current?.abort()
      resetOfficialPyqSplitWorker()
      bumpWorkGen()
      const keep = peekOfficialPyqSplitKeep()
      const n = Number(keep?.count) || 0
      if (keep?.id && keep.questions?.length) {
        try {
          updateOfficialPyqPendingPaper(keep.id, { questions: keep.questions })
        } catch {
          /* still unlock */
        }
        setPreviewReload((x) => x + 1)
      }
      setMessage(
        n
          ? `Local split kept ${n} questions. Re-parse was stopped after ${Math.round(RE_PARSE_LOCAL_MS / 1000)}s. You can use tabs and Next.`
          : 'Re-parse took too long and was stopped. Your stored cards are still shown.',
      )
      setError('')
      setReParseBusy(false)
      setProgressPct(0)
      setProgressLabel('')
    }, RE_PARSE_LOCAL_MS + 2000)
    return undefined
  }, [reParseBusy])

  const pendingCount = useMemo(() => {
    void tick
    try {
      return countOfficialPyqPendingReview()
    } catch {
      return 0
    }
  }, [tick])

  const [mainDates, setMainDates] = useState(/** @type {string[]} */ ([]))
  const [formatPyqDate, setFormatPyqDate] = useState(/** @type {(d: string) => string} */ ((d) => d))

  useEffect(() => {
    let cancelled = false
    import('../utils/pyqSlotMeta.js')
      .then(({ listPyqStyleSlots, uniquePyqDatesFromSlots, formatPyqDatePretty }) => {
        if (cancelled) return
        setMainDates(uniquePyqDatesFromSlots(listPyqStyleSlots('jee-main', year)))
        setFormatPyqDate(() => formatPyqDatePretty)
      })
      .catch(() => {
        if (!cancelled) setMainDates([])
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const slots = useMemo(() => listOfficialPyqSourceSlots(exam, year), [exam, year])

  const selected =
    openedPaper && selectedId && String(openedPaper.id) === String(selectedId)
      ? openedPaper
      : selectedId
        ? { id: selectedId, paperLabel: 'Paper', status: 'pending_review', exam: 'jee-advanced', questionCount: 0 }
        : null

  const [approveBlockers, setApproveBlockers] = useState(/** @type {string[]} */ ([]))
  const [approveBusy, setApproveBusy] = useState(false)
  const [approveLabel, setApproveLabel] = useState('')
  const [approvePct, setApprovePct] = useState(0)

  useEffect(() => {
    if (!selectedId) {
      setOpenedPaper((prev) => (prev == null ? prev : null))
      setPreviewMeta((prev) => (prev.count || prev.filled ? { count: 0, filled: 0 } : prev))
    }
  }, [selectedId])

  const [extractionReport, setExtractionReport] = useState(null)

  const previewExpected = useMemo(() => {
    if (!selected) return 0
    const fromOcr = officialPyqExpectedTotal(selected)
    if (fromOcr >= 8) return fromOcr
    const stored = Number(selected.expectedQuestionCount)
    if (Number.isFinite(stored) && stored >= 8) return stored
    return 0
  }, [selected])

  useEffect(() => {
    if (!previewOpen || !selected || selected.status !== 'pending_review') {
      setApproveBlockers([])
      return
    }
    const filled = Number(previewMeta.filled) || 0
    const min = expectedMinOfficialPyqCount(selected.exam)
    /** @type {string[]} */
    const errors = []
    if (!selected.aiReplicaPaper && !selected.factsConfirmedAt && !selected.adminFacts?.confirmedAt) {
      errors.push('Paper facts are not confirmed. Open “Paper facts”, check every row, and press Confirm.')
    }
    if (!filled) errors.push('Add at least one question before approving.')
    if (filled > 0 && filled < min) {
      errors.push(
        `Do not approve: found ${filled} question(s), need at least ${min} for a ${getOfficialPyqExamLabel(selected.exam)} paper.`,
      )
    }
    const expected = Number(previewExpected) || 0
    if (expected >= 8 && filled > 0 && filled < expected - 2) {
      errors.push(
        `Do not approve: ${filled} filled question(s), OCR/catalog shows ${expected}. Re-parse or add missing questions.`,
      )
    }
    if (
      selected.localQuality?.revision === LOCAL_QUALITY_REVISION &&
      selected.localQuality.passed === false
    ) {
      const nums = Array.isArray(selected.localQuality.failedGoTo)
        ? selected.localQuality.failedGoTo.slice(0, 24).join(', ')
        : ''
      errors.push(
        `Quality checked by local AI — not passed.${nums ? ` Go to Q ${nums}.` : ''} Do not approve.`,
      )
    } else if (selected.localQuality?.revision !== LOCAL_QUALITY_REVISION) {
      errors.push('Quality check by local AI has not passed.')
    }
    setApproveBlockers((prev) => {
      const content = prev.filter((line) => CARD_REVIEW_LINE.test(line))
      return [...errors, ...content]
    })
  }, [previewOpen, selected, previewMeta.filled, previewExpected])

  useEffect(() => {
    if (!previewOpen || !selectedId || selected?.status !== 'pending_review') return undefined
    let cancelled = false
    setApproveBlockers((prev) =>
      prev.filter((line) => !CARD_REVIEW_LINE.test(line)),
    )
    const cancelIdle = scheduleIdleWork(() => {
      Promise.all([
        import('../utils/officialPyqReviewFlags.js'),
        import('../utils/uploadQualityGuards.js'),
        import('../utils/passage.js'),
      ])
        .then(([{ officialPyqContentReviewMessages, officialPyqMissingListMessage }, { healUploadQuestionCard }, { peelOfficialPyqCardForDisplay }]) => {
          if (cancelled) return
          const preview = getOfficialPyqPendingPreviewPaper(selectedId)
          const qs = Array.isArray(preview?.questions) ? preview.questions : []
          const ocr =
            getOfficialPyqPendingOcrText(selectedId) || String(preview?.preparedText ?? '')
          const shown = qs.map((q) => {
            const src = q?.adminEdited === true ? '' : ocr
            try {
              return peelOfficialPyqCardForDisplay(healUploadQuestionCard(q, src), src)
            } catch {
              return q
            }
          })
          if (cancelled) return
          const missingList = officialPyqMissingListMessage(shown)
          const content = [
            ...officialPyqContentReviewMessages(shown),
            ...(missingList ? [missingList] : []),
          ]
          setApproveBlockers((prev) => {
            const kept = prev.filter((line) => !CARD_REVIEW_LINE.test(line))
            return content.length ? [...kept, ...content] : kept
          })
        })
        .catch(() => {})
    }, { timeoutMs: 700, fallbackMs: 60 })
    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [previewOpen, selectedId, selected?.status, previewReload, cardEditTick, 'drawn-reaction-ok'])

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const step = () => {
      if (cancelled) return
      import('../utils/officialPyqLocalQuality.js')
        .then(({ checkNextPendingPaper }) => {
          if (cancelled) return 'done'
          return checkNextPendingPaper()
        })
        .then((result) => {
          if (cancelled || !result) return
          const status = typeof result === 'string' ? result : result.status
          bump()
          if (result.paperId && result.paperId === openPreviewIdRef.current) {
            setPreviewReload((n) => n + 1)
          }
          setOpenedPaper((prev) => {
            if (!prev?.id) return prev
            return lookupSavedPaperSummary(prev.id) || prev
          })
          if (status === 'more') timer = window.setTimeout(step, 60)
        })
        .catch(() => {})
    }
    timer = window.setTimeout(step, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bump])

  const [missingSlots, setMissingSlots] = useState(/** @type {number[]} */ ([]))

  const filledPreviewCount = previewMeta.filled
  const siblingWithQuestions = useMemo(() => {
    if (!selected || filledPreviewCount > 0) return null
    try {
      return findOfficialPyqSiblingWithQuestions(selected)
    } catch {
      return null
    }
  }, [selected, filledPreviewCount, tick])

  useEffect(() => {
    if (!previewOpen || !selectedId) return undefined
    let cancelled = false
    const exam = selected?.exam
    const session = selected?.session
    const cancel = scheduleIdleWork(
      () => {
        if (cancelled) return
        const preview = getOfficialPyqPendingPreviewPaper(selectedId)
        let qs = Array.isArray(preview?.questions) ? preview.questions : []
        if (countFilledOfficialPyqQuestions(qs) < 8) {
          const recovered = recoverOfficialPyqQuestionsFromStore(selectedId)
          if (countFilledOfficialPyqQuestions(recovered) >= 8) {
            qs = recovered
            setPreviewMeta({
              count: recovered.length,
              filled: countFilledOfficialPyqQuestions(recovered),
            })
            try {
              updateOfficialPyqPendingPaper(selectedId, { questions: recovered })
              setPreviewReload((x) => x + 1)
            } catch {
              /* keep showing recovered cards */
            }
          } else if (
            (preview?.hasOcr || paperHasStoredOcr(preview)) &&
            ocrRestoreTriedRef.current !== selectedId
          ) {
            ocrRestoreTriedRef.current = selectedId
            void import('../utils/officialPyqLocalReparse.js')
              .then(async ({ reExtractOfficialPyqPendingPaperLocalAsync, officialPyqStoredOcrTextLocal }) => {
                if (cancelled) return
                const paper = getOfficialPyqPendingPaper(selectedId)
                const ocr = officialPyqStoredOcrTextLocal(paper)
                if (!paper || ocr.length < 80) return
                if (paper.status === 'approved' || paper.returnedFromPublished === true) return
                const result = await reExtractOfficialPyqPendingPaperLocalAsync(paper, {
                  yieldFn: yieldToUi,
                })
                if (cancelled || !result?.ok) return
                setPreviewReload((x) => x + 1)
                bump()
              })
              .catch(() => {
                /* stored OCR restore is best-effort */
              })
          }
        }
        const ocrText =
          getOfficialPyqPendingOcrText(selectedId) || String(preview?.preparedText ?? '')
        const expected =
          officialPyqExpectedTotal({
            exam,
            session,
            expectedQuestionCount: preview?.expectedQuestionCount,
            questions: qs,
            preparedText: ocrText,
          }) ||
          Number(preview?.expectedQuestionCount) ||
          0
        setMissingSlots(listOfficialPyqMissingSlots(qs, expected))
        setExtractionReport(
          buildLiteExtractionSummary({
            ocrText,
            questions: qs,
            exam,
            session,
          }),
        )
        if (
          (preview?.hasOcr || paperHasStoredOcr(preview) || paperHasStoredOcr(selected)) &&
          persistedHealRef.current !== selectedId
        ) {
          persistedHealRef.current = selectedId
          void import('../utils/officialPyqLocalReparse.js')
            .then(async ({
              healAndPersistOfficialPyqPaper,
              officialPyqNeedsAutoResplit,
              reExtractOfficialPyqPendingPaperLocalAsync,
            }) => {
              if (cancelled) return
              const paper = getOfficialPyqPendingPaper(selectedId)
              if (!paper) return
              if (paper.status === 'approved' || paper.returnedFromPublished === true) return
              if (
                paper.localQuality?.passed === true &&
                (paper.localQuality?.sameCheck === 'banner-v1' ||
                  paper.localQuality?.sameCheck === 'banner-v2' ||
                  paper.localQuality?.sameCheck === 'banner-v3') &&
                paper.localQuality?.revision === LOCAL_QUALITY_REVISION
              ) {
                return
              }
              const status = String(paper.status)
              const rebuildThisSlot =
                status === 'pending_review' || status === 'rejected'
              if (rebuildThisSlot && officialPyqNeedsAutoResplit(paper)) {
                const rebuilt = await reExtractOfficialPyqPendingPaperLocalAsync(paper, {
                  yieldFn: yieldToUi,
                })
                if (cancelled) return
                if (rebuilt?.ok && rebuilt.changed !== false) {
                  setPreviewReload((x) => x + 1)
                  bump()
                  return
                }
              }
              const result = healAndPersistOfficialPyqPaper(paper)
              if (cancelled || !result?.changed) return
              setPreviewReload((x) => x + 1)
              bump()
            })
            .catch(() => {
              if (persistedHealRef.current === selectedId) persistedHealRef.current = ''
            })
        }
      },
      { timeoutMs: 800, fallbackMs: 280 },
    )
    return () => {
      cancelled = true
      cancel()
    }
  }, [previewOpen, selectedId, selected?.exam, selected?.session, previewMeta.count, tick])

  const canReExtractStoredText = Boolean(selected && (selected.hasOcr || paperHasStoredOcr(selected)))

  useEffect(() => {
    if (!selected) {
      setExtractSummary('')
      return
    }
    setExtractSummary(extractSummaryFromNotes(selected.notes))
  }, [selected])

  // Auto re-split on open runs async (see selectedId effect) so row click stays responsive.

  async function refreshSourcesFromApi() {
    setBusy(true)
    setError('')
    setMessage('')
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), API_FETCH_MS)
    try {
      const res = await fetch(`${API_BASE}/api/official-pyq/sources`, { signal: ctl.signal })
      if (!res.ok) throw new Error('Could not load official source list from the server.')
      const data = await res.json()
      setMessage(
        `Official source list ready (${data.slotCount ?? data.slots?.length ?? 0} slots). Download papers from the links below — we do not scrape coaching sites.`,
      )
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'AbortError'
          ? 'Could not load — retry'
          : e instanceof Error
            ? e.message
            : 'Server source list unavailable — you can still use the curated list on this page.',
      )
    } finally {
      clearTimeout(timer)
      setBusy(false)
    }
  }

  function addSlotShell(slotId) {
    setError('')
    setMessage('')
    const slot = slots.find((s) => s.id === slotId) || listOfficialPyqSourceSlots().find((s) => s.id === slotId)
    if (!slot) {
      setError('Source slot not found.')
      return
    }
    const existing = findOfficialPyqPendingBySourceSlot(slot.id)
    if (existing) {
      if (existing.status === 'rejected') {
        writeOfficialPyqUi({ filter: 'rejected' })
      } else if (existing.status === 'approved') {
        writeOfficialPyqUi({ filter: 'approved' })
      } else {
        writeOfficialPyqUi({ filter: 'pending_review' })
      }
      openOfficialPaper(existing)
      if (existing.status === 'pending_review') {
        setMessage(`“${existing.paperLabel}” is already in Pending approval.`)
      } else if (existing.status === 'rejected') {
        setMessage(
          `“${existing.paperLabel}” is in Rejected. Use Remove from list below to clear it, or import a new file to start over.`,
        )
      } else {
        setMessage(`“${existing.paperLabel}” is already published.`)
      }
      bump()
      return
    }
    const paper = pendingPaperFromSourceSlot(slot, [])
    openOfficialPaper(paper)
    setMessage(
      `Added “${paper.paperLabel}” to Pending approval (0 questions). Download the official PDF, then import JSON/CSV questions into this paper.`,
    )
    bump()
  }

  async function onUploadFile(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    setProgressPct(2)
    setProgressLabel('Starting…')
    try {
      const [{ importFileToPending }, { formatOfficialPyqExtractSummary, formatOfficialPyqProgress }] =
        await Promise.all([
          import('../utils/officialPyqImportFile.js'),
          loadOfficialPyqExtractHelpers(),
        ])
      const { paper, summary, cloudNote } = await importFileToPending(
        file,
        {
          exam,
          year,
          session,
          pyqDate: exam === 'jee-main' ? pyqDate : undefined,
          pyqShift: exam === 'jee-main' ? pyqShift : undefined,
          sourceUrl,
          sourceLabel,
          paperLabel,
        },
        {
          onProgress: (pct, label) => {
            const formatted = formatOfficialPyqProgress(pct, label)
            if (formatted.pct >= 0) setProgressPct(formatted.pct)
            if (formatted.label) setProgressLabel(formatted.label)
          },
        },
      )
      if (paper?.id && /\.(pdf|png|jpe?g|webp)$/i.test(String(file.name || ''))) {
        void import('../utils/officialPyqOriginalCompare.js')
          .then(({ uploadOfficialPyqOriginal }) => uploadOfficialPyqOriginal(paper.id, file))
          .catch(() => {
            /* compare can still use "Attach original PDF" later */
          })
      }
      openOfficialPaper(paper)
      setExtractSummary(extractSummaryFromNotes(paper.notes) || (summary ? formatOfficialPyqExtractSummary(summary) : ''))
      const expected = Number(paper.expectedQuestionCount) || paper.questions.length
      const min = expectedMinOfficialPyqCount(exam)
      if (paper.questions.length < min) {
        setError(
          `Found only ${paper.questions.length} question(s) (this paper’s OCR count is ${expected}). Do not approve if under ${min}. Use Re-parse stored OCR if the PDF text was saved, or upload again.`,
        )
        setMessage(cloudNote || '')
      } else {
        setMessage(
          `Imported ${paper.questions.length} question(s) into Pending approval — not published yet.${cloudNote ? ` ${cloudNote}` : ''}`,
        )
      }
      bump()
      setProgressPct(0)
      setProgressLabel('')
    } catch (e) {
      try {
        const { formatOfficialPyqUploadError } = await loadOfficialPyqExtractHelpers()
        setError(formatOfficialPyqUploadError(e, {}))
      } catch {
        setError(e instanceof Error ? e.message : 'Upload failed.')
      }
      setProgressPct(0)
      setProgressLabel('')
    } finally {
      setBusy(false)
    }
  }

  async function onApprove() {
    if (!selected || approveBusy) return
    setError('')
    setMessage('')
    setApproveBusy(true)
    setApproveLabel('Starting…')
    setApprovePct(2)
    await yieldToUi()
    try {
      const { approveOfficialPyqPaperAsync } = await loadOfficialPyqApproval()
      const result = await approveOfficialPyqPaperAsync(selected.id, {
        onProgress: (pct, label) => {
          setApprovePct(pct)
          setApproveLabel(label)
        },
        yieldFn: yieldToUi,
      })
      if (!result.ok) {
        const msg = result.errors.join(' ') || 'Could not approve.'
        setError(msg)
        requestAnimationFrame(() => {
          previewRef.current
            ?.querySelector('[data-testid="official-pyq-approve-error"]')
            ?.scrollIntoView({ block: 'center' })
        })
        return
      }
      setMessage(
        `Published ${result.pyqCount} question(s) to PYQ and ${result.bankCount} to Question Bank. Students can use them under Prepare → PYQ.`,
      )
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve.')
    } finally {
      setApproveBusy(false)
      setApproveLabel('')
      setApprovePct(0)
    }
  }

  function onReserveMissingSlots() {
    if (!selected) return
    const preview = getOfficialPyqPendingPreviewPaper(selected.id)
    const qs = Array.isArray(preview?.questions) ? preview.questions : []
    const expected = previewExpected || officialPyqExpectedTotal(preview || selected)
    const missing = listOfficialPyqMissingSlots(qs, expected)
    if (!missing.length) return
    const reserved = reserveOfficialPyqMissingSlots(qs, expected, selected.id)
    updateOfficialPyqPendingPaper(selected.id, {
      questions: reserved,
      expectedQuestionCount: expected,
    })
    setPreviewReload((n) => n + 1)
    setMessage(
      `Reserved ${missing.length} empty slot(s) on this paper (Q${missing.join(', Q')}). Fill them later. Do not Approve until every slot has a real question.`,
    )
    bump()
  }

  async function onReExtractStoredText() {
    if (!selected || reParseBusy) return
    const gen = bumpWorkGen()
    setReParseBusy(true)
    setError('')
    setMessage('Re-parsing stored OCR…')
    setProgressPct(5)
    setProgressLabel('Starting…')
    await yieldToUi()
    await yieldToUi()
    const reparseCtl = new AbortController()
    reparseAbortRef.current = reparseCtl
    try {
      setProgressPct(10)
      setProgressLabel('Reading stored OCR…')
      await yieldToUi()
      const { reExtractOfficialPyqPendingPaperLocalAsync, officialPyqStoredOcrTextLocal } =
        await import('../utils/officialPyqLocalReparse.js')
      const { expectedPyqTargetFromOcrLite, localOfficialPyqReparseAcceptable } =
        await import('../utils/pyqOcrCountLite.js')
      let paperNow = resolveFreshPaper(selected) || selected
      const storedOcr = officialPyqStoredOcrTextLocal(paperNow) || ''
      const target = expectedPyqTargetFromOcrLite(paperNow.exam, storedOcr)
      setProgressPct(28)
      setProgressLabel('Re-splitting stored OCR (local)…')
      await yieldToUi()
      if (isWorkStale(gen)) return
      const localResult = await reExtractOfficialPyqPendingPaperLocalAsync(paperNow, {
        yieldFn: yieldToUi,
        signal: reparseCtl.signal,
        onProgress: (pct, label) => {
          if (pct >= 0) setProgressPct(Math.max(28, Math.min(94, pct)))
          if (label) setProgressLabel(label)
        },
      })
      if (isWorkStale(gen)) return
      if (localResult.ok) {
        const previousCount = localResult.previousCount ?? paperNow.questions?.length ?? 0
        setPreviewReload((n) => n + 1)
        paperNow = resolveFreshPaper(paperNow) || paperNow
        const count = localResult.count
        const acceptable = localOfficialPyqReparseAcceptable(count, target, paperNow.exam, previousCount)
        setMessage(
          acceptable
            ? `Re-parsed ${count} question(s) from stored OCR (was ${previousCount}). Local split done — press Fill tags, answers & solutions (Hybrid AI) to fill them two at a time.`
            : `Re-parsed ${count} question(s) from stored OCR (was ${previousCount}). Review the count before approving.`,
        )
        if (count < expectedMinOfficialPyqCount(paperNow.exam)) {
          setError(
            `Do not approve: found ${count} question(s), need at least ${expectedMinOfficialPyqCount(paperNow.exam)} for a ${getOfficialPyqExamLabel(paperNow.exam)} paper (OCR shows ~${target}). Re-upload the official PDF or try Re-parse again.`,
          )
        } else if (target > 0 && Math.abs(count - target) > 2) {
          setError(
            `Split has ${count} card(s) but OCR markers show ~${target}. Do not Approve until the count matches. Try Re-parse stored OCR again.`,
          )
        } else {
          setError('')
        }
        if (acceptable) {
          bump()
          setProgressLabel('Done (local split)')
          setProgressPct(100)
          await yieldToUi()
          return
        }
        setProgressLabel('Local count off — Gemini flash-lite fallback…')
        setProgressPct(72)
        await yieldToUi()
        const { reExtractOfficialPyqPendingPaperWithGeminiTimed } = await import(
          '../utils/officialPyqApproval.js'
        )
        const geminiResult = await reExtractOfficialPyqPendingPaperWithGeminiTimed(paperNow, {
          signal: reparseCtl.signal,
          timeoutMs: 25_000,
          overallTimeoutMs: 28_000,
          onProgress: (pct, label) => {
            if (pct >= 0) setProgressPct(Math.max(72, Math.min(94, pct)))
            if (label) setProgressLabel(label)
          },
        })
        if (isWorkStale(gen)) return
        if (geminiResult.ok) {
          setPreviewReload((n) => n + 1)
          const gCount = geminiResult.count
          setMessage(
            geminiResult.usedGemini
              ? `Local split needed help. Gemini flash-lite fallback saved ${gCount} question(s).`
              : `Re-parsed ${gCount} question(s) locally. Gemini not used.`,
          )
          if (gCount < expectedMinOfficialPyqCount(paperNow.exam)) {
            setError(
              `Do not approve: found ${gCount} question(s), need at least ${expectedMinOfficialPyqCount(paperNow.exam)}.`,
            )
          } else {
            setError('')
          }
          bump()
        } else if (geminiResult.error) {
          setError(geminiResult.error)
        }
        setProgressLabel('Done')
        setProgressPct(100)
        await yieldToUi()
        return
      }
      if (localResult.error) {
        setError(localResult.error)
        return
      }
      setError('Re-parse did not return questions from stored OCR.')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        if (!isWorkStale(gen)) {
          const keep = peekOfficialPyqSplitKeep()
          const n = Number(keep?.count) || 0
          if (keep?.id && keep.questions?.length) {
            try {
              updateOfficialPyqPendingPaper(keep.id, { questions: keep.questions })
            } catch {
              /* unlock anyway */
            }
            setPreviewReload((x) => x + 1)
          }
          setMessage(
            n
              ? `Local split kept ${n} questions. Re-parse was stopped. You can use tabs and Next.`
              : 'Re-parse was stopped. Your previous cards are still shown.',
          )
          setError('')
        }
        return
      }
      const msg = e instanceof Error ? e.message : 'Re-parse failed.'
      if (e instanceof Error && e.code === 'REPARSE_OVERALL_TIMEOUT') {
        setError(`${msg} Do not Approve.`)
      } else if (/port 3001|API server|GEMINI_API_KEY|not reachable/i.test(msg)) {
        setError(
          'Re-parse uses the stored OCR on this computer only. Press F5 and try Re-parse stored OCR again.',
        )
      } else {
        setError(msg)
      }
    } finally {
      reparseCtl.abort()
      reparseAbortRef.current = null
      resetOfficialPyqSplitWorker()
      setReParseBusy(false)
      if (!isWorkStale(gen)) {
        setProgressPct(0)
        setProgressLabel('')
      }
    }
  }

  async function onReject() {
    if (!selected) return
    setError('')
    setMessage('')
    try {
      const { rejectOfficialPyqPaper } = await loadOfficialPyqApproval()
      const result = rejectOfficialPyqPaper(selected.id, rejectReason)
      if (!result.ok) {
        setError(result.error || 'Could not reject.')
        return
      }
      setMessage(
        'Rejected — not in student PYQ. It moved to the Rejected tab. Use Delete permanently when you are done with it.',
      )
      setRejectReason('')
      writeOfficialPyqUi({ filter: 'rejected', openId: null })
      setPreviewOpen(false)
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save rejection.')
    }
  }

  async function onReturnRejectedToPending() {
    if (!selected || selected.status !== 'rejected') return
    setError('')
    setMessage('')
    try {
      const { returnOfficialPyqPaperToPending } = await loadOfficialPyqApproval()
      const result = returnOfficialPyqPaperToPending(selected.id)
      if (!result.ok) {
        setError(result.error || 'Could not move this paper back to Pending approval.')
        return
      }
      const next = result.paper || { ...selected, status: 'pending_review' }
      writeOfficialPyqUi({ filter: 'pending_review', openId: selected.id })
      setOpenedPaper(officialPyqPaperToSummary(next))
      setPreviewOpen(true)
      setMessage(`“${next.paperLabel}” is back in Pending approval. Review it, then Approve only if it looks right.`)
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move this paper back to Pending approval.')
    }
  }

  async function onUnpublishToPending() {
    if (!selected || selected.status !== 'approved') return
    if (!isAdminLoggedIn()) {
      setError('Only an admin can send a published paper back for review.')
      return
    }
    const warn =
      `Send “${selected.paperLabel}” back for review? It leaves the student test and the published bank, and returns to Pending with the same questions. This does not re-extract or change List rows. It does not approve the paper again.`
    if (typeof window !== 'undefined' && !window.confirm(warn)) return
    setError('')
    setMessage('')
    try {
      const { unpublishOfficialPyqPaper } = await loadOfficialPyqApproval()
      const result = unpublishOfficialPyqPaper(selected.id)
      if (!result.ok) {
        setError(result.error || 'Could not unpublish.')
        return
      }
      const next = result.paper || { ...selected, status: 'pending_review' }
      writeOfficialPyqUi({ filter: 'pending_review', openId: selected.id })
      setOpenedPaper(officialPyqPaperToSummary(next))
      setPreviewOpen(true)
      setMessage(
        `Sent “${next.paperLabel}” back for review. It is in Pending with the same questions` +
          (result.pyqRemoved || result.bankRemoved
            ? ` (removed ${result.pyqRemoved || 0} from the student test and ${result.bankRemoved || 0} from the bank).`
            : '.'),
      )
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unpublish.')
    }
  }

  const onDeleteSitting = useCallback(async (paper) => {
    if (!paper) return
    const warn =
      paper.status === 'rejected'
        ? `Delete “${paper.paperLabel}” from this list for good? Student PYQ is not touched.`
        : `Remove “${paper.paperLabel}” from this approval list? Student PYQ and the question bank stay as they are.`
    if (typeof window !== 'undefined' && !window.confirm(warn)) return
    setError('')
    setMessage('')
    try {
      const { dismissOfficialPyqSitting } = await loadOfficialPyqApproval()
      const result = dismissOfficialPyqSitting(paper)
      if (!result.ok) {
        setError(result.error || 'Could not delete.')
        return
      }
      setSelectedId(null)
      const label =
        paper.status === 'rejected'
          ? `Deleted “${paper.paperLabel}” permanently.`
          : `Removed “${paper.paperLabel}” from your approval queue.`
      setMessage(
        result.removed > 1
          ? `${label} (${result.removed} duplicate rows cleared.)`
          : label,
      )
      bump()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete sitting.')
    }
  }, [bump])

  function attachQuestionsToSelected(file) {
    if (!selected || selected.status !== 'pending_review') {
      setError('Select a pending paper first.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    file
      .text()
      .then(async (text) => {
        const { parsePyqJson, parsePyqCsv } = await import('../utils/pyqImport.js')
        const name = file.name.toLowerCase()
        const questions = name.endsWith('.csv') ? parsePyqCsv(text) : parsePyqJson(text)
        if (!questions.length) throw new Error('No questions in file.')
        updateOfficialPyqPendingPaper(selected.id, {
          questions: questions.map((q, i) => ({
            ...q,
            answerSource: q.answerSource || (q.correctIndex != null ? 'from_paper' : 'unknown'),
            solutionSource: q.solutionSource || (q.solution ? 'from_paper' : undefined),
            provenance: `${selected.sourceLabel}${selected.sourceUrl ? ` · ${selected.sourceUrl}` : ''}`,
            pyqSlot: q.pyqSlot ?? i + 1,
          })),
        })
        setMessage(`Attached ${questions.length} question(s) to “${selected.paperLabel}”. Still pending approval.`)
        setPreviewReload((n) => n + 1)
        bump()
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Attach failed.'))
      .finally(() => setBusy(false))
  }

  return (
    <div className="page official-pyq-page">
      <header className="page-header">
        <h1>Approve official papers</h1>
        <p className="form-hint">
          Pull or upload <strong>official</strong> previous-year papers (NTA / JEE Advanced archive). They stay in
          this separate bank until you <strong>Approve &amp; publish</strong> — then they go to student{' '}
          <Link to="/pyq">PYQ Bank</Link> and Question Bank. Coaching-site scrapes are not allowed.
        </p>
        <p className="form-hint">
          <Link to="/pyq">PYQ Bank</Link>
          {' · '}
          <Link to="/question-bank">Question Bank</Link>
          {' · '}
          <span className="bank-review-badge bank-review-badge-needs-review">
            {pendingCount} pending approval
          </span>
        </p>
      </header>

      {error && <p className="upload-error">{error}</p>}
      {message && <p className="form-hint upload-success-hint">{message}</p>}

      <section className="card official-pyq-portals">
        <h2>Official portals</h2>
        <ul className="cc-official-ref-list">
          {OFFICIAL_PYQ_PORTALS.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer noopener">
                {p.label}
              </a>
              <span className="cc-sub"> — {p.note}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={refreshSourcesFromApi}>
          Refresh source list from server
        </button>
      </section>

      <section className="card official-pyq-import">
        <h2>1. Import into pending bank</h2>
        <div className="pyq-paper-setup-grid">
          <label>
            Exam
            <select value={exam} onChange={(e) => setExam(/** @type {any} */ (e.target.value))}>
              {OFFICIAL_PYQ_EXAMS.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
            />
          </label>
          {exam === 'jee-main' ? (
            <label>
              Date
              <select value={pyqDate} onChange={(e) => setPyqDate(e.target.value)}>
                {mainDates.map((d) => (
                  <option key={d} value={d}>
                    {formatPyqDate(d)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {exam === 'jee-main' ? (
            <label>
              Shift
              <select value={String(pyqShift)} onChange={(e) => setPyqShift(Number(e.target.value))}>
                <option value="1">Shift 1</option>
                <option value="2">Shift 2</option>
              </select>
            </label>
          ) : null}
          {exam === 'jee-advanced' ? (
            <label>
              Paper
              <select value={session} onChange={(e) => setSession(e.target.value)}>
                <option value="Paper 1">Paper 1</option>
                <option value="Paper 2">Paper 2</option>
              </select>
            </label>
          ) : null}
          <label className="pyq-paper-setup-wide">
            Source label
            <input
              type="text"
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="Official NTA…"
            />
          </label>
          <label className="pyq-paper-setup-wide">
            Official link
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          </label>
          <label className="pyq-paper-setup-wide">
            Paper label (optional)
            <input
              type="text"
              value={paperLabel}
              onChange={(e) => setPaperLabel(e.target.value)}
              placeholder="Auto from exam + year"
            />
          </label>
        </div>

        <p className="form-hint">
          Download the official PDF from NTA / Advanced archive, then upload it here (or JSON/CSV).
          Stored OCR is split on this computer (Re-parse does not wait for Gemini).
          Papers stay <strong>Pending approval</strong> until you publish. AI-filled solutions are
          labelled separately from official keys.
          {' '}
          <strong>Do not approve a JEE Advanced paper if it has under 40 questions</strong>
          {' '}
          (a full paper is about 51).
        </p>
        <Suspense fallback={<p className="form-hint">Loading OCR options…</p>}>
          <OcrOutputFormatPicker id="official-pyq-ocr-format" />
        </Suspense>

        <div className="official-pyq-actions">
          <label className="btn btn-primary btn-sm">
            {busy ? (progressLabel || 'Working…') : 'Upload official PDF / Word / JSON / CSV'}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.json,.csv,application/pdf,application/json,text/csv,image/*"
              hidden
              disabled={busy}
              onChange={onUploadFile}
            />
          </label>
        </div>
        {busy || reParseBusy ? (
          <p className="official-pyq-progress" role="status">
            {progressLabel || (reParseBusy ? 'Re-parsing stored OCR…' : 'Working…')}{' '}
            {Math.round(progressPct)}%
          </p>
        ) : null}

        {slots.length > 0 && (
          <div className="official-pyq-slots">
            <h3>Curated year slots</h3>
            <ul>
              {slots.map((s) => (
                <li key={s.id}>
                  <strong>{s.paperLabel}</strong>
                  <span className="cc-sub"> — {s.sourceLabel}</span>
                  <div className="official-pyq-slot-actions">
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-sm">
                      Open official page
                    </a>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => addSlotShell(s.id)}>
                      Add empty pending slot
                    </button>
                  </div>
                  <p className="form-hint">{s.downloadHint}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card official-pyq-list">
        <h2>2. Review &amp; approve</h2>
        {listError ? (
          <p className="upload-error">
            {listError}{' '}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setListError('')
                try {
                  hydrateOfficialPyqPendingSummariesIfEmpty()
                  void listOfficialPyqPendingSummaries('all')
                } catch {
                  setListError('Could not load — retry')
                }
                setTick((t) => t + 1)
              }}
            >
              Retry
            </button>
          </p>
        ) : null}
        <OfficialPyqTabList
          selectedId={selectedId}
          listTick={tick}
          onOpen={openOfficialPaper}
          onDelete={onDeleteSitting}
          qualityBusyId={qualityBusyId}
          onQualityFix={(summary) => {
            const id = String(summary?.id || '')
            if (!id || qualityBusyId) return
            const paper = getOfficialPyqPendingPaper(id)
            if (!paper || paper.status === 'approved') return
            setQualityBusyId(id)
            void import('../utils/officialPyqLocalQuality.js')
              .then(({ persistOfficialPyqQualityRun }) => {
                persistOfficialPyqQualityRun(paper)
                bump()
                if (openPreviewIdRef.current === id) setPreviewReload((n) => n + 1)
                setOpenedPaper((prev) =>
                  prev?.id === id ? lookupSavedPaperSummary(id) || prev : prev,
                )
              })
              .catch(() => {})
              .finally(() => setQualityBusyId(''))
          }}
        />
      </section>

      {selectedId ? (
        <section className="card official-pyq-preview-panel" hidden={!previewOpen}>
            <div
              ref={previewRef}
              className="official-pyq-inline-review official-pyq-preview"
              tabIndex={-1}
              aria-live="polite"
            >
              {selected ? (
                <>
                    <h3>
                      Preview — {selected.paperLabel}
                      {selected.session ? ` · ${selected.session}` : ''}
                    </h3>
                    <p className="form-hint" role="status">
                      Opened <strong>{filledPreviewCount}</strong> filled question(s)
                      {previewMeta.count > filledPreviewCount
                        ? ` + ${previewMeta.count - filledPreviewCount} reserved`
                        : ''}
                      {previewExpected
                        ? ` (detected ${previewExpected} in OCR/catalog)`
                        : ''}
                      {filledPreviewCount > 0 &&
                      filledPreviewCount < expectedMinOfficialPyqCount(selected.exam)
                        ? ` — Do not approve if under ${expectedMinOfficialPyqCount(selected.exam)}.`
                        : ''}
                      {extractSummary ? ` · ${extractSummary}` : ''}
                    </p>
                    {selected.status === 'approved' ? (
                      <div className="official-pyq-actions">
                        <p className="form-hint" data-testid="official-pyq-fix-tags-hint">
                          This paper is published. Each question below uses the Question Bank metatag
                          fields: Subject, Unit, Chapter, Topic, Type of question, Exam assigned,
                          Toughness, and Source, plus Answer and Solution. Gemini&apos;s values are shown,
                          including blanks.
                          {isAdminLoggedIn()
                            ? ' Save them here, or ask Hybrid AI to fill them. The paper stays published, and the question wording is not changed.'
                            : ' Only an admin can change them.'}
                        </p>
                        {isAdminLoggedIn() ? (
                        <OfficialPyqReplicaControls
                          paper={selected}
                          onCreated={(paper, all) => {
                            const list = Array.isArray(all) && all.length ? all : [paper]
                            writeOfficialPyqUi({ filter: 'pending_review', openId: paper.id })
                            openOfficialPaper(paper)
                            setMessage(
                              list.length > 1
                                ? list.length +
                                  ' similar papers are in Pending approval (−1, Same, +1, +2). They are not published. Approve one when it looks right. Each question then gets a Child Id.'
                                : 'Similar paper is in Pending approval. It is not published. Approve it when it looks right. Each question then gets a Child Id.',
                            )
                            bump()
                          }}
                          onFilled={() => {
                            setPreviewReload((n) => n + 1)
                            setMessage(
                              'Saved Hybrid AI tags, answers, and solutions for this paper. It is still published. Question wording was not changed.',
                            )
                            bump()
                          }}
                        />
                        ) : null}
                        {isAdminLoggedIn() ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="official-pyq-send-back"
                          onClick={() => void onUnpublishToPending()}
                        >
                          Unapprove — send back for review
                        </button>
                        ) : null}
                      </div>
                    ) : null}
                    {selected.status === 'rejected' ? (
                      <div className="official-pyq-actions">
                        <p className="form-hint">
                          This paper is in Rejected. It is not in student PYQ. Open it here to review.
                          Move it back to Pending only if you still want to Approve it.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          data-testid="official-pyq-return-pending"
                          onClick={() => void onReturnRejectedToPending()}
                        >
                          Move back to Pending approval
                        </button>
                      </div>
                    ) : null}
                    {filledPreviewCount === 0 && siblingWithQuestions ? (
                      <div className="official-pyq-missing-slots" data-testid="official-pyq-recover-sibling">
                        <p className="upload-error">
                          This is <strong>{selected.paperLabel}</strong> — it has no uploaded questions
                          and no stored OCR. Your reviewed paper is still stored as{' '}
                          <strong>{siblingWithQuestions.paperLabel}</strong> (
                          {officialPyqPaperQuestionCount(siblingWithQuestions)} questions
                          {siblingWithQuestions.status === 'approved' ? ', under Published PYQ' : ''}).
                          Re-parse cannot restore this empty Paper 2 row.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const status = siblingWithQuestions.status
                            writeOfficialPyqUi({
                              filter:
                                status === 'approved' || status === 'rejected' ? status : 'pending_review',
                              openId: siblingWithQuestions.id,
                            })
                            openOfficialPaper(siblingWithQuestions)
                            bump()
                          }}
                        >
                          Open the stored {officialPyqPaperQuestionCount(siblingWithQuestions)}-question paper
                        </button>
                      </div>
                    ) : null}
                    {selected.status === 'pending_review' &&
                    missingSlots.length > 0 &&
                    filledPreviewCount > 0 ? (
                      <div className="official-pyq-missing-slots">
                        <p className="upload-error">
                          Short count: {filledPreviewCount} filled vs {previewExpected} detected.
                          Missing Q{missingSlots.join(', Q')}.
                        </p>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="official-pyq-reserve-missing"
                          onPointerDown={(e) => {
                            if (e.button != null && e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            onReserveMissingSlots()
                          }}
                          onClick={(e) => {
                            if (e.detail > 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            onReserveMissingSlots()
                          }}
                        >
                          Add missing questions later
                        </button>
                      </div>
                    ) : null}
                    {extractionReport ? (
                      <Suspense fallback={<p className="form-hint">Loading extraction summary…</p>}>
                        <ExtractionSummaryTable report={extractionReport} compact />
                      </Suspense>
                    ) : null}
                    {!selected.aiReplicaPaper && (selected.status === 'pending_review' || selected.factsConfirmedAt) ? (
                      <ErrorBoundary compact title="Paper facts hit an error">
                        <Suspense fallback={null}>
                          <OfficialPyqPaperFactsForm
                            key={selected.id}
                            paperId={selected.id}
                            onChanged={() => {
                              bump()
                              setPreviewReload((n) => n + 1)
                              setCardEditTick((n) => n + 1)
                              setOpenedPaper((prev) =>
                                prev?.id === selected.id ? lookupSavedPaperSummary(selected.id) || prev : prev,
                              )
                            }}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    ) : null}
                    {selected.status === 'pending_review' && (
                      <div className="official-pyq-actions bank-review-status-actions">
                        <label className="btn btn-ghost btn-sm">
                          Attach JSON/CSV questions
                          <input
                            type="file"
                            accept=".json,.csv"
                            hidden
                            disabled={reParseBusy}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              e.target.value = ''
                              if (f) attachQuestionsToSelected(f)
                            }}
                          />
                        </label>
                        {canReExtractStoredText && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid="official-pyq-reparse-stored"
                            disabled={reParseBusy}
                            aria-busy={reParseBusy}
                            onPointerDown={(e) => {
                              if (e.button != null && e.button !== 0) return
                              e.preventDefault()
                              e.stopPropagation()
                              if (!reParseBusy) void onReExtractStoredText()
                            }}
                            onClick={(e) => {
                              if (e.detail > 0) return
                              e.preventDefault()
                              e.stopPropagation()
                              if (!reParseBusy) void onReExtractStoredText()
                            }}
                          >
                            {reParseBusy ? 'Re-parsing…' : 'Re-parse stored OCR'}
                          </button>
                        )}
                        <OfficialPyqPendingFill
                          paperId={selected.id}
                          onChanged={() => {
                            bump()
                            setPreviewReload((n) => n + 1)
                          }}
                        />
                        <ErrorBoundary compact title="Compare with original paper hit an error">
                          <Suspense fallback={null}>
                            <OfficialPyqOriginalComparePanel
                              paperId={selected.id}
                              flaggedGoTo={
                                selected.localQuality?.revision === LOCAL_QUALITY_REVISION &&
                                Array.isArray(selected.localQuality?.failedGoTo)
                                  ? selected.localQuality.failedGoTo
                                  : []
                              }
                              onChanged={() => {
                                bump()
                                setCardEditTick((n) => n + 1)
                                setOpenedPaper((prev) =>
                                  prev?.id === selected.id ? lookupSavedPaperSummary(selected.id) || prev : prev,
                                )
                              }}
                            />
                          </Suspense>
                        </ErrorBoundary>
                        {reParseBusy || (progressLabel && isReParseProgressLabel(progressLabel)) ? (
                          <p className="official-pyq-progress official-pyq-reparse-progress" role="status">
                            {progressLabel || 'Re-parsing stored OCR…'}{' '}
                            {progressPct > 0 ? `${Math.round(progressPct)}%` : ''}
                          </p>
                        ) : null}
                        {approveBusy ? (
                          <p
                            className="official-pyq-progress official-pyq-approve-progress"
                            data-testid="official-pyq-approve-progress"
                            role="status"
                          >
                            {approveLabel || 'Publishing…'}{' '}
                            {approvePct > 0 ? `${Math.round(approvePct)}%` : ''}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary"
                          data-testid="official-pyq-approve"
                          disabled={approveBlockers.length > 0 || approveBusy}
                          aria-busy={approveBusy}
                          onPointerDown={(e) => {
                            if (e.button != null && e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            if (approveBlockers.length === 0 && !approveBusy) void onApprove()
                          }}
                          onClick={(e) => {
                            if (e.detail > 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            if (approveBlockers.length === 0 && !approveBusy) void onApprove()
                          }}
                        >
                          {approveBusy ? 'Publishing…' : 'Approve & publish'}
                        </button>
                        <input
                          type="text"
                          className="official-pyq-reject-reason"
                          placeholder="Reject reason (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <button type="button" className="btn btn-ghost" onClick={onReject}>
                          Reject
                        </button>
                      </div>
                    )}
                    {selected.status === 'pending_review' && (approveBlockers.length > 0 || error) ? (
                      <p className="upload-error" data-testid="official-pyq-approve-error">
                        {approveBlockers.length ? approveBlockers.join(' ') : error}
                      </p>
                    ) : null}
                    <ErrorBoundary compact title="Preview hit an error">
                      <OfficialPyqPreviewPager
                        paperId={selectedId}
                        reloadToken={previewReload}
                        onMeta={onPreviewMeta}
                      />
                    </ErrorBoundary>
                </>
              ) : (
                <p className="form-hint" role="status">
                  Loading paper…
                </p>
              )}
            </div>
        </section>
      ) : null}
    </div>
  )
}
