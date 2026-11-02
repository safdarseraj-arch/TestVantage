import { useEffect, useMemo, useRef, useState } from 'react'
import { markHybridQuestionPattern } from '../utils/hybridAiClient.js'
import { createPortal } from 'react-dom'
import MathText from './MathText'
import { QuestionStem } from './QuestionMedia'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import QuestionMetadataForm from './QuestionMetadataForm'
import { getQuestionType, isPassageMetadataType } from '../data/questionTypes'
import {
  formatExamLabels,
  formatToughnessLabel,
  validateQuestionMetadata,
} from '../utils/questionMetadata'
import { isHybridQuestion } from '../utils/imageQuestion'
import { optionTextForDisplay, shouldStripMistakenOptionCrops } from '../utils/graphOptionOcr.js'
import {
  isValidDiagramStemImage,
  shouldHideStemTextWithImage,
  shouldShowQuestionStemImage,
  stemLikelyNeedsDiagramImage,
} from '../utils/stemDiagramDetect.js'
import { passageSubAnswerMode } from '../utils/passageSubAnswer.js'
import {
  detectBrokenBankStem,
  finalizeStemForBank,
  stemForLivePreview,
} from '../utils/persistUpload.js'
import {
  getPassageDiagramUrl,
  getPassageSetQuestions,
  getPassageRawText,
  getPassageText,
  isPassageLinkedQuestion,
  passageLikelyNeedsSharedDiagram,
  passageSubQuestionDisplayText,
  shouldShowPassageImageInViewer,
  shouldShowPassageTextBesideImage,
} from '../utils/passage.js'
import MatrixMatchInput from './MatrixMatchInput'
import SavedQuestionContentEditor from './SavedQuestionContentEditor'
import { formatMatrixCorrectAnswer, getMatrixResponseMode } from '../utils/matrixMatch.js'
import QuestionUpdateHistory from './QuestionUpdateHistory'
import { bankStatusLabel, effectiveBankStatus } from '../utils/questionUploadFilter.js'
import { bankListActionTargetId } from '../utils/passageBankList.js'
import { blockersBesidesDuplicate, getQuestionPublishBlockersForAction } from '../utils/questionBankReview.js'
import {
  findOriginalForDuplicate,
  findDuplicateReviewCopies,
  isDuplicateReviewItem,
} from '../utils/detectDuplicateQuestion.js'
import {
  canOfferSavedImageOcr,
  convertSavedImageToOcr,
} from '../utils/convertSavedImageToOcr.js'
import { friendlyUploadError } from '../utils/uploadFriendlyErrors.js'
import ReportQuestionButton from './ReportQuestionModal.jsx'
import DraftFieldConfidence from './DraftFieldConfidence.jsx'

/** @param {import('../data/tests').Question} q */
function formatAnswerLabel(q) {
  const t = q.questionType ?? 'single_correct'
  if (t === 'multiple_correct') {
    const idx = q.correctIndices ?? []
    return idx.length ? idx.map((i) => String.fromCharCode(65 + i)).join(', ') : '—'
  }
  if (t === 'single_correct') {
    return String.fromCharCode(65 + (q.correctIndex ?? 0))
  }
  if (t === 'integer') return q.correctInteger != null ? String(q.correctInteger) : '—'
  if (t === 'numerical') return q.correctNumerical != null ? String(q.correctNumerical) : '—'
  if (t === 'matrix_match') return formatMatrixCorrectAnswer(q)
  if (t === 'passage_integer') {
    return passageSubAnswerMode(q) === 'numerical'
      ? q.correctNumerical != null
        ? String(q.correctNumerical)
        : '—'
      : q.correctInteger != null
        ? String(q.correctInteger)
        : '—'
  }
  if (t === 'passage' || t === 'passage_scq') {
    if (q.correctIndex != null) return String.fromCharCode(65 + q.correctIndex)
    return 'Passage — edit in form'
  }
  return '—'
}

/**
 * @param {{
 *   question: import('../data/tests').Question
 *   onClose: () => void
 *   onSave: (updates: Partial<import('../data/tests').Question>) => boolean | void
 *   onEditFull: () => void
 *   onDelete: () => void
 *   allQuestions?: import('../data/tests').Question[]
 *   initialEditMeta?: boolean
 *   initialEditContent?: boolean
 *   canPublish?: boolean
 *   onPublish?: (id: string) => boolean | void
 *   onPublishSilent?: (id: string) => boolean | void
 *   onUnpublish?: (id: string) => boolean | void
 *   onPatchQuestion?: (updates: Partial<import('../data/tests').Question>) => boolean
 *   onViewRelated?: (id: string) => void
 * }} props
 */
