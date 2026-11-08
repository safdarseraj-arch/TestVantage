/**
 * Admin tools under one PENDING Official PYQ card:
 * - Edit question (stem, options, answer key) with a live preview drawn by
 *   the same card renderer.
 * - Compare this question with the original paper page (Gemini vision).
 * - Show original page: the original PDF page picture beside
 *   the card, drawn locally on the server. No Gemini.
 * - Crop a picture from that page into the question, passage, or an option
 *   (the server copies the pixels; nothing is redrawn).
 * Never shown on published papers. Never publishes.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { isAdminLoggedIn } from '../utils/auth.js'
import { isOfficialPyqPlaceholder } from '../utils/officialPyqMissingSlots.js'
import { getOfficialPyqPendingPreviewPaper } from '../utils/officialPyqPendingStore.js'
import { officialPyqCurrentCompare } from '../utils/officialPyqCompareFreshness.js'
import {
  OFFICIAL_PYQ_CARD_CHANGED_EVENT,
  applyOfficialPyqCardDraft,
  approveOfficialPyqCard,
  insertOfficialPyqCropFigure,
  officialPyqCardForAdmin,
  officialPyqCardHasAnswerKey,
  officialPyqCompareHasSuggestion,
  officialPyqDraftFigureProblem,
  officialPyqDraftFromCard,
  officialPyqDraftFromSuggestion,
  officialPyqPassageGroupIndexes,
  officialPyqSuggestedFigures,
  restoreOfficialPyqCardFromScan,
  saveOfficialPyqCardEdit,
  unapproveOfficialPyqCard,
  undoOfficialPyqCardEdit,
} from '../utils/officialPyqCardEdit.js'

import MatrixGridView from './MatrixGridView.jsx'
import { gridColLabels } from '../utils/matrixGridPyq.js'

const OfficialPyqPreviewMath = lazy(() => import('../pages/OfficialPyqPreviewMath.jsx'))

const FIELD_STYLE = { display: 'block', margin: '0.5rem 0' }
const INPUT_STYLE = { display: 'block', width: '100%', fontFamily: 'ui-monospace, Consolas, monospace' }
const BOX_STYLE = { marginTop: '0.75rem', padding: '0.75rem' }
const PREVIEW_STYLE = { borderTop: '1px dashed currentColor', marginTop: '0.75rem', paddingTop: '0.5rem' }

const PAGE_PANEL_STYLE = { marginTop: '0.75rem', padding: '0.75rem' }
const PAGE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '0.75rem',
  alignItems: 'start',
  marginTop: '0.5rem',
}
const PAGE_IMG_WRAP_STYLE = { maxHeight: '80vh', overflow: 'auto', background: '#fff', border: '1px solid #ddd' }
const PAGE_IMG_STYLE = { display: 'block', width: '100%', height: 'auto', userSelect: 'none' }
const CROP_BAR_STYLE = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: '#fff',
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid #ddd',
}
const CROP_BOX_STYLE = {
  position: 'absolute',
  border: '2px solid #d93025',
  background: 'rgba(217, 48, 37, 0.12)',
  pointerEvents: 'none',
}

/** Go-to numbers of the cards sharing this card's passage. @param {string} paperId @param {number} index */
function passageGroupGoTo(paperId, index) {
  try {
    const questions = getOfficialPyqPendingPreviewPaper(paperId)?.questions || []
    return officialPyqPassageGroupIndexes(questions, index).map((i) => i + 1)
  } catch {
    return [index + 1]
  }
}

/** @param {{ x0: number, y0: number, x1: number, y1: number } | null} box */
function boxBigEnough(box) {
  return Boolean(box && Math.abs(box.x1 - box.x0) >= 0.01 && Math.abs(box.y1 - box.y0) >= 0.01)
}

