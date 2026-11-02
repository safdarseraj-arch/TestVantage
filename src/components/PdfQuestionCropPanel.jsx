import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BANK_IMAGE_PRESETS } from '../utils/imageQuestion.js'
import { cropFromDisplayedImage, displayRectToNatural } from '../utils/cropImageRegion.js'
import {
  PDF_CROP_TYPE_OPTIONS,
  bundleHasRequiredCrops,
  countAssignedRegions,
  emptyPdfCropRegions,
  getCropStepsForType,
  nextStepIndexAfterCrop,
  regionHasCrop,
} from '../utils/pdfCropSteps.js'
import { openPdfFromFile } from '../utils/pdfDocumentCache.js'
import { renderPdfPageToDataUrl } from '../utils/pdfPageRender.js'
import { ocrPdfCropRegion, resolvePdfCropOcrForSave } from '../utils/pdfCropOcr.js'
import { cropImageForOcrKey, ocrMetaKeyForPassageStep } from '../utils/pdfCropBundleSave.js'
import PdfCropOcrCompare from './PdfCropOcrCompare.jsx'
import { hasOcrDisplayText, ocrConfidenceBadgeLabel, patchOcrWithEditedText } from '../utils/ocrPreviewDisplay.js'

let cropIdSeq = 0

/** @typedef {import('../utils/pdfCropSteps.js').PdfCropQuestionTypeId} PdfCropQuestionTypeId */

/**
 * @typedef {Object} PdfCropSubQuestion
 * @property {string | null} stem
 * @property {string | null} optionsBlock
 * @property {(string | null)[]} optionImages
 * @property {number} correctIndex
 * @property {string} correctInteger
 * @property {string} correctNumerical
 */

/**
 * @typedef {Object} PdfCropBundle
 * @property {string} id
 * @property {PdfCropQuestionTypeId} questionType
 * @property {string} label
 * @property {number} pageNum
 * @property {'split' | 'full'} mode
 * @property {string | null} fullImage
 * @property {ReturnType<typeof emptyPdfCropRegions>} regions
 * @property {PdfCropSubQuestion[]} subQuestions
 * @property {number} activeSubIndex
 * @property {number} correctIndex
 * @property {number[]} correctIndices
 * @property {boolean} saved
 * @property {boolean} [saving]
 * @property {Record<string, import('../utils/pdfCropOcr.js').PdfCropOcrResult>} [ocrMeta]
 */

function emptySubQuestion() {
  return {
    stem: null,
    optionsBlock: null,
    optionImages: [null, null, null, null],
    correctIndex: 0,
    correctInteger: '',
    correctNumerical: '',
  }
}

function newBundle(pageNum, questionType, n = 1) {
  cropIdSeq += 1
  return {
    id: `pdf-crop-${cropIdSeq}`,
    questionType,
    label: `Page ${pageNum} — question ${n}`,
    pageNum,
    mode: 'split',
    fullImage: null,
    regions: emptyPdfCropRegions(),
    subQuestions: [emptySubQuestion()],
    activeSubIndex: 0,
    correctIndex: 0,
    correctIndices: [],
    saved: false,
    ocrMeta: {},
  }
}

/** @param {PdfCropBundle} bundle @param {string} stepKey @param {string} dataUrl */
function assignCropToBundle(bundle, stepKey, dataUrl) {
  const isPassage =
    bundle.questionType === 'passage_scq' || bundle.questionType === 'passage_integer'
  const subKeys = ['sub_stem', 'sub_options_block', 'option_0', 'option_1', 'option_2', 'option_3']

  if (isPassage && subKeys.includes(stepKey)) {
    const subs = [...bundle.subQuestions]
    const idx = bundle.activeSubIndex
    const sub = { ...subs[idx], optionImages: [...subs[idx].optionImages] }
    if (stepKey === 'sub_stem') sub.stem = dataUrl
    else if (stepKey === 'sub_options_block') sub.optionsBlock = dataUrl
    else if (stepKey.startsWith('option_')) {
      const oi = Number(stepKey.replace('option_', ''))
      sub.optionImages[oi] = dataUrl
    }
    subs[idx] = sub
    return { ...bundle, subQuestions: subs }
  }

  return { ...bundle, regions: { ...bundle.regions, [stepKey]: dataUrl } }
}