export default function SavedQuestionViewer({
  question,
  allQuestions = [],
  onClose,
  onSave,
  onEditFull,
  onDelete,
  initialEditMeta = false,
  initialEditContent = false,
  canPublish = false,
  onPublish,
  onPublishSilent,
  onUnpublish,
  onPatchQuestion,
  onViewRelated,
}) {
  const q = question
  const bank = allQuestions.length ? allQuestions : [q]
  const passageRaw = getPassageRawText(q, bank)
  const passage = getPassageText(q, bank)
  const passageSet = isPassageLinkedQuestion(q) ? getPassageSetQuestions(q, bank) : null
  const passageParent = q.passageText
    ? q
    : q.passageId
      ? bank.find((x) => x.id === q.passageId)
      : null
  const passageDiagramUrl = getPassageDiagramUrl(q, bank)
  const showPassageImage =
    !!passageDiagramUrl &&
    !!passageParent &&
    shouldShowPassageImageInViewer(passageParent, passage)
  const showPassageText =
    !!passageParent && shouldShowPassageTextBesideImage(passageParent, passageRaw ?? passage)
  const passageImageIsFullPage =
    !!passageDiagramUrl && passageParent && !passageParent.passageImageCrop
  const displayQuestionText = passageSubQuestionDisplayText(q.text ?? '', passageRaw ?? '')
// eslint-disable-next-line react-hooks/exhaustive-deps
  const options = q.options ?? []
  const foldedLists = matchOptionsFoldedIntoLists(q.text, options)
  const stemForViewer = useMemo(() => {
    const base = isPassageLinkedQuestion(q) ? displayQuestionText : q.text ?? ''
    return stemForLivePreview(base, options)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id, q.text, displayQuestionText, options, isPassageLinkedQuestion(q)])
  const qType = q.questionType ?? 'single_correct'
  const passageMetaType = passageParent?.questionType

  const [editingMeta, setEditingMeta] = useState(initialEditMeta)
  const [editingContent, setEditingContent] = useState(initialEditContent)
  const [metaError, setMetaError] = useState('')
  const [metaSaving, setMetaSaving] = useState(false)
  const metaEditorRef = useRef(null)
  const [typeLabelVersion, setTypeLabelVersion] = useState(0)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrError, setOcrError] = useState('')
  const [ocrPendingUpdates, setOcrPendingUpdates] = useState(null)
  const ocrAbortRef = useRef(/** @type {AbortController | null} */ (null))
  const [publishNote, setPublishNote] = useState(/** @type {{ type: string, text: string }} */ ({ type: '', text: '' }))
  const showImageOcr = canOfferSavedImageOcr(q)

  const publishBlockers = useMemo(
    () => getQuestionPublishBlockersForAction(q, bank),
    [q, bank],
  )
  const hardPublishBlockers = blockersBesidesDuplicate(publishBlockers)
  const publishActionId = bankListActionTargetId(q)
  const duplicateOriginal = findOriginalForDuplicate(q, bank)
  const duplicateCopies = findDuplicateReviewCopies(q, bank)

