/**
 * Official PYQ preview pager. Next only bumps the page index and paints
 * one plain-text question. KaTeX paints on the next frame after first paint.
 * Full question arrays stay in a ref — never in React state.
 */

import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import BankReviewPageBar from '../components/BankReviewPageBar.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { isOfficialPyqPlaceholder } from '../utils/officialPyqMissingSlots.js'
import {
  getOfficialPyqPendingOcrText,
  getOfficialPyqPendingPreviewPaper,
} from '../utils/officialPyqPendingStore.js'
import { repairOrphanAlignedBody, stripRepeatedQuestionNumberPrefix } from '../utils/wrapBareLatexRuns.js'

const PAGE_SIZE = 1
const OfficialPyqPreviewMath = lazy(() => import('./OfficialPyqPreviewMath.jsx'))
const OfficialPyqPublishedMetaForm = lazy(() => import('../components/OfficialPyqPublishedMetaForm.jsx'))
const OfficialPyqCardAdminTools = lazy(() => import('../components/OfficialPyqCardAdminTools.jsx'))

function plainPreviewText(text) {
  return repairOrphanAlignedBody(stripRepeatedQuestionNumberPrefix(String(text ?? '')))
    .replace(/<smiles>[\s\S]*?<\/smiles>/gi, ' [structure] ')
    .replace(/<\/?smiles>/gi, ' ')
    .replace(/!\[[^\]]*\]\(\s*https?:\/\/[^)]+\)/gi, ' ')
    .replace(/\\begin\{(?:itemize|enumerate|figure\*?)\}/gi, ' ')
    .replace(/\\end\{(?:itemize|enumerate|figure\*?)\}/gi, ' ')
    .replace(/\\item\s*\[[^\]]*\]/gi, ' ')
    .replace(/\\item\b/gi, ' ')
    .replace(/\$\$\\begin\{(?:aligned|align\*?|eqnarray)\}([\s\S]*?)\\end\{(?:aligned|align\*?|eqnarray)\}\$\$/gi, (_, body) =>
      String(body ?? '')
        .replace(/\\\\/g, ' ')
        .replace(/&/g, ' '),
    )
    .split('$')
    .join(' ')
    .replace(/\\[a-zA-Z]+(\{[^{}]*\})*/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/(^|\s)&\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchOptionsProbablyFolded(text, options) {
  const t = String(text ?? '')
  if (!(/(?:List|Column)\s*[-–]?\s*I(?!I)/i.test(t) && /(?:List|Column)\s*[-–]?\s*II/i.test(t))) {
    return false
  }
  const opts = Array.isArray(options) ? options : []
  return opts.some((o) => /\(\s*P\s*\)|P\s*→|P\s*\\rightarrow/i.test(String(o ?? '')))
}

const PlainQuestionCard = memo(function PlainQuestionCard({ q }) {
  if (isOfficialPyqPlaceholder(q)) {
    const slot = q?.pyqSlot ?? q?.questionNumber ?? ''
    return (
      <p className="official-pyq-placeholder-note">
        Reserved Q{slot || '?'} — add this question later on this paper. Not publishable yet.
      </p>
    )
  }
  const text = String(q?.text ?? q?.stem ?? '')
  const options = Array.isArray(q?.options) ? q.options : []
  const showOptions =
    options.some((o) => String(o ?? '').trim()) && !matchOptionsProbablyFolded(text, options)
  const plain = plainPreviewText(text)
  return (
    <>
      <p className="official-pyq-plain-stem">{plain || '(Question text)'}</p>
      {showOptions ? (
        <ol className="official-pyq-options" type="A">
          {options.map((opt, oi) => {
            const shown = plainPreviewText(String(opt ?? ''))
            return shown ? <li key={oi}>{shown}</li> : null
          })}
        </ol>
      ) : null}
    </>
  )
})

const OfficialPyqPreviewPager = memo(function OfficialPyqPreviewPager({
  paperId,
  reloadToken = 0,
  onMeta,
}) {
  const questionsRef = useRef(/** @type {unknown[]} */ ([]))
  const sourceTextRef = useRef('')
  const pageRef = useRef(0)
  const onMetaRef = useRef(onMeta)
  onMetaRef.current = onMeta
  const [page, setPage] = useState(0)
  const [current, setCurrent] = useState(/** @type {unknown | null} */ (null))
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [showMath, setShowMath] = useState(false)
  const [sourceTick, setSourceTick] = useState(0)
  const [approved, setApproved] = useState(false)
  const [published, setPublished] = useState(false)
  const keptIdsRef = useRef(/** @type {Record<string, { id: string }>} */ ({}))

  useEffect(() => {
    let cancelled = false
    let inner = 0
    setReady(false)
    setShowMath(false)
    setCurrent(null)
    setPage(0)
    setTotal(0)
    setSourceTick(0)
    setApproved(false)
    setPublished(false)
    keptIdsRef.current = {}
    pageRef.current = 0
    questionsRef.current = []
    sourceTextRef.current = ''
    let loaded = false
    const loadPaper = () => {
      if (cancelled || loaded) return
      loaded = true
      let paper = null
      try {
        paper = getOfficialPyqPendingPreviewPaper(paperId)
      } catch {
        paper = null
      }
      const qs = Array.isArray(paper?.questions) ? paper.questions : []
      questionsRef.current = qs
      setTotal(qs.length)
      setCurrent(qs[0] ?? null)
      setApproved(paper?.status === 'approved' || paper?.status === 'published')
      setPublished(paper?.status === 'published')
      keptIdsRef.current = paper?.keptPublishedIds && typeof paper.keptPublishedIds === 'object' ? paper.keptPublishedIds : {}
      setReady(true)
      const metaFn = onMetaRef.current
      if (typeof metaFn === 'function') {
        const filled = qs.filter((q) => !isOfficialPyqPlaceholder(q)).length
        metaFn({ count: qs.length, filled })
      }
    }
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(loadPaper)
    })
    const fallback = setTimeout(loadPaper, 80)
    return () => {
      cancelled = true
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
      clearTimeout(fallback)
    }
  }, [paperId, reloadToken])

  useEffect(() => {
    if (!ready || !paperId) return undefined
    let cancelled = false
    const run = () => {
      if (cancelled) return
      try {
        const ocr = getOfficialPyqPendingOcrText(paperId)
        if (!cancelled && ocr) {
          sourceTextRef.current = ocr
          setSourceTick((n) => n + 1)
        }
      } catch {
        /* plain preview still works */
      }
    }
    const later =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 1200 })
        : setTimeout(run, 180)
    return () => {
      cancelled = true
      if (typeof cancelIdleCallback === 'function' && typeof later === 'number') {
        cancelIdleCallback(later)
      } else {
        clearTimeout(later)
      }
    }
  }, [ready, paperId, reloadToken])

  const goPage = useCallback((nextPage) => {
    const list = questionsRef.current
    const maxPage = Math.max(0, list.length - 1)
    const safe = Math.min(maxPage, Math.max(0, Number(nextPage) || 0))
    if (safe === pageRef.current) return
    pageRef.current = safe
    setShowMath(false)
    setPage(safe)
    setCurrent(list[safe] ?? null)
  }, [])

  useEffect(() => {
    if (!ready || !current) return undefined
    let painted = false
    const paint = () => {
      if (painted) return
      painted = true
      setShowMath(true)
    }
    const id = requestAnimationFrame(paint)
    const fallback = setTimeout(paint, 80)
    return () => {
      cancelAnimationFrame(id)
      clearTimeout(fallback)
    }
  }, [ready, page, current])

  if (!ready) {
    return (
      <p className="form-hint" role="status">
        Loading questions…
      </p>
    )
  }

  if (!total || !current) {
    return (
      <p className="form-hint">No questions yet — attach an official JSON/CSV after you parse the PDF.</p>
    )
  }

  const start = page
  const end = page + PAGE_SIZE
  const totalPages = Math.max(1, total)
  const showBar = total > PAGE_SIZE

  return (
    <>
      {showBar ? (
        <BankReviewPageBar
          page={page}
          totalPages={totalPages}
          start={start}
          end={end}
          total={total}
          onPage={goPage}
          sticky={false}
          disableNextOnLastPage={false}
          questionJump
        />
      ) : null}
      <ol className="official-pyq-simple-list" start={start + 1}>
        <li key={current?.id ?? start} className="official-pyq-simple-q">
          {showMath ? (
            <Suspense fallback={<PlainQuestionCard q={current} />}>
              <OfficialPyqPreviewMath
                q={current}
                sourceText={sourceTextRef.current}
                sourceTick={sourceTick}
              />
            </Suspense>
          ) : (
            <PlainQuestionCard q={current} />
          )}
          {approved ? (
            <ErrorBoundary compact title="Metatag fields hit an error">
              <Suspense fallback={<p className="form-hint">Loading metatag fields...</p>}>
                <OfficialPyqPublishedMetaForm
                  paperId={paperId}
                  questionIndex={page}
                  question={current}
                  published={published}
                  keptId={String(keptIdsRef.current[String(current?.pyqSlot ?? current?.questionNumber ?? page + 1)]?.id ?? '')}
                  onSaved={(saved) => {
                    if (!saved) return
                    const list = questionsRef.current.slice()
                    const at = pageRef.current
                    if (list[at]) list[at] = { ...list[at], ...saved }
                    questionsRef.current = list
                    setCurrent(list[at] ?? saved)
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary compact title="Edit / compare tools hit an error">
              <Suspense fallback={null}>
                <OfficialPyqCardAdminTools
                  key={page}
                  paperId={paperId}
                  index={page}
                  card={current}
                  onSaved={(saved) => {
                    if (!saved) return
                    const list = questionsRef.current.slice()
                    const at = pageRef.current
                    if (list[at]) list[at] = saved
                    questionsRef.current = list
                    setCurrent(list[at] ?? saved)
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </li>
      </ol>
      {showBar ? (
        <BankReviewPageBar
          page={page}
          totalPages={totalPages}
          start={start}
          end={end}
          total={total}
          onPage={goPage}
          sticky={false}
          disableNextOnLastPage={false}
          questionJump
        />
      ) : null}
    </>
  )
})

export default OfficialPyqPreviewPager