/** @param {{ x0: number, y0: number, x1: number, y1: number }} box */
function boxStyle(box) {
  const left = Math.min(box.x0, box.x1)
  const top = Math.min(box.y0, box.y1)
  return {
    ...CROP_BOX_STYLE,
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${Math.abs(box.x1 - box.x0) * 100}%`,
    height: `${Math.abs(box.y1 - box.y0) * 100}%`,
  }
}

/**
 * Drag a box on the page picture; the server cuts exactly that box out of the original.
 * @param {{
 *   paperId: string
 *   page: number
 *   mod: any
 *   cropTargets: { id: string, label: string }[]
 *   onCrop: (target: string, url: string) => void
 *   onImgError: () => void
 * }} props
 */
function CroppablePage({ paperId, page, mod, cropTargets, onCrop, onImgError }) {
  const [cropMode, setCropMode] = useState(false)
  const [box, setBox] = useState(/** @type {{ x0: number, y0: number, x1: number, y1: number } | null} */ (null))
  const [busy, setBusy] = useState(false)
  const [cropError, setCropError] = useState('')
  const dragging = useRef(false)
  const imgRef = useRef(/** @type {HTMLImageElement | null} */ (null))

  useEffect(() => {
    setBox(null)
    setCropError('')
  }, [page])

  /** @param {React.PointerEvent} e */
  function pointAt(e) {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  /** @param {React.PointerEvent} e */
  function onPointerDown(e) {
    if (!cropMode || busy) return
    const p = pointAt(e)
    if (!p) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragging.current = true
    setCropError('')
    setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  /** @param {React.PointerEvent} e */
  function onPointerMove(e) {
    if (!dragging.current) return
    const p = pointAt(e)
    if (p) setBox((b) => (b ? { ...b, x1: p.x, y1: p.y } : b))
  }

  function onPointerUp() {
    dragging.current = false
  }

  async function putIn(target) {
    if (!boxBigEnough(box) || busy) return
    setBusy(true)
    setCropError('')
    try {
      const out = await mod.cropOfficialPyqOriginalPage(paperId, page, {
        x0: Math.min(box.x0, box.x1),
        y0: Math.min(box.y0, box.y1),
        x1: Math.max(box.x0, box.x1),
        y1: Math.max(box.y0, box.y1),
      })
      if (!out?.url) throw new Error('The helper did not return the picture.')
      onCrop(target, out.url)
      setBox(null)
      setCropMode(false)
    } catch (err) {
      setCropError(err instanceof Error ? err.message : 'Could not cut the picture.')
    } finally {
      setBusy(false)
    }
  }

  const ready = boxBigEnough(box)
  return (
    <div>
      <div className="official-pyq-actions" style={{ alignItems: 'center' }}>
        <p className="form-hint" style={{ margin: 0 }}>
          Original paper, page {page}
        </p>
        <button
          type="button"
          className={cropMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          data-testid="official-pyq-crop-toggle"
          aria-pressed={cropMode}
          onClick={() => {
            setCropMode((v) => !v)
            setBox(null)
            setCropError('')
          }}
        >
          {cropMode ? 'Stop cropping' : 'Crop a picture from this page'}
        </button>
      </div>
      <div style={PAGE_IMG_WRAP_STYLE}>
        {cropMode ? (
          <div style={CROP_BAR_STYLE}>
            <p className="form-hint" style={{ margin: 0 }} data-testid="official-pyq-crop-help">
              {ready
                ? 'Box drawn. Now click where this picture should go. (Drag again to redraw the box.)'
                : 'Hold the mouse button down and drag a box around the drawing on the page.'}
            </p>
            {ready ? (
              <div className="official-pyq-actions" data-testid="official-pyq-crop-targets">
                <span className="form-hint">Put picture in:</span>
                {cropTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    data-testid={`official-pyq-crop-to-${t.id}`}
                    onClick={() => void putIn(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
                {busy ? <span className="form-hint">Cutting the picture…</span> : null}
              </div>
            ) : null}
            {cropError ? <p className="upload-error">{cropError}</p> : null}
          </div>
        ) : null}
        {mod && page ? (
          <div
            style={{ position: 'relative', cursor: cropMode ? 'crosshair' : 'default', touchAction: cropMode ? 'none' : 'auto' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-testid="official-pyq-crop-surface"
          >
            <img
              ref={imgRef}
              key={page}
              src={mod.officialPyqOriginalPageUrl(paperId, page)}
              alt={`Original paper page ${page}`}
              style={PAGE_IMG_STYLE}
              draggable={false}
              data-testid="official-pyq-original-page-img"
              onError={onImgError}
            />
            {cropMode && box ? <div style={boxStyle(box)} data-testid="official-pyq-crop-box" /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Original page picture for one card, drawn locally. No Gemini.
 * @param {{
 *   paperId: string
 *   index: number
 *   card: any
 *   onClose: () => void
 *   cropTargets: { id: string, label: string }[]
 *   onCrop: (target: string, url: string) => void
 * }} props
 */
function OriginalPagePanel({ paperId, index, card, onClose, cropTargets, onCrop }) {
  const [info, setInfo] = useState(/** @type {any} */ (null))
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [imgError, setImgError] = useState('')
  const [mod, setMod] = useState(/** @type {any} */ (null))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await import('../utils/officialPyqOriginalCompare.js')
        if (cancelled) return
        setMod(m)
        const found = await m.locateOfficialPyqOriginalPage(paperId, index, card)
        if (cancelled) return
        setInfo(found)
        setPage(found?.pages?.[0] || 1)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the original page.')
      }
    })()
    return () => {
      cancelled = true
    }
    // Locate once per card; later card text edits do not move the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, index])

  const pageCount = Number(info?.page_count) || 0
  const goTo = index + 1
  const foundNote =
    info?.found_by === 'text_layer' || info?.found_by === 'saved_page_map'
      ? `Q${goTo} found on page ${info.pages[0]}`
      : info?.found_by === 'image'
        ? 'Stored page image'
        : `Could not find Q${goTo} automatically — use the page buttons`

  return (
    <div className="card official-pyq-original-page" style={PAGE_PANEL_STYLE} data-testid="official-pyq-original-page">
      <div className="official-pyq-actions" style={{ alignItems: 'center' }}>
        <strong>Original paper</strong>
        {info?.available && pageCount > 1 ? (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page <= 1}
              onClick={() => {
                setImgError('')
                setPage((p) => Math.max(1, p - 1))
              }}
            >
              ‹ Prev page
            </button>
            <span className="form-hint" data-testid="official-pyq-original-page-number">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={page >= pageCount}
              onClick={() => {
                setImgError('')
                setPage((p) => Math.min(pageCount, p + 1))
              }}
            >
              Next page ›
            </button>
          </>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Hide original page
        </button>
      </div>
      {error ? <p className="upload-error">{error}</p> : null}
      {!error && !info ? <p className="form-hint">Finding the page…</p> : null}
      {info && !info.available ? (
        <p className="form-hint" data-testid="official-pyq-original-missing">
          {mod?.ORIGINAL_MISSING_MESSAGE || 'Original paper not available for this paper'}.
        </p>
      ) : null}
      {info?.available ? (
        <>
          <p className="form-hint">{foundNote}. Drawn on this computer — nothing is sent to Gemini.</p>
          {imgError ? <p className="upload-error">{imgError}</p> : null}
          <div style={PAGE_GRID_STYLE}>
            <div data-testid="official-pyq-original-page-card">
              <p className="form-hint">This card (Q{goTo})</p>
              <Suspense fallback={<p className="form-hint">Loading card…</p>}>
                <OfficialPyqPreviewMath q={card} />
              </Suspense>
            </div>
            <CroppablePage
              paperId={paperId}
              page={page}
              mod={mod}
              cropTargets={cropTargets}
              onCrop={onCrop}
              onImgError={() => setImgError(`Could not draw page ${page}.`)}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

const DIFF_LABELS = {
  missing_text: 'Missing text',
  wrong_number: 'Wrong number',
  wrong_unit: 'Wrong unit',
  wrong_symbol: 'Wrong symbol',
  wrong_option: 'Wrong option',
  wrong_alignment: 'Wrong alignment',
  missing_figure: 'Missing figure',
  wrong_passage: 'Passage',
  extra_card: 'Not a question on the original',
  card_problem: 'Problem on the card',
  other: 'Difference',
}

/** @param {any} q */
function cardSyncKey(q) {
  return JSON.stringify([
    q?.text ?? '',
    q?.passageText ?? '',
    q?.options ?? [],
    q?.adminEdited === true,
    q?.adminEditedAt ?? 0,
    q?.adminApprovedAt ?? 0,
    q?.originalCompare?.checkedAt ?? 0,
    Array.isArray(q?.editHistory) ? q.editHistory.length : 0,
  ])
}

const draftFromCard = officialPyqDraftFromCard

/** Column I / Column II rows and the answer grid of a matrix-match grid card. */
function GridDraftFields({ draft, setDraft, card }) {
  const setItem = (field, at, value) =>
    setDraft((d) => {
      const list = (d[field] || []).slice()
      list[at] = value
      return { ...d, [field]: list }
    })
  const labels = gridColLabels({ ...card, matrixCols: draft.matrixCols })
  return (
    <div data-testid="official-pyq-edit-grid">
      {(draft.matrixRows || []).map((row, i) => (
        <label key={`r${i}`} className="official-pyq-edit-field" style={FIELD_STYLE}>
          Column I ({String.fromCharCode(65 + i)})
          <textarea rows={2} style={INPUT_STYLE} value={row} onChange={(e) => setItem('matrixRows', i, e.target.value)} />
        </label>
      ))}
      {(draft.matrixCols || []).map((col, j) => (
        <label key={`c${j}`} className="official-pyq-edit-field" style={FIELD_STYLE}>
          Column II ({labels[j]})
          <textarea rows={2} style={INPUT_STYLE} value={col} onChange={(e) => setItem('matrixCols', j, e.target.value)} />
        </label>
      ))}
      <p className="form-hint" style={{ marginBottom: 0 }}>
        Answer: tick every Column II box that matches each Column I row (one or more per row).
      </p>
      <MatrixGridView
        question={{ ...card, matrixRows: draft.matrixRows, matrixCols: draft.matrixCols, matrixAnswerKey: draft.matrixAnswerKey }}
        onChange={(key) => setDraft((d) => ({ ...d, matrixAnswerKey: key }))}
      />
    </div>
  )
}
const draftFromSuggestion = officialPyqDraftFromSuggestion

const FIGURE_THUMB_STYLE = {
  maxHeight: '72px',
  maxWidth: '240px',
  background: '#fff',
  border: '1px solid #ddd',
  marginRight: '0.4rem',
  verticalAlign: 'middle',
}

/** Pictures Compare cut out of the original page, so the admin sees them before Fix it now. @param {{ figures: any }} props */
function SuggestedFigures({ figures }) {
  const groups = [
    { label: 'Question', urls: figures.text },
    { label: 'Passage', urls: figures.passage },
    ...figures.options.map((urls, i) => ({ label: `Option ${String.fromCharCode(65 + i)}`, urls })),
  ].filter((g) => g.urls.length)
  if (!groups.length) return null
  return (
    <div data-testid="official-pyq-compare-figures">
      <p style={{ margin: '0.4rem 0 0.2rem' }}>Pictures cut from the original page (Fix it now puts them in):</p>
      {groups.map((g) => (
        <div key={g.label} style={{ margin: '0.2rem 0' }}>
          <span className="form-hint" style={{ display: 'inline-block', minWidth: '5.5rem' }}>
            {g.label}:
          </span>
          {g.urls.map((url) => (
            <img key={url} src={url} alt={`${g.label} picture from the original page`} style={FIGURE_THUMB_STYLE} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * @param {{
 *   paperId: string
 *   index: number
 *   card: any
 *   onSaved?: (card: any) => void
 * }} props
 */
export default function OfficialPyqCardAdminTools({ paperId, index, card, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => draftFromCard(card))
  const [fromSuggestion, setFromSuggestion] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [compareBusy, setCompareBusy] = useState(false)
  const [showPage, setShowPage] = useState(false)

  const previewCard = useMemo(
    () => ({ ...applyOfficialPyqCardDraft(card, draft), adminEdited: true }),
    [card, draft],
  )

  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const cardRef = useRef(card)
  cardRef.current = card

  useEffect(() => {
    const sync = () => {
      let fresh = null
      try {
        fresh = getOfficialPyqPendingPreviewPaper(paperId)?.questions?.[index] ?? null
      } catch {
        fresh = null
      }
      if (fresh && cardSyncKey(fresh) !== cardSyncKey(cardRef.current)) onSavedRef.current?.(fresh)
    }
    sync()
    const onChanged = (ev) => {
      if (String(ev?.detail?.paperId ?? '') === String(paperId)) sync()
    }
    window.addEventListener(OFFICIAL_PYQ_CARD_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(OFFICIAL_PYQ_CARD_CHANGED_EVENT, onChanged)
  }, [paperId, index])

  const isPending = useMemo(() => {
    try {
      return String(getOfficialPyqPendingPreviewPaper(paperId)?.status ?? '') === 'pending_review'
    } catch {
      return false
    }
  }, [paperId])

  if (!isPending || !isAdminLoggedIn() || !card || isOfficialPyqPlaceholder(card)) return null

  const hasAnswer = officialPyqCardHasAnswerKey(card)
  const hasFigure = Boolean(String(card?.questionImage ?? '').trim())
  const goTo = index + 1
  const flaggedNow = (() => {
    try {
      return (getOfficialPyqPendingPreviewPaper(paperId)?.localQuality?.failedGoTo || []).map(Number).includes(goTo)
    } catch {
      return false
    }
  })()
  const compare = officialPyqCurrentCompare(card, { flagged: flaggedNow })
  const hasSuggestion = officialPyqCompareHasSuggestion(compare)
  const suggestedFigures = officialPyqSuggestedFigures(compare?.suggestedFigures)
  const useSuggestion = compare?.verdict === 'differs' && hasSuggestion
  const hasPassage = Boolean(
    String(card?.passageText ?? '').trim() || card?.passageId || card?.passageGroup || draft.passageText,
  )
  const passageMates = hasPassage ? passageGroupGoTo(paperId, index) : []
  function openEditor(nextDraft, suggested = false) {
    setDraft(nextDraft)
    setFromSuggestion(suggested)
    setError('')
    setNote('')
    setEditing(true)
  }

  const adminCard = showPage && !editing ? officialPyqCardForAdmin(paperId, card) : null
  const optionCount = editing ? draft.options.length : (adminCard?.options || []).length
  const cropTargets = [
    { id: 'text', label: 'Question text' },
    ...(hasPassage ? [{ id: 'passage', label: 'Passage' }] : []),
    ...Array.from({ length: optionCount }, (_, i) => ({ id: String(i), label: `Option ${String.fromCharCode(65 + i)}` })),
  ]

  function onCropPicked(target, url) {
    const where = cropTargets.find((t) => t.id === target)?.label || 'the card'
    try {
      insertOfficialPyqCropFigure({ text: '', passageText: '', options: [] }, 'text', url)
      if (editing) setDraft((d) => insertOfficialPyqCropFigure(d, target, url))
      else openEditor(insertOfficialPyqCropFigure(draftFromCard(adminCard || officialPyqCardForAdmin(paperId, card)), target, url))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not put the picture in.')
      return
    }
    setNote(
      `Picture from the original page put in ${where}. Do not change the \\includegraphics{…} line by hand — check the live preview, then click Save.`,
    )
  }

  const historyCount = Array.isArray(card.editHistory) ? card.editHistory.length : 0

  /** @param {{ ok: boolean, error?: string, paper?: any, restoredScan?: boolean }} result @param {string} done */
  function afterUndo(result, done) {
    if (!result.ok) {
      setError(result.error || 'Could not undo.')
      return
    }
    const passed = !(result.paper?.localQuality?.failedGoTo || []).includes(goTo)
    setNote(`${done} Quality check re-run: ${passed ? 'this card passed' : 'this card still needs a look'}. Not published.`)
    onSaved?.(result.paper?.questions?.[index] ?? card)
  }

  function onUndo() {
    setError('')
    if (!window.confirm(`Undo the last change to Q${goTo}? The question goes back to how it was before that save.`)) return
    const result = undoOfficialPyqCardEdit(paperId, index)
    afterUndo(
      result,
      result.restoredScan
        ? `Q${goTo} is back to the scanned version. Re-parse and auto-heal can fix it again.`
        : `Undid the last change to Q${goTo}.`,
    )
  }

  function onRestoreScan() {
    setError('')
    if (
      !window.confirm(
        `Go back to the scanned version of Q${goTo}? Your edits on this question are replaced by the text from the stored scan, and re-parse / auto-heal can fix it again. (You can Undo this.)`,
      )
    ) {
      return
    }
    afterUndo(restoreOfficialPyqCardFromScan(paperId, index), `Q${goTo} is back to the scanned version.`)
  }

  const draftFigureProblem = editing ? officialPyqDraftFigureProblem(draft) : ''
  function onCancel() {
    setEditing(false)
    setDraft(draftFromCard(card))
    setFromSuggestion(false)
    setError('')
    setNote('Edit cancelled. The card was not changed.')
  }

  function onSave() {
    setError('')
    const result = saveOfficialPyqCardEdit(paperId, index, draft)
    if (!result.ok) {
      setError(result.error || 'Could not save.')
      return
    }
    setEditing(false)
    setFromSuggestion(false)
    const passed = !(result.paper?.localQuality?.failedGoTo || []).includes(goTo)
    const shared = result.passageShared?.length ? ` The passage was also saved on Q${result.passageShared.join(', Q')}.` : ''
    setNote(
      `Saved Q${goTo}.${shared} Quality check re-run: ${passed ? 'this card passed' : 'this card still needs a look'}. Not published.`,
    )
    onSaved?.(result.card)
  }

  function onUseCorrection() {
    setError('')
    const nextDraft = draftFromSuggestion(officialPyqCardForAdmin(paperId, card), compare)
    const problem = officialPyqDraftFigureProblem(nextDraft)
    if (problem) {
      openEditor(nextDraft, true)
      setError(problem)
      return
    }
    const result = saveOfficialPyqCardEdit(paperId, index, nextDraft)
    if (!result.ok) {
      setError(result.error || 'Could not save the corrected version.')
      return
    }
    const passed = !(result.paper?.localQuality?.failedGoTo || []).includes(goTo)
    setNote(
      `Fixed Q${goTo} with the corrected version from the original paper. Quality check re-run: ${
        passed ? 'this card passed' : 'this card still needs a look'
      }. Not published. Wrong? Click Undo last edit.`,
    )
    onSaved?.(result.card)
  }

  function onApprove() {
    setError('')
    const result = approveOfficialPyqCard(paperId, index)
    if (!result.ok) {
      setError(result.error || 'Could not approve.')
      return
    }
    setNote(`Approved Q${goTo}. It is saved as shown, gets no quality alarms, and nothing will change it. Not published.`)
    onSaved?.(result.card)
  }

  function onUnapprove() {
    setError('')
    const result = unapproveOfficialPyqCard(paperId, index)
    if (!result.ok) {
      setError(result.error || 'Could not undo the approval.')
      return
    }
    const passed = !(result.paper?.localQuality?.failedGoTo || []).includes(goTo)
    setNote(
      `Approval removed from Q${goTo}. Quality check re-run: ${passed ? 'this card passed' : 'this card needs a look'}.`,
    )
    onSaved?.(result.card)
  }

  async function onCompare() {
    if (compareBusy) return
    setCompareBusy(true)
    setError('')
    const startedAt = Date.now()
    const waitingNote = () =>
      `Comparing Q${goTo} with the original paper… ${Math.round((Date.now() - startedAt) / 1000)} s so far. This usually takes under a minute.`
    setNote(waitingNote())
    const ticker = setInterval(() => setNote(waitingNote()), 1000)
    let doneNote = ''
    try {
      const mod = await import('../utils/officialPyqOriginalCompare.js')
      let status = null
      try {
        status = await mod.getOfficialPyqOriginalStatus(paperId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Compare service is not reachable.')
        return
      }
      if (!status?.available) {
        setError(mod.ORIGINAL_MISSING_MESSAGE)
        return
      }
      if (!status?.gemini_key) {
        setError(mod.GEMINI_KEY_MISSING_MESSAGE)
        return
      }
      const out = await mod.compareOneOfficialPyqCard(paperId, index)
      if (!out.ok) {
        setError(out.error || 'Compare failed.')
        return
      }
      if (out.card) onSaved?.(out.card)
      const verdict = String(out.result?.verdict ?? '')
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      doneNote =
        verdict === 'matches'
          ? `Compare finished at ${at}: Q${goTo} matches the original paper.`
          : out.result?.textMatches || out.result?.text_matches
            ? `Compare finished at ${at}: the words of Q${goTo} match the original, but the card still has a problem on screen — see the list above. Fix it before approving.`
            : verdict === 'error'
            ? `Compare stopped at ${at}: Gemini could not check Q${goTo}. ${
                String(out.result?.error ?? '').trim() || 'Try again.'
              }`
            : `Compare finished at ${at}: Q${goTo} differs from the original — see the list above.${
                officialPyqCompareHasSuggestion(out.card?.originalCompare)
                  ? ' Click Fix it now to save the corrected version, or Edit question to check it first.'
                  : ''
              }`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed.')
    } finally {
      clearInterval(ticker)
      setNote(doneNote)
      setCompareBusy(false)
    }
  }

  return (
    <div className="official-pyq-card-admin" data-testid="official-pyq-card-admin">
      {card.adminApproved ? (
        <p className="form-hint official-pyq-admin-approved" data-testid="official-pyq-admin-approved">
          <span className="bank-review-badge">Approved by admin</span> This question is saved as shown. Quality
          alarms are off for it, and re-parse, quality fix, and auto-heal will not change it.
        </p>
      ) : card.adminEdited && card.editSource === 'auto_compare' ? (
        <p className="form-hint official-pyq-admin-edited" data-testid="official-pyq-auto-fixed">
          <span className="bank-review-badge">Fixed by auto-fix</span> Saved from the original paper. A rebuild from
          the scan can still correct it.{' '}
          {historyCount ? 'Undo last edit puts back the version before the fix.' : ''}
        </p>
      ) : card.adminEdited ? (
        <p className="form-hint official-pyq-admin-edited" data-testid="official-pyq-admin-edited">
          <span className="bank-review-badge">Edited by admin</span> Re-parse, quality fix, and auto-heal
          will not change this card.{' '}
          {historyCount ? 'Undo last edit puts back the version before your last save.' : 'Go back to the scanned version undoes your edits.'}
        </p>
      ) : null}

      {compare ? (
        <div
          className={compare.verdict === 'differs' || (compare.verdict === 'matches' && flaggedNow) ? 'upload-error' : 'form-hint'}
          data-testid="official-pyq-compare-result"
          role="status"
        >
          {compare.verdict === 'matches' && flaggedNow ? (
            <span data-testid="official-pyq-compare-flagged">
              The words matched the original paper{compare.pages?.length ? ` (page ${compare.pages[0]})` : ''}, but the
              quality check still flags Q{goTo} — the card has a problem on screen. Fix it before approving.
            </span>
          ) : compare.verdict === 'matches' ? (
            <span>
              Matches the original paper{compare.pages?.length ? ` (page ${compare.pages[0]})` : ''}.
              {compare.checkedAt
                ? ` Checked ${new Date(compare.checkedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.`
                : ''}
            </span>
          ) : compare.verdict === 'error' ? (
            <span>
              Could not compare Q{goTo} after 2 tries{compare.error ? `: ${compare.error}` : '.'}
            </span>
          ) : (
            <>
              <strong>
                {compare.textMatches
                  ? `The words of Q${goTo} match the original paper${compare.pages?.length ? ` (page ${compare.pages[0]})` : ''}, but the card still has a problem:`
                  : `Q${goTo} differs from the original paper${compare.pages?.length ? ` (page ${compare.pages[0]})` : ''}:`}
              </strong>
              <ul className="official-pyq-compare-diffs">
                {(compare.differences || []).map((d, i) => (
                  <li key={i}>
                    {DIFF_LABELS[d.kind] || DIFF_LABELS.other}: {d.detail}
                  </li>
                ))}
              </ul>
              <SuggestedFigures figures={suggestedFigures} />
              {hasSuggestion ? (
                <p data-testid="official-pyq-open-suggestion">
                  Click Fix it now to save the corrected version (you can Undo), or Edit question to check it first.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {!editing ? (
        <div className="official-pyq-actions">
          {card.adminApproved ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="official-pyq-unapprove-question"
              onClick={onUnapprove}
            >
              Undo approval
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="official-pyq-approve-question"
              title="Looks right on screen? Approve it: no more alarms for this question, and nothing will change it."
              onClick={onApprove}
            >
              Approve this question
            </button>
          )}
          {useSuggestion && !card.adminApproved ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="official-pyq-use-correction"
              title="Save the corrected version that Compare read from the original paper. Undo last edit puts it back."
              onClick={onUseCorrection}
            >
              Fix it now
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="official-pyq-edit-question"
            onClick={() =>
              openEditor(
                useSuggestion
                  ? draftFromSuggestion(officialPyqCardForAdmin(paperId, card), compare)
                  : draftFromCard(officialPyqCardForAdmin(paperId, card)),
                useSuggestion,
              )
            }
          >
            {useSuggestion ? 'Edit question (corrected)' : 'Edit question'}
          </button>
          {historyCount ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="official-pyq-undo-edit"
              title="Put back the version of this question from before the last save."
              onClick={onUndo}
            >
              Undo last edit
            </button>
          ) : card.adminEdited ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="official-pyq-restore-scan"
              title="Throw away the admin edits and rebuild this question from the stored scan."
              onClick={onRestoreScan}
            >
              Go back to the scanned version
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="official-pyq-compare-question"
            disabled={compareBusy}
            aria-busy={compareBusy}
            onClick={() => void onCompare()}
          >
            {compareBusy ? 'Comparing…' : 'Compare this question'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="official-pyq-show-original-page"
            aria-pressed={showPage}
            onClick={() => setShowPage((v) => !v)}
          >
            {showPage ? 'Hide original page' : 'Show original page'}
          </button>
        </div>
      ) : (
        <div className="official-pyq-edit-box card" style={BOX_STYLE} data-testid="official-pyq-edit-box">
          <h4>Edit question Q{goTo}</h4>
          {fromSuggestion ? (
            <p className="form-hint">
              Suggested correction from the original page is filled in. Check it against the page, change
              anything, then Save — or Cancel to keep the card as it is.
            </p>
          ) : null}
          {hasPassage ? (
            <label className="official-pyq-edit-field" style={FIELD_STYLE}>
              Passage / question stem
              {passageMates.length > 1
                ? ` (shared by Q${passageMates.join(', Q')} — saving changes it on all of them)`
                : ''}
              <textarea
                rows={8}
                style={INPUT_STYLE}
                value={draft.passageText}
                data-testid="official-pyq-edit-passage"
                onChange={(e) => setDraft((d) => ({ ...d, passageText: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="official-pyq-edit-field" style={FIELD_STYLE}>
            Question text (text and LaTeX, e.g. $x^2$)
            <textarea
              rows={6}
              style={INPUT_STYLE}
              value={draft.text}
              data-testid="official-pyq-edit-stem"
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            />
          </label>
          {draft.options.map((opt, oi) => (
            <label key={oi} className="official-pyq-edit-field" style={FIELD_STYLE}>
              Option {String.fromCharCode(65 + oi)}
              <textarea
                rows={2}
                style={INPUT_STYLE}
                value={opt}
                data-testid={`official-pyq-edit-option-${oi}`}
                onChange={(e) =>
                  setDraft((d) => {
                    const options = d.options.slice()
                    options[oi] = e.target.value
                    return { ...d, options }
                  })
                }
              />
            </label>
          ))}
          {draft.grid ? (
            <GridDraftFields draft={draft} setDraft={setDraft} card={card} />
          ) : null}
          {hasAnswer && !draft.grid ? (
            <label className="official-pyq-edit-field" style={FIELD_STYLE}>
              Answer key (A, or A, C for more than one, or a number)
              <input
                type="text"
                style={INPUT_STYLE}
                value={draft.answerKey}
                data-testid="official-pyq-edit-answer"
                onChange={(e) => setDraft((d) => ({ ...d, answerKey: e.target.value }))}
              />
            </label>
          ) : null}
          {hasFigure ? (
            <label className="official-pyq-edit-field" style={FIELD_STYLE}>
              <input
                type="checkbox"
                checked={draft.removeFigure}
                onChange={(e) => setDraft((d) => ({ ...d, removeFigure: e.target.checked }))}
              />{' '}
              Remove this card&apos;s figure (leave unticked to keep it)
            </label>
          ) : null}
          <div style={PREVIEW_STYLE} data-testid="official-pyq-edit-preview">
            <p className="form-hint">Live preview (drawn the same way as the card):</p>
            <Suspense fallback={<p className="form-hint">Loading preview…</p>}>
              <OfficialPyqPreviewMath q={previewCard} />
            </Suspense>
          </div>
          {draftFigureProblem ? (
            <p className="upload-error" data-testid="official-pyq-edit-figure-problem">
              {draftFigureProblem}. Put the picture in again with the crop tool, or delete that whole line.
            </p>
          ) : null}
          <div className="official-pyq-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="official-pyq-edit-save"
              disabled={Boolean(draftFigureProblem)}
              onClick={onSave}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="official-pyq-edit-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p className="upload-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? <p className="form-hint">{note}</p> : null}
      {showPage ? (
        <OriginalPagePanel
          paperId={paperId}
          index={index}
          card={card}
          onClose={() => setShowPage(false)}
          cropTargets={cropTargets}
          onCrop={onCropPicked}
        />
      ) : null}
    </div>
  )
}