/** @param {PdfCropBundle} bundle */
function bundleReadyToFinish(bundle) {
  if (bundle.mode === 'full') return !!bundle.fullImage
  const steps = getCropStepsForType(bundle.questionType, {
    subIndex: bundle.activeSubIndex,
  })
  const isPassage =
    bundle.questionType === 'passage_scq' || bundle.questionType === 'passage_integer'

  if (isPassage) {
    const hasPassage =
      regionHasCrop(bundle.regions, 'passage_body') ||
      regionHasCrop(bundle.regions, 'passage_diagram')
    const hasSub = bundle.subQuestions.some(
      (sq) => sq.stem || sq.optionsBlock || sq.optionImages.some(Boolean),
    )
    return hasPassage && hasSub
  }

  if (bundleHasRequiredCrops(bundle.regions, steps)) return true
  return (
    regionHasCrop(bundle.regions, 'stem') ||
    regionHasCrop(bundle.regions, 'column_I') ||
    countAssignedRegions(bundle.regions) >= 1
  )
}

/**
 * @param {{
 *   defaultQuestionType?: PdfCropQuestionTypeId
 *   onSaveBundle: (bundle: PdfCropBundle) => Promise<boolean>
 *   onMessage?: (type: 'success' | 'error' | '', text: string) => void
 * }} props
 */