// eslint-disable-next-line react-hooks/exhaustive-deps
  const typeName = useMemo(() => getQuestionType(qType).name, [qType, typeLabelVersion])
  const passageBadgeLabel = useMemo(
    () =>
      passageMetaType && isPassageMetadataType(passageMetaType)
        ? getQuestionType(passageMetaType).shortName
        : 'Passage',
// eslint-disable-next-line react-hooks/exhaustive-deps
    [passageMetaType, typeLabelVersion],
  )
  const [mSubject, setMSubject] = useState(q.subject ?? '')
  const [mSection, setMSection] = useState(q.section ?? '')
  const [mChapter, setMChapter] = useState(q.chapter ?? '')
  const [mTopic, setMTopic] = useState(q.topic ?? '')
  const [mType, setMType] = useState(qType)
  const [mExamIds, setMExamIds] = useState([...(q.examIds ?? [])])
  const [mTough, setMTough] = useState(
    q.toughnessLevel != null && q.toughnessLevel !== '' ? String(q.toughnessLevel) : '',
  )
  const [mSource, setMSource] = useState(q.source ?? '')

  useEffect(() => {
    setEditingMeta(initialEditMeta)
    setEditingContent(initialEditContent)
    setMetaError('')
    setMetaSaving(false)
    setMSubject(q.subject ?? '')
    setMSection(q.section ?? '')
    setMChapter(q.chapter ?? '')
    setMTopic(q.topic ?? '')
    setMType(q.questionType ?? 'single_correct')
    setMExamIds([...(q.examIds ?? [])])
    setMTough(q.toughnessLevel != null && q.toughnessLevel !== '' ? String(q.toughnessLevel) : '')
    setMSource(q.source ?? '')
  }, [
    q.id,
    initialEditMeta,
    initialEditContent,
    q.subject,
    q.section,
    q.chapter,
    q.topic,
    q.questionType,
    q.examIds,
    q.toughnessLevel,
    q.source,
  ])

  useEffect(() => {
    setOcrError('')
    setOcrProgress(0)
    setOcrBusy(false)
    setOcrPendingUpdates(null)
    ocrAbortRef.current?.abort()
    ocrAbortRef.current = null
  }, [q.id])

  const handleSaveMeta = () => {
    const errors = validateQuestionMetadata({
      subject: mSubject,
      questionType: mType,
      examIds: mExamIds,
    })
    if (errors.length) {
      setMetaError(errors.join(' '))
      metaEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
    setMetaError('')
    setMetaSaving(true)
    try {
      const ok = onSave({
        subject: mSubject,
        section: mSection.trim() || undefined,
        chapter: mChapter.trim() || undefined,
        topic: mTopic.trim() || undefined,
        questionType: mType,
        examIds: [...mExamIds],
        toughnessLevel: mTough !== '' && mTough != null ? Number(mTough) : undefined,
        source: mSource.trim() || undefined,
      })
      if (ok === false) {
        setMetaError('Could not save metatags. See the message at the top of the page, or try again.')
        metaEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        return
      }
      setEditingMeta(false)
    } catch (err) {
      setMetaError(err?.message ?? 'Save failed — browser storage may be full.')
      metaEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } finally {
      setMetaSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  useEffect(() => {
    setPublishNote({ type: '', text: '' })
  }, [q.id, q.bankStatus, q.updatedAt])

  const handlePublishClick = () => {
    if (hardPublishBlockers.length) {
      setPublishNote({
        type: 'error',
        text: `Cannot publish yet — ${hardPublishBlockers.join(' ')}`,
      })
      return
    }
    if (!onPublish) return
    const ok = onPublish(publishActionId)
    if (ok === 'compare') {
      setPublishNote({
        type: 'info',
        text: 'Compare the original and this copy, then choose Keep original only or Keep both.',
      })
      return
    }
    if (ok === false) {
      setPublishNote({
        type: 'error',
        text: 'Could not publish this question. Close review, refresh the page, and try again.',
      })
      return
    }
    setPublishNote({
      type: 'success',
      text: 'Published — now available in papers and practice.',
    })
  }

  const handlePublishSilentClick = () => {
    if (hardPublishBlockers.length) {
      setPublishNote({
        type: 'error',
        text: `Cannot publish yet — ${hardPublishBlockers.join(' ')}`,
      })
      return
    }
    if (!onPublishSilent) return
    const ok = onPublishSilent(publishActionId)
    if (ok === 'compare') {
      setPublishNote({
        type: 'info',
        text: 'Compare the original and this copy, then choose Keep original only or Keep both.',
      })
      return
    }
    if (ok === false) {
      setPublishNote({
        type: 'error',
        text: 'Could not publish silently. Close review, refresh, and try again.',
      })
      return
    }
    setPublishNote({
      type: 'success',
      text: 'Published silently — in the main bank for papers; no student announcement.',
    })
  }

  const handleUnpublishClick = () => {
    if (!onUnpublish) return
    const ok = onUnpublish(publishActionId)
    if (ok === false) {
      setPublishNote({
        type: 'error',
        text: 'Could not move to draft. Close review, refresh the page, and try again.',
      })
      return
    }
    setPublishNote({
      type: 'success',
      text: 'Moved back to draft for further review.',
    })
  }

  const autoHealDoneRef = useRef(false)
  useEffect(() => {
    autoHealDoneRef.current = false
  }, [q.id])

  useEffect(() => {
    const raw = (q.text ?? '').trim()
    if (!raw || editingContent || editingMeta || autoHealDoneRef.current) return
    if (detectBrokenBankStem(raw).length === 0) return
    const repaired = finalizeStemForBank(raw, options)
    if (repaired === raw || detectBrokenBankStem(repaired).length > 0) return
    autoHealDoneRef.current = true
    onSave({ text: repaired })
  }, [q.id, editingContent, editingMeta, options, onSave, q.text])

  const previewContext = useMemo(
    () => [q.text, ...(options ?? [])].filter(Boolean).join('\n'),
    [q.text, options],
  )

  const handleEditQuestionAnswer = () => {
    setEditingMeta(false)
    setEditingContent(true)
    setMetaError('')
  }

  const handleSaveContent = (updates) => {
    try {
      const ok = onSave(updates)
      if (ok === false) return
      setEditingContent(false)
    } catch (err) {
      setMetaError(err?.message ?? 'Save failed.')
      setEditingContent(true)
    }
  }

  const handleConvertImageToOcr = async () => {
    if (!onPatchQuestion || ocrBusy) return
    ocrAbortRef.current?.abort()
    const ac = new AbortController()
    ocrAbortRef.current = ac
    setOcrBusy(true)
    setOcrProgress(0)
    setOcrError('')
    setOcrPendingUpdates(null)
    try {
      const updates = await convertSavedImageToOcr(q, setOcrProgress, { signal: ac.signal })
      setOcrPendingUpdates(updates)
      setOcrProgress(100)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setOcrError('Conversion cancelled.')
      } else {
        const friendly = friendlyUploadError(err)
        setOcrError(friendly || 'Image conversion failed. Try a clearer crop, or type the question manually.')
      }
    } finally {
      setOcrBusy(false)
      ocrAbortRef.current = null
    }
  }

  const handleCancelOcr = () => {
    ocrAbortRef.current?.abort()
    setOcrBusy(false)
    setOcrProgress(0)
  }

  const handleSaveOcrText = () => {
    if (!ocrPendingUpdates || !onPatchQuestion) return
    const ok = onPatchQuestion(ocrPendingUpdates)
    if (!ok) {
      setOcrError('Could not save OCR text to the bank.')
      return
    }
    setOcrPendingUpdates(null)
  }

  const handleKeepImage = () => {
    setOcrPendingUpdates(null)
    setOcrError('')
    setOcrProgress(0)
  }

  useEffect(() => {
    return () => ocrAbortRef.current?.abort()
  }, [])

  const modal = (
    <div
      className="saved-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-viewer-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="saved-viewer-panel card">
        <div className="saved-viewer-header">
          <h3 id="saved-viewer-title">Saved question</h3>
          <div className="saved-viewer-header-actions">
            <ReportQuestionButton questionId={q.id} source="bank" compact />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="saved-viewer-meta">
          {q.id && <span className="saved-question-id">{q.id}</span>}
          <span className="saved-subject">{q.subject}</span>
          {q.section && <span className="saved-section">{q.section}</span>}
          {q.chapter && <span className="saved-chapter">{q.chapter}</span>}
          {q.topic && <span className="saved-topic">{q.topic}</span>}
          <span className="saved-type">{typeName}</span>
          {q.examIds?.length > 0 && (
            <span className="saved-exams">{formatExamLabels(q.examIds)}</span>
          )}
          {q.toughnessLevel != null && q.toughnessLevel >= 1 && (
            <span className="saved-toughness">{formatToughnessLabel(q.toughnessLevel)}</span>
          )}
          {q.source && <span className="saved-source">{q.source}</span>}
          {isHybridQuestion(q) && <span className="saved-hybrid-badge">Hybrid</span>}
          {(q.passageText || q.passageId) && (
            <span className="saved-passage-badge">{passageBadgeLabel}</span>
          )}
        </div>
        <DraftFieldConfidence
          question={q}
          variant="breakdown"
          alwaysShow={effectiveBankStatus(q) === 'draft'}
          showUnknown={effectiveBankStatus(q) === 'draft'}
        />

        <details className="saved-viewer-edit-details" open={editingMeta || editingContent}>
          <summary className="saved-viewer-edit-summary">Edit tags or question text</summary>
          <div className="saved-viewer-edit-choices">
            <button
              type="button"
              className={`btn btn-sm ${editingMeta ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setEditingContent(false)
                setEditingMeta(true)
              }}
              aria-expanded={editingMeta}
            >
              1. Edit metatags
            </button>
            <button
              type="button"
              className={`btn btn-sm ${editingContent ? 'btn-primary' : 'btn-ghost'}`}
              onClick={handleEditQuestionAnswer}
            >
              2. Edit question &amp; answer
            </button>
          </div>
          <p className="form-hint saved-edit-choices-hint">
            <strong>Metatags</strong> — subject, unit, chapter, topic, type, exam, toughness.
            <strong> Question &amp; answer</strong> — stem, options A–D, answer (LaTeX + preview).
          </p>
        </details>

        {editingContent && (
          <SavedQuestionContentEditor
            question={q}
            allQuestions={bank}
            onSave={handleSaveContent}
            onCancel={() => setEditingContent(false)}
            onOpenFullEditor={() => {
              setEditingContent(false)
              onClose()
              onEditFull()
            }}
          />
        )}

        {editingMeta && (
          <div className="saved-viewer-block saved-meta-editor" ref={metaEditorRef}>
            <h4>1. Edit metatags</h4>
            <p className="form-hint" data-testid="bank-edit-gemini-metatags-hint">
              After publish, Gemini tags can be wrong. Change Type here, then{' '}
              <strong>Save metatags</strong>. Passage number questions are <strong>NVQ</strong> (type
              a number), not <strong>SCQ</strong> (A–D). If Gemini chose SCQ or PSCQ, set Type to
              NVQ, or <strong>PIVQ</strong> when several parts share one passage.
            </p>
            <QuestionMetadataForm
              subject={mSubject}
              onSubjectChange={setMSubject}
              section={mSection}
              onSectionChange={setMSection}
              chapter={mChapter}
              onChapterChange={setMChapter}
              topic={mTopic}
              onTopicChange={setMTopic}
              questionType={mType}
              onQuestionTypeChange={setMType}
              examIds={mExamIds}
              onExamIdsChange={setMExamIds}
              toughnessLevel={mTough}
              onToughnessLevelChange={setMTough}
              source={mSource}
              onSourceChange={setMSource}
              bankQuestions={bank}
              onTypeRenamed={() => setTypeLabelVersion((n) => n + 1)}
            />
            {metaError && <p className="form-error">{metaError}</p>}
            <div className="saved-meta-editor-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveMeta}
                disabled={metaSaving}
              >
                {metaSaving ? 'Saving…' : 'Save metatags'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditingMeta(false)
                  setMetaError('')
                }}
              >
                Cancel
              </button>
            </div>
            {mType !== qType && (
              <p className="form-hint">
                Changing the question type may require re-entering the correct answer below after
                saving.
              </p>
            )}
          </div>
        )}

        {editingMeta && (
          <p className="form-hint saved-meta-preview-hint">
            Question preview is hidden while editing metatags. Save or Cancel to see the full
            question again.
          </p>
        )}

        {!editingContent && !editingMeta && passage?.trim() && (
          <div className="saved-viewer-block passage-block">
            <h4>Passage</h4>
            <div className="passage-text saved-viewer-math">
              {showPassageImage && passageDiagramUrl && (
                <img
                  src={passageDiagramUrl}
                  alt="Passage diagram"
                  className="saved-viewer-img saved-viewer-stem-diagram passage-diagram-img"
                />
              )}
              {showPassageText && passage?.trim() && <MathText text={passage} />}
            </div>
            {passageImageIsFullPage && passageLikelyNeedsSharedDiagram(passage) && (
              <p className="form-hint saved-passage-missing">
                Passage image is the full upload (text is duplicated in the picture). Open{' '}
                <strong>Edit passage set</strong> → re-attach or wait for auto-crop, then{' '}
                <strong>Save all</strong>. Trimmed passage text is shown above when available.
              </p>
            )}
            {passageLikelyNeedsSharedDiagram(passage) && !passageDiagramUrl && (
              <p className="form-hint saved-passage-missing">
                This passage refers to a plot or figure but no image is stored. Open{' '}
                <strong>Edit passage set</strong> on question 1 → <strong>Attach passage diagram</strong>{' '}
                (use the graph from your upload), then <strong>Save all</strong>.
              </p>
            )}
            {q.passageId && (
              <p className="form-hint">
                Sub-question linked to the passage stored on the first question in this set.
              </p>
            )}
          </div>
        )}

        {!editingMeta && (q.passageId || q.passageText) && !passage?.trim() && (
          <div className="saved-viewer-block saved-passage-missing">
            <p className="form-hint">
              Passage text is not stored on this question. Find the first question in the set
              (same upload) and use <strong>Edit question &amp; answer</strong> to add passage text, or
              re-upload
              and use <strong>Save all</strong> from the passage panel.
            </p>
          </div>
        )}

        {!editingContent && !editingMeta && (
        <div className="saved-viewer-block">
          <h4>Question</h4>
          {!isPassageLinkedQuestion(q) && stemLikelyNeedsDiagramImage(q.text ?? '') && (
            <>
              {!q.questionImage?.trim() && (
                <p className="form-hint saved-missing-diagram-hint">
                  This question refers to a figure (&quot;as shown&quot;, graph, circuit, etc.) but no
                  diagram is stored. Use <strong>Edit question &amp; answer</strong>, re-upload the
                  question image
                  (diagram auto-crops on save), or attach under <strong>Question diagram</strong>, then
                  save.
                </p>
              )}
              {q.questionImage?.trim() && !isValidDiagramStemImage(q) && (
                <p className="form-hint saved-missing-diagram-hint">
                  Diagram is stored as a full-page screenshot. Use <strong>Edit question &amp; answer</strong>{' '}
                  → <strong>Crop graph / diagram</strong> for a cleaner graph-only image, then save.
                </p>
              )}
            </>
          )}
          {(stemForViewer?.trim() ||
            (q.questionImage && !isPassageLinkedQuestion(q) && shouldShowQuestionStemImage(q))) && (
            <QuestionStem
              className="saved-viewer-math question-text"
              text={stemForViewer}
              options={q.options}
              parseMatchLists={qType !== 'matrix_match'}
              questionImage={
                shouldShowQuestionStemImage(q) ? q.questionImage : undefined
              }
              hideTextWithImage={shouldHideStemTextWithImage(q)}
              layout="split"
              imageFirst
            />
          )}
          {isPassageLinkedQuestion(q) && (q.text ?? '').trim() && !stemForViewer?.trim() && (
            <p className="form-hint">This sub-question is already stated in the passage above.</p>
          )}
        </div>
        )}

        {!editingContent && !editingMeta && qType === 'matrix_match' && (q.matrixRows?.length || q.matrixCols?.length) && (
          <div className="saved-viewer-block">
            <h4>Matrix match (Column I × Column II)</h4>
            <p className="form-hint">
              Response mode:{' '}
              <strong>
                {getMatrixResponseMode(q) === 'options' ? 'Options A–D' : 'Checkbox grid'}
              </strong>
            </p>
            <MatrixMatchInput
              question={q}
              answer={
                getMatrixResponseMode(q) === 'options'
                  ? q.correctIndex ?? 0
                  : q.matrixAnswerKey ?? {}
              }
              onChange={() => {}}
              disabled
            />
          </div>
        )}

        {!editingContent && !editingMeta && !foldedLists && (qType === 'single_correct' || qType === 'multiple_correct') && (
          <div className="saved-viewer-block">
            <h4>Options</h4>
            {q.optionsImage && !isPassageLinkedQuestion(q) && (
              <img src={q.optionsImage} alt="Options A–D" className="saved-viewer-img" />
            )}
            <ul className="saved-viewer-options">
              {options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i)
                const hasGraph =
                  !!q.optionImages?.[i] &&
                  !shouldStripMistakenOptionCrops(q.text ?? '', options, q.optionImages ?? [])
                const displayOpt = optionTextForDisplay(opt, hasGraph, q.text ?? '')
                const hasAnswerText = !!(displayOpt || hasGraph)
                const isCorrect =
                  hasAnswerText &&
                  (qType === 'multiple_correct'
                    ? (q.correctIndices ?? []).includes(i)
                    : q.correctIndex != null && q.correctIndex === i)
                return (
                  <li
                    key={i}
                    className={`${isCorrect ? 'saved-opt-correct' : ''}${!hasAnswerText ? ' saved-opt-empty' : ''}`.trim()}
                  >
                    <span className="saved-opt-letter">{letter}</span>
                    {hasGraph ? (
                      <img
                        src={q.optionImages[i]}
                        alt={`Option ${letter}`}
                        className="saved-viewer-img saved-viewer-opt-img"
                      />
                    ) : null}
                    {displayOpt ? (
                      <MathText
                        text={displayOpt}
                        questionContext={previewContext}
                        optionLetter={letter}
                      />
                    ) : (
                      !hasGraph && (
                        <span className="form-hint saved-opt-missing" title="Option text missing — re-extract or edit">
                          (no text)
                        </span>
                      )
                    )}
                    {isCorrect && <span className="saved-opt-badge">Correct</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!editingContent && !editingMeta && (q.solution || q.solutionImage || q.videoSolution) && (
          <div className="saved-viewer-block">
            <h4>Solution</h4>
            {q.solutionImage && (
              <img src={q.solutionImage} alt="Solution" className="saved-viewer-img" />
            )}
            {q.solution?.trim() && (
              <div className="saved-viewer-math">
                <MathText text={q.solution} />
              </div>
            )}
            {q.videoSolution && (
              <p className="form-hint">
                Video:{' '}
                <a href={q.videoSolution} target="_blank" rel="noreferrer">
                  {q.videoSolution}
                </a>
              </p>
            )}
          </div>
        )}

        {!editingContent && !editingMeta && (
        <div className="saved-viewer-block saved-viewer-answer">
          <h4>Correct answer</h4>
          <p className="form-hint">
            <strong>{formatAnswerLabel(q)}</strong>
            {qType === 'multiple_correct' && q.msqMarking && <> · MSQ marking configured</>}
          </p>
          <p className="form-hint">
            To change the stem, options, or correct answer, use{' '}
            <button type="button" className="btn-link" onClick={handleEditQuestionAnswer}>
              Edit question &amp; answer
            </button>
            .
          </p>
          {passageSet && passageSet.length > 1 && (
            <p className="form-hint">
              Passage set ({passageSet.length} questions) — opens the full upload editor for passage
              text, all sub-questions, options, and answers.
            </p>
          )}
        </div>
        )}

        {!editingContent && !editingMeta && showImageOcr && (
          <div className="saved-viewer-block bank-saved-ocr-block">
            <h4>Convert image → OCR text</h4>
            <p className="form-hint">
              Same as the Upload tab: reads the stored image in your browser and fills question text
              and options. The first run may take a few minutes while the LaTeX model loads.
            </p>
            {ocrError && <p className="form-error">{ocrError}</p>}
            {ocrBusy && (
              <div className="bank-saved-ocr-progress" role="status">
                <div className="bank-saved-ocr-progress-bar">
                  <div
                    className="bank-saved-ocr-progress-fill"
                    style={{ width: `${Math.min(100, ocrProgress)}%` }}
                  />
                </div>
                <span className="form-hint">Converting… {ocrProgress}%</span>
              </div>
            )}
            {ocrPendingUpdates && (
              <div className="bank-saved-ocr-choice">
                <h5>OCR result ready</h5>
                <p className="form-hint">
                  Review the extracted text. Save as OCR text will update this bank question;
                  keep image leaves the saved question unchanged.
                </p>
                {ocrPendingUpdates.text?.trim() && (
                  <div className="bank-saved-ocr-preview">
                    <strong>Question text</strong>
                    <div className="saved-viewer-math">
                      <MathText text={ocrPendingUpdates.text} />
                    </div>
                  </div>
                )}
                {Array.isArray(ocrPendingUpdates.options) &&
                  ocrPendingUpdates.options.some((opt) => opt?.trim()) && (
                    <div className="bank-saved-ocr-preview">
                      <strong>Options</strong>
                      <ul className="saved-viewer-options">
                        {ocrPendingUpdates.options.slice(0, 4).map((opt, i) => (
                          <li key={i}>
                            <span className="saved-opt-letter">{String.fromCharCode(65 + i)}</span>
                            {opt?.trim() ? (
                              <MathText
                                text={opt}
                                questionContext={[
                                  ocrPendingUpdates.text,
                                  ...(ocrPendingUpdates.options ?? []),
                                ]
                                  .filter(Boolean)
                                  .join('\n')}
                                optionLetter={String.fromCharCode(65 + i)}
                              />
                            ) : (
                              <span className="form-hint">(no text)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                <div className="bank-saved-ocr-actions">
                  <button type="button" className="btn btn-primary" onClick={handleSaveOcrText}>
                    Save as OCR text
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleKeepImage}>
                    Keep image
                  </button>
                </div>
              </div>
            )}
            <div className="bank-saved-ocr-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={ocrBusy || !onPatchQuestion}
                onClick={handleConvertImageToOcr}
              >
                {ocrBusy
                  ? 'Converting…'
                  : ocrPendingUpdates
                    ? 'Run OCR again'
                    : 'Convert image → OCR text'}
              </button>
              {ocrBusy && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleCancelOcr}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {!editingContent && !editingMeta && (isDuplicateReviewItem(q) || duplicateCopies.length > 0) && (
          <div className="saved-viewer-block duplicate-compare-panel">
            <h4>
              {isDuplicateReviewItem(q)
                ? 'Possible duplicate — compare with original'
                : 'Other copies to compare'}
            </h4>
            {duplicateOriginal ? (
              <div className="duplicate-compare-grid">
                <div className="duplicate-compare-col">
                  <h5>This copy</h5>
                  <p className="duplicate-compare-stem">
                    <MathText text={q.text ?? ''} questionContext={q.text} />
                  </p>
                </div>
                <div className="duplicate-compare-col">
                  <h5>Original</h5>
                  <p className="duplicate-compare-stem">
                    <MathText
                      text={duplicateOriginal.text ?? ''}
                      questionContext={duplicateOriginal.text}
                    />
                  </p>
                  {onViewRelated && duplicateOriginal.id ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onViewRelated(duplicateOriginal.id)}
                    >
                      Open original
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {duplicateCopies.length > 0 ? (
              <div className="duplicate-compare-copies">
                <p className="form-hint">
                  {duplicateCopies.length === 1
                    ? '1 other copy is waiting so you can compare.'
                    : `${duplicateCopies.length} other copies are waiting so you can compare.`}
                </p>
                {onViewRelated
                  ? duplicateCopies.map((copy) => (
                      <button
                        key={copy.id}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onViewRelated(copy.id)}
                      >
                        Open copy {copy.id}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
            {isDuplicateReviewItem(q) && onPatchQuestion ? (
              <div className="duplicate-compare-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    onPatchQuestion({
                      duplicateOfId: '',
                      duplicateMatch: '',
                      duplicateSimilarity: 0,
                    })
                    setPublishNote({
                      type: 'success',
                      text: 'Marked as a different question. You can publish after other checks pass.',
                    })
                  }}
                >
                  Keep both — this is a different question
                </button>
              </div>
            ) : null}
          </div>
        )}

        {!editingContent && !editingMeta && (
          <div className="saved-viewer-block bank-review-status-block">
            <h4>Review status</h4>
            {publishNote.text && (
              <p
                className={`saved-viewer-toast ${
                  publishNote.type === 'success' ? 'saved-viewer-toast-ok' : 'saved-viewer-toast-error'
                }`}
                role={publishNote.type === 'error' ? 'alert' : 'status'}
              >
                {publishNote.text}
              </p>
            )}
            <p className="form-hint bank-review-status-hint">
              <span className={`saved-bank-status saved-bank-status-${effectiveBankStatus(q)}`}>
                {bankStatusLabel(q)}
              </span>
              {effectiveBankStatus(q) === 'published' && q.publishedByName && (
                <> · Published by {q.publishedByName}</>
              )}
              {effectiveBankStatus(q) === 'draft'
                ? ' — not yet in papers. Publish when review is complete.'
                : ' — live in papers. Move to draft if more changes are needed.'}
            </p>
            {publishBlockers.length > 0 && effectiveBankStatus(q) === 'draft' && (
              <ul className="bank-review-blocker-list">
                {publishBlockers.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
            {canPublish && (
              <div className="bank-review-status-actions">
                {effectiveBankStatus(q) === 'draft' && onPublish && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={hardPublishBlockers.length > 0}
                    title={
                      hardPublishBlockers.join(' ') ||
                      (publishBlockers.length
                        ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                        : 'Publish after review')
                    }
                    onClick={handlePublishClick}
                  >
                    Publish after review
                  </button>
                )}
                {effectiveBankStatus(q) === 'draft' && onPublishSilent && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={hardPublishBlockers.length > 0}
                    title={
                      hardPublishBlockers.join(' ') ||
                      (publishBlockers.length
                        ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                        : 'Publish silently to main bank')
                    }
                    onClick={handlePublishSilentClick}
                  >
                    Publish (Silently)
                  </button>
                )}
                {effectiveBankStatus(q) === 'published' && onUnpublish && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleUnpublishClick}
                  >
                    Move back to draft
                  </button>
                )}
              </div>
            )}
            {onPatchQuestion && !q.needsAction ? (
              <div className="bank-review-status-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const next = !(q.patternQuestion || q.isPattern)
                    onPatchQuestion({ patternQuestion: next, isPattern: next })
                    const id = String(q.id ?? '').trim()
                    if (id) {
                      markHybridQuestionPattern(id, next).catch(() => {})
                    }
                  }}
                >
                  {q.patternQuestion || q.isPattern ? 'Pattern question' : 'Mark as pattern'}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {!editingContent && !editingMeta && (
          <div className="saved-viewer-block">
            <h4>Modification history</h4>
            <QuestionUpdateHistory history={q.updateHistory} />
          </div>
        )}

        <div className="saved-viewer-actions">
          {!editingContent && !editingMeta && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setEditingMeta(true)}>
                Edit metatags
              </button>
              <button type="button" className="btn btn-primary" onClick={handleEditQuestionAnswer}>
                {passageSet && passageSet.length > 1
                  ? `Edit question & answer (${passageSet.length} in set)`
                  : 'Edit question & answer'}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Delete this question from your bank? Published copies stay in the main bank.')) onDelete()
            }}
          >
            Delete
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal
}