export default function PdfQuestionCropPanel({
  defaultQuestionType = 'single_correct',
  onSaveBundle,
  onMessage,
}) {
  const supportedDefault = PDF_CROP_TYPE_OPTIONS.some((o) => o.id === defaultQuestionType)
    ? defaultQuestionType
    : 'single_correct'
  const [pdfFile, setPdfFile] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [pageUrl, setPageUrl] = useState('')
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const pdfRef = useRef(null)

  const imgWrapRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)
  const [displayRect, setDisplayRect] = useState(null)
  const [dims, setDims] = useState(null)
  const [cropBusy, setCropBusy] = useState(false)
  const [cropError, setCropError] = useState('')
  const cropBusyRef = useRef(false)
  const assignCropRef = useRef(/** @type {((rect?: { left: number, top: number, width: number, height: number }) => Promise<void>) | null} */ (null))

  /** @type {[PdfCropBundle | null, Function]} */
  const [activeBundle, setActiveBundle] = useState(null)
  /** @type {[PdfCropBundle[], Function]} */
  const [queue, setQueue] = useState([])
  const [stepIndex, setStepIndex] = useState(0)

  const questionType = activeBundle?.questionType ?? supportedDefault
  const cropMode = activeBundle?.mode ?? 'split'
  const activeSubIndex = activeBundle?.activeSubIndex ?? 0

  const steps = useMemo(
    () => getCropStepsForType(questionType, { subIndex: activeSubIndex }),
    [questionType, activeSubIndex],
  )
  const step = steps[stepIndex] ?? steps[0]

  const measureImage = useCallback(() => {
    const img = imgRef.current
    if (!img || !img.complete) return
    const displayWidth = img.clientWidth
    const displayHeight = img.clientHeight
    if (!displayWidth || !displayHeight) return
    setDims({
      displayWidth,
      displayHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })
  }, [])

  const readImageDims = useCallback(() => {
    const img = imgRef.current
    if (!img?.complete || !img.naturalWidth || !img.clientWidth) return null
    return {
      displayWidth: img.clientWidth,
      displayHeight: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }
  }, [])

  useEffect(() => {
    const onResize = () => measureImage()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureImage])

  const loadPage = useCallback(async (file, page, pdfHandle) => {
    if (!file || !pdfHandle) return
    setPageLoading(true)
    setPageError('')
    setDisplayRect(null)
    try {
      const proxy = await pdfHandle.getPage(page)
      const dataUrl = await renderPdfPageToDataUrl(proxy, 2)
      setPageUrl(dataUrl)
    } catch (err) {
      setPageUrl('')
      setPageError(err instanceof Error ? err.message : 'Could not show this page.')
    } finally {
      setPageLoading(false)
    }
  }, [])

  const startNewBundle = useCallback(
    (type, pg = pageNum) => {
      const n = queue.length + 1
      setActiveBundle(newBundle(pg, type, n))
      setStepIndex(0)
      setDisplayRect(null)
      setCropError('')
    },
    [pageNum, queue.length],
  )

  const handlePdfPick = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      onMessage?.('error', 'Choose a PDF file.')
      return
    }
    setPdfFile(file)
    setQueue([])
    setActiveBundle(null)
    setPageNum(1)
    setPageLoading(true)
    setPageError('')
    try {
      const { pdf, numPages: n } = await openPdfFromFile(file)
      pdfRef.current = pdf
      setNumPages(n)
      await loadPage(file, 1, pdf)
      startNewBundle(supportedDefault, 1)
    } catch (err) {
      pdfRef.current = null
      setNumPages(0)
      setPageUrl('')
      onMessage?.('error', err instanceof Error ? err.message : 'Could not open PDF.')
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => {
    if (!pdfFile || !pdfRef.current) return
    loadPage(pdfFile, pageNum, pdfRef.current)
  }, [pageNum, pdfFile, loadPage])

  useEffect(() => {
    setStepIndex(0)
    setDisplayRect(null)
  }, [questionType, activeSubIndex, cropMode])

  const pointerPos = (e) => {
    const wrap = imgWrapRef.current
    if (!wrap) return null
    const box = wrap.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - box.left, box.width))
    const y = Math.max(0, Math.min(e.clientY - box.top, box.height))
    return { x, y }
  }

  const onPointerDown = (e) => {
    if (cropBusy || pageLoading || !pageUrl) return
    e.preventDefault()
    const pos = pointerPos(e)
    if (!pos) return
    dragRef.current = { start: pos, current: pos }
    setDisplayRect({ left: pos.x, top: pos.y, width: 0, height: 0 })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const pos = pointerPos(e)
    if (!pos) return
    drag.current = pos
    const left = Math.min(drag.start.x, pos.x)
    const top = Math.min(drag.start.y, pos.y)
    setDisplayRect({
      left,
      top,
      width: Math.abs(pos.x - drag.start.x),
      height: Math.abs(pos.y - drag.start.y),
    })
  }

  const onPointerUp = (e) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const pos = pointerPos(e) ?? drag.current
    if (!pos) return
    const left = Math.min(drag.start.x, pos.x)
    const top = Math.min(drag.start.y, pos.y)
    const width = Math.abs(pos.x - drag.start.x)
    const height = Math.abs(pos.y - drag.start.y)
    const rect = { left, top, width, height }
    setDisplayRect(rect)
    if (width >= 8 && height >= 8 && !cropBusyRef.current) {
      void assignCropRef.current?.(rect)
    }
  }

  const patchBundleOcr = useCallback((bundleId, stepKey, patch) => {
    const merge = (ocrMeta) => ({
      ...(ocrMeta ?? {}),
      [stepKey]: { ...(ocrMeta?.[stepKey] ?? {}), ...patch },
    })
    setActiveBundle((b) => (b?.id === bundleId ? { ...b, ocrMeta: merge(b.ocrMeta) } : b))
    setQueue((prev) =>
      prev.map((c) => (c.id === bundleId ? { ...c, ocrMeta: merge(c.ocrMeta) } : c)),
    )
  }, [])

  const runOcrAfterCrop = useCallback(
    (bundleId, storageKey, parseStepKey, dataUrl, qType) => {
      patchBundleOcr(bundleId, storageKey, { status: 'running', useText: false })
      queueMicrotask(() => {
        ocrPdfCropRegion(dataUrl, parseStepKey, qType, { fast: true })
          .then((result) => {
            patchBundleOcr(bundleId, storageKey, result)
          })
          .catch(() => {
            patchBundleOcr(bundleId, storageKey, { status: 'failed', useText: false })
          })
      })
    },
    [patchBundleOcr],
  )

  const assignCrop = useCallback(
    async (rectOverride) => {
      const rect = rectOverride ?? displayRect
      if (!rect || rect.width < 8 || rect.height < 8) {
        setCropError('Drag a box around the area first.')
        return
      }
      if (cropBusyRef.current) return
      const imageDims = readImageDims() ?? dims
      if (!imageDims || !activeBundle) {
        setCropError('Page not ready — wait a moment and try again.')
        measureImage()
        return
      }
      cropBusyRef.current = true
      setCropBusy(true)
      setCropError('')
      try {
        const preset = BANK_IMAGE_PRESETS[step?.role ?? 'crop'] ?? BANK_IMAGE_PRESETS.crop
        const natural = displayRectToNatural(rect, imageDims)
        const dataUrl = await cropFromDisplayedImage(imgRef.current, natural, {
          srcHint: pageUrl,
          maxWidth: preset.maxWidth,
          quality: preset.quality,
        })

        const bundleId = activeBundle.id
        const stepKey = cropMode === 'full' ? 'full' : step.key
        const qType = activeBundle.questionType
        const ocrKey = ocrMetaKeyForPassageStep(stepKey, activeBundle.activeSubIndex, qType)

        if (cropMode === 'full') {
          setActiveBundle((b) => (b ? { ...b, fullImage: dataUrl } : b))
        } else {
          const updated = assignCropToBundle(activeBundle, step.key, dataUrl)
          setActiveBundle(updated)
          setStepIndex(nextStepIndexAfterCrop(steps, stepIndex, updated))
        }
        setDisplayRect(null)
        runOcrAfterCrop(bundleId, ocrKey, stepKey, dataUrl, qType)
      } catch (err) {
        setCropError(err instanceof Error ? err.message : 'Crop failed.')
      } finally {
        cropBusyRef.current = false
        setCropBusy(false)
      }
    },
    [
      activeBundle,
      cropMode,
      dims,
      displayRect,
      measureImage,
      pageUrl,
      readImageDims,
      runOcrAfterCrop,
      step,
      stepIndex,
      steps,
    ],
  )

  useEffect(() => {
    assignCropRef.current = assignCrop
  }, [assignCrop])

  const setOcrChoice = useCallback(
    (bundleId, stepKey, useText) => {
      patchBundleOcr(bundleId, stepKey, { useText })
    },
    [patchBundleOcr],
  )

  const ocrRunningCount = (bundle) =>
    Object.values(bundle?.ocrMeta ?? {}).filter((v) => v?.status === 'running').length

  const finishQuestion = () => {
    if (!activeBundle || !bundleReadyToFinish(activeBundle)) {
      setCropError('Add the required crops before finishing this question.')
      return
    }
    setQueue((q) => [...q, { ...activeBundle, saved: false }])
    startNewBundle(questionType, pageNum)
    onMessage?.(
      'success',
      'Question added — image saved by default unless you picked Save as text. Convert to text later from Saved questions.',
    )
  }

  const updateQueueItem = (id, patch) => {
    setQueue((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  const removeFromQueue = (id) => {
    setQueue((prev) => prev.filter((c) => c.id !== id))
  }

  const saveBundle = async (id) => {
    const item = queue.find((c) => c.id === id)
    if (!item || item.saved) return
    const resolved = {
      ...item,
      ocrMeta: resolvePdfCropOcrForSave(item.ocrMeta),
    }
    updateQueueItem(id, { saving: true, ocrMeta: resolved.ocrMeta })
    try {
      const ok = await onSaveBundle(resolved)
      if (ok) {
        updateQueueItem(id, { saved: true, saving: false })
        onMessage?.('success', `Saved “${item.label}” to the bank (draft).`)
      } else {
        updateQueueItem(id, { saving: false })
      }
    } catch (err) {
      updateQueueItem(id, { saving: false })
      onMessage?.('error', err instanceof Error ? err.message : 'Save failed.')
    }
  }

  const saveAll = async () => {
    const pending = queue.filter((c) => !c.saved)
    if (!pending.length) {
      onMessage?.('error', 'No unsaved questions.')
      return
    }
    let saved = 0
    for (const item of pending) {
      const resolved = {
        ...item,
        ocrMeta: resolvePdfCropOcrForSave(item.ocrMeta),
      }
      updateQueueItem(item.id, { saving: true, ocrMeta: resolved.ocrMeta })
      try {
        const ok = await onSaveBundle(resolved)
        if (ok) {
          saved += 1
          updateQueueItem(item.id, { saved: true, saving: false })
        } else {
          updateQueueItem(item.id, { saving: false })
          break
        }
      } catch {
        updateQueueItem(item.id, { saving: false })
        break
      }
    }
    if (saved) onMessage?.('success', `Saved ${saved} question(s) to the bank (draft).`)
  }

  const unsavedCount = queue.filter((c) => !c.saved).length
  const isPassage =
    questionType === 'passage_scq' || questionType === 'passage_integer'

  const stepDone = (key) => {
    if (!activeBundle) return false
    if (key === 'sub_stem') return !!activeBundle.subQuestions[activeSubIndex]?.stem
    if (key === 'sub_options_block')
      return !!activeBundle.subQuestions[activeSubIndex]?.optionsBlock
    if (key.startsWith('option_')) {
      const oi = Number(key.replace('option_', ''))
      return !!activeBundle.subQuestions[activeSubIndex]?.optionImages[oi]
    }
    return regionHasCrop(activeBundle.regions, key)
  }

  const renderThumb = (url, label) =>
    url ? (
      <figure className="pdf-crop-region-thumb" key={label}>
        <img src={url} alt="" />
        <figcaption>{label}</figcaption>
      </figure>
    ) : null

  /** @param {string} key @param {string} qType */
  const labelForOcrKey = (key, qType) => {
    const scoped = /^sub_(\d+)_(.+)$/.exec(key)
    if (scoped) {
      const qi = Number(scoped[1]) + 1
      const rest = scoped[2]
      if (rest === 'stem') return `Sub Q${qi} — stem`
      if (rest === 'options_block') return `Sub Q${qi} — options A–D`
      if (rest.startsWith('option_')) {
        const oi = Number(rest.replace('option_', ''))
        return `Sub Q${qi} — option ${String.fromCharCode(65 + (Number.isFinite(oi) ? oi : 0))}`
      }
    }
    const stepDef =
      getCropStepsForType(qType).find((s) => s.key === key) ??
      ({ label: key === 'full' ? 'Full question' : key === 'solution' ? 'Solution' : key })
    return stepDef.label
  }

  /** @param {PdfCropBundle} bundle @param {(id: string, key: string, useText: boolean) => void} onChoose */
  const renderOcrCards = (bundle, onChoose) => {
    const entries = Object.entries(bundle.ocrMeta ?? {}).filter(([, v]) => v?.status)
    if (!entries.length) return null

    return (
      <div className="pdf-crop-ocr-list">
        {entries.map(([key, ocr]) => {
          const hasText = hasOcrDisplayText(ocr)
          const cropImg = cropImageForOcrKey(bundle, key)
          const needsReview = ocr.status === 'done' && !ocr.trusted && hasText
          const showChoice = ocr.status === 'done' && (ocr.trusted || needsReview || cropImg)
          return (
            <div
              key={key}
              className={`pdf-crop-ocr-card ${ocr.trusted ? 'is-trusted' : needsReview ? 'needs-review' : ''} ${ocr.useText === true ? 'picked-text' : ocr.useText === false ? 'picked-image' : ''}`}
            >
              <div className="pdf-crop-ocr-card-head">
                <strong>{labelForOcrKey(key, bundle.questionType)}</strong>
                {ocr.status === 'running' && (
                  <span className="pdf-crop-ocr-badge running">Reading…</span>
                )}
                {ocr.status === 'done' && (
                  <span className={`pdf-crop-ocr-badge ${hasText ? '' : 'no-text'}`}>
                    {ocrConfidenceBadgeLabel(ocr.confidence, hasText)}
                    {hasText && ocr.trusted ? ' · trusted' : hasText && needsReview ? ' · review' : ''}
                  </span>
                )}
              </div>
              {ocr.status === 'done' && cropImg && (
                <PdfCropOcrCompare
                  cropImg={cropImg}
                  ocr={ocr}
                  onTextEdit={(value) =>
                    patchBundleOcr(bundle.id, key, patchOcrWithEditedText(ocr, value, key))
                  }
                />
              )}
              {showChoice && (
                <div className="pdf-crop-ocr-actions">
                  <button
                    type="button"
                    className={`btn btn-sm ${ocr.useText === true ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={!hasText}
                    title={hasText ? undefined : 'No text was extracted — keep as image or re-crop'}
                    onClick={() => onChoose(bundle.id, key, true)}
                  >
                    Save as text
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${ocr.useText === false ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => onChoose(bundle.id, key, false)}
                  >
                    Keep as image
                  </button>
                </div>
              )}
              {needsReview && ocr.useText == null && hasText && (
                <p className="form-hint pdf-crop-ocr-review-hint">
                  Extraction is not perfect — compare above, then choose. If you skip, the image is
                  saved (convert to text later from Saved questions).
                </p>
              )}
              {!hasText && ocr.status === 'done' && ocr.useText == null && (
                <p className="form-hint pdf-crop-ocr-review-hint">
                  OCR could not read this crop — type the text in the box above, use{' '}
                  <strong>Keep as image</strong>, or draw a slightly larger crop.
                </p>
              )}
              {ocr.trusted && ocr.status === 'done' && ocr.useText == null && hasText && (
                <p className="form-hint">
                  No choice picked — image will be saved. Use <strong>Save as text</strong> now, or
                  convert from Saved questions later.
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card bank-panel pdf-crop-panel">
      <h3>PDF crop — split regions</h3>
      <p className="form-hint">
        The PDF stays <strong>only in your browser</strong>. Draw each part on the PDF — text is read{' '}
        <strong>in the background</strong> while you crop the next option or question. Compare the crop
        image with extracted text on each card, then pick <strong>Save as text</strong> or{' '}
        <strong>Keep as image</strong>. If you skip the choice, the <strong>image is saved</strong>{' '}
        — you can convert it to text later from Saved questions.
      </p>

      <div className="pdf-crop-dual-workspace">
        <section className="pdf-crop-pane pdf-crop-pane--pdf" aria-label="PDF source">
          <div className="pdf-crop-pane-head">
            <strong>PDF page</strong>
            {pdfFile && <span className="pdf-crop-file-name">{pdfFile.name}</span>}
          </div>

          <div className="pdf-crop-toolbar">
            <label className="btn btn-secondary btn-sm pdf-crop-file-label">
              {pdfFile ? 'Change PDF' : 'Choose PDF'}
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handlePdfPick(f)
                  e.target.value = ''
                }}
              />
            </label>
            {pdfFile && numPages > 0 && (
              <div className="pdf-crop-page-nav">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pageNum <= 1 || pageLoading}
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span>
                  Page {pageNum} / {numPages}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pageNum >= numPages || pageLoading}
                  onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          {!pdfFile && (
            <p className="form-hint pdf-crop-empty">Pick a PDF to start cropping.</p>
          )}
          {pageError && <p className="form-error">{pageError}</p>}
          {cropError && <p className="form-error">{cropError}</p>}

          {pdfFile && (
            <div className="pdf-crop-stage">
              {pageLoading && <p className="form-hint">Loading page…</p>}
              {!pageLoading && pageUrl && (
                <>
                  <p className="form-hint pdf-crop-drag-hint">
                    {cropMode === 'full' ? (
                      <>Drag one box around the <strong>full question</strong> — crop applies when you release.</>
                    ) : (
                      <>
                        Cropping: <strong>{step?.label}</strong> — drag a box, release to save. After
                        question text, the next crops go to <strong>Option A, B, C, D</strong> (diagram
                        only if you click that pill first).
                      </>
                    )}
                  </p>
                  <div
                    ref={imgWrapRef}
                    className="pdf-crop-img-wrap"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                  >
                    <img
                      ref={imgRef}
                      src={pageUrl}
                      alt={`PDF page ${pageNum}`}
                      className="pdf-crop-page-img"
                      onLoad={measureImage}
                      draggable={false}
                    />
                    {displayRect && displayRect.width > 2 && displayRect.height > 2 && (
                      <div
                        className="image-split-selection"
                        style={{
                          left: displayRect.left,
                          top: displayRect.top,
                          width: displayRect.width,
                          height: displayRect.height,
                        }}
                      />
                    )}
                  </div>
                  <div className="pdf-crop-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={cropBusy || pageLoading || !activeBundle || !displayRect}
                      onClick={() => void assignCrop()}
                    >
                      {cropBusy ? 'Cropping…' : 'Use this crop'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={cropBusy}
                      onClick={() => {
                        setDisplayRect(null)
                        setCropError('')
                      }}
                    >
                      Clear box
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        <section className="pdf-crop-pane pdf-crop-pane--builder" aria-label="Question builder">
          <div className="pdf-crop-pane-head">
            <strong>Question builder</strong>
            {unsavedCount > 0 && (
              <span className="pdf-crop-tab-count">{unsavedCount} to save</span>
            )}
          </div>

          {!pdfFile ? (
            <p className="form-hint">Open a PDF on the left to build questions here.</p>
          ) : (
            <>
              <div className="pdf-crop-builder-controls">
                <label className="pdf-crop-type-label">
                  Question type
                  <select
                    value={questionType}
                    onChange={(e) => {
                      const t = /** @type {PdfCropQuestionTypeId} */ (e.target.value)
                      setActiveBundle((b) =>
                        b
                          ? {
                              ...newBundle(pageNum, t, queue.length + 1),
                              label: b.label,
                              id: b.id,
                            }
                          : newBundle(pageNum, t, queue.length + 1),
                      )
                    }}
                  >
                    {PDF_CROP_TYPE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="pdf-crop-mode-toggle">
                  <button
                    type="button"
                    className={`btn btn-sm ${cropMode === 'split' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() =>
                      setActiveBundle((b) => (b ? { ...b, mode: 'split', fullImage: null } : b))
                    }
                  >
                    Split crops
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${cropMode === 'full' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveBundle((b) => (b ? { ...b, mode: 'full' } : b))}
                  >
                    Full question
                  </button>
                </div>
              </div>

              {cropMode === 'split' && (
                <>
                  {displayRect && displayRect.width >= 8 && !cropBusy && (
                    <div className="pdf-crop-pending-banner" role="status">
                      <p>
                        Box drawn — release the mouse to save, or click{' '}
                        <strong>Use this crop</strong> on the PDF.
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void assignCrop()}
                      >
                        Use this crop now
                      </button>
                    </div>
                  )}

                  {activeBundle && ocrRunningCount(activeBundle) > 0 && (
                    <p className="form-hint pdf-crop-ocr-bg-hint">
                      {ocrRunningCount(activeBundle)} part(s) reading text in background — keep
                      cropping.
                    </p>
                  )}

                  {isPassage && activeBundle && (
                    <div className="pdf-crop-sub-nav">
                      <span className="form-hint">Sub-questions:</span>
                      {activeBundle.subQuestions.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`btn btn-sm ${activeSubIndex === i ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() =>
                            setActiveBundle((b) => (b ? { ...b, activeSubIndex: i } : b))
                          }
                        >
                          Q{i + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setActiveBundle((b) =>
                            b
                              ? {
                                  ...b,
                                  subQuestions: [...b.subQuestions, emptySubQuestion()],
                                  activeSubIndex: b.subQuestions.length,
                                }
                              : b,
                          )
                        }
                      >
                        + Add sub Q
                      </button>
                    </div>
                  )}

                  <div className="pdf-crop-step-bar">
                    {steps.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        className={`image-split-step-pill ${stepIndex === i ? 'active' : ''} ${stepDone(s.key) ? 'done' : ''}`}
                        onClick={() => setStepIndex(i)}
                      >
                        {s.label}
                        {s.required ? ' *' : ''}
                      </button>
                    ))}
                  </div>

                  <div className="pdf-crop-region-grid">
                    {activeBundle?.fullImage && renderThumb(activeBundle.fullImage, 'Full')}
                    {activeBundle &&
                      Object.entries(activeBundle.regions)
                        .filter(([, v]) => v)
                        .map(([k, v]) => {
                          const def = steps.find((s) => s.key === k)
                          return renderThumb(v, def?.label ?? k)
                        })}
                    {activeBundle?.subQuestions.map((sq, si) => (
                      <span key={si} className="pdf-crop-sub-thumbs">
                        {sq.stem && renderThumb(sq.stem, `Sub ${si + 1} stem`)}
                        {sq.optionsBlock &&
                          renderThumb(sq.optionsBlock, `Sub ${si + 1} options`)}
                        {sq.optionImages.map(
                          (img, oi) =>
                            img &&
                            renderThumb(
                              img,
                              `Sub ${si + 1} opt ${String.fromCharCode(65 + oi)}`,
                            ),
                        )}
                      </span>
                    ))}
                  </div>

                  {activeBundle && renderOcrCards(activeBundle, setOcrChoice)}
                </>
              )}

              {cropMode === 'full' && activeBundle?.fullImage && (
                <div className="pdf-crop-region-grid">
                  {renderThumb(activeBundle.fullImage, 'Full question')}
                </div>
              )}

              {cropMode === 'full' &&
                activeBundle &&
                renderOcrCards(activeBundle, setOcrChoice)}

              {activeBundle && (
                <div className="pdf-crop-builder-actions">
                  <label className="pdf-crop-label-field">
                    Label
                    <input
                      value={activeBundle.label}
                      onChange={(e) =>
                        setActiveBundle((b) => (b ? { ...b, label: e.target.value } : b))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!bundleReadyToFinish(activeBundle)}
                    onClick={finishQuestion}
                  >
                    Finish this question →
                  </button>
                </div>
              )}

              <hr className="pdf-crop-divider" />

              <div className="pdf-crop-queue-section">
                <div className="pdf-crop-queue-toolbar">
                  <strong>Cropped questions ({queue.length})</strong>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!unsavedCount || queue.some((c) => c.saving)}
                    onClick={saveAll}
                  >
                    Save all ({unsavedCount})
                  </button>
                </div>

                {queue.length === 0 ? (
                  <p className="form-hint">
                    Finished questions appear here. Crop parts on the left, click{' '}
                    <strong>Finish this question</strong>, then save to the bank.
                  </p>
                ) : (
                  <ul className="pdf-crop-queue">
                    {queue.map((item) => (
                      <li
                        key={item.id}
                        className={`pdf-crop-queue-item ${item.saved ? 'is-saved' : ''}`}
                      >
                        <div className="pdf-crop-queue-thumbs">
                          {(item.fullImage && (
                            <img src={item.fullImage} alt="" className="pdf-crop-thumb" />
                          )) ||
                            (item.regions.stem && (
                              <img src={item.regions.stem} alt="" className="pdf-crop-thumb" />
                            )) ||
                            (item.regions.passage_body && (
                              <img
                                src={item.regions.passage_body}
                                alt=""
                                className="pdf-crop-thumb"
                              />
                            )) ||
                            (item.regions.column_I && (
                              <img src={item.regions.column_I} alt="" className="pdf-crop-thumb" />
                            ))}
                        </div>
                        <div className="pdf-crop-queue-body">
                          <label>
                            Label
                            <input
                              value={item.label}
                              disabled={item.saved}
                              onChange={(e) => updateQueueItem(item.id, { label: e.target.value })}
                            />
                          </label>
                          <p className="form-hint">
                            {PDF_CROP_TYPE_OPTIONS.find((o) => o.id === item.questionType)?.label ??
                              item.questionType}
                            {' · '}
                            {item.mode === 'full'
                              ? 'Full crop'
                              : `${countAssignedRegions(item.regions)} region(s)`}
                            {Object.values(item.ocrMeta ?? {}).some((o) => o?.useText === true)
                              ? ' · text mode'
                              : ''}
                          </p>

                          {renderOcrCards(item, setOcrChoice)}

                          {(item.questionType === 'single_correct' ||
                            item.questionType === 'passage_scq' ||
                            item.questionType === 'matrix_match') && (
                            <div className="pdf-crop-correct-row">
                              <span className="form-hint">Correct:</span>
                              {[0, 1, 2, 3].map((i) => (
                                <label key={i} className="pdf-crop-opt-pick">
                                  <input
                                    type="radio"
                                    name={`correct-${item.id}`}
                                    checked={item.correctIndex === i}
                                    disabled={item.saved}
                                    onChange={() => updateQueueItem(item.id, { correctIndex: i })}
                                  />
                                  {String.fromCharCode(65 + i)}
                                </label>
                              ))}
                            </div>
                          )}

                          {item.questionType === 'multiple_correct' && (
                            <div className="pdf-crop-correct-row">
                              <span className="form-hint">Correct (pick any):</span>
                              {[0, 1, 2, 3].map((i) => (
                                <label key={i} className="pdf-crop-opt-pick">
                                  <input
                                    type="checkbox"
                                    checked={item.correctIndices.includes(i)}
                                    disabled={item.saved}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...new Set([...item.correctIndices, i])]
                                        : item.correctIndices.filter((x) => x !== i)
                                      updateQueueItem(item.id, { correctIndices: next })
                                    }}
                                  />
                                  {String.fromCharCode(65 + i)}
                                </label>
                              ))}
                            </div>
                          )}

                          {item.questionType === 'integer' && (
                            <label className="pdf-crop-label-field">
                              Correct integer
                              <input
                                type="number"
                                min={0}
                                max={9999}
                                disabled={item.saved}
                                value={item.subQuestions[0]?.correctInteger ?? ''}
                                onChange={(e) => {
                                  const subs = [...item.subQuestions]
                                  subs[0] = { ...subs[0], correctInteger: e.target.value }
                                  updateQueueItem(item.id, { subQuestions: subs })
                                }}
                              />
                            </label>
                          )}

                          {item.questionType === 'numerical' && (
                            <label className="pdf-crop-label-field">
                              Correct numerical
                              <input
                                type="text"
                                disabled={item.saved}
                                value={item.subQuestions[0]?.correctNumerical ?? ''}
                                onChange={(e) => {
                                  const subs = [...item.subQuestions]
                                  subs[0] = { ...subs[0], correctNumerical: e.target.value }
                                  updateQueueItem(item.id, { subQuestions: subs })
                                }}
                              />
                            </label>
                          )}

                          <div className="pdf-crop-queue-actions">
                            {item.saved ? (
                              <span className="pdf-crop-saved-badge">In bank (draft)</span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={item.saving}
                                onClick={() => saveBundle(item.id)}
                              >
                                {item.saving ? 'Saving…' : 'Save to bank'}
                              </button>
                            )}
                            {!item.saved && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => removeFromQueue(item.id)}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
