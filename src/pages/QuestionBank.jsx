import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import MathSymbolBar, { insertIntoField } from '../components/MathSymbolBar'
import ComposeQuestionExtras from '../components/ComposeQuestionExtras'
import ComposeSmartPanel from '../components/ComposeSmartPanel'
import {
  getComposeSoftIssues,
  localImproveStem,
  localSuggestLatex,
  localPolishOptions,
  findComposeSimilarStems,
  formatComposeSimilarWarning,
} from '../utils/composeSmartAssist.js'
import {
  aiAssistBadgeLabel,
  runAiAssistWithFallback,
} from '../utils/aiProviderAssist.js'
import HybridImageSlot from '../components/HybridImageSlot'
import ImageOcrChoicePanel from '../components/ImageOcrChoicePanel'
import ImageSplitCropper from '../components/ImageSplitCropper'
import PdfQuestionCropPanel from '../components/PdfQuestionCropPanel'
import OcrOutputFormatPicker from '../components/OcrOutputFormatPicker'
import SingleImageUploadQueue from '../components/SingleImageUploadQueue'
import PassageSplitPanel from '../components/PassageSplitPanel'
import MatrixMatchForm from '../components/MatrixMatchForm'
import {
  looksLikePassageMultiMcq,
  pickPassageSplitSource,
  resolvePassageUpload } from '../utils/parsePassageUpload'
import { applyMetadataToPassageSet } from '../utils/passageBankList'
import {
  getPassageSetQuestions,
  isPassageLinkedQuestion,
  normalizePassageQuestionStorage,
  trimPassageBodyText,
  passageLikelyNeedsSharedDiagram,
  formatPassageBundleAsText } from '../utils/passage'
import {
  MATRIX_ROW_COUNT,
  getMatrixResponseMode,
  normalizeMatrixAnswerKey,
  normalizeMatrixItemText,
  matrixRowHasContent,
  defaultMatrixColLabels,
  inferMatrixColCount,
  normalizeMatrixColLabels } from '../utils/matrixMatch'
import {
  countFilledMatrixRows,
  countFilledMatrixRowsNormalized,
  looksLikeMatchColumnUpload,
  looksLikeMatrixAlgebraQuestion,
  applyParsedMatrixCols,
  mergeMatrixParse,
  matrixRowsForUi,
  repairIncompleteRowD,
  resolveMatchColumnUpload,
  supplementMatrixRowsFromCachedOcr,
  trimRowColumnIIBleed,
  matrixColsNeedHeal } from '../utils/parseMatchColumnUpload'
import QuestionDiagramPanel from '../components/QuestionDiagramPanel'
import QuestionMetadataForm from '../components/QuestionMetadataForm'
import BankSavedView from '../components/BankSavedView'
import BankReviewWorkspace from '../components/BankReviewWorkspace'
import BankRecentUploads from '../components/BankRecentUploads'
import BankMetaManager from '../components/BankMetaManager'
import GeminiScqTrialPanel from '../components/GeminiScqTrialPanel'
import BankMathpixUploadPanel from '../components/BankMathpixUploadPanel'
import QuestionBankHubNav from '../components/QuestionBankHubNav'
import QuestionBankSubBankNav from '../components/QuestionBankSubBankNav'
import BankReviewApproveStrip from '../components/BankReviewApproveStrip'
import BankHybridFill from '../components/BankHybridFill.jsx'
import {
  countHybridAiDrafts,
  countHybridAiDraftTrays,
  countQuestionsBySubBank,
  filterHybridAiDraftTray,
  filterQuestionsForSubBankTab,
  parseQuestionBankSubBank,
} from '../utils/questionBankSubBank.js'
import {
  HYBRID_AI_SYNC_STATUS_EVENT,
  hybridSyncUserMessage,
  postgresHasNoHybridAiRows,
} from '../utils/hybridAiSync.js'
import ErrorBoundary from '../components/ErrorBoundary'
import { countOpenQuestionReports } from '../utils/questionReports.js'
import { BANK_REVIEW_MODES, reviewDatePresetToRange, reviewDatesAfterUrlParam } from '../utils/bankReviewFilters.js'
import { useDeferredPanelKey } from '../hooks/useBankPanelTiming.js'
import BankStorageNotice from '../components/BankStorageNotice'
import BankSaveModeBar from '../components/BankSaveModeBar.jsx'
import PortalPage from '../components/PortalPage.jsx'
import { getBrowserStorageLabel } from '../utils/bankBrowserLabel.js'
import { effectiveBankStatus } from '../utils/questionUploadFilter.js'
import {
  getBankStorageDiagnostics,
  tryRecoverBankAsync,
} from '../utils/bankStorageRecovery'
import {
  consumeBankCopyResultBanner,
  navigateCopyBankFromLocalhost } from '../utils/bankOriginRedirect'
import { autoImportFromLocalhostIfEmpty, listenForLocalhostBankMerge } from '../utils/bankLocalhostCopy'
import NumericalAnswerInput from '../components/NumericalAnswerInput'
import MathText from '../components/MathText'
import { OptionBody, QuestionStem } from '../components/QuestionMedia'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import SavedQuestionViewer from '../components/SavedQuestionViewer'
import { EXAM_PATTERNS } from '../data/examPatterns'
import {
  getQuestionType,
  isPassageMetadataType,
  isPassageSetIntegerMode,
  resolvePassageSetMetaType,
  QUESTION_TYPES,
  TRUE_FALSE_OPTIONS,
  isTrueFalseQuestionType } from '../data/questionTypes'
import {
  assertPassageSetStorageConsistent,
  buildPassageSubQuestionPayload,
  passageSetMetaTypeFromForm } from '../utils/uploadRegressionContracts'
import { optionsPayloadFromRegions, ocrText, ocrUseText, scopedPassageSubOcrMeta, solutionPayloadFromBundle, stemFlagsForSave, stemImageForSave, stemTextFromBundle } from '../utils/pdfCropBundleSave.js'
import { validateNumericalAnswer } from '../utils/numericalAnswer.js'
import {
  findDuplicateQuestions,
  formatDuplicateAlarmMessage,
  formatDuplicateMatchLabel,
  attachDuplicateReviewFields,
  questionCompareFacts,
  questionPreviewLabel } from '../utils/detectDuplicateQuestion.js'
import { TEST_TYPES } from '../data/testTypes'
import { DEFAULT_MSQ_MARKING, formatMsqMarkingLabel } from '../utils/msqMarking'
import {
  createPreviewUrl,
  extractMcqFromImage,
  extractTextFromFile,
  describeMcqExtractResult,
  polishOcrText,
  polishExtractedText,
  polishCloudVisionText,
  polishParsedMcqOptions,
  formatMcqExtractBlock,
  isImageFile,
  isPdfFile,
  isSupportedUpload,
  isWordFile,
  wordExtractLooksBroken,
  repairWordSymbolFontText } from '../utils/extractDocument'
import { stemLooksHighQualityLatex } from '../utils/stemBankGuard.js'
import { friendlyUploadError } from '../utils/uploadFriendlyErrors.js'
import { generateDeepSolution } from '../utils/deepSolutionGenerator.js'
import {
  autofillSolutionAfterUpload,
  clearAiSuggestedMetaField,
  enrichUploadWithMetaAndAnswer,
  formatAnswerKeyForLearning,
} from '../utils/autoFillUploadAssist.js'
import {
  fingerprintImageInput,
  getLocalAiLearningStats,
  loadLocalAiLearningSettings,
  recordLocalAiLearningExample,
  saveLocalAiLearningSettings,
} from '../utils/localAiLearningStore.js'
import {
  clearCloudVisionStatusCache,
  fetchCloudVisionStatus,
  ocrEngineBadgeLabel,
  solveWithCloudVisionClient,
} from '../utils/cloudVisionClient.js'
import { isUltraLowConfidenceOcr, scoreLocalOcrWeakness, visionQuestionToMcqParse, shouldPreserveVisionStructuredFill, mergeVisionOptionsPreferPreserve } from '../utils/cloudVisionParse.js'
import { normalizeMathText, normalizeQuestionStemText } from '../utils/normalizeMathText'
import {
  finalizeStemForBank,
  persistPassageBundleFields,
  persistQuestionForBank,
  stemForLivePreview,
  stemNeedsSourceRepair,
  stemSaveBlockers } from '../utils/persistUpload'
import {
  readinessSaveBlockMessage,
  validateQuestionReadiness } from '../utils/questionReadiness.js'
import { fillMissingVectorMsqOptions } from '../utils/polishMcqExtract'
import { parseBulkQuestions } from '../utils/parseBulkQuestions'
import { applyUploadQualityGuards } from '../utils/uploadQualityGuards'
import { parseSingleQuestionUpload } from '../utils/parseSingleQuestionUpload'
import { resolveMcqFieldsFromExtracted, resolveStemInputForSave } from '../utils/resolveStemInput.js'
import { processMcqUploadExtract, tryRecoverSingleUploadParse, planUploadImageActions, resolveMcqFromOcr, reparseMcqUpload, recoverTextMcqFromFullOcr, runGuardedUploadStep, salvageParseFromOcr, shouldSkipHeavyMcqHeal } from '../utils/uploadPipeline.js'
import {
  formatUploadQualityMessage,
  inferUploadQuestionType,
  labelForUploadType,
  correctUploadTypeForOcr,
  isMcqLikeFromOcr,
  cleanStemMergedOptionGarbage } from '../utils/classifyUploadFromOcr.js'
import { assessUploadQualityFull } from '../utils/uploadErrorBrain.js'
import {
  buildUploadFinishHeadline,
  resolveUploadMessageType,
  uploadNeedsReview } from '../utils/uploadStatus.js'
import AiUploadAssistBanner from '../components/AiUploadAssistBanner.jsx'
import UploadReviewCompare from '../components/UploadReviewCompare.jsx'
import UploadHistoryTimeline from '../components/UploadHistoryTimeline.jsx'
import { recordUploadHistory } from '../utils/uploadHistory.js'
import {
  buildConfidencePersistFields,
  restoreFieldConfidenceState,
  scoreUploadFieldConfidence,
} from '../utils/uploadFieldConfidence.js'
import DraftFieldConfidence, { FieldConfidenceInline } from '../components/DraftFieldConfidence.jsx'
import {
  findNextPendingImage,
  makeImageQueueItem,
  pickQueueableImages,
  resolveImageQueueOcrStatus,
} from '../utils/imageUploadQueue.js'
import BulkPreviewEditForm from '../components/BulkPreviewEditForm.jsx'
import {
  buildAiUploadReport,
  enhanceMatrixParse,
  enhanceMcqFromOcr,
  runAiUploadAssist } from '../utils/aiUploadAssist.js'
import {
  iterativeUploadHeal,
  retryPassageSplitAfterHeal,
  runFullUploadAssist,
  scoreBulkQuestionRow,
  filterBulkImportRows } from '../utils/uploadOrchestrator.js'
import {
  attemptUploadImageFallback,
  adjustQualityAfterImageFallback } from '../utils/uploadImageFallback.js'
import { addBulkUploadedQuestionsChunked } from '../utils/bulkUploadChunks.js'
import { clearCompressImageCache } from '../utils/imageQuestion.js'
import { looksLikeDeterminantMcq } from '../utils/repairDeterminantMcqOcr.js'
import { looksLikeZ5ImaginaryRootsExpDeterminantMcq, repairZ5ImaginaryRootsExpDeterminantMcqParse } from '../utils/repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  looksLikeSurjectiveNotInjectiveMcq,
  repairSurjectiveNotInjectiveMcqParse } from '../utils/repairSurjectiveNotInjectiveMcqOcr.js'
import {
  looksLikeFxPlusOneTimesEightMcq,
  repairFxPlusOneTimesEightMcqParse } from '../utils/repairFxPlusOneTimesEightMcqOcr.js'
import {
  looksLikeFRplusPowFunctionMcq,
  repairFRplusPowFunctionMcqParse } from '../utils/repairFRplusPowFunctionMcqOcr.js'
import { looksLikeLimitGxQuestion, hasGoodLimitGxStem } from '../utils/repairLimitGxStemOcr.js'
import {
  looksLikeDomainGreatestIntegerMcq,
  repairDomainGreatestIntegerMcqParse } from '../utils/repairDomainGreatestIntegerMcqOcr.js'
import {
  looksLikeF0MoebiusFunctionalMcq,
  repairF0MoebiusFunctionalMcqParse } from '../utils/repairF0MoebiusFunctionalMcqOcr.js'
import { repairFxIntegralMaxMinStemOcr } from '../utils/repairFxIntegralMaxMinMcqOcr.js'
import { repairLambdaSinCubicExtremaStemOcr } from '../utils/repairLambdaSinCubicExtremaMcqOcr.js'
import { cancelTesseractOcr, warmTesseractWorker } from '../utils/enhancedTesseract'
import { cancelMathOcr, warmMathOcrPipeline, getMathOcrLoadStatus } from '../utils/onnxMathOcr'
import { extractMatrixRowSupplementOcr } from '../utils/matrixSupplementOcr'
import { isLocalMathOcrEnabled } from '../utils/ocrSettings.js'
import { applyMcqParseRepairs } from '../utils/repairRegistry.js'
import { routeUploadExtract } from '../utils/uploadStructureRouter.js'
import { getOcrProgressLabel } from '../utils/ocrProgressLabel.js'
import {
  consumeBankMathpixExtractResult,
  isGarbageRawLatexCard,
  buildBankUploadPaperMeta,
} from '../utils/bankMathpixUpload.js'
import {
  geminiStructureFailedSplit,
  mathpixSplitToBankDrafts,
  normalizeMathpixQuestionMarkers,
  countMathpixQuestionMarkers,
} from '../utils/mathpixQuestionSplit.js'
import { isAbortError } from '../utils/ocrAbort'
import {
  csvToQuestions,
  downloadQuestionsCsv } from '../utils/csvQuestions'
import { JSON_TEMPLATE, parseQuestionsFromJson } from '../utils/jsonImport'
import {
  UPLOADED_TEST_ID,
  addUploadedQuestion,
  importFullBankBackup,
  mergeBankBackup,
  loadQuestionBank,
  loadUploadedQuestions,
  peekUploadedQuestions,
  repairBankFromBackups,
  removeDuplicateDraftOnly,
  removeUploadedQuestions,
  updateUploadedQuestion,
  publishUploadedQuestion,
  publishUploadedQuestions,
  unpublishUploadedQuestion,
  unpublishUploadedQuestions,
  saveUploadSettings } from '../utils/questionBank'
import {
  canAccessMainQuestionBank,
  filterQuestionsForTeacherScope,
  publishQuestionSilently,
  publishQuestionsSilently,
  questionOwnedByTeacher,
  removeQuestionFromTeacherBank,
} from '../utils/teacherQuestionBank.js'
import { blockersBesidesDuplicate, getQuestionPublishBlockers } from '../utils/questionBankReview.js'
import { slimStoredBankImages } from '../utils/bankImageSlim.js'
import { persistQuestionWithSaveMode, pullBankIfLiveMode } from '../utils/bankServerSync.js'
import { getBankSaveMode } from '../utils/bankSaveMode.js'
import {
  IMAGE_OPTION_LABELS,
  compressImageFile,
  estimateDataUrlBytes,
  formatImageSize,
  isHybridQuestion } from '../utils/imageQuestion'
import {
  cropDiagramFromImageSource,
  tryAutoCropStemDiagramFromSource,
  questionNeedsFigure,
  resolveFigureImageForSave,
  resolvePassageDiagramFromSource,
  buildStoredFigureImageFields,
  shouldDropCompositeStemForOptionGraphs,
  classifyMcqImageLayout } from '../utils/figureQuestionImage.js'
import {
  applyGraphOptionPlaceholders,
  blobHasTypedTextMcqOptions,
  blobMentionsGraphOptions,
  countGraphOptionsNeedingImage,
  isGraphPlaceholderText,
  looksLikeContinuityDiscontinuityTextMcq,
  looksLikeVerticalTextOptionsMcq,
  optionInputValue,
  optionTextForDisplay,
  optionsAreTextOnlyMcq,
  sanitizeStoredOptions,
  stemSaysOptionsAreFigures,
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
  looksLikeFunctionPropertyTextMcq,
  looksLikeRealOptionText,
  stripMistakenCropLeakFromStem,
  looksLikeMistakenCropStemTail } from '../utils/graphOptionOcr'
import {
  autoCropMcqOptionsWithMeta,
  formatOptionsAutoCropStatus,
} from '../utils/autoDetectOptions.js'
import {
  countRealMcqOptions,
  countMcqAnswerSlots,
  isFixedAnswerQuestionType,
  shouldAutoAttachUploadScreenshot,
  shouldPreferDiagramOverMatrixParse,
  shouldAttemptDiagramAutoCrop,
  stemLikelyNeedsDiagramImage,
  shouldShowQuestionStemImage,
  shouldHideStemTextWithImage,
  shouldHideUploadScreenshotInStemPreview } from '../utils/stemDiagramDetect'
import {
  applyQuestionMetadata,
  defaultQuestionTypeForExams,
  formatExamLabels,
  formatToughnessLabel,
  normalizeSource,
  getQuestionTypeOptionsForExams,
  getSubjectsForExams,
  validateBulkPreviewQuestionTypes,
  validateQuestionMetadata } from '../utils/questionMetadata'
import { resolveQuestionHierarchy } from '../utils/curriculumOptions'
import { autoClassifyQuestion } from '../utils/autoClassifyQuestion'
import JeeUploadTestPanel from '../components/JeeUploadTestPanel'

const UPLOAD_TAB_IDS = [
  'compose',
  'single',
  'hybrid',
  'pdf-crop',
  'file',
  'jee-test',
  'bulk',
  'json',
  'csv',
]

const TABS = [
  { id: 'compose', label: 'Smart Compose', icon: '✍️' },
  { id: 'single', label: 'Convert (OCR)', icon: '🖼️' },
  { id: 'hybrid', label: 'Hybrid (images)', icon: '🧩' },
  { id: 'pdf-crop', label: 'PDF crop', icon: '✂️' },
  { id: 'file', label: 'Word/PDF/Image', icon: '📄' },
  { id: 'jee-test', label: 'JEE upload test', icon: '🧪' },
  { id: 'bulk', label: 'Bulk paste', icon: '📋' },
  { id: 'json', label: 'JSON import', icon: '{ }' },
  { id: 'csv', label: 'CSV import', icon: '📊' },
]

const BULK_TEMPLATE = `Q1. What is the value of x if x^2 - 5x + 6 = 0?
A) 2 and 3
B) 1 and 6
C) -2 and -3
D) 0 and 5
Answer: A

Q2. Which are polar molecules?
A) H2O
B) CO2
C) NH3
D) CCl4
Answer: A,C
Solution: Water and ammonia are polar due to dipole moment.

---`

function DuplicateCompareColumn({ title, question }) {
  const facts = questionCompareFacts(question)
  return (
    <div className="duplicate-compare-col">
      <h4>{title}</h4>
      <p className="form-hint">
        {facts.id || 'No id'} · {facts.subBank} · {facts.statusLabel}
      </p>
      <p className="duplicate-compare-stem">
        <MathText text={String(question?.text ?? '').slice(0, 500)} questionContext={question?.text} />
      </p>
      {facts.options.map((line, index) => (
        <p key={`${index}-${line}`} className="form-hint">
          {line}
        </p>
      ))}
      <p className="form-hint">Correct answer: {facts.answer}</p>
    </div>
  )
}

export default function QuestionBank() {
  const { hasPermission, session, isAdmin, isTeacher } = useAuth()
  const canPublishBank = hasPermission(PERMS.PUBLISH_QUESTIONS)
  const accessMainBank = isAdmin || canAccessMainQuestionBank(session)
  const [searchParams, setSearchParams] = useSearchParams()
  const forceMineBank =
    searchParams.get('owner') === 'teacher' ||
    searchParams.get('from') === 'teacher' ||
    (!accessMainBank && isTeacher)
  const hubFromUrl = searchParams.get('hub')
  const [hubMode, setHubMode] = useState(
    ['upload', 'view', 'manage', 'review'].includes(hubFromUrl ?? '') ? hubFromUrl : 'upload',
  )
  const panelHub = useDeferredPanelKey(hubMode)
  const viewFromUrl = searchParams.get('view')
  const [viewTab, setViewTab] = useState(() => {
    if (viewFromUrl === 'draft' || viewFromUrl === 'published') return viewFromUrl
    return 'draft'
  })
  const modeFromUrl = searchParams.get('mode')
  const [reviewMode, setReviewMode] = useState(
    BANK_REVIEW_MODES.some((m) => m.id === modeFromUrl) ? modeFromUrl : 'drafts',
  )
  const [selectedQueueId, setSelectedQueueId] = useState(null)
  const tabFromUrl = searchParams.get('tab')
  const [tab, setTab] = useState(
    UPLOAD_TAB_IDS.includes(tabFromUrl ?? '') ? tabFromUrl : 'compose',
  )
  const [settings, setSettings] = useState(() => loadQuestionBank().settings)
  const [saved, setSaved] = useState(() => {
    const peek = peekUploadedQuestions()
    if (peek.length > 0) return peek
    const repaired = repairBankFromBackups()
    if (repaired > 0) return peekUploadedQuestions()
    return loadUploadedQuestions()
  })
  const [viewingQuestionId, setViewingQuestionId] = useState(null)
  /** Open saved viewer with metatag editor expanded */
  const [viewerOpenMeta, setViewerOpenMeta] = useState(false)
  /** Open saved viewer with question/answer editor expanded */
  const [viewerOpenContent, setViewerOpenContent] = useState(false)
  /** When editing from bank: show content form before metadata */
  const [uploadEditFocus, setUploadEditFocus] = useState(null)
  const contentEditorRef = useRef(null)
  const [editingQuestionId, setEditingQuestionId] = useState(null)
  /** Possible duplicate — new copy saved as draft for compare. */
  const [duplicateAlarm, setDuplicateAlarm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const ocrGenRef = useRef(0)
  const ocrAbortRef = useRef(null)
  const ocrSourceFileRef = useRef(null)
  /** OCR text before heavy normalize — better for option marker parsing */
  const ocrRawTextRef = useRef('')
  /** Built-in OCR merged when primary pass omits Column-I rows (e.g. Row C) */
  const ocrSupplementTextRef = useRef('')
  const matrixSupplementGenRef = useRef(0)
  const matrixSupplementAttemptedRef = useRef(false)
  /** True when the last passage split produced sub-questions with no options yet */
  const passageNeedsOptionsRef = useRef(false)
  /** Set when upload pipeline handles option crops — blocks duplicate debounced crop. */
  const uploadCropGuardRef = useRef(false)
  /** Passage text waiting for manual diagram crop from split tool. */
  const passageDiagramCropTextRef = useRef('')
  const pasteParseTimerRef = useRef(null)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [aiUploadReport, setAiUploadReport] = useState(/** @type {ReturnType<typeof buildAiUploadReport>} */ (null))
  const [uploadHistoryOpen, setUploadHistoryOpen] = useState(false)
  const uploadSessionStartedRef = useRef(0)
  const uploadTimelineSnapRef = useRef(/** @type {Record<string, unknown> | null} */ (null))
  /** True once this Convert run filled the form — catch must not wipe that parse. */
  const uploadParseAppliedRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const messageBannerRef = useRef(null)
  const messageDismissTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))

  const clearBankMessage = useCallback(() => {
    if (messageDismissTimerRef.current) {
      clearTimeout(messageDismissTimerRef.current)
      messageDismissTimerRef.current = null
    }
    setMessage({ type: '', text: '' })
  }, [])

  const showBankMessage = useCallback((type, text) => {
    if (messageDismissTimerRef.current) {
      clearTimeout(messageDismissTimerRef.current)
      messageDismissTimerRef.current = null
    }
    setMessage({ type, text })
    // Errors auto-dismiss too so they never permanently cover option controls
    const dismissMs = type === 'error' ? 8000 : 5000
    if (type === 'success' || type === 'info' || type === 'error') {
      messageDismissTimerRef.current = setTimeout(() => {
        messageDismissTimerRef.current = null
        setMessage({ type: '', text: '' })
      }, dismissMs)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (messageDismissTimerRef.current) clearTimeout(messageDismissTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const onHybridSync = (ev) => {
      const detail = ev?.detail
      const text = String(detail?.message ?? '').trim()
      if (!text) return
      const type = detail?.type === 'error' ? 'error' : detail?.type === 'success' ? 'success' : 'info'
      showBankMessage(type, text)
    }
    window.addEventListener(HYBRID_AI_SYNC_STATUS_EVENT, onHybridSync)
    return () => window.removeEventListener(HYBRID_AI_SYNC_STATUS_EVENT, onHybridSync)
  }, [showBankMessage])

  // Auto-dismiss success/info/error when setMessage is called directly
  useEffect(() => {
    if (!message.text) return
    if (message.type !== 'success' && message.type !== 'info' && message.type !== 'error') return
    if (messageDismissTimerRef.current) clearTimeout(messageDismissTimerRef.current)
    const ms = message.type === 'error' ? 8000 : 5000
    messageDismissTimerRef.current = setTimeout(() => {
      messageDismissTimerRef.current = null
      setMessage({ type: '', text: '' })
    }, ms)
    return () => {
      if (messageDismissTimerRef.current) {
        clearTimeout(messageDismissTimerRef.current)
        messageDismissTimerRef.current = null
      }
    }
  }, [message.type, message.text])

  const logUploadSession = useCallback((picked, mode, engine = 'builtin') => {
    const snap = uploadTimelineSnapRef.current ?? {}
    recordUploadHistory({
      fileName: picked?.name ?? 'Upload',
      mode: mode ?? 'unknown',
      engine,
      durationMs: uploadSessionStartedRef.current
        ? Date.now() - uploadSessionStartedRef.current
        : 0,
      ...snap })
    uploadTimelineSnapRef.current = null
  }, [])

  const getOcrSourceFile = () => singleUploadFile ?? ocrSourceFileRef.current

  /** Auto-attach + crop upload screenshot as shared passage diagram (graph/plot passages). */
  const schedulePassageDiagramFromUpload = useCallback((source, passageText) => {
    const text = String(passageText ?? '').trim()
    if (!source || !text || !passageLikelyNeedsSharedDiagram(text)) return

    const apply = (resolved) => {
      if (!resolved?.url) return
      setPassageBundle((b) =>
        b?.passageText === text
          ? {
              ...b,
              passageImage: resolved.url,
              passageImageCrop: resolved.passageImageCrop ?? false }
          : b,
      )
    }

    ;(async () => {
      try {
        const url =
          typeof source === 'string' ? source : await compressImageFile(source)
        const resolved = await resolvePassageDiagramFromSource(url, text)
        if (resolved?.url) {
          apply(resolved)
          return
        }
        if (typeof source !== 'string') {
          previewBlobRef.current = url
          setPreviewUrl(url)
        }
        passageDiagramCropTextRef.current = text
        setSplitCropMode('diagram')
        requestAnimationFrame(() => setSplitCropOpen(true))
        showBankMessage(
          'info',
          'Could not auto-crop the passage diagram — draw a box around the figure in the crop tool.',
        )
      } catch {
        /* user can attach manually in passage panel */
      }
    })()
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canRunImageOcr = () => {
    const f = getOcrSourceFile()
    return !!(f && (isImageFile(f) || isPdfFile(f)))
  }

  const reportExtractProgress = useCallback((pct) => {
    startTransition(() => {
      setProgress((prev) => Math.max(prev, Math.min(100, pct)))
    })
  }, [])

  const bankGeminiStallRef = useRef(null)
  useEffect(() => {
    if (!loading || progress < 60) {
      if (bankGeminiStallRef.current) {
        clearTimeout(bankGeminiStallRef.current)
        bankGeminiStallRef.current = null
      }
      return undefined
    }
    if (bankGeminiStallRef.current) return undefined
    bankGeminiStallRef.current = setTimeout(() => {
      bankGeminiStallRef.current = null
      setMessage({
        type: 'error',
        text: 'Upload stalled after Mathpix. The button is unlocked. Keep the bottom panel open (Ctrl+J then Ctrl+`), press F5, then try again. Your published bank was not wiped.',
      })
      setLoading(false)
      setProgress(0)
    }, 20000)
    return undefined
  }, [loading, progress])

  /** Clear stuck OCR UI from a prior run (e.g. after delete / refresh). */
  const resetOcrUi = useCallback(() => {
    ocrGenRef.current += 1
    ocrAbortRef.current?.abort()
    ocrAbortRef.current = null
    cancelTesseractOcr()
    cancelMathOcr()
    setLoading(false)
    setProgress(0)
  }, [])

  const finishOcrRun = useCallback((gen) => {
    if (gen === ocrGenRef.current) {
      ocrAbortRef.current = null
      setLoading(false)
      setProgress(0)
    }
  }, [])

  /** On mount: clear stuck spinners only — never bump ocrGenRef (Strict Mode would abort upload OCR). */
 
  useEffect(() => {
    setLoading(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    let cancelled = false
    clearCloudVisionStatusCache()
    fetchCloudVisionStatus({ force: true }).then((st) => {
      if (cancelled) return
      if (st.configured && st.ready !== false) {
        const who = st.preferred || st.providers?.[0] || 'cloud'
        const model = st.model ? ` · ${st.model}` : ''
        setCloudVisionReady({ ready: true, label: `AI ready (${who}${model})` })
      } else {
        setCloudVisionReady({ ready: false, label: 'AI offline (no API key — OCR still works)' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const notifyOcrInterrupted = () => {
    setMessage({
      type: 'info',
      text: 'OCR was interrupted — click **Convert image → text** to run again.' })
  }

  const cancelExtract = useCallback(() => {
    resetOcrUi()
    setMessage({ type: 'success', text: 'OCR cancelled. You can type or upload again.' })
  }, [resetOcrUi])

  useEffect(() => {
    if (!loading) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelExtract()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading, cancelExtract])

  const beginOcrRun = () => {
    ocrAbortRef.current?.abort()
    ocrAbortRef.current = new AbortController()
    optionsAutoCropAttemptedRef.current = ''
    manualOptionSplitRef.current = false
    return ocrAbortRef.current.signal
  }

  const refresh = useCallback(() => {
    const peek = peekUploadedQuestions()
    if (peek.length > 0) {
      setSaved(loadUploadedQuestions())
      return
    }
    repairBankFromBackups()
    setSaved(loadUploadedQuestions())
  }, [])

  /** Fast path after a single-question save (avoids re-migrating the whole bank). */
  const applySavedQuestionPatch = useCallback((id, updates) => {
    try {
      const entry = updateUploadedQuestion(id, updates)
      if (!entry) {
        showBankMessage('error', 'Could not save — question not found. Refresh the page and try again.')
        return false
      }
      setSaved((prev) => {
        const oldId = String(id)
        const newId = String(entry.id)
        const remapped =
          oldId !== newId
            ? prev.map((q) => (q.passageId === oldId ? { ...q, passageId: newId } : q))
            : prev
        const idx = remapped.findIndex((q) => String(q.id) === oldId)
        if (idx === -1) return [entry, ...remapped.filter((q) => String(q.id) !== newId)]
        const next = [...remapped]
        next.splice(idx, 1)
        next.unshift(entry)
        return next
      })
      return true
    } catch (e) {
      showBankMessage(
        'error',
        e?.message ?? 'Save failed. Export your bank as JSON, then free browser storage.',
      )
      return false
    }
  }, [showBankMessage])

  const clearDuplicateAlarm = useCallback(() => {
    setDuplicateAlarm(null)
    setMessage((prev) =>
      prev.type === 'error' && /duplicate/i.test(prev.text) ? { type: '', text: '' } : prev,
    )
  }, [])

  const clearEditingState = () => {
    setEditingQuestionId(null)
    setPassageBundle(null)
    setUploadEditFocus(null)
    clearDuplicateAlarm()
  }

  useEffect(() => {
    if (!duplicateAlarm) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        clearDuplicateAlarm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [duplicateAlarm, clearDuplicateAlarm])

  /**
   * @param {object} entry
   * @param {{ forceDuplicate?: boolean }} [opts]
   * @returns {Promise<{ persist: 'saved' | 'updated' | 'duplicate', syncStatus?: import('../utils/bankServerSync.js').QuestionSyncStatus, duplicateReview?: boolean, entry?: import('../data/tests').Question }>}
   */
  const persistToBank = async (entry, { forceDuplicate = false } = {}) => {
    const stemNorm =
      typeof entry?.text === 'string' && entry.text.trim()
        ? finalizeStemForBank(entry.text, entry.options ?? [])
        : entry?.text
    const cleaned = normalizePassageQuestionStorage({
      ...entry,
      ...(stemNorm !== undefined ? { text: stemNorm } : {}) })
    const excludeId = editingQuestionId ?? cleaned.id ?? undefined
    const wasEditing = !!editingQuestionId

    let toSave = cleaned
    let matches = []
    if (!forceDuplicate) {
      matches = findDuplicateQuestions(cleaned, saved, { excludeId })
      if (matches.length) {
        toSave = attachDuplicateReviewFields(cleaned, matches)
      }
    }

    const out = await persistQuestionWithSaveMode(toSave, {
      editingId: wasEditing ? excludeId : undefined,
      mode: getBankSaveMode() })
    if (wasEditing) {
      setEditingQuestionId(null)
      setPassageBundle(null)
      setUploadEditFocus(null)
    }
    refresh()
    if (matches.length) {
      setDuplicateAlarm({
        matches,
        entry: out.entry,
        saved: true,
        canDiscard: !wasEditing && out.result === 'saved',
      })
    } else {
      setDuplicateAlarm(null)
    }
    return {
      persist: out.result,
      syncStatus: out.syncStatus,
      entry: out.entry,
      duplicateReview: matches.length > 0,
    }
  }

  const formatSaveSyncNote = (syncStatus, isNew = false) => {
    const mode = getBankSaveMode()
    const draftNote = isNew ? ' Saved as draft — publish from Saved view when ready.' : ''
    if (syncStatus === 'live') return `${draftNote} Question is live on the server.`
    if (mode === 'online' && syncStatus === 'failed') {
      return `${draftNote} Saved on this device — server sync failed. Use Sync on the Saved tab.`
    }
    if (mode === 'offline') return `${draftNote} Saved offline — use Sync when ready to go live.`
    return draftNote
  }

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveUploadSettings(next)
    if (patch.examPatternId) {
      const ids = [patch.examPatternId]
      setExamIds(ids)
      setQType((prev) => defaultQuestionTypeForExams(ids, prev))
    }
  }

  // —— Single question state ——
  const [qType, setQType] = useState('single_correct')
  const [subject, setSubject] = useState('mathematics')
  /** Compose Question lifecycle — maps to draft / published. */
  const [composeStatus, setComposeStatus] = useState(
    /** @type {'active' | 'needs_review' | 'disabled'} */ ('needs_review'),
  )
  const [composeMarksCorrect, setComposeMarksCorrect] = useState(4)
  const [composeMarksWrong, setComposeMarksWrong] = useState(-1)
  const [composeAssistBusy, setComposeAssistBusy] = useState(false)
  const [composeAssistBadge, setComposeAssistBadge] = useState('')
  const [composeSimilarWarning, setComposeSimilarWarning] = useState('')
  const [qText, setQText] = useState('')
  const [options, setOptions] = useState(['', '', '', ''])
  const [optionImages, setOptionImages] = useState([null, null, null, null])
  /** Latest A–D crops — updated synchronously so save/parse does not race React state. */
  const optionImagesRef = useRef(/** @type {(string|null)[]} */ ([null, null, null, null]))
  const [questionImage, setQuestionImage] = useState(null)
  /** True when stem image is a deliberate crop/attach (not auto full-page OCR). */
  const [stemImageCrop, setStemImageCrop] = useState(false)
  /** Hide separate stem text when the same wording is inside questionImage. */
  const [stemTextInImage, setStemTextInImage] = useState(false)
  const [, setOptionStep] = useState(0)
  const [correctIndex, setCorrectIndex] = useState(/** @type {number | null} */ (null))
  const [correctIndices, setCorrectIndices] = useState([])
  const [msqMarking, setMsqMarking] = useState({ ...DEFAULT_MSQ_MARKING })
  const [correctInteger, setCorrectInteger] = useState('')
  const [correctNumerical, setCorrectNumerical] = useState('')
  const [matrixRows, setMatrixRows] = useState(['', '', '', ''])
  const [matrixCols, setMatrixCols] = useState(['', '', '', ''])
  const [matrixColCount, setMatrixColCount] = useState(4)
  const [matrixUseOptions, setMatrixUseOptions] = useState(false)
  const [matrixGridKey, setMatrixGridKey] = useState(
    /** @type {Record<number, number[]>} */ ({}),
  )
  const [matrixColLabels, setMatrixColLabels] = useState(defaultMatrixColLabels(5))
  const [solution, setSolution] = useState('')
  const [videoSolution, setVideoSolution] = useState('')
  const [answerSource, setAnswerSource] = useState(/** @type {string} */ ('unknown'))
  const [solutionSource, setSolutionSource] = useState(/** @type {string} */ ('unknown'))
  const [aiSuggestedMeta, setAiSuggestedMeta] = useState(/** @type {string[]} */ ([]))
  /** Fields the user edited — AI enrich must not overwrite these. */
  const userLockedMetaRef = useRef(/** @type {Set<string>} */ (new Set()))
  const lockMetaField = useCallback((field) => {
    userLockedMetaRef.current.add(field)
    setAiSuggestedMeta((prev) => clearAiSuggestedMetaField(prev, field))
  }, [])
  const [localAiStats, setLocalAiStats] = useState(() => getLocalAiLearningStats())
  const [useLocalAiLearning, setUseLocalAiLearning] = useState(
    () => loadLocalAiLearningSettings().enabled,
  )
  const cloudLearningCaptureRef = useRef(
    /** @type {{ localOcrRaw?: string, fingerprint?: string, provider?: string } | null} */ (null),
  )
  const solutionAutofillGenRef = useRef(0)
  const [ocrEngine, setOcrEngine] = useState(/** @type {string} */ ('builtin'))
  const [extractLowConfidence, setExtractLowConfidence] = useState(false)
  const [extractCloudNote, setExtractCloudNote] = useState('')
  const [cloudVisionReady, setCloudVisionReady] = useState(
    /** @type {{ ready: boolean, label: string } | null} */ (null),
  )
  const [regeneratingSolution, setRegeneratingSolution] = useState(false)
  const [fieldConfidence, setFieldConfidence] = useState(/** @type {ReturnType<typeof scoreUploadFieldConfidence> | null} */ (null))
  const [section, setSection] = useState('')
  const [chapter, setChapter] = useState('')
  const [topic, setTopic] = useState('')
  const [examIds, setExamIds] = useState(() => {
    const bank = loadQuestionBank()
    const fromSettings = bank.settings.examPatternId
    if (fromSettings === 'jee-main') return ['jee-advanced']
    return fromSettings ? [fromSettings] : ['jee-advanced']
  })
  const [toughnessLevel, setToughnessLevel] = useState('')
  const [source, setSource] = useState('')
  useEffect(() => {
    setQType((prev) => defaultQuestionTypeForExams(examIds, prev))
  }, [examIds])
  const [bankListFilters, setBankListFilters] = useState({
    examId: '',
    subject: '',
    section: '',
    chapter: '',
    topic: '',
    questionType: '',
    toughnessLevel: '',
    toughnessBand: '',
    source: '',
    sourceKind: '',
    dateFrom: '',
    dateTo: '',
    uploadedBy: '',
    bankStatus: 'draft',
    questionIdQuery: '',
    familyKind: '',
    pyqYear: '',
    pyqDate: '',
    pyqShift: '',
    pyqPaper: '',
    subBankType: '',
    reviewSort: 'newest',
  })
  const [parseStatus, setParseStatus] = useState(null)
  const [extractedRaw, setExtractedRaw] = useState('')
  const [singleUploadFile, setSingleUploadFile] = useState(null)
  /** @type {[import('../utils/imageUploadQueue.js').ImageQueueItem[], Function]} */
  const [imageUploadQueue, setImageUploadQueue] = useState([])
  const [activeImageQueueId, setActiveImageQueueId] = useState(null)
  const imageUploadQueueRef = useRef([])
  const activeImageQueueIdRef = useRef(null)
  const [splitCropOpen, setSplitCropOpen] = useState(false)
  /** `diagram` = crop graph only (text from OCR); `full` = stem + options A–D */
  const [splitCropMode, setSplitCropMode] = useState('full')
  /** @type {[{ passageText: string, passageImage?: string, subQuestions: import('../utils/parsePassageUpload').PassageSubQuestion[] }] | null} */
  const [passageBundle, setPassageBundle] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  /** Blob URL for upload preview — revoke only on replace/unmount, not on React strict remount. */
  const previewBlobRef = useRef(null)
  const optionsAutoCropAttemptedRef = useRef('')
  /** Blocks mistaken-crop strip after user manually splits A–D from the upload screenshot. */
  const manualOptionSplitRef = useRef(false)
  const optionsAutoCropTimerRef = useRef(null)
  const autoSaveAfterCropRef = useRef(false)

  const syncOptionImagesRef = useCallback((imgs) => {
    const next = (imgs ?? []).slice(0, 4)
    while (next.length < 4) next.push(null)
    optionImagesRef.current = next
    return next
  }, [])

  const getEffectiveOptionImages = useCallback(() => {
    if (optionImages.some((img) => !!String(img ?? '').trim())) {
      return syncOptionImagesRef(optionImages)
    }
    return syncOptionImagesRef(optionImagesRef.current)
  }, [optionImages, syncOptionImagesRef])

  useEffect(() => {
    syncOptionImagesRef(optionImages)
  }, [optionImages, syncOptionImagesRef])
  const singleInputRef = useRef(null)
  const wordInputRef = useRef(null)
  /** @type {['type' | 'upload' | 'word', Function]} */
  const [singleEntryMode, setSingleEntryMode] = useState(
    /** @type {'type' | 'upload' | 'word'} */ ('type'),
  )
  const questionRef = useRef(null)
  const optionRefs = useRef([])
  const solutionRef = useRef(null)
  const composeSaveRef = useRef(/** @type {null | (() => void | Promise<void>)} */ (null))
  const composePassageSaveRef = useRef(/** @type {null | (() => void | Promise<void>)} */ (null))
  const [activeField, setActiveField] = useState({ type: 'question', index: 0 })

  const scopedSaved = useMemo(
    () =>
      filterQuestionsForTeacherScope(saved, {
        session,
        forceMine: forceMineBank,
      }),
    [saved, session, forceMineBank],
  )

  const activeSubBank = useMemo(
    () => parseQuestionBankSubBank(searchParams.get('subBank')),
    [searchParams],
  )

  const subBankScoped = useMemo(
    () => filterQuestionsForSubBankTab(scopedSaved, activeSubBank),
    [scopedSaved, activeSubBank],
  )

  const hybridTray = searchParams.get('hybridTray') === 'needs-action' ? 'needs-action' : 'ready'

  const hybridTrayCounts = useMemo(() => {
    const aiRows = filterQuestionsForSubBankTab(scopedSaved, 'ai')
    return countHybridAiDraftTrays(aiRows)
  }, [scopedSaved])

  const shownQuestions = useMemo(
    () => filterHybridAiDraftTray(subBankScoped, activeSubBank, hybridTray),
    [subBankScoped, activeSubBank, hybridTray],
  )

  const subBankCounts = useMemo(() => countQuestionsBySubBank(scopedSaved), [scopedSaved])

  const hybridDraftCount = useMemo(
    () => countHybridAiDrafts(scopedSaved),
    [scopedSaved],
  )

  const shownDrafts = useMemo(
    () => shownQuestions.filter((q) => effectiveBankStatus(q) === 'draft'),
    [shownQuestions],
  )
  const draftCount = shownDrafts.length
  const publishedCount = useMemo(
    () => shownQuestions.filter((q) => effectiveBankStatus(q) === 'published').length,
    [shownQuestions],
  )
// eslint-disable-next-line react-hooks/exhaustive-deps
  const storageDiag = useMemo(() => getBankStorageDiagnostics(), [saved.length])

  const composeSoftIssues = useMemo(() => {
    if (tab !== 'compose') {
      return { blockers: [], warnings: [], ready: true }
    }
    return getComposeSoftIssues({
      questionType: qType,
      stem: qText,
      options,
      optionImages,
      correctIndex,
      correctIndices,
      correctInteger,
      correctNumerical,
      matrixRows,
      matrixCols,
      matrixUseOptions,
      matrixGridKey,
      passageBundle,
      subject,
      examIds,
    })
  }, [
    tab,
    qType,
    qText,
    options,
    optionImages,
    correctIndex,
    correctIndices,
    correctInteger,
    correctNumerical,
    matrixRows,
    matrixCols,
    matrixUseOptions,
    matrixGridKey,
    passageBundle,
    subject,
    examIds,
  ])

  const examEligibleCount = useMemo(
    () =>
      subBankScoped.filter(
        (q) => !q.examIds?.length || q.examIds.includes(settings.examPatternId),
      ).length,
    [subBankScoped, settings.examPatternId],
  )
  const selectedExamName =
    EXAM_PATTERNS.find((p) => p.id === settings.examPatternId)?.name ?? settings.examPatternId

  const handleHubChange = useCallback((mode) => {
    if (mode === 'review' && !accessMainBank) {
      setHubMode('view')
      return
    }
    setHubMode(mode)
  }, [accessMainBank])

  const handleViewTabChange = useCallback((tab) => {
    setViewTab(tab)
    setBankListFilters((prev) => ({ ...prev, bankStatus: tab }))
    setSelectedQueueId(null)
  }, [])

  const handleSubBankChange = useCallback(
    (subBankId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!subBankId) next.delete('subBank')
          else next.set('subBank', subBankId)
          if (subBankId !== 'ai') next.delete('hybridTray')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleHybridTrayChange = useCallback(
    (tray) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('subBank', 'ai')
          if (tray === 'needs-action') next.set('hybridTray', 'needs-action')
          else next.delete('hybridTray')
          return next
        },
        { replace: true },
      )
      setViewTab('draft')
      setBankListFilters((prev) => (prev.bankStatus === 'draft' ? prev : { ...prev, bankStatus: 'draft' }))
    },
    [setSearchParams],
  )

  const openBankDrafts = useCallback(() => {
    setHubMode('view')
    handleViewTabChange('draft')
  }, [handleViewTabChange])

  const consumeMathpixBankResult = useCallback(
    (result) =>
      consumeBankMathpixExtractResult(result, {
        refresh,
        openDrafts: openBankDrafts,
        setMessage,
      }),
    [refresh, openBankDrafts],
  )

  const handlePublishQuestion = useCallback(
    (id, { silent = false, allowDuplicate = false } = {}) => {
      const target =
        peekUploadedQuestions().find((q) => String(q.id) === String(id)) ??
        saved.find((q) => String(q.id) === String(id))
      const blockers = blockersBesidesDuplicate(target ? getQuestionPublishBlockers(target) : [])
      if (blockers.length) {
        showBankMessage('error', `Cannot publish yet — ${blockers.join(' ')}`)
        return false
      }
      try {
        const entry = silent
          ? publishQuestionSilently(id, { allowDuplicate })
          : publishUploadedQuestion(id, { silent, allowDuplicate })
        if (!entry) {
          showBankMessage('error', 'Could not publish — question not found.')
          return false
        }
        refresh()
        showBankMessage(
          'success',
          allowDuplicate
            ? 'Kept both. This copy is published once — the draft was not left behind.'
            : silent
              ? 'Published silently — in the main bank for papers; no student announcement.'
              : 'Published — now available in papers and practice.',
        )
        return true
      } catch (err) {
        if (err?.code === 'PUBLISH_DUPLICATE') {
          setDuplicateAlarm({
            purpose: 'publish',
            matches: err.matches,
            entry: err.question ?? target,
            silent,
            saved: true,
            canDiscard: false,
          })
          showBankMessage(
            'info',
            'This matches a question already in the bank. Compare the two, then choose Keep original only or Keep both.',
          )
          return 'compare'
        }
        showBankMessage('error', err?.message || 'Could not publish.')
        return false
      }
    },
    [refresh, saved, showBankMessage],
  )

  const finishBulkPublish = useCallback(
    (published, contentBlocked, silent = false) => {
      const compare = published?.needsCompare ?? []
      refresh()
      if (compare[0]) {
        setDuplicateAlarm({
          purpose: 'publish',
          matches: compare[0].matches,
          entry: compare[0].question,
          silent,
          saved: true,
          canDiscard: false,
        })
      }
      const compareNote = compare.length
        ? ` ${compare.length} match a question already in the bank — compare, then choose Keep original only or Keep both.`
        : ''
      const contentNote = contentBlocked
        ? ` ${contentBlocked} blocked until tags/content are fixed.`
        : ''
      showBankMessage(
        published.length ? 'success' : compare.length ? 'info' : 'error',
        published.length
          ? `${silent ? 'Silently published' : 'Published'} ${published.length} question(s).${contentNote}${compareNote}`
          : compare.length
            ? `Nothing published yet.${compareNote}`
            : contentBlocked
              ? `${contentBlocked} question(s) blocked until tags/content are fixed.`
              : 'No questions were published.',
      )
    },
    [refresh, showBankMessage],
  )

  const handleUnpublishQuestion = useCallback(
    (id) => {
      const entry = unpublishUploadedQuestion(id)
      if (!entry) {
        showBankMessage('error', 'Could not move to draft — question not found.')
        return false
      }
      refresh()
      showBankMessage('success', 'Moved back to draft for further review.')
      return true
    },
// eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh],
  )

  const handleDeleteFromBank = useCallback(
    (id) => {
      const q = saved.find((x) => String(x.id) === String(id))
      const teacherId = String(session?.userId ?? '').trim()
      const teacherSoftDelete =
        isTeacher &&
        !isAdmin &&
        q &&
        questionOwnedByTeacher(q, teacherId)

      if (teacherSoftDelete) {
        const set =
          q.passageText
            ? saved.filter((row) => row.id === q.id || row.passageId === q.id)
            : [q]
        let soft = 0
        let hard = 0
        for (const row of set) {
          const result = removeQuestionFromTeacherBank(row.id, { teacherId })
          if (result.ok && result.mode === 'soft') soft += 1
          else if (result.ok && result.mode === 'hard') hard += 1
        }
        if (viewingQuestionId === id) setViewingQuestionId(null)
        if (editingQuestionId === id) clearEditingState()
        refresh()
        if (!soft && !hard) {
          showBankMessage('error', 'Could not delete that question.')
          return
        }
        if (soft && !hard) {
          showBankMessage(
            'success',
            soft > 1
              ? `Removed ${soft} questions from your bank — they stay in the main bank.`
              : 'Removed from your bank — kept in the main bank after publish.',
          )
        } else if (hard && !soft) {
          showBankMessage(
            'success',
            hard > 1 ? `Deleted ${hard} draft questions.` : 'Draft question deleted.',
          )
        } else {
          showBankMessage(
            'success',
            `Updated your bank (${soft} kept in main, ${hard} drafts deleted).`,
          )
        }
        return
      }

      const seed = new Set([String(id)])
      if (q) {
        const parentId = q.passageText ? q.id : q.passageId
        if (parentId) {
          seed.add(String(parentId))
          for (const row of saved) {
            if (String(row.id) === String(parentId) || String(row.passageId) === String(parentId)) {
              seed.add(String(row.id))
            }
          }
        } else {
          seed.add(String(q.id))
        }
      }
      const { removedIds, blockedEmpty } = removeUploadedQuestions([...seed])
      if (blockedEmpty) {
        showBankMessage('error', 'Could not delete — that would empty the whole bank.')
        return
      }
      if (!removedIds.length) {
        showBankMessage('error', 'Could not delete — question not found.')
        return
      }
      if (viewingQuestionId === id) setViewingQuestionId(null)
      if (editingQuestionId === id) clearEditingState()
      refresh()
      showBankMessage(
        'success',
        removedIds.length > 1
          ? `Deleted ${removedIds.length} copies of this question.`
          : 'Question deleted.',
      )
    },
    [
      saved,
      session?.userId,
      isTeacher,
      isAdmin,
      viewingQuestionId,
      editingQuestionId,
      clearEditingState,
      refresh,
      showBankMessage,
    ],
  )

  useEffect(() => {
    const hub = searchParams.get('hub')
    if (['upload', 'view', 'manage', 'review'].includes(hub ?? '')) {
      const nextHub = hub === 'review' && !accessMainBank ? 'view' : hub
      setHubMode((prev) => (prev === nextHub ? prev : nextHub))
    }
    const view = searchParams.get('view')
    if (view === 'draft' || view === 'published') {
      setViewTab((prev) => (prev === view ? prev : view))
      setBankListFilters((prev) =>
        prev.bankStatus === view ? prev : { ...prev, bankStatus: view },
      )
    } else if (view === 'all' || view === 'classified' || view === 'untagged') {
      setViewTab((prev) => (prev === 'draft' ? prev : 'draft'))
      setBankListFilters((prev) =>
        prev.bankStatus === 'draft' ? prev : { ...prev, bankStatus: 'draft' },
      )
    }
    const modeParam = searchParams.get('mode')
    if (BANK_REVIEW_MODES.some((m) => m.id === modeParam)) {
      setReviewMode((prev) => (prev === modeParam ? prev : modeParam))
    }
    const tabParam = searchParams.get('tab')
    if (UPLOAD_TAB_IDS.includes(tabParam ?? '')) {
      setTab((prev) => (prev === tabParam ? prev : tabParam))
    }
    const typeParam = searchParams.get('type')
    const allowedTypeIds = QUESTION_TYPES.map((t) => t.id)
    if (typeParam && allowedTypeIds.includes(typeParam)) {
      setQType((prev) => (prev === typeParam ? prev : typeParam))
    }
    const sourceParam = searchParams.get('source')
    if (sourceParam != null && String(sourceParam).trim()) {
      const normalized = normalizeSource(sourceParam) || ''
      setSource((prev) => (prev === normalized ? prev : normalized))
      setBankListFilters((prev) =>
        prev.source === normalized ? prev : { ...prev, source: normalized },
      )
    }
    const subBankParam = parseQuestionBankSubBank(searchParams.get('subBank'))
    setBankListFilters((prev) =>
      (prev.subBankType ?? '') === subBankParam
        ? prev
        : { ...prev, subBankType: subBankParam },
    )
    const reviewSortParam = searchParams.get('reviewSort')
    const nextReviewSort = reviewSortParam === 'oldest' ? 'oldest' : 'newest'
    const reviewDaysParam = searchParams.get('reviewDays')
    setBankListFilters((prev) => {
      const sortOk = (prev.reviewSort ?? 'newest') === nextReviewSort
      const dates = reviewDatesAfterUrlParam(prev, reviewDaysParam)
      if (sortOk && !dates.changed) return prev
      return {
        ...prev,
        reviewSort: nextReviewSort,
        dateFrom: dates.dateFrom,
        dateTo: dates.dateTo,
      }
    })
  }, [searchParams, accessMainBank])

  useEffect(() => {
    if (tab === 'compose') setSingleEntryMode('type')
  }, [tab])

  // Keep hub/view/tab in the URL — but only write when values actually differ.
  // Calling setSearchParams on every render (even with the same values) re-triggers
  // this effect via a new setSearchParams identity and flickers the tab UI.
  useEffect(() => {
    const wantHub = hubMode
    const wantView = hubMode === 'view' || hubMode === 'review' ? viewTab : null
    const wantTab = hubMode === 'upload' ? tab : null
    const wantMode = hubMode === 'review' ? reviewMode : null
    const wantReviewSort =
      hubMode === 'review' ? (bankListFilters.reviewSort === 'oldest' ? 'oldest' : 'newest') : null
    const wantReviewDays =
      hubMode === 'review'
        ? (() => {
            const { dateFrom, dateTo } = bankListFilters
            if (!dateFrom && !dateTo) return 'all'
            for (const p of ['today', '7d', '30d']) {
              const r = reviewDatePresetToRange(p)
              if (r.dateFrom === dateFrom && r.dateTo === dateTo) return p
            }
            return null
          })()
        : null
    const hubOk = searchParams.get('hub') === wantHub
    const viewOk = wantView ? searchParams.get('view') === wantView : !searchParams.has('view')
    const tabOk = wantTab ? searchParams.get('tab') === wantTab : !searchParams.has('tab')
    const modeOk = wantMode ? searchParams.get('mode') === wantMode : !searchParams.has('mode')
    const sortOk = wantReviewSort
      ? searchParams.get('reviewSort') === wantReviewSort
      : !searchParams.has('reviewSort')
    const daysOk = wantReviewDays
      ? searchParams.get('reviewDays') === wantReviewDays
      : !searchParams.has('reviewDays')
    if (hubOk && viewOk && tabOk && modeOk && sortOk && daysOk) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('hub', wantHub)
        if (wantView) next.set('view', wantView)
        else next.delete('view')
        if (wantTab) next.set('tab', wantTab)
        else next.delete('tab')
        if (wantMode) next.set('mode', wantMode)
        else next.delete('mode')
        if (wantReviewSort) next.set('reviewSort', wantReviewSort)
        else next.delete('reviewSort')
        if (wantReviewDays) next.set('reviewDays', wantReviewDays)
        else next.delete('reviewDays')
        return next
      },
      { replace: true },
    )
  }, [hubMode, viewTab, tab, reviewMode, bankListFilters, searchParams, setSearchParams])

  useEffect(() => {
    // Warm Tesseract first (fast text) then math model — cuts "stuck at 25%" on first upload.
    const warmTess = () => warmTesseractWorker()
    const warmMath = () => {
      if (isLocalMathOcrEnabled()) warmMathOcrPipeline()
    }
    if (typeof requestIdleCallback === 'function') {
      const id1 = requestIdleCallback(warmTess, { timeout: 4_000 })
      const id2 = requestIdleCallback(warmMath, { timeout: 12_000 })
      return () => {
        cancelIdleCallback(id1)
        cancelIdleCallback(id2)
      }
    }
    const t1 = window.setTimeout(warmTess, 400)
    const t2 = window.setTimeout(warmMath, 1500)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    /** @type {null | (() => void)} */
    let cancelAuto = null
    ;(async () => {
      const repaired = repairBankFromBackups()
      if (repaired > 0) {
        if (!cancelled) {
          refresh()
          showBankMessage('success', `Restored ${repaired} question(s) from storage backup.`)
        }
        return
      }
      const recovered = await tryRecoverBankAsync()
      if (cancelled) return
      if (recovered.recovered) {
        refresh()
        showBankMessage(
          'success',
          `Recovered ${recovered.count} question(s) from ${recovered.source ?? 'backup'}.`,
        )
        return
      }

      if (peekUploadedQuestions().length > 0) return

      cancelAuto = autoImportFromLocalhostIfEmpty((result) => {
        if (result.count > 0) {
          refresh()
          showBankMessage(
            'success',
            `Automatically copied ${result.count} question(s) from localhost (${result.total} total in bank).`,
          )
        }
      })
    })()
    return () => {
      cancelled = true
      if (cancelAuto) cancelAuto()
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  useEffect(() => {
    pullBankIfLiveMode()
      .then((result) => {
        if (result?.serverCount > 0) {
          refresh()
          showBankMessage('success', `Loaded ${result.serverCount} question(s) from live server.`)
        }
      })
      .catch(() => {})
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  useEffect(() => {
    if (peekUploadedQuestions().length === 0) return
    const migrated = loadUploadedQuestions()
    if (migrated.length > 0) setSaved(migrated)
    // Seed durable IndexedDB copy so future localStorage wipes can restore.
    try {
      const raw = localStorage.getItem('testvantage-uploaded-questions')
      if (raw) {
        import('../utils/bankIdbStore.js')
          .then((m) => m.writeBankJsonToIdb(raw))
          .catch(() => {})
      }
    } catch {
      /* ignore */
    }
    slimStoredBankImages().then((result) => {
      if (result.savedBytes > 0) {
        refresh()
        showBankMessage(
          'success',
          `Compressed saved images — freed about ${formatImageSize(result.savedBytes)} of browser storage.`,
        )
      }
    })
    setTimeout(() => {
      void import('../utils/mathpixLocalPictures.js')
        .then((m) => m.keepAllStoredMathpixPicturesLocal())
        .catch(() => {})
    }, 5000)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return listenForLocalhostBankMerge(({ added, total, count }) => {
      refresh()
      showBankMessage(
        'success',
        `Copied ${count} question(s) from localhost (${added} new, ${total} total in bank).`,
      )
    })
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])
 

  useEffect(() => {
    const copyResult = consumeBankCopyResultBanner()
    if (copyResult === 'imported') {
      refresh()
      showBankMessage('success', 'Questions copied from localhost into this bank.')
    } else if (copyResult === 'empty') {
      showBankMessage(
        'error',
        'localhost:5173 also has 0 questions. Use Import backup JSON if you exported before, or re-upload.',
      )
 
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  useEffect(() => {
    const onFocus = () => {
      const peek = peekUploadedQuestions()
      if (!peek.length) {
        refresh()
        return
      }
      setSaved((prev) => {
        const signature = (list) =>
          list.map((row) => `${row.id}:${row.bankStatus ?? ''}`).sort().join('|')
        if (signature(prev) === signature(peek)) return prev
        return peek
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const viewingQuestion = useMemo(
    () =>
      viewingQuestionId
        ? saved.find((q) => String(q.id) === String(viewingQuestionId)) ?? null
        : null,
    [saved, viewingQuestionId],
 
  )

  const resolveCurrentStem = useCallback(
    () =>
      resolveStemInputForSave({
        qText,
        qType,
        extractedRaw,
        ocrRawText: ocrRawTextRef.current,
        questionImage,
 
        stemTextInImage,
        options }),
    [qText, qType, extractedRaw, questionImage, stemTextInImage, options],
  )

  const effectiveQText = useMemo(() => {
    const { stem } = resolveCurrentStem()
    const base = String(stem || qText || '').trim()
    if (!base) return base
    return stemForLivePreview(base, options)
  }, [resolveCurrentStem, qText, options])

  /** Keep paste box in sync with passage panel (editable LaTeX source for re-parse). */
 
  useEffect(() => {
    if (loading || !passageBundle?.subQuestions?.length) return
    const display = formatPassageBundleAsText(passageBundle)
    if (!display.trim()) return
    setExtractedRaw(display)
    if (!ocrRawTextRef.current?.trim()) ocrRawTextRef.current = display
  }, [passageBundle, loading])

  const syncQuestionTextFromRepair = useCallback(() => {
    if (!qText.trim()) return
    const repaired = stemForLivePreview(qText, options)
    if (repaired !== qText) setQText(repaired)
  }, [qText, options])

  useEffect(() => {
    if (loading || passageBundle || qText.trim()) return
    const filledOpts = (options ?? []).filter((o) => String(o ?? '').trim().length > 3).length
    if (filledOpts < 2) return
    const { stem, source } = resolveCurrentStem()
    if (!stem?.trim() || source === 'image_only' || stem.trim() === '(Image question)') return
    const live = stemForLivePreview(stem, options)
    if (live.trim()) setQText(live)
  }, [loading, passageBundle, qText, options, extractedRaw, resolveCurrentStem])

  useEffect(() => {
    if (loading || !qText.trim() || !stemNeedsSourceRepair(qText, options)) return
    syncQuestionTextFromRepair()
  }, [qText, options, extractedRaw, loading, syncQuestionTextFromRepair])

  /** Full-page upload used to crop stem + options A–D separately. */
  const splitCropSourceUrl = previewUrl || questionImage || null

  const openDiagramSplit = useCallback(() => {
    if (!splitCropSourceUrl) {
      showBankMessage('error', 'Upload a screenshot first, then split the graph.')
      return
    }
    setSplitCropMode('diagram')
    setSplitCropOpen(true)
  }, [splitCropSourceUrl, showBankMessage])

  const openFullSplit = useCallback(() => {
    if (!splitCropSourceUrl) {
      showBankMessage('error', 'Upload a screenshot first.')
      return
    }
    setSplitCropMode('full')
    setSplitCropOpen(true)
  }, [splitCropSourceUrl, showBankMessage])

  const applySplitCrops = useCallback(
    ({ questionImage: stemCrop, optionImages: optionCrops }) => {
      const passageText = passageDiagramCropTextRef.current?.trim()
      if (passageText && stemCrop && splitCropMode === 'diagram') {
        setPassageBundle((b) =>
          b?.passageText === passageText
            ? {
                ...b,
                passageImage: stemCrop,
                passageImageCrop: true }
            : b,
        )
        passageDiagramCropTextRef.current = ''
        setMessage({
          type: 'success',
          text: 'Passage diagram cropped — review the passage panel, then Save all.' })
        setSplitCropOpen(false)
        return
      }
      if (stemCrop) {
        setQuestionImage(stemCrop)
        setStemImageCrop(true)
        setStemTextInImage(splitCropMode !== 'diagram')
      }
      const crops = optionCrops ?? []
      if (crops.some(Boolean)) {
        if (splitCropMode === 'full' && crops.filter(Boolean).length >= 2) {
          manualOptionSplitRef.current = true
        }
        setOptionImages((prev) => {
          const next = [...prev]
          while (next.length < 4) next.push(null)
          crops.forEach((url, i) => {
            if (url) next[i] = url
          })
          return next.slice(0, 4)
        })
        setOptions((prev) => {
          const stem = qText.trim()
          const next = [...prev]
          while (next.length < 4) next.push('')
          crops.forEach((url, i) => {
            if (url) next[i] = ''
          })
          return applyGraphOptionPlaceholders(stem, next, crops)
        })
      }
      const nOpt = crops.filter(Boolean).length
      setMessage({
        type: 'success',
        text:
          splitCropMode === 'diagram' && stemCrop
            ? 'Diagram cropped — question text stays from OCR. Review preview, then Save.'
            : `Crops applied${stemCrop ? ' — question image' : ''}${nOpt ? ` — ${nOpt} option image(s)` : ''}.` })
      setSplitCropOpen(false)
    },
    [qText, splitCropMode],
  )

  const stemNeedsDiagram = useMemo(
    () => shouldAttemptDiagramAutoCrop(qText, extractedRaw, options, qType),
    [qText, extractedRaw, options, qType],
  )

  useEffect(() => {
    if (!splitCropSourceUrl) return
    if (uploadCropGuardRef.current) return
    const rawOcr = ocrRawTextRef.current?.trim() || extractedRaw.trim()
    const mcqLike =
      qType === 'single_correct' ||
      qType === 'multiple_correct' ||
      isMcqLikeFromOcr({ stem: qText, options, rawOcr, optionImages })
    if (!mcqLike) return
    if (loading) return
    if (optionImages.some((img) => !!img)) return
    if (!rawOcr || rawOcr.length < 24) return
    if (shouldSkipOptionsAutoCrop(qText, options, rawOcr)) return
    if (!shouldAttemptOptionsAutoCrop(qText, options, optionImages, rawOcr)) return
    // Only skip when this source already succeeded (or manual strip locked it).
    if (optionsAutoCropAttemptedRef.current === splitCropSourceUrl) return

    if (optionsAutoCropTimerRef.current) clearTimeout(optionsAutoCropTimerRef.current)
    optionsAutoCropTimerRef.current = setTimeout(() => {
      autoCropOptionsFromSource(splitCropSourceUrl, qText, options, {
        hasStemDiagram: !!stemImageCrop || stemNeedsDiagram,
        force: false,
        minFilled: 2 })
        .then(async (result) => {
          const n = result?.filled ?? 0
          const cropSource = result?.source ?? null
          if (n < 2) {
            showBankMessage(
              'info',
              'Graph options detected — auto-crop did not find A–D panels. Click **Auto-crop A–D** to retry (uses Cloud vision when ready).',
            )
            return
          }
          optionsAutoCropAttemptedRef.current = splitCropSourceUrl
          if (qType !== 'single_correct' && qType !== 'multiple_correct') {
            setQType('single_correct')
          }
          const fallback = await attemptUploadImageFallback({
            sourceUrl: splitCropSourceUrl,
            stem: cleanStemMergedOptionGarbage(qText),
            options,
            rawOcr,
            questionType: 'single_correct',
            optionImages,
            optionsAutoCropped: n,
            questionImage })
          if (!fallback.applied) {
            autoSaveAfterCropRef.current = n >= 2
            showBankMessage('success', formatOptionsAutoCropStatus(n, cropSource))
            return
          }
          setQText(fallback.stem ?? qText)
          setOptions(fallback.options ?? options)
          setOptionImages(fallback.optionImages ?? optionImages)
          if (fallback.questionImage) {
            setQuestionImage(fallback.questionImage)
            setStemImageCrop(!!fallback.stemImageCrop)
            setStemTextInImage(!!fallback.stemTextInImage)
          }
          setQType('single_correct')
          autoSaveAfterCropRef.current = true
          showBankMessage('success', fallback.message ?? 'Image fallback applied — saving…')
        })
        .catch(() => {})
    }, 350)

    return () => {
      if (optionsAutoCropTimerRef.current) clearTimeout(optionsAutoCropTimerRef.current)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    splitCropSourceUrl,
    qText,
    options,
    optionImages,
    extractedRaw,
    qType,
    loading,
    stemImageCrop,
    stemNeedsDiagram,
    questionImage,
    showBankMessage,
  ])

  useEffect(() => {
    if (!autoSaveAfterCropRef.current || loading || saving) return
    const metaErrors = validateQuestionMetadata(metadataDefaults())
    if (metaErrors.length) return
    autoSaveAfterCropRef.current = false
    const timer = window.setTimeout(() => {
      void saveSingle()
    }, 250)
    return () => window.clearTimeout(timer)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText, options, optionImages, questionImage, qType, loading, saving])

  /** Remove mistaken graph crops on text MCQs (e.g. f(x) odd/even — not graph options). */
  useEffect(() => {
    if (loading) return
    if (manualOptionSplitRef.current) return
    if (qType !== 'single_correct' && qType !== 'multiple_correct') return
    if (!optionImages.some((img) => !!img)) return
    const rawOcr = ocrRawTextRef.current?.trim() || extractedRaw.trim()
    if (
      countMcqAnswerSlots(qText, options, optionImages) >= 2 ||
      !shouldStripMistakenOptionCrops(qText, options, optionImages, rawOcr)
    ) {
      return
    }
    syncOptionImagesRef([null, null, null, null])
    setOptionImages([null, null, null, null])
    if (!rawOcr) return
    const recovered = recoverTextMcqFromFullOcr(qText, options, rawOcr, getOcrSourceFile())
    if (recovered.found >= 2 && recovered.stem?.trim()) {
 
      applySingleParseResult(
        {
          text: recovered.stem,
          options: recovered.options,
          optionsFound: recovered.found,
          complete: recovered.found >= 4 },
        rawOcr,
      )
    } else if (looksLikeMistakenCropStemTail(qText)) {
      setQText((prev) => stripMistakenCropLeakFromStem(prev))
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionImages, options, qText, extractedRaw, loading, qType])

  /** Diagram questions: preview only the cropped figure, never the full OCR screenshot. */
  const stemPreviewImage = useMemo(() => {
    const previewQ = {
      questionType: qType,
      questionImage,
      stemImageCrop,
      stemTextInImage,
      text: effectiveQText,
      options,
      optionImages }
    if (questionImage && shouldShowQuestionStemImage(previewQ)) return questionImage

    if (stemNeedsDiagram) return undefined
    if (shouldHideUploadScreenshotInStemPreview(effectiveQText, options, extractedRaw)) {
      return undefined
    }
    return previewUrl ?? undefined
  }, [questionImage, previewUrl, stemNeedsDiagram, qType, stemImageCrop, stemTextInImage, effectiveQText, options, optionImages, extractedRaw])

  const stemPreviewHideText = useMemo(() => {
    return shouldHideStemTextWithImage({
      questionImage: stemPreviewImage,
      stemTextInImage,
      stemImageCrop,
      text: effectiveQText })
  }, [stemPreviewImage, stemTextInImage, stemImageCrop, effectiveQText])

  /** Hide OCR source only when stem text + diagram are both settled (keeps crop tool available). */
  const hideOcrSourceScreenshot = useMemo(() => {
    if (passageBundle) return true
    if (previewUrl && stemNeedsDiagram && !questionImage) return false
    if (qText.trim() && questionImage && (stemImageCrop || stemNeedsDiagram)) return false
    if (qText.trim() && questionImage) return true
    if (qText.trim() && !stemNeedsDiagram) return true
    return (
      countRealMcqOptions(qText, options) >= 4 &&
      !stemNeedsDiagram &&
      Boolean(questionImage)
    )
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    passageBundle,
    previewUrl,
    qText,
    options,
 
    extractedRaw,
    questionImage,
    stemImageCrop,
    stemNeedsDiagram,
  ])


  // —— Hybrid (image + answer metadata, no OCR) ——
  const [hybridQuestionImage, setHybridQuestionImage] = useState(null)
  const [hybridQuestionImageName, setHybridQuestionImageName] = useState('')
  const [hybridOptionsMode, setHybridOptionsMode] = useState('single')
  const [hybridOptionsImage, setHybridOptionsImage] = useState(null)
  const [hybridOptionsImageName, setHybridOptionsImageName] = useState('')
  const [hybridOptionImages, setHybridOptionImages] = useState([null, null, null, null])
  const [hybridOptionImageNames, setHybridOptionImageNames] = useState(['', '', '', ''])
  const [hybridSolutionImage, setHybridSolutionImage] = useState(null)
  const [hybridSolutionImageName, setHybridSolutionImageName] = useState('')
  const [hybridSolutionUseText, setHybridSolutionUseText] = useState(null)
  const [hybridQText, setHybridQText] = useState('')
  const [hybridSolution, setHybridSolution] = useState('')

  const resetHybridForm = () => {
    setHybridQuestionImage(null)
    setHybridQuestionImageName('')
    setHybridOptionsImage(null)
    setHybridOptionsImageName('')
    setHybridOptionImages([null, null, null, null])
    setHybridOptionImageNames(['', '', '', ''])
    setHybridSolutionImage(null)
    setHybridSolutionImageName('')
    setHybridQText('')
    setHybridSolution('')
    setCorrectIndex(null)
    setCorrectIndices([])
    setCorrectInteger('')
    setCorrectNumerical('')
  }

  const hybridPayloadBytes = [
    hybridQuestionImage,
    hybridOptionsImage,
    ...hybridOptionImages,
 
    hybridSolutionImage,
  ]
    .filter(Boolean)
    .reduce((sum, url) => sum + estimateDataUrlBytes(url), 0)

  const clearUploadPreview = useCallback(() => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current)
      previewBlobRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  const patchImageQueueItem = useCallback((id, patch) => {
    if (!id) return
    setImageUploadQueue((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      imageUploadQueueRef.current = next
      return next
    })
  }, [])

  const resetSingleFormFields = useCallback(() => {
    setQText('')
    setSolution('')
    setAnswerSource('unknown')
    setSolutionSource('unknown')
    setOcrEngine('builtin')
    setExtractLowConfidence(false)
    setExtractCloudNote('')
    setFieldConfidence(null)
    setAiSuggestedMeta([])
    userLockedMetaRef.current = new Set()
    cloudLearningCaptureRef.current = null
    solutionAutofillGenRef.current += 1
    setCorrectIndex(null)
    setCorrectIndices([])
    setOptions(['', '', '', ''])
    setMatrixRows(['', '', '', ''])
    setMatrixCols(['', '', '', ''])
    setMatrixColCount(4)
    setMatrixUseOptions(false)
    setMatrixGridKey({})
    setMatrixColLabels(defaultMatrixColLabels(4))
    setOptionImages([null, null, null, null])
    setQuestionImage(null)
    setStemImageCrop(false)
    setStemTextInImage(false)
    setOptionStep(0)
    setExtractedRaw('')
    setParseStatus(null)
    setPassageBundle(null)
    ocrRawTextRef.current = ''
    clearUploadPreview()
    setSingleUploadFile(null)
  }, [clearUploadPreview])

  useEffect(() => {
    imageUploadQueueRef.current = imageUploadQueue
  }, [imageUploadQueue])

  useEffect(() => {
    activeImageQueueIdRef.current = activeImageQueueId
  }, [activeImageQueueId])

  /** Last OCR outcome for the active queue item (avoids React state race → false Error). */
  const imageQueueOcrMetaRef = useRef({
    lowConfidence: false,
    cloudNote: '',
    errorMessage: '',
  })

  const finalizeActiveImageQueueOcr = useCallback(
    (override = {}) => {
      const id = activeImageQueueIdRef.current
      if (!id) return
      const item = imageUploadQueueRef.current.find((q) => q.id === id)
      if (!item) return
      if (
        item.status !== 'processing' &&
        item.status !== 'error' &&
        item.status !== 'needs_review'
      ) {
        return
      }
      const meta = { ...imageQueueOcrMetaRef.current, ...override }
      const hasContent = !!(
        override.hasContent ||
        ocrRawTextRef.current?.trim() ||
        String(override.extractedRaw ?? '').trim() ||
        String(override.qText ?? '').trim() ||
        (Array.isArray(override.options) &&
          override.options.some((o) => String(o ?? '').trim()))
      )
      const next = resolveImageQueueOcrStatus({
        hasContent,
        lowConfidence: meta.lowConfidence,
        cloudNote: meta.cloudNote,
        errorMessage: meta.errorMessage,
      })
      patchImageQueueItem(id, {
        status: next.status,
        errorMessage: next.errorMessage,
      })
    },
    [patchImageQueueItem],
  )

  // When OCR finishes for the active queued image, mark ready / needs_review / error.
  // Use ocrRawTextRef so we do not mark Error before React state catches up with filled text.
  const imageQueueWasLoadingRef = useRef(false)
  useEffect(() => {
    if (loading) {
      imageQueueWasLoadingRef.current = true
      return
    }
    const id = activeImageQueueId
    if (!id || !imageQueueWasLoadingRef.current) {
      // Content arrived after a premature Error — upgrade to review.
      if (id && (extractedRaw.trim() || qText.trim() || ocrRawTextRef.current?.trim())) {
        const item = imageUploadQueueRef.current.find((q) => q.id === id)
        if (item?.status === 'error') {
          finalizeActiveImageQueueOcr({
            hasContent: true,
            extractedRaw,
            qText,
          })
        }
      }
      return
    }
    imageQueueWasLoadingRef.current = false
    finalizeActiveImageQueueOcr({ extractedRaw, qText })
  }, [loading, activeImageQueueId, extractedRaw, qText, finalizeActiveImageQueueOcr])

  useEffect(() => {
    return () => {
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current)
        previewBlobRef.current = null
      }
    }
  }, [])

  const loadPassageSetIntoForm = useCallback((set) => {
    const parent = set[0]
    if (!parent?.id) return false
    setEditingQuestionId(null)
    setViewingQuestionId(null)
    setTab('single')
    setSubject(parent.subject ?? 'mathematics')
    setSection(parent.section ?? '')
    setChapter(parent.chapter ?? '')
    setTopic(parent.topic ?? '')
    setExamIds(parent.examIds?.length ? [...parent.examIds] : examIds)
    setToughnessLevel(parent.toughnessLevel != null ? String(parent.toughnessLevel) : '')
    setSource(parent.source ?? '')
    setSolution(parent.solution ?? '')
    setVideoSolution(parent.videoSolution ?? '')
    const loadedSubs = set.map((sq) => {
        const opts = [...(sq.options ?? [])]
        while (opts.length < 4) opts.push('')
        return {
          id: sq.id,
          text: finalizeStemForBank(sq.text ?? '', sq.options ?? []),
          options: opts.slice(0, 4),
          correctIndex: sq.correctIndex != null ? sq.correctIndex : null,
          correctInteger: sq.correctInteger,
          correctNumerical: sq.correctNumerical,
          numericalTolerance: sq.numericalTolerance,
          answerMode:
            sq.correctNumerical != null && sq.correctInteger == null ? 'numerical' : 'integer' }
      })
    const loadedBundle = persistPassageBundleFields({
      passageText: parent.passageText ?? '',
      subQuestions: loadedSubs })
    Object.assign(loadedBundle, {
      editParentId: parent.id,
      passageImage: parent.passageImage ?? undefined,
      passageImageCrop: parent.passageImageCrop ?? false })
    setPassageBundle(loadedBundle)
    setQType(
      isPassageMetadataType(parent.questionType)
        ? parent.questionType
        : resolvePassageSetMetaType('single_correct', loadedBundle.subQuestions),
    )
    setQText('')
    setOptions(['', '', '', ''])
    setQuestionImage(null)
    setOptionImages([null, null, null, null])
    setExtractedRaw('')
    setSingleUploadFile(null)
    clearUploadPreview()
    setMessage({
      type: 'success',
      text: `Passage set loaded (${set.length} questions) — edit passage, stems, options, and answers above; metadata below applies to all.` })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return true
  }, [examIds, clearUploadPreview])

  const loadQuestionIntoForm = useCallback((q) => {
    setHubMode('upload')
    setUploadEditFocus('content')
    if (isPassageLinkedQuestion(q)) {
      const set = getPassageSetQuestions(q, saved)
      if (set?.length >= 2 && loadPassageSetIntoForm(set)) return
    }

    const type = q.questionType ?? 'single_correct'
    setPassageBundle(null)
    setEditingQuestionId(q.id)
    setViewingQuestionId(null)
    setSubject(q.subject ?? 'mathematics')
    setSection(q.section ?? '')
    setChapter(q.chapter ?? '')
    setTopic(q.topic ?? '')
    setExamIds(q.examIds?.length ? [...q.examIds] : examIds)
    setToughnessLevel(q.toughnessLevel != null ? String(q.toughnessLevel) : '')
    setSource(q.source ?? '')
    setSolution(q.solution ?? '')
    setVideoSolution(q.videoSolution ?? '')
    setQType(type)
    {
      const published = effectiveBankStatus(q) === 'published'
      setComposeStatus(published ? 'active' : 'needs_review')
      const m = q.marking ?? getQuestionType(type)?.defaultMarking
      if (m) {
        setComposeMarksCorrect(m.correct ?? 4)
        setComposeMarksWrong(m.wrong ?? -1)
      }
    }
    setCorrectIndex(
      type === 'true_false'
        ? (q.correctIndex ?? 0)
        : q.correctIndex != null && Number.isFinite(Number(q.correctIndex))
          ? Number(q.correctIndex)
          : null,
    )
    setCorrectIndices([...(q.correctIndices ?? [])])
    userLockedMetaRef.current = new Set(['subject', 'section', 'chapter', 'topic', 'toughnessLevel', 'examIds'].filter(
      (f) => {
        if (f === 'subject') return !!q.subject
        if (f === 'section') return !!q.section
        if (f === 'chapter') return !!q.chapter
        if (f === 'topic') return !!q.topic
        if (f === 'toughnessLevel') return q.toughnessLevel != null
        if (f === 'examIds') return !!(q.examIds?.length)
        return false
      },
    ))
    setAiSuggestedMeta([])
    setMsqMarking(q.msqMarking ? { ...q.msqMarking } : { ...DEFAULT_MSQ_MARKING })
    setCorrectInteger(q.correctInteger != null ? String(q.correctInteger) : '')
    setCorrectNumerical(q.correctNumerical != null ? String(q.correctNumerical) : '')
    if (type === 'matrix_match') {
      const mRows = (q.matrixRows ?? []).map((r, i) => {
        let s = trimRowColumnIIBleed(String(r ?? ''))
        if (i === 3) s = repairIncompleteRowD(s)
        return s
      })
      while (mRows.length < MATRIX_ROW_COUNT) mRows.push('')
      setMatrixRows(mRows.slice(0, MATRIX_ROW_COUNT))
      const mCols = [...(q.matrixCols ?? [])]
      const cc = inferMatrixColCount(q)
      setMatrixColCount(cc)
      while (mCols.length < 5) mCols.push('')
      setMatrixCols(mCols.slice(0, 5))
      setMatrixUseOptions(getMatrixResponseMode(q) === 'options')
      setMatrixGridKey(normalizeMatrixAnswerKey(q.matrixAnswerKey))
      setMatrixColLabels(normalizeMatrixColLabels(q.matrixColLabels, cc))
    } else {
      setMatrixRows(['', '', '', ''])
      setMatrixCols(['', '', '', ''])
      setMatrixColCount(4)
      setMatrixUseOptions(false)
      setMatrixGridKey({})
      setMatrixColLabels(defaultMatrixColLabels(4))
    }

    if (isHybridQuestion(q)) {
      setTab('hybrid')
      setHybridQText(q.text ?? '')
      setHybridSolution(q.solution ?? '')
      setHybridQuestionImage(q.questionImage ?? null)
      setHybridQuestionImageName(q.questionImage ? 'saved-question.png' : '')
      setHybridOptionsImage(q.optionsImage ?? null)
      setHybridOptionsImageName(q.optionsImage ? 'saved-options.png' : '')
      setHybridOptionImages(
        q.optionImages?.length
          ? [...q.optionImages, null, null, null, null].slice(0, 4)
          : [null, null, null, null],
      )
      setHybridOptionImageNames(
        [0, 1, 2, 3].map((i) =>
          q.optionImages?.[i] ? `option-${String.fromCharCode(65 + i)}.png` : '',
        ),
      )
      setHybridOptionsMode(q.optionImages?.filter(Boolean).length ? 'separate' : 'single')
      setHybridSolutionImage(q.solutionImage ?? null)
      setHybridSolutionImageName(q.solutionImage ? 'saved-solution.png' : '')
    } else {
      setTab('single')
      setQText(
        stemForLivePreview(finalizeStemForBank(q.text ?? '', q.options ?? []), q.options ?? []),
      )
      if (isTrueFalseQuestionType(type)) {
        setOptions([...TRUE_FALSE_OPTIONS])
        setOptionImages([null, null, null, null])
      } else {
        const opts = [...(q.options ?? [])]
        while (opts.length < 4) opts.push('')
        const padded = opts.slice(0, 6)
        while (padded.length < 4) padded.push('')
        const stem = q.text ?? ''
        const loadedOpts = sanitizeStoredOptions(
          applyGraphOptionPlaceholders(stem, padded, q.optionImages ?? []),
          q.optionImages ?? [],
          stem,
        )
        setOptions(loadedOpts)
        setOptionImages(
          shouldStripMistakenOptionCrops(stem, loadedOpts, q.optionImages ?? [])
            ? [null, null, null, null]
            : q.optionImages?.length
              ? [...q.optionImages, null, null, null, null].slice(0, 4)
              : [null, null, null, null],
        )
      }
      if (q.passageText) {
        setQuestionImage(q.passageImage ?? null)
      } else if (q.passageId) {
        setQuestionImage(null)
      } else {
        setQuestionImage(q.questionImage ?? null)
        setStemImageCrop(!!q.stemImageCrop)
        setStemTextInImage(q.stemTextInImage === true)
      }
      setExtractedRaw('')
      setSingleUploadFile(null)
      clearUploadPreview()
    }
    setFieldConfidence(restoreFieldConfidenceState(q))
    setMessage({
      type: 'success',
      text: 'Question loaded — edit stem, options, and answer below, then save.' })
    requestAnimationFrame(() => {
      contentEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [examIds, saved, loadPassageSetIntoForm, clearUploadPreview])

  const qidFromUrl = searchParams.get('qid')
  useEffect(() => {
    const id = String(qidFromUrl ?? '').trim()
    if (!id) return
    if (!saved.some((row) => String(row.id) === id)) return
    setHubMode((prev) => (prev === 'view' ? prev : 'view'))
    setViewingQuestionId((prev) => (String(prev) === id ? prev : id))
  }, [qidFromUrl, saved])

  const editFromUrl = searchParams.get('edit')
  const editHandledRef = useRef(null)
  useEffect(() => {
    const editId = String(editFromUrl ?? '').trim()
    if (!editId) {
      editHandledRef.current = null
      return
    }
    if (editHandledRef.current === editId) return
    const q = saved.find((row) => row.id === editId)
    if (!q) return
    editHandledRef.current = editId
    loadQuestionIntoForm(q)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('edit')
        return next
      },
      { replace: true },
    )
  }, [editFromUrl, saved, loadQuestionIntoForm, setSearchParams])

  const handleSymbolInsert = useCallback(
    (insert) => {
      if (activeField.type === 'solution' && solutionRef.current) {
        const el = solutionRef.current
        const base = solution
        const { value, cursor } = insertIntoField(
          base,
          insert,
          el.selectionStart ?? base.length,
          el.selectionEnd ?? base.length,
        )
        setSolution(value)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(cursor, cursor)
        })
        return
      }
      if (activeField.type === 'question' && questionRef.current) {
        const el = questionRef.current
        let base = qText
        if (!base.trim()) {
          const { stem } = resolveStemInputForSave({
            qText,
            qType,
            extractedRaw,
            ocrRawText: ocrRawTextRef.current,
            questionImage,
            stemTextInImage,
            options })
          if (stem?.trim() && stem !== '(Image question)') {
            base = finalizeStemForBank(normalizeQuestionStemText(stem), options)
            setQText(base)
          }
        }
        const { value, cursor } = insertIntoField(
          base,
          insert,
          el.selectionStart ?? base.length,
          el.selectionEnd ?? base.length,
        )
        setQText(value)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(cursor, cursor)
        })
        return
      }
      const i = activeField.index ?? 0
      const el = optionRefs.current[i]
      if (el) {
        const { value, cursor } = insertIntoField(
          options[i],
          insert,
          el.selectionStart ?? options[i].length,
          el.selectionEnd ?? options[i].length,
        )
        const next = [...options]
        next[i] = value
        setOptions(next)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(cursor, cursor)
        })
      }
    },
    [activeField, qText, options, solution, qType, extractedRaw, questionImage, stemTextInImage],
  )

  useEffect(() => {
    if (tab !== 'compose') {
      setComposeSimilarWarning('')
      return undefined
    }
    const stem = String(qText ?? '').trim()
    if (stem.length < 28) {
      setComposeSimilarWarning('')
      return undefined
    }
    const timer = window.setTimeout(() => {
      try {
        const matches = findComposeSimilarStems(stem, saved, {
          excludeId: editingQuestionId || undefined,
        })
        setComposeSimilarWarning(formatComposeSimilarWarning(matches))
      } catch {
        setComposeSimilarWarning('')
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [tab, qText, saved, editingQuestionId])

  const runComposeAssist = useCallback(
    async (mode) => {
      if (composeAssistBusy) return
      setComposeAssistBusy(true)
      setComposeAssistBadge('')
      try {
        if (mode === 'options') {
          const local = localPolishOptions(options)
          const joined = local.filter(Boolean).join('\n')
          const result = await runAiAssistWithFallback({
            task: 'compose-polish-options',
            context: {
              mode: 'polish_options',
              questionType: qType,
              stem: qText.slice(0, 1500),
              options: options.slice(0, 6),
            },
            localText: joined || localImproveStem(options.join('\n')),
            localDisclaimer: 'Local option polish — review before Save.',
            learningStem: qText.slice(0, 240),
          })
          const lines = String(result.text ?? '')
            .split(/\n+/)
            .map((l) => l.replace(/^\s*[A-D][\)\.\]]\s*/i, '').trim())
            .filter(Boolean)
          const next = [...options]
          for (let i = 0; i < Math.min(4, lines.length, next.length); i++) {
            if (lines[i]) next[i] = lines[i]
          }
          // Prefer local polish when cloud returned fewer lines than we have filled
          const localFilled = local.filter(Boolean).length
          const cloudFilled = lines.length
          setOptions(cloudFilled >= localFilled ? next.map((o, i) => o || local[i] || '') : local)
          setComposeAssistBadge(aiAssistBadgeLabel(result.provider))
          showBankMessage(
            'success',
            result.provider === 'cloud-vision'
              ? 'Options polished with Cloud AI — review A–D, then Save.'
              : 'Options polished locally — review A–D, then Save.',
          )
          return
        }

        const source = qText
        const localText =
          mode === 'latex' ? localSuggestLatex(source) : localImproveStem(source)
        const result = await runAiAssistWithFallback({
          task: mode === 'latex' ? 'compose-suggest-latex' : 'compose-improve-stem',
          context: {
            mode: mode === 'latex' ? 'suggest_latex' : 'improve_stem',
            questionType: qType,
            stem: source.slice(0, 4000),
            options: options.slice(0, 4),
          },
          localText,
          localDisclaimer: 'Local format — review math before Save.',
          learningStem: source.slice(0, 240),
        })
        const next = String(result.text ?? '').trim() || localText
        if (next) setQText(next)
        setComposeAssistBadge(aiAssistBadgeLabel(result.provider))
        showBankMessage(
          'success',
          result.provider === 'cloud-vision'
            ? mode === 'latex'
              ? 'LaTeX suggestions applied (Cloud) — review the stem preview.'
              : 'Stem improved (Cloud) — review the live preview, then Save.'
            : mode === 'latex'
              ? 'LaTeX suggestions applied locally — review the stem preview.'
              : 'Stem formatted locally — review the live preview, then Save.',
        )
      } catch (e) {
        showBankMessage(
          'error',
          e instanceof Error ? e.message : 'Assist failed — you can still edit and Save.',
        )
      } finally {
        setComposeAssistBusy(false)
      }
    },
    [composeAssistBusy, options, qText, qType],
  )

  const startComposePassageSet = useCallback(() => {
    const integerMode = qType === 'passage_integer'
    setPassageBundle(
      persistPassageBundleFields({
        passageText: '',
        subQuestions: [
          {
            label: 'Q1',
            text: '',
            options: integerMode ? ['', '', '', ''] : ['', '', '', ''],
            ...(integerMode
              ? { answerMode: 'integer', correctInteger: '' }
              : { correctIndex: 0 }),
          },
          {
            label: 'Q2',
            text: '',
            options: integerMode ? ['', '', '', ''] : ['', '', '', ''],
            ...(integerMode
              ? { answerMode: 'integer', correctInteger: '' }
              : { correctIndex: 0 }),
          },
        ],
      }),
    )
    if (!isPassageMetadataType(qType)) {
      setQType(integerMode ? 'passage_integer' : 'passage_scq')
    }
    showBankMessage(
      'info',
      'Passage set started — fill the shared passage and each sub-question, then Save all.',
    )
  }, [qType])

  const fixMathSymbols = () => {
    const norm = polishOcrText(extractedRaw || qText)
    setExtractedRaw(norm)
    const parsed = parseSingleQuestionUpload(norm, ocrRawTextRef.current || norm)
    if (!parsed.multi) {
      applySingleParseResult(parsed, norm)
      setOptions(polishParsedMcqOptions(norm || qText, parsed.options ?? options, norm))
    } else {
      reparseFromRaw(norm)
    }
    setMessage({ type: 'success', text: 'Math symbols normalized in question and options.' })
  }

  /**
   * Auto-crop graph options A–D from the uploaded screenshot (2×2, 1×4 horizontal, or four rows).
   * Prefers Cloud vision (Gemini) boxes, then local layout. Does not clear Correct answer.
   * @returns {Promise<{ filled: number, source: 'cloud-vision' | 'local' | null }>}
   */
  const autoCropOptionsFromSource = async (
    srcUrl,
    stem,
    optsList,
    { hasStemDiagram = false, force = false, minFilled = 2 } = {},
  ) => {
    const empty = /** @type {{ filled: number, source: null }} */ ({ filled: 0, source: null })
    if (!srcUrl?.trim()) return empty
    const rawOcr = ocrRawTextRef.current?.trim() || ''
    const blob = `${stem}\n${rawOcr}`
    // Typed A–D (prose/math continuity MCQs) — never auto-slice into option images.
    if (
      !force &&
      (blobHasTypedTextMcqOptions(blob) ||
        looksLikeContinuityDiscontinuityTextMcq(blob) ||
        looksLikeVerticalTextOptionsMcq(stem, optsList, rawOcr))
    ) {
      return empty
    }
    const graphLikely =
      force ||
      stemSaysOptionsAreFigures(stem) ||
      blobMentionsGraphOptions(`${stem}\n${rawOcr}`) ||
      countGraphOptionsNeedingImage(optsList, [null, null, null, null], stem) >= 1
    if (!graphLikely && shouldSkipOptionsAutoCrop(stem, optsList, rawOcr)) return empty
    const graphNeed = countGraphOptionsNeedingImage(optsList, [null, null, null, null], stem)

    const shouldTry =
      force ||
      graphNeed >= 1 ||
      stemSaysOptionsAreFigures(stem) ||
      shouldAttemptOptionsAutoCrop(stem, optsList, [], rawOcr)
    if (!shouldTry) return empty

    const stemLen = String(stem ?? '').length
    const excludeTop = hasStemDiagram
      ? 0.56
      : stemLen > 200
        ? 0.55
        : stemLikelyNeedsDiagramImage(stem)
          ? 0.52
          : 0.44
    const { crops, source } = await autoCropMcqOptionsWithMeta(srcUrl, {
      excludeTopRatio: excludeTop,
      excludeBottomRatio: 0.03,
      stemLength: stemLen,
      preferGraph: true,
      useVision: true })
    const filled = crops.filter(Boolean).length
    if (filled < minFilled) return empty
    // Never strip deliberate graph crops we just produced (empty/"Option A" slots + images).
    if (
      shouldStripMistakenOptionCrops(stem, optsList, crops, rawOcr) &&
      !stemSaysOptionsAreFigures(stem) &&
      !blobMentionsGraphOptions(`${stem}\n${rawOcr}`)
    ) {
      return empty
    }

    // Preserve correctIndex / correctIndices — only update option images + labels.
    const layout = classifyMcqImageLayout({
      stem,
      options: optsList,
      extractedRaw: rawOcr,
      optionImages: optionImagesRef.current,
    })
    const graphOnly =
      layout.kind === 'mixed_options'
        ? new Set(
            (layout.graphOptionIndexes?.length
              ? layout.graphOptionIndexes
              : [0, 1, 2, 3].filter((i) => !looksLikeRealOptionText(optsList?.[i]))),
          )
        : null
    const nextImgs = syncOptionImagesRef(
      (optionImagesRef.current ?? []).slice(0, 4).concat([null, null, null, null]).slice(0, 4),
    )
    crops.forEach((url, i) => {
      if (!url) return
      if (graphOnly && !graphOnly.has(i)) return
      if (graphOnly && looksLikeRealOptionText(optsList?.[i])) return
      // Never replace a filled typed option with a crop strip.
      if (looksLikeRealOptionText(optsList?.[i])) return
      nextImgs[i] = url
    })
    const appliedImgs = nextImgs.filter(Boolean).length
    if (appliedImgs < minFilled) return empty
    syncOptionImagesRef(nextImgs)
    setOptionImages([...nextImgs])
    setOptions((prev) => {
      const next = [...prev]
      while (next.length < 4) next.push('')
      crops.forEach((url, i) => {
        if (!url || (graphOnly && !graphOnly.has(i))) return
        if (graphOnly && looksLikeRealOptionText(next[i])) return
        if (looksLikeRealOptionText(next[i]) || looksLikeRealOptionText(optsList?.[i])) return
        if (url && nextImgs[i]) next[i] = IMAGE_OPTION_LABELS[i] ?? `Option ${String.fromCharCode(65 + i)}`
        else if (isGraphPlaceholderText(next[i])) next[i] = ''
      })
      return sanitizeStoredOptions(next, nextImgs, stem)
    })
    /** Drop full composite when A–D graph crops succeeded — keep text (+ optional stem-only). */
    if (
      shouldDropCompositeStemForOptionGraphs({
        stem,
        extractedRaw: rawOcr,
        optionImages: nextImgs,
        stemImageCrop,
        options: optsList,
      })
    ) {
      setQuestionImage(null)
      setStemImageCrop(false)
      setStemTextInImage(false)
    }
    return { filled: nextImgs.filter(Boolean).length, source }
  }

  const handleAutoCropOptions = async () => {
    if (!splitCropSourceUrl) {
      showBankMessage('error', 'Upload a screenshot first.')
      return
    }
    const raw = extractedRaw.trim() || ocrRawTextRef.current?.trim()
    const parsed = raw ? resolveMcqFieldsFromExtracted(raw) : null
    const stem = qText.trim() || parsed?.stem?.trim() || ''
    const optsList =
      (options ?? []).some((o) => String(o ?? '').trim()) ? options : (parsed?.options ?? options)
    // Manual click: allow graph crop even when OCR only saw (A)–(D) labels under figures.
    const graphLikely =
      stemSaysOptionsAreFigures(stem) ||
      blobMentionsGraphOptions(`${stem}\n${raw ?? ''}`) ||
      countGraphOptionsNeedingImage(optsList, optionImages, stem) >= 1
    if (shouldSkipOptionsAutoCrop(stem, optsList, raw) && !graphLikely) {
      const stripMistaken =
        shouldStripMistakenOptionCrops(stem, optsList, optionImages) && optionImages.some(Boolean)
      if (stripMistaken) {
        setOptionImages([null, null, null, null])
        const recovered = raw ? recoverTextMcqFromFullOcr(stem, optsList, raw) : null
        if (recovered?.found >= 2 && recovered.stem?.trim()) {
          applySingleParseResult(
            {
              text: recovered.stem,
              options: recovered.options,
              optionsFound: recovered.found,
              complete: recovered.found >= 4 },
            raw,
          )
        } else if (looksLikeMistakenCropStemTail(stem)) {
          setQText(stripMistakenCropLeakFromStem(stem))
        }
      }
      showBankMessage(
        'info',
        stripMistaken
          ? 'These are text options (not graphs). A–D text is filled from OCR — review and Save. Remove any wrong images with × on each row.'
          : optionImages.some(Boolean)
            ? 'Manual option crops kept — text options do not need auto-crop. Review A–D, then Save.'
            : 'These are text options (not graphs). A–D text is filled from OCR — review and Save.',
      )
      return
    }
    try {
      optionsAutoCropAttemptedRef.current = ''
      const { filled: n, source } = await autoCropOptionsFromSource(splitCropSourceUrl, stem, optsList, {
        hasStemDiagram: !!stemImageCrop || stemNeedsDiagram,
        force: true,
        minFilled: 1 })
      if (n >= 1) {
        optionsAutoCropAttemptedRef.current = splitCropSourceUrl
        showBankMessage('success', formatOptionsAutoCropStatus(n, source))
      } else {
        showBankMessage(
          'info',
          formatOptionsAutoCropStatus(0, null),
        )
        setSplitCropMode('full')
        requestAnimationFrame(() => setSplitCropOpen(true))
      }
    } catch (e) {
      showBankMessage(
        'error',
        e instanceof Error ? e.message : 'Option auto-crop failed.',
      )
    }
  }

  const refreshQuestionPreview = async () => {
    if (passageBundle?.subQuestions?.length) {
      setPassageBundle((b) =>
        b
          ? persistPassageBundleFields({
              ...b,
              subQuestions: b.subQuestions ?? [] })
          : b,
      )
      setExtractedRaw((prev) =>
        polishExtractedText(prev || ocrRawTextRef.current, ocrEngine || 'builtin'),
      )
      setMessage({
        type: 'success',
        text: 'Passage + sub-questions refreshed with LaTeX polish.' })
      return
    }
    const { stem: previewStem } = resolveCurrentStem()
    if (!previewStem?.trim()) {
      if (stemPreviewImage) {
        setMessage({
          type: 'info',
          text: 'Diagram is attached — paste or OCR question text above, then refresh again.' })
      } else {
        setMessage({ type: 'error', text: 'Enter question text first.' })
      }
      return
    }

    const polishEngine = ocrEngine === 'cloud-vision' || ocrEngine === 'mathpix' ? ocrEngine : 'builtin'
    const cleanedLive = stemForLivePreview(previewStem, options)
    const cleanedLooksGood =
      /\\begin\{cases\}/.test(cleanedLive) ||
      (cleanedLive.length >= 40 &&
        !/asgn\s*\(|Usxst|f\^0\s*<\s*x\s*<\s*l|bx\?/i.test(cleanedLive) &&
        /\$|\\frac|\\begin|\\operatorname|\\pi|e\^\{/.test(cleanedLive))

    // Prefer the already-cleaned editor stem — do NOT re-parse stale Local OCR garbage
    // from ocrRawTextRef when Convert / repairs already fixed the stem.
    if (cleanedLooksGood || String(qText ?? '').trim() === cleanedLive.trim()) {
      setQText(cleanedLive)
      if (extractedRaw.trim() || ocrRawTextRef.current?.trim()) {
        const src = extractedRaw.trim() || ocrRawTextRef.current
        // Keep paste box in sync with cleaned stem when OCR blob is still garbled
        if (/asgn\s*\(|Usxst|f\^0\s*<\s*x\s*<\s*l/i.test(src) && cleanedLooksGood) {
          setExtractedRaw(
            polishExtractedText(
              `${cleanedLive}\n${(options ?? [])
                .map((o, i) =>
                  String(o ?? '').trim()
                    ? `(${String.fromCharCode(65 + i)}) ${String(o).trim()}`
                    : '',
                )
                .filter(Boolean)
                .join('\n')}`,
              polishEngine,
            ),
          )
          ocrRawTextRef.current = cleanedLive
        } else {
          setExtractedRaw(polishExtractedText(src, polishEngine))
        }
      }
      setOptions((prev) =>
        prev.map((o) => (String(o ?? '').trim() ? normalizeQuestionStemText(String(o)) : o)),
      )
      setMessage({
        type: 'success',
        text: 'Preview refreshed — showing cleaned question stem.',
      })
      return
    }

    const raw = extractedRaw.trim() || ocrRawTextRef.current?.trim()
    if (raw) {
      const aiMcq = enhanceMcqFromOcr({
        stem: previewStem,
        options,
        rawOcr: raw,
        engine: polishEngine,
        questionType: qType })
      if (aiMcq.improved || aiMcq.found > countRealMcqOptions(previewStem, options)) {
        applySingleParseResult(
          { text: aiMcq.stem, options: aiMcq.options, optionsFound: aiMcq.found },
          raw,
        )
        setOptionImages((prev) =>
          shouldStripMistakenOptionCrops(aiMcq.stem, aiMcq.options, prev, raw)
            ? [null, null, null, null]
            : prev,
        )
        setMessage({
          type: 'success',
          text: `Preview refreshed — AI repaired ${aiMcq.found}/4 options from OCR.` })
        return
      }
      const reparsed = parseSingleQuestionUpload(
        polishExtractedText(raw, polishEngine),
        raw,
      )
      if (!reparsed.multi && reparsed.text?.trim()) {
        applySingleParseResult(reparsed, raw)
        if (looksLikeF0MoebiusFunctionalMcq(`${reparsed.text ?? ''}\n${raw}`)) {
          setOptionImages([null, null, null, null])
        }
        setMessage({ type: 'success', text: 'Preview refreshed — question re-parsed from OCR.' })
        return
      }
    }
    const polishedStem = polishExtractedText(previewStem, polishEngine)
    if (!qText.trim()) {
      setQText(finalizeStemForBank(normalizeQuestionStemText(polishedStem), options))
    }
    setQText((prev) =>
      finalizeStemForBank(
        normalizeQuestionStemText(polishExtractedText(prev || polishedStem, polishEngine)),
        options,
      ),
    )
    if (extractedRaw.trim() || ocrRawTextRef.current?.trim()) {
      setExtractedRaw(
        polishExtractedText(extractedRaw || ocrRawTextRef.current, polishEngine),
      )
    }
    setOptions((prev) =>
      prev.map((o) => (String(o ?? '').trim() ? normalizeQuestionStemText(String(o)) : o)),
    )
    const stemNorm = normalizeQuestionStemText(qText)
    const mcqCount = countRealMcqOptions(stemNorm, options)
    if (questionNeedsFigure(stemNorm, extractedRaw)) {
      const srcFile = getOcrSourceFile()
      let srcUrl = questionImage
      if (srcFile && isImageFile(srcFile) && !isPdfFile(srcFile)) {
        try {
          srcUrl = await compressImageFile(srcFile)
        } catch {
          /* keep current */
        }
      }
      if (srcUrl) {
        const crop = await cropDiagramFromImageSource(srcUrl, {
          mcqOptionCount: mcqCount,
          questionType: qType,
          stem: stemNorm })
        if (crop) {
          setQuestionImage(crop.url)
          setStemImageCrop(true)
          setStemTextInImage(false)
          setMessage({ type: 'success', text: 'Preview refreshed — diagram re-cropped.' })
          return
        }
      }
    }
    setMessage({ type: 'success', text: 'Preview refreshed.' })
  }

  const applyParsedQuestionToSingle = (item, rawContext = '') => {
    let work = item
    const ctx = String(rawContext || extractedRaw || ocrRawTextRef.current || '').trim()
    if (ctx && looksLikeZ5ImaginaryRootsExpDeterminantMcq(ctx)) {
      const fixed = repairZ5ImaginaryRootsExpDeterminantMcqParse({
        text: work.text,
        options: work.options,
        _ocrSource: ctx })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options }
    }
    if (ctx && looksLikeSurjectiveNotInjectiveMcq(ctx)) {
      const fixed = repairSurjectiveNotInjectiveMcqParse({
        text: work.text,
        options: work.options,
        _ocrSource: ctx })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options }
    }
    if (ctx && looksLikeFRplusPowFunctionMcq(ctx)) {
      const fixed = repairFRplusPowFunctionMcqParse({
        text: work.text,
        options: work.options,
        _ocrSource: ctx })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options }
    }
    if (ctx && looksLikeFxPlusOneTimesEightMcq(ctx)) {
      const fixed = repairFxPlusOneTimesEightMcqParse({
        text: work.text,
        options: work.options,
        _ocrSource: ctx })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options }
    }
    if (
      ctx &&
      looksLikeLimitGxQuestion(ctx) &&
      (!hasGoodLimitGxStem(String(work.text ?? '')) ||
        (work.options ?? []).filter((o) => String(o ?? '').trim()).length < 4)
    ) {
      const reparsed = parseSingleQuestionUpload(polishOcrText(ctx), ctx)
      if (!reparsed.multi && reparsed.text?.trim()) {
        work = {
          ...work,
          text: reparsed.text,
          options: reparsed.options,
          optionsFound: reparsed.optionsFound,
          complete: reparsed.complete,
          suggestedQuestionType: reparsed.suggestedQuestionType ?? work.suggestedQuestionType }
      }
    }
    if (ctx && looksLikeDomainGreatestIntegerMcq(ctx)) {
      const fixed = repairDomainGreatestIntegerMcqParse({
        text: stripMistakenCropLeakFromStem(work.text),
        options: work.options,
        _ocrSource: ctx,
        sourceFile: getOcrSourceFile() })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options,
        optionsFound: fixed.optionsFound }
    }
    if (ctx && looksLikeF0MoebiusFunctionalMcq(ctx)) {
      const fixed = repairF0MoebiusFunctionalMcqParse({
        text: work.text,
        options: work.options,
        _ocrSource: ctx })
      work = {
        ...work,
        text: fixed.text,
        options: fixed.options,
        optionsFound: fixed.optionsFound,
        complete: fixed.complete }
      setOptionImages([null, null, null, null])
    }
    const opts = [...(work.options?.length ? work.options : ['', '', '', ''])]
    while (opts.length < 4) opts.push('')
    const polishEngine =
      ocrEngine === 'cloud-vision' || ocrEngine === 'mathpix' ? ocrEngine : 'builtin'
    const polishedCtx = ctx ? polishExtractedText(ctx, polishEngine) : ''
    const resolved = ctx ? resolveMcqFromOcr(ctx) : { stem: '' }
    const workStem = String(work.text ?? '').trim()
    const preferLightStem =
      hasGoodLimitGxStem(workStem) ||
      polishEngine === 'cloud-vision' ||
      polishEngine === 'mathpix' ||
      stemLooksHighQualityLatex(workStem) ||
      /\\begin\{cases\}/.test(workStem)
    const stemFallback = workStem || resolved.stem?.trim() || polishedCtx || ctx
    const stemSource = preferLightStem
      ? polishEngine === 'cloud-vision' || stemLooksHighQualityLatex(workStem) || /\\begin\{cases\}/.test(workStem)
        ? polishCloudVisionText(stemFallback)
        : polishExtractedText(stemFallback, polishEngine)
      : polishOcrText(stemFallback)
    const stemNormalized = preferLightStem
      ? String(stemSource).trim() || workStem
      : normalizeQuestionStemText(stemSource)
    const stem = stemForLivePreview(finalizeStemForBank(stemNormalized, opts), opts)
    setQText(stem)
    const polished = polishParsedMcqOptions(
      stem,
      fillMissingVectorMsqOptions(stem, opts),
      ctx,
    )
    const effectiveOptionImages = getEffectiveOptionImages()
    const withGraph = sanitizeStoredOptions(
      applyGraphOptionPlaceholders(stem, polished, effectiveOptionImages),
      effectiveOptionImages,
      stem,
    )
    setOptions(withGraph)
    const stripRaw = String(rawContext ?? ocrRawTextRef.current ?? extractedRaw ?? '').trim()
    if (
      countMcqAnswerSlots(stem, withGraph, effectiveOptionImages) < 2 &&
      shouldStripMistakenOptionCrops(stem, withGraph, effectiveOptionImages, stripRaw)
    ) {
      syncOptionImagesRef([null, null, null, null])
      setOptionImages([null, null, null, null])
      if (splitCropSourceUrl) optionsAutoCropAttemptedRef.current = splitCropSourceUrl
      if (stripRaw) {
        const recovered = recoverTextMcqFromFullOcr(stem, withGraph, stripRaw, getOcrSourceFile())
        if (recovered.found >= 2 && recovered.stem?.trim()) {
          const cleanStem = stemForLivePreview(
            finalizeStemForBank(recovered.stem, recovered.options),
            recovered.options,
          )
          const cleanOpts = sanitizeStoredOptions(recovered.options, [null, null, null, null], cleanStem)
          setQText(cleanStem)
          setOptions(cleanOpts)
        } else if (looksLikeMistakenCropStemTail(stem)) {
          setQText(stripMistakenCropLeakFromStem(stem))
        }
      }
    }
    const repairedMcqReady =
      /\\begin\{vmatrix\}/.test(stem) &&
      withGraph.filter((o) => String(o ?? '').trim()).length >= 4
    const textOnlyStemReady =
      countRealMcqOptions(stem, withGraph) >= 4 ||
      repairedMcqReady ||
      shouldHideUploadScreenshotInStemPreview(stem, withGraph, ctx)
    if (
      textOnlyStemReady &&
      !stemLikelyNeedsDiagramImage(stem, ctx, { questionType: qType }) &&
      qType !== 'integer' &&
      qType !== 'numerical' &&
      !stemImageCrop
    ) {
      setQuestionImage(null)
      setStemImageCrop(false)
    }
    const graphNeed = countGraphOptionsNeedingImage(withGraph, optionImages, stem)
    if (graphNeed > 0) {
      setMessage({
        type: 'info',
        text: `${graphNeed} option(s) look like graphs — auto-cropping A–D (Cloud vision when ready)…` })
    }
    if (repairedMcqReady || countRealMcqOptions(stem, withGraph) >= 4) {
      setExtractedRaw(formatMcqExtractBlock(stem, withGraph))
    } else if (polishedCtx.trim()) {
      setExtractedRaw(polishedCtx)
    } else if (stem) {
      setExtractedRaw(formatMcqExtractBlock(stem, withGraph))
    }
    if (item.correctIndices?.length) {
      setQType((prev) => (isFixedAnswerQuestionType(prev) ? prev : 'multiple_correct'))
      setCorrectIndices(item.correctIndices)
    } else if (item.correctIndex != null) {
      setQType((prev) => (isFixedAnswerQuestionType(prev) ? prev : 'single_correct'))
      setCorrectIndex(item.correctIndex)
    } else {
      // Do not leave stale "A" selected when OCR/cloud did not find an answer
      setCorrectIndex(null)
      setCorrectIndices([])
    }
    if (item.correctInteger != null) {
      setQType((prev) => (isFixedAnswerQuestionType(prev) ? prev : 'integer'))
      setCorrectInteger(String(item.correctInteger))
    }
    if (item.correctNumerical != null) {
      setQType((prev) => (isFixedAnswerQuestionType(prev) ? prev : 'numerical'))
      setCorrectNumerical(String(item.correctNumerical))
    }
    if (item.solution) setSolution(item.solution)
    const nextAnswerSource =
      item.answerSource ||
      (item.correctIndex != null || item.correctIndices?.length || item.correctInteger != null
        ? 'from_paper'
        : 'unknown')
    const nextSolutionSource = item.solutionSource || (item.solution ? 'from_paper' : 'unknown')
    setAnswerSource(nextAnswerSource)
    setSolutionSource(nextSolutionSource)
    setFieldConfidence(
      scoreUploadFieldConfidence({
        text: stem,
        options: withGraph,
        correctIndex: item.correctIndex,
        correctIndices: item.correctIndices,
        correctInteger: item.correctInteger,
        correctNumerical: item.correctNumerical,
        solution: item.solution || '',
        answerSource: nextAnswerSource,
        answerConfidence: item.answerConfidence,
        solutionConfidence: item.solutionConfidence,
        uploadQualityScore: aiUploadReport?.confidence,
        _ocrSource: ocrRawTextRef.current || extractedRaw || '',
      }),
    )

    // Auto-detect metadata the OCR / parser didn't already supply. Explicit
    // item values always win; auto-detection only fills the gaps so the user
    // can still override anything in the form before saving.
    const auto = autoClassifyQuestion({
      text: stem,
      options: withGraph,
      questionType: item.correctIndices?.length ? 'multiple_correct' : qType,
      allowedSubjects: getSubjectsForExams(examIds).map((s) => s.id) })

    const suggested = []
    const locked = userLockedMetaRef.current
    const effectiveSubject = item.subject || (!locked.has('subject') ? auto.subject : null) || subject
    if (item.subject) setSubject(item.subject)
    else if (auto.subject && !locked.has('subject') && (!subject || aiSuggestedMeta.includes('subject') || subject === 'mathematics')) {
      setSubject(auto.subject)
      suggested.push('subject')
    }

    const haveItemHierarchy = item.section || item.chapter || item.topic
    if (haveItemHierarchy) {
      const resolved = resolveQuestionHierarchy(
        effectiveSubject,
        item.section,
        item.chapter,
        item.topic,
      )
      if (resolved.section && !locked.has('section')) setSection(resolved.section)
      if (resolved.chapter && !locked.has('chapter')) setChapter(resolved.chapter)
      if (resolved.topic && !locked.has('topic')) setTopic(resolved.topic)
    } else if (auto.chapter && !locked.has('chapter')) {
      if (auto.section && !locked.has('section')) {
        setSection(auto.section)
        suggested.push('section')
      }
      setChapter(auto.chapter)
      suggested.push('chapter')
      if (auto.topic && !locked.has('topic')) {
        setTopic(auto.topic)
        suggested.push('topic')
      }
    }

    if (item.toughnessLevel != null && item.toughnessLevel !== '') {
      setToughnessLevel(Number(item.toughnessLevel))
    } else if (auto.toughnessLevel && !locked.has('toughnessLevel')) {
      setToughnessLevel(auto.toughnessLevel)
      suggested.push('toughnessLevel')
    }

    if (Array.isArray(item.examIds) && item.examIds.length) {
      if (!locked.has('examIds')) setExamIds(item.examIds)
      if (item.aiSuggestedMeta?.includes?.('examIds')) suggested.push('examIds')
    } else if (Array.isArray(item.aiSuggestedMeta) && item.examIds?.length && !locked.has('examIds')) {
      setExamIds(item.examIds)
    }

    const fromItem = Array.isArray(item.aiSuggestedMeta) ? item.aiSuggestedMeta : []
    setAiSuggestedMeta([...new Set([...fromItem, ...suggested])].filter((f) => !locked.has(f)))

    // Fill Solution field (and optionally answer) via local draft + Cloud solve when available
    const needsSolution = !String(item.solution ?? '').trim() || String(item.solution).trim().length < 60
    const hasOpts = withGraph.filter((o) => String(o ?? '').trim()).length >= 2
    if (needsSolution && (hasOpts || item.correctInteger != null || item.correctNumerical != null)) {
      const gen = ++solutionAutofillGenRef.current
      void (async () => {
        try {
          const deep = await autofillSolutionAfterUpload(
            {
              text: stem,
              options: withGraph,
              correctIndex: item.correctIndex,
              correctIndices: item.correctIndices,
              correctInteger: item.correctInteger,
              correctNumerical: item.correctNumerical,
              answerSource: nextAnswerSource,
              solution: item.solution,
              questionType: qType,
            },
            {
              preferCloud: true,
              solveCloud: solveWithCloudVisionClient,
            },
          )
          if (gen !== solutionAutofillGenRef.current) return
          if (deep.solution) {
            setSolution(deep.solution)
            setSolutionSource(deep.solutionSource || 'draft')
          }
          if (
            item.correctIndex == null &&
            !(item.correctIndices?.length) &&
            deep.correctIndex != null &&
            String(withGraph[deep.correctIndex] ?? '').trim()
          ) {
            setCorrectIndex(deep.correctIndex)
            setAnswerSource('ai_generated')
          }
        } catch {
          /* keep form usable without cloud */
        }
      })()
    }
  }

  const applySingleParseResult = (parsed, fallbackRaw = '') => {
    uploadParseAppliedRef.current = true
    setPassageBundle(null)
    const resolved = runGuardedUploadStep(
      'resolve-mcq-apply',
      () => resolveMcqFromOcr(fallbackRaw || ocrRawTextRef.current || extractedRaw || ''),
      { stem: '', options: ['', '', '', ''], found: 0 },
    ) || { stem: '', options: ['', '', '', ''], found: 0 }
    const enriched = runGuardedUploadStep(
      'enrich-upload-meta',
      () =>
        enrichUploadWithMetaAndAnswer(
          {
            ...parsed,
            text:
              parsed.text?.trim() ||
              resolved.stem?.trim() ||
              (fallbackRaw.trim() ? fallbackRaw.trim().slice(0, 2000) : ''),
          },
          fallbackRaw || ocrRawTextRef.current || '',
          {
            examIds,
            prevAiSuggestedMeta: aiSuggestedMeta,
            userLockedMeta: [...userLockedMetaRef.current],
            currentMeta: {
              subject,
              section,
              chapter,
              topic,
              toughnessLevel: toughnessLevel !== '' ? Number(toughnessLevel) : null,
              examIds,
            },
          },
        ),
      parsed,
    ) || parsed
    const text = String(enriched.text ?? '').trim()
    // A fresh upload that parsed real A–D options is an MCQ — never keep a stale
    // integer/numerical/matrix type left over from a previously edited question.
  const hasMcqOptions = countRealMcqOptions(text, enriched.options) >= 2
  const blob = `${text}\n${fallbackRaw}`
  const inferredType = inferUploadQuestionType({
    suggestedQuestionType: enriched.suggestedQuestionType ?? parsed.suggestedQuestionType,
    found: enriched.optionsFound ?? parsed.optionsFound ?? countRealMcqOptions(text, enriched.options),
    stem: text,
    options: enriched.options ?? parsed.options,
    rawOcr: fallbackRaw })
  setQType((prev) => {
    if (looksLikeMatchColumnUpload(blob) && !hasMcqOptions) return 'matrix_match'
    if (isPassageMetadataType(prev)) return prev
    if (inferredType === 'integer' && looksLikeDeterminantMcq(blob)) return 'single_correct'
    if (inferredType === 'integer' && isMcqLikeFromOcr({ stem: text, options: enriched.options, rawOcr: fallbackRaw })) {
      return 'single_correct'
    }
    return inferredType
  })
    if (hasMcqOptions) {
      // Clear stale fixed-answer values so they don't get saved on an MCQ.
      setCorrectInteger('')
      setCorrectNumerical('')
    }
    const correctIndices =
      enriched.suggestedCorrectIndices?.length
        ? enriched.suggestedCorrectIndices
        : enriched.correctIndices
    applyParsedQuestionToSingle(
      {
        text,
        options: enriched.options ?? parsed.options,
        correctIndex: enriched.correctIndex,
        correctIndices,
        correctInteger: enriched.correctInteger,
        correctNumerical: enriched.correctNumerical,
        solution: enriched.solution,
        answerSource: enriched.answerSource,
        solutionSource: enriched.solutionSource,
        answerConfidence: enriched.answerConfidence,
        solutionConfidence: enriched.solutionConfidence,
        subject: enriched.subject,
        section: enriched.section,
        chapter: enriched.chapter,
        topic: enriched.topic,
        examIds: enriched.examIds,
        toughnessLevel: enriched.toughnessLevel,
        aiSuggestedMeta: enriched.aiSuggestedMeta,
      },
      fallbackRaw,
    )
    const status = {
      stem: text,
      options: enriched.options ?? [],
      found: countRealMcqOptions(text, enriched.options ?? parsed.options),
      complete: !!enriched.complete || !!parsed.complete,
      mode: 'single',
      total: 1,
      suggestedCorrectIndices: enriched.suggestedCorrectIndices ?? parsed.suggestedCorrectIndices,
      suggestedQuestionType: enriched.suggestedQuestionType ?? parsed.suggestedQuestionType }
    setParseStatus(status)
    return status
  }

  const hasPassageSplitSource = useMemo(
    () =>
      !!(
        ocrRawTextRef.current?.trim() ||
        extractedRaw.trim() ||
        qText.trim()
      ),
    [extractedRaw, qText],
  )

  const splitPassageFromExtracted = () => {
    const { raw, normalized: normBase } = pickPassageSplitSource(
      ocrRawTextRef.current,
      extractedRaw,
      qText,
    )
    if (!raw) {
      showBankMessage(
        'error',
        'Paste OCR text in the box above, or upload an image and click Convert image → text first.',
      )
      return false
    }
    const normalized = normalizeMathText(normBase)
    ocrRawTextRef.current = raw
    if (!extractedRaw.trim() || extractedRaw.length < raw.length * 0.85) {
      setExtractedRaw(normalized)
    }
    setTab('single')
    const count = tryApplyPassageBundle(raw, normalized, { allowOptionless: true })
    if (count >= 2) {
      const parsed = resolvePassageUpload(raw, normalized, { allowOptionless: true })
      const passageText = trimPassageBodyText(
        normalizeMathText(parsed?.passageText ?? ''),
      )
      const src = getOcrSourceFile()
      if (src && passageText) {
        schedulePassageDiagramFromUpload(src, passageText)
      }
      showBankMessage(
        passageNeedsOptionsRef.current ? 'info' : 'success',
        passageNeedsOptionsRef.current
          ? `Passage + ${count} questions split. Enter each correct integer (0–9999) in the passage panel above, then Save all.`
          : `Passage + ${count} questions split. Review the passage panel above.`,
      )
      return true
    }
    showBankMessage(
      'error',
      looksLikePassageMultiMcq(raw)
        ? 'Could not split this passage. Put ↵ before each sub-question (e.g. before "Let r, s, t…" and "Let P(x)…", "If Distance…", or "Partial pressure of…"), then click Split passage again.'
        : 'Could not split — need a passage plus 2+ sub-questions (e.g. "Answer the following questions" then "Let…" / "If…" integer stems, or "Value of…" MCQs).',
    )
    return false
  }

  const passagePanelRef = useRef(null)
  const matrixFormRef = useRef(null)

  const resolveMatrixFromAllOcr = useCallback(() => {
    const raw = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
    const extra = ocrSupplementTextRef.current ? [ocrSupplementTextRef.current] : []
    return resolveMatchColumnUpload(raw, extractedRaw, extra)
  }, [extractedRaw])

  const applyMatrixSupplementParsed = useCallback((parsed, { source = 'backup OCR' } = {}) => {
    if (!parsed) return 0
    setQType('matrix_match')
    const rawOcr = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
    const normalized = parsed.matrixRows.map((r, i) => {
      const stem = i === 3 ? repairIncompleteRowD(r, rawOcr) : r
      return normalizeMatrixItemText(stem)
    })
    setMatrixRows(matrixRowsForUi(normalized, rawOcr))
    const parsedCols = parsed.matrixCols.map((c) => normalizeMatrixItemText(c))
    const applied = applyParsedMatrixCols(matrixCols, parsedCols, { keepCurrentIfSparse: true })
    setMatrixCols(applied.cols)
    setMatrixColCount(applied.colCount)
    setMatrixColLabels(normalizeMatrixColLabels(parsed.matrixColLabels, applied.colCount))
    const n = countFilledMatrixRowsNormalized(parsed)
    setMessage({
      type: 'success',
      text:
        n >= 4
          ? `All 4 Column-I rows filled (${source}). Tick the answer grid, then Save.`
          : `Column-I updated (${n}/4 rows). Review row C, then Save.` })
    return n
  }, [extractedRaw, matrixCols])

  const supplementMatrixRows = useCallback(async ({ force = false } = {}) => {
    if (!force && matrixSupplementAttemptedRef.current) return false
    const file = getOcrSourceFile()
    if (!file || !isImageFile(file) || isPdfFile(file)) return false
    matrixSupplementAttemptedRef.current = true
    const gen = ++matrixSupplementGenRef.current
    const raw = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
    const extra = ocrSupplementTextRef.current ? [ocrSupplementTextRef.current] : []
    const current = resolveMatchColumnUpload(raw, extractedRaw, extra)

    setMessage({ type: '', text: 'Match the Column — recovering row C from cached OCR…' })
    const cached = supplementMatrixRowsFromCachedOcr(raw, current)
    if (cached) {
      const cachedRows = countFilledMatrixRowsNormalized(cached)
      if (gen === matrixSupplementGenRef.current && cachedRows >= 4) {
        return applyMatrixSupplementParsed(cached, { source: 'cached OCR' }) >= 4
      }
    }

    setMessage({ type: '', text: 'Match the Column — fast crop OCR for row C…' })
    try {
      const text = await extractMatrixRowSupplementOcr(file)
      if (gen !== matrixSupplementGenRef.current || !text?.trim()) {
        if (cached && gen === matrixSupplementGenRef.current) {
          return applyMatrixSupplementParsed(cached, { source: 'cached OCR' }) >= 4
        }
        return false
      }
      ocrSupplementTextRef.current = text.replace(/\r\n/g, '\n').trim()
      const parsed = resolveMatchColumnUpload(raw, extractedRaw, [ocrSupplementTextRef.current])
      const merged =
        cached && parsed ? mergeMatrixParse(cached, parsed) : parsed ?? cached
      if (!merged) return false
      return applyMatrixSupplementParsed(merged, { source: 'backup OCR' }) >= 4
    } catch (e) {
      console.warn('[matrix supplement OCR]', e)
      if (cached && gen === matrixSupplementGenRef.current) {
        return applyMatrixSupplementParsed(cached, { source: 'cached OCR' }) >= 4
      }
      return false
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyMatrixSupplementParsed, extractedRaw])

  const applyMatrixParse = useCallback((parsed, { scroll = false } = {}) => {
    if (!parsed) return false
    const rawOcr = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
    const normalized = parsed.matrixRows.map((r, i) => {
      const stem = i === 3 ? repairIncompleteRowD(r, rawOcr) : r
      return normalizeMatrixItemText(stem)
    })
    setMatrixRows(matrixRowsForUi(normalized, rawOcr))
    const parsedCols = parsed.matrixCols.map((c) => normalizeMatrixItemText(c))
    const applied = applyParsedMatrixCols(matrixCols, parsedCols)
    setMatrixCols(applied.cols)
    setMatrixColCount(applied.colCount)
    setMatrixColLabels(normalizeMatrixColLabels(parsed.matrixColLabels, applied.colCount))
    if (parsed.matrixAnswerKey && Object.keys(parsed.matrixAnswerKey).length) {
      setMatrixGridKey(normalizeMatrixAnswerKey(parsed.matrixAnswerKey))
    }
    const q = qText.trim()
    const stemLooksLikeMatrixOcr =
      /Column\s*[-–]?\s*I\b/i.test(q) ||
      (/\(\s*A\s*\)/.test(q) && /\(\s*B\s*\)/.test(q) && q.length > 80)
    if (!q || /match\s+(?:the\s+)?column/i.test(q) || stemLooksLikeMatrixOcr) {
      setQText(finalizeStemForBank(normalizeMathText(parsed.stem), options))
    }
    if (scroll) {
      requestAnimationFrame(() => {
        matrixFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    return true
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText, matrixCols])

  useEffect(() => {
    if (qType !== 'matrix_match') return
    const raw = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
    if (!raw) return
    const rowHits = (raw.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
    const colHits = (raw.match(/\(\s*[P-T]\s*\)/gi) ?? []).length
    const matrixLike =
      looksLikeMatchColumnUpload(raw) ||
      (rowHits >= 3 && colHits >= 2 && /Column\s*[-–]?\s*I|quadratic|match/i.test(raw))
    if (!matrixLike) return
    const parsed = resolveMatrixFromAllOcr()
    if (!parsed) return
    applyMatrixParse(parsed)
    if (
      countFilledMatrixRowsNormalized(parsed) < 4 &&
      getOcrSourceFile() &&
      isImageFile(getOcrSourceFile())
    ) {
      supplementMatrixRows()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-parse matrix when OCR/type changes
  }, [qType, extractedRaw])

  useEffect(() => {
    if (qType !== 'matrix_match') return
    const rawOcr = ocrRawTextRef.current || extractedRaw
    const fixed = matrixRowsForUi(matrixRows, rawOcr)
    if (fixed[3] === matrixRows[3]) return
    if (fixed[3].length <= String(matrixRows[3] ?? '').length + 4) return
    setMatrixRows(fixed)
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qType, matrixRows[3], extractedRaw])

  const handleQuestionTypeChange = useCallback(
    (type) => {
      const wasMatrix = qType === 'matrix_match'
      setQType(type)
      const typeDef = getQuestionType(type)
      if (typeDef?.defaultMarking) {
        setComposeMarksCorrect(typeDef.defaultMarking.correct)
        setComposeMarksWrong(typeDef.defaultMarking.wrong)
      }
      if (
        passageBundle?.subQuestions?.length &&
        (type === 'passage_integer' || type === 'passage_scq' || type === 'passage')
      ) {
        setMessage({
          type: 'info',
          text: `${type === 'passage_integer' ? 'PIVQ' : 'PSCQ'} applies to all ${passageBundle.subQuestions.length} sub-questions when you save the passage set.` })
      }
      if (type === 'integer' || type === 'numerical') {
        setOptions(['', '', '', ''])
        setOptionImages([null, null, null, null])
        setCorrectIndex(null)
        setCorrectIndices([])
      }
 
      if (type === 'true_false') {
        setOptions([...TRUE_FALSE_OPTIONS])
        setOptionImages([null, null, null, null])
        setCorrectIndex(0)
        setCorrectIndices([])
      }
      if (type === 'matrix_match') {
        setQuestionImage(null)
        setStemImageCrop(false)
        setStemTextInImage(false)
        const raw = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
        const rowHits = (raw.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
        const matrixLike =
          looksLikeMatchColumnUpload(raw) ||
          (rowHits >= 3 && /Column\s*[-–]?\s*I|quadratic|match/i.test(raw))
        if (!raw || !matrixLike) return
        const parsed = resolveMatrixFromAllOcr()
        if (parsed) {
          setPassageBundle(null)
          setTab('single')
          applyMatrixParse(parsed, { scroll: true })
          if (
            countFilledMatrixRowsNormalized(parsed) < 4 &&
            getOcrSourceFile() &&
            isImageFile(getOcrSourceFile())
          ) {
            supplementMatrixRows({ force: true })
          }
 
        }
        return
      }
      if (wasMatrix && type !== 'matrix_match') {
        const srcFile = getOcrSourceFile()
        if (srcFile && isImageFile(srcFile) && !isPdfFile(srcFile)) {
          compressImageFile(srcFile)
            .then((srcUrl) =>
              tryAutoCropStemDiagramFromSource({
                sourceUrl: srcUrl,
                stem: qText,
                extractedRaw,
                questionType: type,
                options,
                mcqOptionCount: countRealMcqOptions(qText, options) }),
            )
            .then((crop) => {
              if (!crop) return
              setQuestionImage(crop.url)
              setStemImageCrop(true)
              setStemTextInImage(false)
              showBankMessage(
                'success',
                'Diagram auto-cropped — review the preview, then Save.',
              )
            })
            .catch(() => {})
        }
      }
    },
// eslint-disable-next-line react-hooks/exhaustive-deps
    [
      qType,
 
      qText,
      extractedRaw,
      options,
      passageBundle,
      applyMatrixParse,
      resolveMatrixFromAllOcr,
      supplementMatrixRows,
      showBankMessage,
    ],
  )

  const tryApplyMatchColumn = (raw, normalized) => {
    ocrRawTextRef.current = raw.replace(/\r\n/g, '\n').trim()
    const parsed = resolveMatchColumnUpload(ocrRawTextRef.current, normalized, [
      ocrSupplementTextRef.current,
    ].filter(Boolean))
    if (!parsed) return null
    setPassageBundle(null)
    setQType('matrix_match')
    setTab('single')
    setMatrixUseOptions(false)
    setMatrixGridKey({})
    setMatrixCols(['', '', '', ''])
    setMatrixColLabels(defaultMatrixColLabels(4))
    setOptions(['', '', '', ''])
    setCorrectIndex(null)
    setQuestionImage(null)
    setStemImageCrop(false)
    setStemTextInImage(false)
    setExtractedRaw(normalized ?? raw)
    applyMatrixParse(parsed, { scroll: true })
    return parsed
  }

  const tryApplyPassageBundle = (raw, normalized, { allowOptionless = false } = {}) => {
    if (looksLikeMatchColumnUpload(raw)) return 0
    const norm = String(normalized ?? '').trim() || normalizeMathText(raw)
    const passageParsed = resolvePassageUpload(raw, norm, { allowOptionless })
    if (passageParsed?.subQuestions?.length >= 2) {
      passageNeedsOptionsRef.current = passageParsed.subQuestions.some((sq) =>
        (sq.options ?? []).every((o) => !String(o ?? '').trim()),
      )
      const uploadImage = questionImage ?? undefined
      setQText('')
      setQuestionImage(null)
      const sanitized = persistPassageBundleFields({
        passageText: passageParsed.passageText,
        subQuestions: passageParsed.subQuestions.map((sq) => ({
          ...sq,
          text: sq.text,
          options: sq.options.map((o) => String(o || '')),
          correctIndex: sq.correctIndex,
          correctIndices: sq.correctIndices,
          correctInteger: sq.correctInteger,
          correctNumerical: sq.correctNumerical,
          answerMode: sq.answerMode,
          answerSource: sq.answerSource,
          solution: sq.solution,
        })) })
      const trimmedPassage = sanitized.passageText
      const needsPassageFig = passageLikelyNeedsSharedDiagram(trimmedPassage)
      setPassageBundle((prev) => ({
        passageText: trimmedPassage,
        passageImage: prev?.passageImage,
        passageImageCrop: prev?.passageImageCrop,
        subQuestions: sanitized.subQuestions }))
      setExtractedRaw(formatPassageBundleAsText(sanitized))
      setQType((prev) => resolvePassageSetMetaType(prev, sanitized.subQuestions))
      if (needsPassageFig) {
        const src = getOcrSourceFile()
        if (src && isImageFile(src) && !isPdfFile(src)) {
          schedulePassageDiagramFromUpload(src, trimmedPassage)
        } else if (uploadImage) {
          schedulePassageDiagramFromUpload(uploadImage, trimmedPassage)
        }
      }
      requestAnimationFrame(() => {
        passagePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return passageParsed.subQuestions.length
    }
    setPassageBundle(null)
    return 0
  }

 
  const reparseFromRaw = (text = extractedRaw) => {
    const raw = ocrRawTextRef.current || text.replace(/\r\n/g, '\n').trim()
    // Keep AI / Mathpix light polish — heavy builtin rewrite mangled good Gemini LaTeX.
    const polishEngine =
      ocrEngine === 'cloud-vision' || ocrEngine === 'mathpix' || ocrEngine === 'word'
        ? ocrEngine
        : 'builtin'
    const polished = polishExtractedText(text, polishEngine)
    ocrRawTextRef.current = raw
    const mtx = tryApplyMatchColumn(raw, polished)
    if (mtx) {
      return {
        multi: false,
        bulkCount: 0,
        matrix: true,
        found: mtx.matrixRows.filter((r) => r.trim()).length,
        complete: true }
    }
    const passageCount = tryApplyPassageBundle(raw, polished)
    if (passageCount >= 2) {
      return { multi: false, bulkCount: 0, passage: true, found: passageCount, complete: true }
    }
    const extracted = reparseMcqUpload(raw, { engine: polishEngine })
    if (extracted.polished) setExtractedRaw(extracted.polished)
    const parsed = extracted.parsed
    if (parsed.multi && parsed.items?.length) {
      return {
        multi: true,
        bulkCount: parsed.items.length,
        ...applySingleParseResult(parsed.items[0], extracted.polished || polished) }
    }
    return {
      multi: false,
      bulkCount: 0,
      ...applySingleParseResult(parsed, extracted.polished || polished) }
  }

  const fillSingleFromExtracted = (polishedText, rawText = polishedText, engine = 'builtin') => {
    const raw = String(rawText ?? polishedText).replace(/\r\n/g, '\n').trim()
    if (looksLikeMatchColumnUpload(raw)) {
      return {
        multi: false,
        bulkCount: 0,
        found: 0,
        complete: false,
        stem: '',
        options: ['', '', '', ''] }
    }
    const polished = String(polishedText ?? rawText).replace(/\r\n/g, '\n').trim()
    ocrRawTextRef.current = raw
    const extracted = processMcqUploadExtract(raw, { engine, sourceFile: getOcrSourceFile() })
    const parsed = extracted.parsed
    if (parsed.multi && parsed.items?.length) {
      setExtractedRaw(extracted.polished || polished)
      return { multi: true, bulkCount: parsed.items.length, found: 0, complete: false }
    }
    // If parse wiped both stem and options but raw text exists, keep raw for the form.
    if (
      !String(parsed?.text ?? '').trim() &&
      !(parsed?.options ?? []).some((o) => String(o ?? '').trim()) &&
      raw.trim()
    ) {
      const fallbackParsed = {
        multi: false,
        text: polished || raw,
        options: ['', '', '', ''],
        optionsFound: 0,
        complete: false,
      }
      const split = parseSingleQuestionUpload(polished || raw, raw)
      if (!split.multi && (split.text?.trim() || (split.optionsFound ?? 0) >= 1)) {
        const status = applySingleParseResult(split, raw)
        return { multi: false, bulkCount: 0, applied: true, ...status }
      }
      const status = applySingleParseResult(fallbackParsed, raw)
      return { multi: false, bulkCount: 0, applied: true, ...status, found: status.found ?? 0 }
    }
    const status = applySingleParseResult(parsed, raw)
    return { multi: false, bulkCount: 0, applied: true, ...status }
  }

  const runSingleReExtract = async () => {
    const file = getOcrSourceFile()
    if (!file) {
      setMessage({ type: 'error', text: 'Re-upload the image to run OCR again.' })
      return
    }
    const gen = ++ocrGenRef.current
    const signal = beginOcrRun()
    setLoading(true)
    setProgress(0)
    setMessage({ type: '', text: '' })
    setParseStatus(null)
    uploadSessionStartedRef.current = Date.now()
    try {
      const result = await extractMcqFromImage(file, reportExtractProgress, {
        signal,
        saveToBank: true,
        paperMeta: buildBankUploadPaperMeta({
          subject,
          section,
          chapter,
          examPatternId: settings.examPatternId,
          exam: settings.examPatternId,
        }),
      })
      if (gen !== ocrGenRef.current) {
        notifyOcrInterrupted()
        return
      }
      if (consumeMathpixBankResult(result)) {
        logUploadSession(file, result.savedDrafts?.length > 1 ? 'bulk' : 'single', result.engine)
        return
      }
      if (!result.text?.trim()) {
        await processExtractedText('', file, {
          engine: result.engine,
          lowConfidence: true,
          cloudNote: result.cloudNote || 'No text found — Needs review. Try a clearer crop or type manually.',
          localOcrRaw: result.localOcrRaw,
          visionQuestions: result.questions,
          savedDrafts: result.savedDrafts,
        })
        logUploadSession(file, 'error', result.engine)
        return
      }
      const mode = await processExtractedText(result.text, file, {
        engine: result.engine,
        lowConfidence: result.lowConfidence,
        cloudNote: result.cloudNote,
        localOcrRaw: result.localOcrRaw,
        visionQuestions: result.questions,
        savedDrafts: result.savedDrafts,
      })
      logUploadSession(file, mode, result.engine)
      if (
        mode !== 'passage' &&
        mode !== 'bulk' &&
        mode !== 'matrix' &&
        mode !== 'passage-hint' &&
        mode !== 'error' &&
        mode !== 'diagram-split'
      ) {
        setMessage({
          type: result.lowConfidence ? 'warning' : 'success',
          text: describeMcqExtractResult(result),
        })
      }
    } catch (e) {
      if (gen === ocrGenRef.current) {
        if (isAbortError(e) || signal.aborted) return
        const { status } = getMathOcrLoadStatus()
        const friendly = friendlyUploadError(e, { isFirstRun: status !== 'ready' })
        if (friendly) {
          setMessage({ type: 'error', text: friendly })
          logUploadSession(file, 'error', 'builtin')
        }
      }
    } finally {
      finishOcrRun(gen)
    }
  }

  const runAutoImageExtract = async (fileOverride = null) => {
    const file = fileOverride ?? getOcrSourceFile()
    if (!file) {
      setMessage({
        type: '',
        text: 'Choose your question image — conversion runs right after you pick it.' })
      singleInputRef.current?.click()
      return
    }
    const gen = ++ocrGenRef.current
    const signal = beginOcrRun()
    setLoading(true)
    setProgress(0)
    setMessage({ type: '', text: '' })
    setParseStatus(null)
    uploadSessionStartedRef.current = Date.now()
    try {
      const result = await extractMcqFromImage(file, reportExtractProgress, {
        signal,
        saveToBank: true,
        paperMeta: buildBankUploadPaperMeta({
          subject,
          section,
          chapter,
          examPatternId: settings.examPatternId,
          exam: settings.examPatternId,
        }),
      })
      if (gen !== ocrGenRef.current) {
        notifyOcrInterrupted()
        return
      }
      if (consumeMathpixBankResult(result)) {
        logUploadSession(file, result.savedDrafts?.length > 1 ? 'bulk' : 'single', result.engine)
        return
      }
      if (!result.text?.trim()) {
        if (isImageFile(file) && !isPdfFile(file)) {
          const previewUrl = await compressImageFile(file)
          const fallback = await attemptUploadImageFallback({
            sourceUrl: previewUrl,
            stem: '',
            options: ['', '', '', ''],
            rawOcr: '',
            questionType: 'single_correct',
            force: true })
          if (fallback.applied) {
            setPreviewUrl(previewUrl)
            setExtractedRaw('(Image-only — text extraction failed; using auto-cropped regions.)')
            setQText(fallback.stem ?? '')
            setOptions(fallback.options ?? ['', '', '', ''])
            setOptionImages(fallback.optionImages ?? [null, null, null, null])
            if (fallback.questionImage) {
              setQuestionImage(fallback.questionImage)
              setStemImageCrop(!!fallback.stemImageCrop)
              setStemTextInImage(!!fallback.stemTextInImage)
            }
            setTab('single')
            setMessage({
              type: 'success',
              text:
                fallback.message ??
                'No readable text — cropped question and options from your image. Review previews, then Save.' })
            logUploadSession(file, 'single', result.engine ?? 'builtin')
            return
          }
        }
        setMessage({
          type: 'warning',
          text:
            result.cloudNote ||
            'No text found — Needs review. Try a clearer crop or type the question manually.',
        })
        await processExtractedText('', file, {
          engine: result.engine,
          lowConfidence: true,
          cloudNote: result.cloudNote,
          localOcrRaw: result.localOcrRaw,
          visionQuestions: result.questions,
          savedDrafts: result.savedDrafts,
        })
        logUploadSession(file, 'error', result.engine ?? 'builtin')
        return
      }
      const mode = await processExtractedText(result.text, file, {
        engine: result.engine,
        lowConfidence: result.lowConfidence,
        cloudNote: result.cloudNote,
        localOcrRaw: result.localOcrRaw,
        visionQuestions: result.questions,
        savedDrafts: result.savedDrafts,
      })
      logUploadSession(file, mode, result.engine)
      if (
        mode !== 'passage' &&
        mode !== 'bulk' &&
        mode !== 'matrix' &&
        mode !== 'passage-hint' &&
        mode !== 'error' &&
        mode !== 'diagram-split'
      ) {
        setMessage({
          type: result.lowConfidence ? 'error' : 'success',
          text: `${describeMcqExtractResult(result)} Review previews, then Save.`,
        })
      }
    } catch (e) {
      if (gen === ocrGenRef.current) {
        if (isAbortError(e) || signal.aborted) return
        const { status } = getMathOcrLoadStatus()
        const friendly = friendlyUploadError(e, { isFirstRun: status !== 'ready' })
        if (friendly) {
          setMessage({ type: 'error', text: friendly })
          logUploadSession(file, 'error', 'builtin')
        }
      }
    } finally {
      finishOcrRun(gen)
    }
  }

  const parseFromExtractedOrImage = async () => {
    if (loading) return
    if (!extractedRaw.trim() && canRunImageOcr()) {
      await runAutoImageExtract()
      return
    }
    if (!extractedRaw.trim()) {
      setMessage({ type: 'error', text: 'No OCR text — upload an image or paste LaTeX.' })
      return
    }
    const r = reparseFromRaw()
    if (r.passage && r.found >= 2) {
      setMessage({
        type: 'success',
        text: `Passage + ${r.found} questions — review the passage panel above.` })
    } else if (r.matrix) {
      setMessage({
        type: 'success',
        text: `Match the Column — filled ${r.found ?? 4} Column I rows. Review Column II and the answer grid.` })
    } else if (r.multi && r.bulkCount > 1) {
      setMessage({
        type: 'success',
        text: `Looks like ${r.bulkCount} questions — use Bulk tab or paste one MCQ only.` })
    } else {
      setMessage({
        type: 'success',
        text: r.complete
          ? 'Question + all 4 options filled.'
          : `Parsed ${r.found ?? 0}/4 options — complete the rest.` })
    }
  }

  const splitPassageFromExtractedOrImage = async () => {
    if (loading) return
    if (!hasPassageSplitSource && canRunImageOcr()) {
      await runAutoImageExtract()
      return
    }
    splitPassageFromExtracted()
  }

  const addOptionSlot = () => {
    if (options.length < 6) setOptions([...options, ''])
  }

  /**
   * @param {File} file
   * @param {{ diagramOnly?: boolean }} [opts] — diagramOnly: separate file, no text in image
   */
  const attachQuestionDiagram = async (file, { diagramOnly = false } = {}) => {
    if (!file?.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Upload a PNG or JPG image.' })
      return
    }
    if (
      !diagramOnly &&
      !extractedRaw.trim() &&
      !qText.trim() &&
      !passageBundle?.subQuestions?.length
    ) {
      setFile(file)
      ocrSourceFileRef.current = file
      setSingleUploadFile(file)
      const url = createPreviewUrl(file)
      previewBlobRef.current = url
      setPreviewUrl(url)
      await runAutoImageExtract(file)
      return
    }
    try {
      const url = await compressImageFile(file)
      const needsFig =
        diagramOnly || questionNeedsFigure(qText, extractedRaw) || stemNeedsDiagram
      let finalUrl = url
      if (needsFig) {
        const mcqCount = countRealMcqOptions(qText, options)
        const crop = await tryAutoCropStemDiagramFromSource({
          sourceUrl: url,
          stem: qText,
          extractedRaw,
          questionType: qType,
          options,
          mcqOptionCount: mcqCount })
        if (crop) finalUrl = crop.url
        else {
          setMessage({
            type: 'error',
            text: 'Could not isolate the diagram automatically. Use **Crop graph / diagram** and draw a box around the figure only.' })
          setSplitCropMode('diagram')
          requestAnimationFrame(() => setSplitCropOpen(true))
          return
        }
      }
      setQuestionImage(finalUrl)
      setStemImageCrop(true)
      if (diagramOnly || needsFig) {
        setStemTextInImage(false)
      } else if (
        stemLikelyNeedsDiagramImage(qText, extractedRaw) ||
        qType === 'integer' ||
        qType === 'numerical'
      ) {
        setStemTextInImage(true)
      } else {
        setStemTextInImage(false)
      }
      setMessage({
        type: 'success',
        text: diagramOnly
          ? 'Diagram-only image attached — it will show with the question text above in tests and preview.'
          : 'Question image attached — it will show in preview, tests, and review.' })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not attach image.' })
    }
  }

  const attachOptionGraph = async (index, file) => {
    if (!file?.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Upload a PNG or JPG image.' })
      return
    }
    try {
      const url = await compressImageFile(file, { role: 'option' })
      setOptionImages((prev) => {
        const next = [...prev]
        while (next.length < 4) next.push(null)
        next[index] = url
        return next.slice(0, 4)
      })
      setOptions((prev) => {
        const next = [...prev]
        while (next.length < 4) next.push('')
        if (isGraphPlaceholderText(next[index])) next[index] = ''
        return next
      })
      setMessage({
        type: 'success',
        text: `Graph image attached for option ${String.fromCharCode(65 + index)}.` })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not attach image.' })
    }
  }

  const buildMcqOptionsPayload = (polishedOptions, imgs = optionImages) => {
    const hasAnyImage = imgs.some(Boolean)
    const opts = polishedOptions.map((o, i) => {
      const t = String(o ?? '').trim()
      if (imgs[i] && (!t || isGraphPlaceholderText(t))) {
        return IMAGE_OPTION_LABELS[i] ?? `Option ${String.fromCharCode(65 + i)}`
      }
      return t
    })
    return {
      options: opts,
      ...(hasAnyImage ? { optionImages: imgs.map((img) => img ?? '') } : {}) }
  }

  const savePassageBundle = () => {
    if (!ensureMetadata()) return
    if (!passageBundle?.subQuestions?.length) return
    if (editingQuestionId && !passageBundle.editParentId) {
      setMessage({
        type: 'error',
        text: 'Finish or cancel single-question edit before saving a passage set.' })
      return
    }

    const defaults = metadataDefaults()
    const isEdit = !!passageBundle.editParentId
    let savedParentId = isEdit ? passageBundle.editParentId : null
    const passageSanitized = persistPassageBundleFields({
      passageText: passageBundle.passageText.trim(),
      subQuestions: passageBundle.subQuestions })
    const passageNorm = passageSanitized.passageText
    if (!passageNorm) {
      setMessage({ type: 'error', text: 'Passage text is required.' })
      return
    }

    try {
      const pendingInBatch = []
      const passageMetaType = passageSetMetaTypeFromForm(qType, passageSanitized.subQuestions)
      const needsPassageFig = passageLikelyNeedsSharedDiagram(passageNorm)
      const contractBatch = []
      const passageDiagram = needsPassageFig
        ? passageBundle.passageImage ?? questionImage ?? undefined
        : undefined

      passageSanitized.subQuestions.forEach((sq, i) => {
        const stem = finalizeStemForBank(String(sq.text ?? '').trim(), sq.options ?? [])
        if (!stem) throw new Error(`Question ${i + 1} text is empty.`)

        const rowId = isEdit ? sq.id : undefined
        if (isEdit && !rowId) {
          throw new Error(`Question ${i + 1} is missing a bank id — reload the set and try again.`)
        }
        const passageParentId = i === 0 ? undefined : savedParentId ?? passageBundle.editParentId

        let questionPayload
        try {
          const sqForPayload =
            passageMetaType === 'passage_scq'
              ? {
                  ...sq,
                  options: polishParsedMcqOptions(
                    stem,
                    sanitizeStoredOptions(sq.options ?? [], [], stem),
                    extractedRaw,
                  ) }
              : sq
          questionPayload = buildPassageSubQuestionPayload(passageMetaType, sqForPayload, stem)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid sub-question.'
          throw new Error(`Question ${i + 1}: ${msg}`)
        }

        const entry = normalizePassageQuestionStorage(
          applyQuestionMetadata(
            {
              ...(rowId ? { id: rowId } : {}),
              subject,
              ...questionPayload,
              section: section.trim() || undefined,
              chapter: chapter.trim() || undefined,
              topic: topic.trim() || undefined,
              examIds: [...examIds],
              toughnessLevel:
                toughnessLevel !== '' && toughnessLevel != null
                  ? Number(toughnessLevel)
                  : undefined,
              source: normalizeSource(source),
              solution: solution.trim() || undefined,
              videoSolution: videoSolution.trim() || undefined,
              ...(i === 0
                ? {
                    passageText: passageNorm,
                    ...(passageDiagram
                      ? {
                          passageImage: passageDiagram,
                          passageImageCrop: passageBundle.passageImageCrop ?? false }
                      : {}),
                    passageId: undefined }
                : {
                    passageId: passageParentId,
                    passageText: undefined }) },
            defaults,
          ),
          [...saved, ...pendingInBatch],
        )

        const dupScope = [...saved, ...pendingInBatch]
        const dup = findDuplicateQuestions(entry, dupScope, isEdit ? { excludeId: rowId } : {})
        const toSave = dup.length ? attachDuplicateReviewFields(entry, dup) : entry
        if (dup.length && i === 0) {
          setDuplicateAlarm({ matches: dup, entry: toSave, saved: true, canDiscard: false })
        }
        contractBatch.push(toSave)
        pendingInBatch.push({
          id: rowId ?? savedParentId ?? `batch-${i}`,
          text: toSave.text,
          options: toSave.options })

        if (isEdit) {
          const updated = updateUploadedQuestion(rowId, toSave)
          if (!updated) throw new Error(`Question ${i + 1} was not found in the bank.`)
          if (i === 0) savedParentId = updated.id
        } else {
          const savedRow = addUploadedQuestion(toSave)
          if (i === 0) savedParentId = savedRow.id
        }
      })
      assertPassageSetStorageConsistent(contractBatch)
      refresh()
      const n = passageBundle.subQuestions.length
      setPassageBundle(null)
      setExtractedRaw('')
      setQText('')
      setOptions(['', '', '', ''])
      setQuestionImage(null)
      setOptionImages([null, null, null, null])
      setMessage({
        type: 'success',
        text: isEdit
          ? `Updated passage + ${n} linked questions in the bank.`
          : `Saved passage block (PIVQ/PSCQ) — ${n} linked questions move together. Open the set from the bank list to edit.` })
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not save passage questions.' })
    }
  }

  const saveSingle = async () => {
    if (saving || loading) return
    if (!ensureMetadata()) return

    const rawBeforeSave = extractedRaw.trim() || ocrRawTextRef.current?.trim()
    const filledOptionCount = (options ?? []).filter((o) => String(o ?? '').trim()).length
    const hasOptionCrops = (optionImages ?? []).some((img) => !!String(img ?? '').trim())
    const canBackfillOptionsFromOcr = !hasOptionCrops && filledOptionCount < 2
    let parsedForSave = null
    if (
      rawBeforeSave &&
      qType !== 'matrix_match' &&
      !looksLikeMatchColumnUpload(rawBeforeSave) &&
      (!qText.trim() || canBackfillOptionsFromOcr)
    ) {
      parsedForSave = resolveMcqFieldsFromExtracted(rawBeforeSave)
      if (parsedForSave.stem?.trim() && !qText.trim()) {
        setQText(
          finalizeStemForBank(normalizeQuestionStemText(parsedForSave.stem), parsedForSave.options ?? []),
        )
      }
      if (parsedForSave.found >= 2 && canBackfillOptionsFromOcr) {
        setOptions((parsedForSave.options ?? ['', '', '', '']).slice(0, 4))
      }
    }

    let { stem: stemResolved } = resolveStemInputForSave({
      qText,
      qType,
      extractedRaw,
      ocrRawText: ocrRawTextRef.current,
      questionImage,
      stemTextInImage,
      options: parsedForSave?.found >= 2 && canBackfillOptionsFromOcr ? parsedForSave.options : options })
    if (!stemResolved && parsedForSave?.stem?.trim()) {
      stemResolved = finalizeStemForBank(
        normalizeQuestionStemText(parsedForSave.stem),
        parsedForSave.options ?? options,
      )
    }
    if (!stemResolved) {
      showBankMessage(
        'error',
        rawBeforeSave
          ? 'Question text is empty — click **Parse question & options** so OCR copies into **Question text**, or type the stem in that box.'
          : 'Question text required — type the stem, or upload an image and run OCR first.',
      )
      return
    }
    if (stemResolved !== qText) setQText(stemResolved)
    const stemInput = stemResolved
    const wasEditing = !!editingQuestionId
    let polishedStem = stemInput
    try {
      polishedStem = finalizeStemForBank(stemInput, options)
    } catch (e) {
      console.warn('[save] stem normalize failed', e)
    }
    const stemIssues = stemSaveBlockers(polishedStem, options)
    if (stemIssues.length) {
      showBankMessage(
        'error',
        `Matrix math could not be fixed automatically (${stemIssues[0]}). Edit **Question text** or re-upload the image, then save again.`,
      )
      return
    }
    const effectiveOptionImages = getEffectiveOptionImages()
    const cleanedOptions = sanitizeStoredOptions(options, effectiveOptionImages, polishedStem)
    let polishedOptsForSave =
      qType === 'single_correct' || qType === 'multiple_correct'
        ? polishParsedMcqOptions(polishedStem, cleanedOptions, extractedRaw)
        : isTrueFalseQuestionType(qType)
          ? [...TRUE_FALSE_OPTIONS]
          : cleanedOptions
    let saveImgsForSave =
      countMcqAnswerSlots(polishedStem, polishedOptsForSave, effectiveOptionImages) >= 2 ||
      !shouldStripMistakenOptionCrops(
        polishedStem,
        polishedOptsForSave,
        effectiveOptionImages,
        rawBeforeSave,
      )
        ? [...effectiveOptionImages]
        : [null, null, null, null]
    while (saveImgsForSave.length < 4) saveImgsForSave.push(null)
    if (saveImgsForSave !== optionImages && saveImgsForSave.some(Boolean) !== optionImages.some(Boolean)) {
      setOptionImages(saveImgsForSave)
    }

    if (
      (qType === 'single_correct' || qType === 'multiple_correct') &&
      countMcqAnswerSlots(polishedStem, polishedOptsForSave, saveImgsForSave) < 4
    ) {
      const srcFile = getOcrSourceFile()
      if (srcFile && isImageFile(srcFile) && !isPdfFile(srcFile)) {
        try {
          const sourceUrl = await compressImageFile(srcFile)
          const fallback = await attemptUploadImageFallback({
            sourceUrl,
            stem: polishedStem,
            options: polishedOptsForSave,
            rawOcr: rawBeforeSave,
            questionType: qType,
            optionImages: saveImgsForSave,
            optionsAutoCropped: saveImgsForSave.filter(Boolean).length,
            diagramAutoCropped: !!questionImage,
            questionImage,
            force: true })
          if (fallback.applied) {
            polishedStem = finalizeStemForBank(
              fallback.stem ?? polishedStem,
              fallback.options ?? polishedOptsForSave,
            )
            polishedOptsForSave = fallback.options ?? polishedOptsForSave
            saveImgsForSave = (fallback.optionImages ?? saveImgsForSave).slice(0, 4)
            while (saveImgsForSave.length < 4) saveImgsForSave.push(null)
            setOptions(polishedOptsForSave)
            setOptionImages(saveImgsForSave)
            setQText(polishedStem)
            setQType('single_correct')
            if (fallback.questionImage) {
              setQuestionImage(fallback.questionImage)
              setStemImageCrop(!!fallback.stemImageCrop)
              setStemTextInImage(!!fallback.stemTextInImage)
            }
          }
        } catch (err) {
          console.warn('[saveSingle] image fallback', err)
        }
      }
    }

    const editingQ = editingQuestionId
      ? saved.find((x) => String(x.id) === String(editingQuestionId))
      : null

    const needsFig = shouldAttemptDiagramAutoCrop(
      polishedStem,
      extractedRaw,
      polishedOptsForSave,
      qType,
    )
    let diagram = questionImage || undefined
    if (qType === 'matrix_match' && !needsFig) diagram = undefined
    let saveStemImageCrop = stemImageCrop
    let saveStemTextInImage = stemTextInImage

    if (
      shouldDropCompositeStemForOptionGraphs({
        stem: polishedStem,
        extractedRaw,
        optionImages: saveImgsForSave,
        stemImageCrop: saveStemImageCrop,
      })
    ) {
      diagram = undefined
      saveStemImageCrop = false
      saveStemTextInImage = false
      setQuestionImage(null)
      setStemImageCrop(false)
      setStemTextInImage(false)
    }

    if (needsFig) {
      const srcFile = getOcrSourceFile()
      let sourceUrl = diagram || null
      if (srcFile && isImageFile(srcFile) && !isPdfFile(srcFile)) {
        try {
          sourceUrl = await compressImageFile(srcFile)
        } catch {
          /* keep diagram url */
        }
      }
      const resolved = await resolveFigureImageForSave({
        questionImage: diagram,
        stemImageCrop,
        stemTextInImage,
        stem: polishedStem,
        extractedRaw,
        sourceUrl:
          stemImageCrop && stemTextInImage !== true ? null : sourceUrl,
        mcqOptionCount: countMcqAnswerSlots(polishedStem, polishedOptsForSave, saveImgsForSave),
        questionType: qType,
        optionImages: saveImgsForSave })
      if (!resolved.ok) {
        if (resolved.reason === 'diagram_missing' && (previewUrl || questionImage)) {
          showBankMessage(
            'info',
            'Could not auto-detect the diagram. Draw a box around the figure in the crop tool, then Save again.',
          )
          setSplitCropMode('diagram')
          requestAnimationFrame(() => setSplitCropOpen(true))
          return
        }
        showBankMessage(
          'error',
          resolved.reason === 'full_page'
            ? 'Crop the graph or diagram only (split tool → Graph / diagram only), then Save.'
            : 'Diagram could not be detected. Re-upload the question image or use **Crop graph / diagram**, then Save.',
        )
        return
      }
      diagram = resolved.questionImage
      saveStemImageCrop = resolved.stemImageCrop
      saveStemTextInImage = resolved.stemTextInImage
      setQuestionImage(diagram)
      setStemImageCrop(saveStemImageCrop)
      setStemTextInImage(saveStemTextInImage === true)
    }

    const imageFields = buildStoredFigureImageFields({
      questionImage: diagram,
      stemImageCrop: saveStemImageCrop,
      stemTextInImage: saveStemTextInImage,
      needsFigure: needsFig,
      forPassageParent: !!editingQ?.passageText && !!diagram,
      mcqOptionCount: countMcqAnswerSlots(polishedStem, polishedOptsForSave, saveImgsForSave),
      optionImages: saveImgsForSave,
      stem: polishedStem,
      extractedRaw })
    const ensureQuestionExamReady = (draft) => {
      {
        const filled = (draft.options ?? []).filter((o) => String(o ?? '').trim()).length
        const stemRaw = String(draft.text ?? '').trim()
        const stemGarbage = isUltraLowConfidenceOcr(stemRaw) || scoreLocalOcrWeakness(stemRaw) >= 55
        const stemOk = stemRaw.length >= 20 && !stemGarbage
        if (extractLowConfidence || stemGarbage) {
          if (!stemOk || filled < 2) {
            showBankMessage(
              'error',
              'Extraction looks garbled — fix the question text and options A–D (or re-run Convert image → text with Cloud vision) before Save.',
            )
            return false
          }
          const ok = window.confirm(
            'OCR confidence is low. Save anyway only if you already fixed the stem and options?\n\nOK = save · Cancel = keep editing',
          )
          if (!ok) return false
        }
      }
      const prepared = persistQuestionForBank(draft, saved)
      const readiness = validateQuestionReadiness(prepared)
      if (!readiness.ok) {
        showBankMessage('error', readinessSaveBlockMessage(readiness))
        return false
      }
      return true
    }
    const base = {
      subject,
      questionType: qType,
      text: polishedStem,
      ...imageFields,
      section: section.trim() || undefined,
      chapter: chapter.trim() || undefined,
      topic: topic.trim() || undefined,
      examIds: [...examIds],
      toughnessLevel:
        toughnessLevel !== '' && toughnessLevel != null ? Number(toughnessLevel) : undefined,
      source: normalizeSource(source),
      solution: solution.trim() || undefined,
      videoSolution: videoSolution.trim() || undefined,
      answerSource: answerSource && answerSource !== 'unknown' ? answerSource : undefined,
      solutionSource: solutionSource && solutionSource !== 'unknown' ? solutionSource : undefined,
      ...buildConfidencePersistFields(fieldConfidence, editingQ || {}),
      ...(tab === 'compose'
        ? {
            marking: {
              correct: Number(composeMarksCorrect) || 0,
              wrong: Number(composeMarksWrong) || 0,
              unattempted: 0,
              ...(qType === 'multiple_correct'
                ? { partial: getQuestionType(qType)?.defaultMarking?.partial }
                : {}),
            },
          }
        : {}),
    }
    /** @type {Awaited<ReturnType<typeof persistToBank>> | null} */
    let persistOut = null

    if (qType === 'integer') {
      if (correctInteger === '') {
        showBankMessage('error', 'Enter the correct integer answer (0–9999) for auto-grading.')
        return
      }
      const n = parseInt(correctInteger, 10)
      if (Number.isNaN(n) || n < 0 || n > 9999) {
        showBankMessage('error', 'Correct integer must be from 0 to 9999.')
        return
      }
      if (!ensureQuestionExamReady({ ...base, correctInteger: n })) return
      persistOut = await persistToBank({ ...base, correctInteger: n })
    } else if (qType === 'numerical') {
      const numCheck = validateNumericalAnswer(correctNumerical)
      if (!numCheck.ok) {
        showBankMessage('error', numCheck.error ?? 'Enter a valid numerical answer.')
        return
      }
      const numDraft = {
        ...base,
        correctNumerical: numCheck.value,
        numericalTolerance: 0.01 }
      if (!ensureQuestionExamReady(numDraft)) return
      persistOut = await persistToBank(numDraft)
    } else if (qType === 'multiple_correct') {
      if (options.filter((o) => o.trim()).length < 2 && !optionImages.some(Boolean)) {
        setMessage({ type: 'error', text: 'Add at least 2 options for MSQ.' })
        return
      }
      const msqDraft = {
        ...base,
        ...buildMcqOptionsPayload(polishedOptsForSave, saveImgsForSave),
        correctIndices: correctIndices.length ? correctIndices : [],
        msqMarking }
      if (!msqDraft.correctIndices.length) {
        showBankMessage('error', 'Mark at least one correct option for MSQ (A–D).')
        return
      }
      if (!ensureQuestionExamReady(msqDraft)) return
      persistOut = await persistToBank(msqDraft)
    } else if (qType === 'matrix_match') {
      const normalizeRow = (raw) => {
        const t = String(raw ?? '').trim()
        if (!t) return ''
        try {
          return normalizeMatrixItemText(t)
        } catch (e) {
          console.warn('[save] matrix row normalize failed', e)
          return t
        }
      }
      const rows = matrixRows.map((raw, i) => {
        let t = String(raw ?? '').trim()
        if (i === 3) t = repairIncompleteRowD(t, ocrRawTextRef.current || extractedRaw)
        return normalizeRow(t)
      })
      const cols = matrixCols.slice(0, matrixColCount).map(normalizeRow)
      const filledRowIdx = rows.map((r, i) => (matrixRowHasContent(r) ? i : -1)).filter((i) => i >= 0)

      if (filledRowIdx.length < 2) {
        showBankMessage('error', 'Enter at least 2 rows in Column I (A–D).')
        matrixFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (matrixColsNeedHeal(cols)) {
        showBankMessage('error', 'Fill all Column II entries (P–S) before Save.')
        matrixFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      const matrixBase = {
        ...base,
        matrixRows: rows,
        matrixCols: cols,
        matrixColCount,
        matrixColLabels: matrixColLabels.slice(0, matrixColCount) }
      try {
        setSaving(true)
        if (matrixUseOptions) {
          const polished = polishParsedMcqOptions(polishedStem, options.slice(0, 4), extractedRaw)
          if (polished.filter((o) => o.trim()).length < 2) {
            showBankMessage('error', 'Enter at least 2 options (A–D).')
            return
          }
          const matrixOptDraft = {
            ...matrixBase,
            matrixResponseMode: 'options',
            ...buildMcqOptionsPayload(polished.slice(0, 4)),
            correctIndex,
            matrixAnswerKey: {} }
          if (!ensureQuestionExamReady(matrixOptDraft)) return
          persistOut = await persistToBank(matrixOptDraft)
        } else {
          const key = normalizeMatrixAnswerKey(matrixGridKey)
          const missingGrid = filledRowIdx.filter((i) => !(key[i]?.length))
          if (missingGrid.length) {
            const labels = missingGrid.map((i) => String.fromCharCode(65 + i)).join(', ')
            showBankMessage(
              'error',
              `Tick the answer grid for row(s) ${labels} (each filled row needs at least one match).`,
            )
            matrixFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          if (!Object.keys(key).length) {
            showBankMessage('error', 'Tick at least one cell in the answer grid below Column II.')
            matrixFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          const matrixGridDraft = {
            ...matrixBase,
            matrixResponseMode: 'grid',
            matrixAnswerKey: key,
            options: [],
            correctIndex: undefined }
          if (!ensureQuestionExamReady(matrixGridDraft)) return
          persistOut = await persistToBank(matrixGridDraft)
        }
      } catch (e) {
        showBankMessage(
          'error',
          e instanceof Error ? e.message : 'Could not save — try smaller images or export the bank.',
        )
        return
      } finally {
        setSaving(false)
      }
      if (!persistOut || persistOut.persist === 'duplicate') return
    } else if (isTrueFalseQuestionType(qType)) {
      const tfDraft = {
        ...base,
        options: [...TRUE_FALSE_OPTIONS],
        optionImages: [null, null],
        correctIndex: correctIndex === 1 ? 1 : 0 }
      if (!ensureQuestionExamReady(tfDraft)) return
      persistOut = await persistToBank(tfDraft)
    } else {
      const polishedOpts = polishedOptsForSave
      if (correctIndex == null || !Number.isFinite(Number(correctIndex))) {
        showBankMessage(
          'error',
          'Pick the correct option (A–D). AI may still be filling the answer — wait a moment or choose manually.',
        )
        return
      }
      const markedEmpty = !String(polishedOpts[correctIndex] ?? '').trim()
      if (markedEmpty) {
        showBankMessage(
          'error',
          `Option ${String.fromCharCode(65 + correctIndex)} is empty — pick a Correct option that has text, or fill all A–D before Save.`,
        )
        return
      }
      const scqDraft = {
        ...base,
        ...buildMcqOptionsPayload(polishedOpts, saveImgsForSave),
        correctIndex }
      if (!ensureQuestionExamReady(scqDraft)) return
      persistOut = await persistToBank(scqDraft)
    }
    if (persistOut?.persist === 'duplicate') return

    // Teach local AI from this Cloud vision success (stays on this computer only)
    if (
      useLocalAiLearning &&
      (ocrEngine === 'cloud-vision' || cloudLearningCaptureRef.current)
    ) {
      try {
        recordLocalAiLearningExample({
          imageFingerprint:
            cloudLearningCaptureRef.current?.fingerprint ||
            fingerprintImageInput(previewUrl || questionImage || ''),
          localOcrRaw:
            cloudLearningCaptureRef.current?.localOcrRaw || ocrRawTextRef.current || extractedRaw,
          cloudStem: polishedStem,
          cloudOptions: polishedOptsForSave,
          cloudAnswer: formatAnswerKeyForLearning({
            correctIndex,
            correctIndices,
            correctInteger,
            correctNumerical,
          }),
          cloudSolution: solution,
          subject,
          section,
          chapter,
          topic,
          examIds,
          userEdited: true,
          provider: cloudLearningCaptureRef.current?.provider || ocrEngine,
        })
        setLocalAiStats(getLocalAiLearningStats())
        cloudLearningCaptureRef.current = null
      } catch {
        /* learning is best-effort */
      }
    }

    const syncNote =
      tab === 'compose' && composeStatus === 'active'
        ? formatSaveSyncNote(persistOut?.syncStatus, false).replace(
            / Saved as draft[^.]*\./,
            '',
          )
        : formatSaveSyncNote(persistOut?.syncStatus, persistOut?.persist === 'saved')
    const bankTotal = peekUploadedQuestions().length
    const browser = getBrowserStorageLabel()
    const savedId = persistOut?.entry?.id
    let statusNote = ''
    if (persistOut?.duplicateReview) {
      statusNote = ' Saved as a draft to compare with a possible duplicate — not published.'
    } else if (tab === 'compose' && savedId) {
      if (composeStatus === 'active') {
        if (canPublishBank) {
          const blockers = blockersBesidesDuplicate(getQuestionPublishBlockers(persistOut.entry))
          if (blockers.length) {
            statusNote = ` Saved as draft (Needs Review) — publish blocked: ${blockers[0]}`
          } else {
            try {
              const published = publishUploadedQuestion(savedId)
              if (published) {
                refresh()
                statusNote = ' Status: Active (published).'
              } else {
                statusNote = ' Saved as draft — could not publish yet.'
              }
            } catch (err) {
              if (err?.code === 'PUBLISH_DUPLICATE') {
                setDuplicateAlarm({
                  purpose: 'publish',
                  matches: err.matches,
                  entry: err.question ?? persistOut.entry,
                  saved: true,
                  canDiscard: false,
                })
                statusNote =
                  ' Saved as a draft. It matches a question already in the bank — compare, then choose Keep original only or Keep both.'
              } else {
                statusNote = ' Saved as draft — could not publish yet.'
              }
            }
          }
        } else {
          statusNote = ' Saved as draft — you need publish permission for Active status.'
        }
      } else if (composeStatus === 'disabled') {
        if (effectiveBankStatus(persistOut.entry) === 'published') {
          unpublishUploadedQuestion(savedId)
          refresh()
        }
        statusNote = ' Status: Disabled (held in draft).'
      } else {
        statusNote = ' Status: Needs Review (draft).'
      }
    }
    const inQueue = !!activeImageQueueIdRef.current
    if (inQueue) {
      showBankMessage(
        'success',
        (wasEditing
          ? `Question updated in ${browser} (${bankTotal} in bank).`
          : `Question saved in ${browser} (${bankTotal} in bank).`) +
          syncNote +
          statusNote +
          ' Loading next image in the queue…',
      )
      advanceImageQueue('saved')
      return
    }
    setQText('')
    setSolution('')
    setOptions(['', '', '', ''])
    setMatrixRows(['', '', '', ''])
    setMatrixCols(['', '', '', ''])
    setMatrixColCount(4)
    setMatrixUseOptions(false)
    setMatrixGridKey({})
    setMatrixColLabels(defaultMatrixColLabels(4))
    setOptionImages([null, null, null, null])
    setQuestionImage(null)
    setStemImageCrop(false)
    setStemTextInImage(false)
    setOptionStep(0)
    setExtractedRaw('')
    if (tab === 'compose') setComposeStatus('needs_review')
    showBankMessage(
      'success',
      (wasEditing
        ? `Question updated in ${browser} (${bankTotal} in bank).`
        : `Question saved in ${browser} (${bankTotal} in bank). Use the same browser each time.`) +
        syncNote +
        statusNote +
        (tab === 'compose'
          ? ' Subject / chapter / topic / exam tags kept for the next question.'
          : ''),
    )
  }

  composeSaveRef.current = saveSingle
  composePassageSaveRef.current = savePassageBundle

  useEffect(() => {
    if (tab !== 'compose') return undefined
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      // Own Ctrl+S on Compose so teachers don't hit the browser Save Page dialog.
      e.preventDefault()
      if (loading || saving || composeAssistBusy) return
      if (passageBundle?.subQuestions?.length) {
        void composePassageSaveRef.current?.()
        return
      }
      void composeSaveRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, loading, saving, composeAssistBusy, passageBundle])

  const saveHybrid = async () => {
    if (!ensureMetadata()) return
    const wasEditing = !!editingQuestionId
    if (!hybridQuestionImage && !hybridQText.trim()) {
      setMessage({ type: 'error', text: 'Upload a question image or enter a short text label.' })
      return
    }

    const isMcq = qType === 'single_correct' || qType === 'multiple_correct'
    if (isMcq) {
      if (hybridOptionsMode === 'single' && !hybridOptionsImage) {
        setMessage({ type: 'error', text: 'Upload an options image (A–D together) or switch to separate images.' })
        return
      }
      if (hybridOptionsMode === 'separate') {
        const filled = hybridOptionImages.filter(Boolean).length
        if (filled < 2) {
          setMessage({ type: 'error', text: 'Upload at least 2 option images (A, B, …).' })
          return
        }
      }
      if (qType === 'multiple_correct' && !correctIndices.length) {
        setMessage({ type: 'error', text: 'Select at least one correct option for MSQ.' })
        return
      }
    }

    if (qType === 'integer' && correctInteger === '') {
      setMessage({ type: 'error', text: 'Enter the correct integer answer (0–9999) for auto-grading.' })
      return
    }
    if (qType === 'integer') {
      const n = parseInt(correctInteger, 10)
      if (Number.isNaN(n) || n < 0 || n > 9999) {
        setMessage({ type: 'error', text: 'Correct integer must be from 0 to 9999.' })
        return
      }
    }
    if (qType === 'numerical') {
      const numCheck = validateNumericalAnswer(correctNumerical)
      if (!numCheck.ok) {
        setMessage({ type: 'error', text: numCheck.error ?? 'Enter the correct numerical answer.' })
        return
      }
    }

    const optionLabels = IMAGE_OPTION_LABELS.slice(0, 4)
    const base = {
      contentMode: 'hybrid',
      subject,
      questionType: qType,
      text: (() => {
        const raw = hybridQText.trim() || '(Image question)'
        try {
          return raw === '(Image question)' ? raw : normalizeQuestionStemText(raw)
        } catch {
          return raw
        }
      })(),
      section: section.trim() || undefined,
      chapter: chapter.trim() || undefined,
      topic: topic.trim() || undefined,
      examIds: [...examIds],
      toughnessLevel:
        toughnessLevel !== '' && toughnessLevel != null ? Number(toughnessLevel) : undefined,
      source: normalizeSource(source),
      questionImage: hybridQuestionImage || undefined,
      solution:
        hybridSolutionUseText === true
          ? hybridSolution.trim() || undefined
          : hybridSolution.trim() || undefined,
      solutionImage:
        hybridSolutionUseText === true ? undefined : hybridSolutionImage || undefined,
      videoSolution: videoSolution.trim() || undefined,
      ...buildConfidencePersistFields(
        fieldConfidence,
        editingQuestionId
          ? saved.find((x) => String(x.id) === String(editingQuestionId)) || {}
          : {},
      ),
    }

    /** @type {Awaited<ReturnType<typeof persistToBank>> | null} */
    let persistOut = null
    try {
      if (qType === 'integer') {
        persistOut = await persistToBank({ ...base, correctInteger: parseInt(correctInteger, 10) })
      } else if (qType === 'numerical') {
        const numCheck = validateNumericalAnswer(correctNumerical)
        if (!numCheck.ok) {
          setMessage({ type: 'error', text: numCheck.error ?? 'Enter a valid numerical answer.' })
          return
        }
        persistOut = await persistToBank({
          ...base,
          correctNumerical: numCheck.value,
          numericalTolerance: 0.01 })
      } else if (qType === 'multiple_correct') {
        persistOut = await persistToBank({
          ...base,
          options: optionLabels,
          optionsImage: hybridOptionsMode === 'single' ? hybridOptionsImage : undefined,
          optionImages:
            hybridOptionsMode === 'separate'
              ? hybridOptionImages.map((img) => img ?? '')
              : undefined,
          correctIndices: correctIndices.length ? correctIndices : [0],
          msqMarking })
      } else {
        persistOut = await persistToBank({
          ...base,
          options: optionLabels,
          optionsImage: hybridOptionsMode === 'single' ? hybridOptionsImage : undefined,
          optionImages:
            hybridOptionsMode === 'separate'
              ? hybridOptionImages.map((img) => img ?? '')
              : undefined,
          correctIndex })
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Could not save — storage may be full.' })
      return
    }

    if (persistOut?.persist === 'duplicate') return

    const syncNote = formatSaveSyncNote(persistOut?.syncStatus, persistOut?.persist === 'saved')
    resetHybridForm()
    setMessage({
      type: 'success',
      text:
        (wasEditing
          ? 'Hybrid question updated.'
          : 'Hybrid question saved (images stored, no OCR).') + syncNote })
  }

  // —— Bulk / file preview ——
  const [bulkPreview, setBulkPreview] = useState([])
  const [bulkEditIndex, setBulkEditIndex] = useState(/** @type {number | null} */ (null))
  const bulkQuestionTypeOptions = useMemo(
    () => getQuestionTypeOptionsForExams(examIds),
    [examIds],
  )
  const updateBulkPreviewItem = useCallback((index, patch) => {
    setBulkPreview((list) =>
      list.map((q, i) => {
        if (i !== index) return q
        const merged = { ...q, ...patch }
        if (patch.text != null) {
          merged.text = repairLambdaSinCubicExtremaStemOcr(
            repairFxIntegralMaxMinStemOcr(String(patch.text)),
          )
        }
        const next = merged
        const score = scoreBulkQuestionRow(next)
        return {
          ...next,
          uploadQualityScore: score.confidence,
          uploadQualityReady: score.ready }
      }),
    )
  }, [])
  const saveBulkPreviewEdit = useCallback(
    (index, patch) => {
      updateBulkPreviewItem(index, patch)
      setBulkEditIndex(null)
      setMessage({ type: 'success', text: `Question ${index + 1} updated in bulk preview.` })
    },
    [updateBulkPreviewItem],
  )
  const [bulkPaste, setBulkPaste] = useState(BULK_TEMPLATE)
  const [jsonPaste, setJsonPaste] = useState(JSON_TEMPLATE)
  const [file, setFile] = useState(null)

  const previewToBank = (items) => {
    setBulkEditIndex(null)
    const defaults = metadataDefaults()
    const allowedSubjectIds = getSubjectsForExams(defaults.examIds).map((s) => s.id)
    const source = items.map((p) => String(p?.text ?? '')).join('\n\n')
    const healedItems = applyUploadQualityGuards(items, source)
    setBulkPreview(
      healedItems.map((p, i) => {
        const qt =
          p.questionType ||
          (p.correctIndices?.length > 1
            ? 'multiple_correct'
            : p.options?.filter((o) => String(o ?? '').trim()).length >= 2
              ? 'single_correct'
              : 'integer')
        // Auto-detect per question; explicit parsed fields always take priority.
        const auto = autoClassifyQuestion({
          text: p.text,
          options: p.options,
          questionType: qt,
          allowedSubjects: allowedSubjectIds })
        const uploadScore = scoreBulkQuestionRow({
          text: p.text,
          options: p.options,
          questionType: qt,
          correctIndex: p.correctIndex,
          correctInteger: p.correctInteger })
        return applyQuestionMetadata(
          {
            id: `preview-${i}`,
            subject: p.subject || auto.subject || subject,
            questionType: qt,
            text: p.text,
            options: p.options?.length ? p.options : ['', '', '', ''],
            correctIndex: p.correctIndex != null ? p.correctIndex : undefined,
            correctIndices: p.correctIndices?.length
              ? p.correctIndices
              : p.correctIndex != null
                ? [p.correctIndex]
                : [],
            msqMarking: p.msqMarking ?? { ...DEFAULT_MSQ_MARKING },
            correctInteger: p.correctInteger,
            correctNumerical: p.correctNumerical,
            numericalTolerance: p.numericalTolerance,
            solution: p.solution,
            section: p.section || auto.section,
            chapter: p.chapter || auto.chapter,
            topic: p.topic || auto.topic,
            examIds: p.examIds,
            toughnessLevel:
              p.toughnessLevel != null && p.toughnessLevel !== ''
                ? p.toughnessLevel
                : auto.toughnessLevel,
            uploadQualityScore: uploadScore.confidence,
            uploadQualityReady: uploadScore.ready },
          defaults,
        )
      }),
    )
  }

  const handleJsonImport = (text) => {
    try {
      const parsed = parseQuestionsFromJson(text)
      previewToBank(parsed)
      setMessage({ type: 'success', text: `Parsed ${parsed.length} questions from JSON.` })
    } catch (e) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Invalid JSON' })
    }
  }

  const handleCsvImport = (text) => {
    const parsed = csvToQuestions(text)
    if (parsed.length === 0) {
      setMessage({ type: 'error', text: 'No valid rows in CSV.' })
      return
    }
    previewToBank(parsed)
    setMessage({ type: 'success', text: `Parsed ${parsed.length} questions from CSV.` })
  }

  const handleJsonFile = (f) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => handleJsonImport(String(reader.result))
    reader.readAsText(f)
  }

  const handleCsvFile = (f) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => handleCsvImport(String(reader.result))
    reader.readAsText(f)
  }

  const handleBackupImport = (f, { merge = false } = {}) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (merge) {
          const { added, skipped, total } = mergeBankBackup(data)
          refresh()
          setSettings(loadQuestionBank().settings)
          setMessage({
            type: 'success',
            text: `Merged backup: ${added} added, ${skipped} skipped (same id). Possible duplicates are kept as drafts to compare. Bank now has ${total} question(s).` })
        } else {
          if (
            !window.confirm(
              'Replace your entire question bank with this backup? Current questions will be removed.',
            )
          ) {
            return
          }
          importFullBankBackup(data)
          refresh()
          setSettings(loadQuestionBank().settings)
          setMessage({ type: 'success', text: 'Full bank backup restored (replaced previous bank).' })
        }
      } catch (e) {
        setMessage({
          type: 'error',
          text: e instanceof Error ? e.message : 'Invalid backup JSON' })
      }
    }
    reader.readAsText(f)
  }

  const runBulkParse = (text, engine = 'builtin') => {
    const repaired = repairWordSymbolFontText(text)
    const useEngine =
      engine === 'word' || wordExtractLooksBroken(repaired) ? 'word' : engine
    const polished = polishExtractedText(repaired, useEngine)
    if (polished && polished !== String(text ?? '').trim()) {
      setBulkPaste(polished)
    }
    const parsed = parseBulkQuestions(polished || repaired || text)
    previewToBank(parsed)
    const optCount = parsed[0]?.options?.filter((o) => String(o ?? '').trim()).length ?? 0
    const msqHint =
      parsed.length === 1 && optCount >= 4
        ? ' For one MCQ with a graph, Single tab is better for attaching the diagram.'
        : ''
    setMessage({
      type: 'success',
      text: `Found ${parsed.length} question(s). Review and import.${msqHint}` })
  }

  const maybeAttachQuestionDiagram = (
    picked,
    {
      stem = '',
      optionsFound = 0,
      extractedRaw = '',
      options = [],
      attachToPassage = false,
      passageText = '' } = {},
  ) => {
    if (!picked || !isImageFile(picked) || isPdfFile(picked) || isWordFile(picked)) {
      return false
    }
    if (attachToPassage) {
      const text = String(passageText || passageBundle?.passageText || '').trim()
      if (!text || !passageLikelyNeedsSharedDiagram(text)) return false
      schedulePassageDiagramFromUpload(picked, text)
      return true
    }
    if (!shouldAutoAttachUploadScreenshot(stem, extractedRaw, optionsFound, options)) {
      return false
    }
    compressImageFile(picked)
      .then((url) => {
        setQuestionImage(url)
        setStemImageCrop(false)
      })
      .catch(() => {})
    return true
  }

  /** Fresh OCR parse type — unified classifier (all subjects). */
  const inferUploadQuestionTypeFromResult = (result, stem, opts, rawOcr) =>
    inferUploadQuestionType({
      suggestedQuestionType: result?.suggestedQuestionType,
      found: result?.found ?? countRealMcqOptions(stem, opts),
      stem,
      options: opts,
      rawOcr })

  /** @returns {Promise<'passage'|'bulk'|'single'|'passage-hint'|'matrix'|'error'|'diagram-split'>} */
  const processExtractedText = async (
    text,
    picked,
    {
      forceSingle = false,
      engine = 'builtin',
      skipReExtract: _skipReExtract = false,
      skipQualityBoost: _skipQualityBoost = false,
      qualityBoosted: _qualityBoosted = false,
      lowConfidence = false,
      cloudNote = '',
      localOcrRaw = '',
      visionQuestions = null,
      savedDrafts = null,
    } = {},
  ) => {
    let rawOcr = ''
    uploadParseAppliedRef.current = false
    try {
      rawOcr = String(text ?? '').replace(/\r\n/g, '\n').trim()
      ocrRawTextRef.current = rawOcr
      ocrSupplementTextRef.current = ''
      matrixSupplementAttemptedRef.current = false
      setAiUploadReport(null)
      setOcrEngine(engine || 'builtin')
      if (engine === 'cloud-vision') {
        cloudLearningCaptureRef.current = {
          localOcrRaw: String(localOcrRaw || '').trim().slice(0, 4000) || undefined,
          fingerprint: fingerprintImageInput(previewUrl || questionImage || ''),
          provider: 'cloud-vision',
        }
      } else {
        cloudLearningCaptureRef.current = null
      }
      setExtractLowConfidence(
        !!lowConfidence || isUltraLowConfidenceOcr(rawOcr) || scoreLocalOcrWeakness(rawOcr) >= 55,
      )
      setExtractCloudNote(String(cloudNote ?? ''))
      const normalized = polishExtractedText(rawOcr, engine)
      // ONNX LaTeX boost runs on Re-extract only (keeps first upload fast).

      if (!forceSingle) {
        const routed = routeUploadExtract({
          rawOcr,
          normalized,
          sourceFile: picked ?? null,
          engine,
          forceSingle })

        if (routed.mode === 'matrix' && routed.matrix) {
          if (picked) {
            setSingleUploadFile(picked)
            ocrSourceFileRef.current = picked
          }
          if (picked && isImageFile(picked) && !isPdfFile(picked)) {
            await supplementMatrixRows({ force: true })
          }
          const finalParsed0 = resolveMatrixFromAllOcr() ?? routed.matrix
          const aiMtx = enhanceMatrixParse(finalParsed0, rawOcr)
          const finalParsed = aiMtx.improved ? aiMtx.parsed : finalParsed0
          applyMatrixParse(finalParsed, { scroll: true })
          const cc = finalParsed.matrixCols.filter((c) => c.trim()).length >= 5 ? 5 : 4
          const colFilled = finalParsed.matrixCols.filter((c) => c.trim()).length
          const rows = countFilledMatrixRowsNormalized(finalParsed)
          setAiUploadReport(
            buildAiUploadReport(
              runAiUploadAssist(rawOcr, {
                engine,
                ocrEngine: engine,
                hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
            ),
          )
          setMessage({
            type: 'success',
            text:
              colFilled >= 2
                ? `Match the Column auto-filled (${rows}/4 rows, Column II ${finalParsed.matrixColLabels.slice(0, cc).join(', ')}).${
                    finalParsed.matrixAnswerKey && Object.keys(finalParsed.matrixAnswerKey).length
                      ? ' Answer codes filled from paper — review the grid, then Save.'
                      : ' Tick the answer grid, then Save.'
                  }`
                : `Match the Column — ${rows}/4 rows filled from OCR. Type Column II entries (P–T) below, tick the grid, then Save.` })
          return 'matrix'
        }

        if (routed.mode === 'passage' && routed.passageCount >= 2) {
          const passageCount = tryApplyPassageBundle(rawOcr, normalized, { allowOptionless: true })
          if (passageCount >= 2) {
            if (picked) {
              setSingleUploadFile(picked)
              ocrSourceFileRef.current = picked
            }
            setQText('')
            setOptions(['', '', '', ''])
            setCorrectIndex(null)
            setTab('single')
            setMessage({
              type: 'success',
              text: `Passage + ${passageCount} questions detected (structure router + LaTeX). Review the passage panel above, then Save all.` })
            return 'passage'
          }
        }

        if (routed.mode === 'bulk' && routed.bulkCount > 1) {
          previewToBank(routed.bulk)
          setTab('bulk')
          setBulkPaste(normalized)
          setMessage({
            type: 'success',
            text: `Found ${routed.bulkCount} questions. Review on Bulk tab, then Import all.` })
          return 'bulk'
        }
      }

      if (
        !forceSingle &&
        !looksLikeMatrixAlgebraQuestion(rawOcr) &&
        !shouldPreferDiagramOverMatrixParse('', normalized, [])
      ) {
        const mtxParsed = tryApplyMatchColumn(rawOcr, normalized)
        if (mtxParsed) {
          if (picked) {
            setSingleUploadFile(picked)
            ocrSourceFileRef.current = picked
          }
          if (picked && isImageFile(picked) && !isPdfFile(picked)) {
            await supplementMatrixRows({ force: true })
          }
          const finalParsed0 = resolveMatrixFromAllOcr() ?? mtxParsed
          const aiMtx = enhanceMatrixParse(finalParsed0, rawOcr)
          const finalParsed = aiMtx.improved ? aiMtx.parsed : finalParsed0
          applyMatrixParse(finalParsed, { scroll: true })
          const cc = finalParsed.matrixCols.filter((c) => c.trim()).length >= 5 ? 5 : 4
          const colFilled = finalParsed.matrixCols.filter((c) => c.trim()).length
          const rows = countFilledMatrixRowsNormalized(finalParsed)
          setAiUploadReport(
            buildAiUploadReport(
              runAiUploadAssist(rawOcr, {
                engine,
                ocrEngine: engine,
                hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
            ),
          )
          setMessage({
            type: 'success',
            text:
              colFilled >= 2
                ? `Match the Column auto-filled (${rows}/4 rows, Column II ${finalParsed.matrixColLabels.slice(0, cc).join(', ')}). Tick the answer grid, then Save.`
                : `Match the Column — ${rows}/4 rows filled from OCR. Type Column II entries (P–T) below, tick the grid, then Save.` })
          return 'matrix'
        }
      }

      const passageCount = looksLikeMatchColumnUpload(rawOcr)
        ? 0
        : tryApplyPassageBundle(rawOcr, normalized, {
            allowOptionless: true })
      if (passageCount >= 2) {
        if (picked) {
          setSingleUploadFile(picked)
          ocrSourceFileRef.current = picked
        }
        setQText('')
        setOptions(['', '', '', ''])
        setCorrectIndex(null)
        setTab('single')
        const parsed = resolvePassageUpload(rawOcr, normalized, { allowOptionless: true })
        const passageText = trimPassageBodyText(
          normalizeMathText(parsed?.passageText ?? ''),
        )
        if (picked && passageText) {
          schedulePassageDiagramFromUpload(picked, passageText)
        }
        setExtractedRaw(formatPassageBundleAsText(
          persistPassageBundleFields({
            passageText: parsed?.passageText ?? '',
            subQuestions: parsed?.subQuestions ?? [] }),
        ))
        setMessage({
          type: 'success',
          text: `Passage + ${passageCount} questions detected (built-in OCR + LaTeX). Review the passage panel above, then Save all.` })
        return 'passage'
      }

    if (!forceSingle && !looksLikePassageMultiMcq(rawOcr)) {
      const bulk = parseBulkQuestions(normalized)
      if (bulk.length > 1) {
        previewToBank(bulk)
        setTab('bulk')
        setBulkPaste(normalized)
        setMessage({
          type: 'success',
          text: `Found ${bulk.length} questions. Review on Bulk tab, then Import all.` })
        return 'bulk'
      }
    }

    if (picked) {
      setSingleUploadFile(picked)
      ocrSourceFileRef.current = picked
    }

    if (
      !forceSingle &&
      looksLikeMatchColumnUpload(rawOcr) &&
      !shouldPreferDiagramOverMatrixParse('', normalized, [])
    ) {
      const mtxFirst = tryApplyMatchColumn(rawOcr, normalized)
      if (mtxFirst) {
        if (picked && isImageFile(picked) && !isPdfFile(picked)) {
          await supplementMatrixRows({ force: true })
        }
        const finalParsed0 = resolveMatrixFromAllOcr() ?? mtxFirst
        const aiMtx = enhanceMatrixParse(finalParsed0, rawOcr)
        const finalParsed = aiMtx.improved ? aiMtx.parsed : finalParsed0
        applyMatrixParse(finalParsed, { scroll: true })
        setAiUploadReport(
          buildAiUploadReport(
            runAiUploadAssist(rawOcr, {
              engine,
              ocrEngine: engine,
              hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
          ),
        )
        setMessage({
          type: 'success',
          text: `Match the Column auto-filled — ${countFilledMatrixRowsNormalized(finalParsed)}/4 rows and ${finalParsed.matrixCols.filter((c) => c.trim()).length} Column II entries. Review the grid, then Save.` })
        return 'matrix'
      }
    }

    if (!forceSingle && looksLikePassageMultiMcq(rawOcr)) {
      const forcedBeforeSingle = tryApplyPassageBundle(rawOcr, normalized, {
        allowOptionless: true })
      if (forcedBeforeSingle >= 2) {
        if (picked) {
          setSingleUploadFile(picked)
          ocrSourceFileRef.current = picked
        }
        setQuestionImage(null)
        setStemImageCrop(false)
        setStemTextInImage(false)
        setMessage({
          type: passageNeedsOptionsRef.current ? 'info' : 'success',
          text: passageNeedsOptionsRef.current
            ? `Passage + ${forcedBeforeSingle} integer-style questions detected. Enter each correct answer (0–9999), then **Save all**.`
            : `Passage + ${forcedBeforeSingle} questions detected. Review the passage panel, enter answers, then **Save all**.` })
        return 'passage'
      }
    }

    // Prefer Gemini/Mathpix structured drafts. Never dump a whole paper as one card.
    const visionList = Array.isArray(visionQuestions) ? visionQuestions.filter(Boolean) : []
    const alreadySaved = Array.isArray(savedDrafts) ? savedDrafts.filter(Boolean) : []
    if (!forceSingle && alreadySaved.length >= 2) {
      setHubMode('view')
      handleViewTabChange('draft')
      setMessage({
        type: 'success',
        text: `Mathpix + Gemini saved ${alreadySaved.length} draft(s) (not published). Open Saved questions → Draft. Do not Import all again.`,
      })
      return 'bulk'
    }
    if (
      !forceSingle &&
      (isGarbageRawLatexCard(visionList, rawOcr) || geminiStructureFailedSplit(visionList.length, rawOcr))
    ) {
      const backup = mathpixSplitToBankDrafts(rawOcr)
      const fromMarkers = backup.drafts.length >= 2
        ? backup.drafts
        : parseBulkQuestions(normalizeMathpixQuestionMarkers(rawOcr))
      if (fromMarkers.length >= 2) {
        previewToBank(fromMarkers)
        setTab('bulk')
        setBulkPaste(normalizeMathpixQuestionMarkers(rawOcr))
        setMessage({
          type: 'warning',
          text: `Split ${fromMarkers.length} questions from Mathpix markers (Gemini returned one blob). Review on Bulk tab, then Import all.`,
        })
        return 'bulk'
      }
      setMessage({
        type: 'error',
        text: `This file looks like ${countMathpixQuestionMarkers(rawOcr) || 'several'} questions stuck in one block. Nothing was saved as one card. Keep the bottom panel open, press F5, then try again.`,
      })
      return 'error'
    }
    if (!forceSingle && visionList.length >= 2) {
      previewToBank(visionList)
      setTab('bulk')
      setBulkPaste(
        visionList
          .map((q, i) => {
            const lines = [`Q${q.questionNumber ?? q.number ?? i + 1}. ${q.text || ''}`.trim()]
            ;(q.options ?? []).forEach((opt, oi) => {
              if (!String(opt ?? '').trim()) return
              lines.push(`(${String.fromCharCode(65 + oi)}) ${opt}`)
            })
            return lines.join('\n')
          })
          .join('\n\n'),
      )
      setMessage({
        type: 'success',
        text: `Found ${visionList.length} questions from Mathpix + Gemini. Review on Bulk tab, then Import all.`,
      })
      return 'bulk'
    }

    let visionSeed = null
    if (visionList.length === 1 || (forceSingle && visionList.length >= 1)) {
      visionSeed = visionQuestionToMcqParse(visionList[0])
    }

    let uploadResult
    if (
      visionSeed &&
      (String(visionSeed.text ?? '').trim() || (visionSeed.optionsFound ?? 0) >= 2)
    ) {
      // Cloud soup like "241 | 1 QInx" still needs parse plugins — do not skip them.
      visionSeed =
        runGuardedUploadStep(
          'vision-seed-repairs',
          () =>
            applyMcqParseRepairs(
              { ...visionSeed, _ocrSource: rawOcr },
              rawOcr,
              { passes: 2 },
            ),
          visionSeed,
        ) || visionSeed
      const status = applySingleParseResult(visionSeed, rawOcr)
      uploadResult = {
        multi: false,
        bulkCount: 0,
        applied: true,
        ...status,
        found: Math.max(status.found ?? 0, visionSeed.optionsFound ?? 0),
        stem: status.stem || visionSeed.text,
        options: status.options?.some((o) => String(o ?? '').trim())
          ? status.options
          : visionSeed.options,
      }
      if (!String(uploadResult.stem ?? '').trim() && String(visionSeed.text ?? '').trim()) {
        setQText(polishCloudVisionText(visionSeed.text))
        uploadResult.stem = visionSeed.text
      }
      if (
        (uploadResult.found ?? 0) < 2 &&
        (visionSeed.optionsFound ?? 0) >= 2
      ) {
        setOptions(visionSeed.options)
        uploadResult.options = visionSeed.options
        uploadResult.found = visionSeed.optionsFound
      }
    } else {
      const result = fillSingleFromExtracted(normalized, rawOcr, engine)
      uploadResult = result
    }
    // Strong Gemini/OpenAI structured fill — do not let local heal wipe A–D / cases / chem / bio.
    const preserveVision = shouldPreserveVisionStructuredFill(visionSeed, engine)
    const realOptCount = countRealMcqOptions(
      uploadResult.stem ?? '',
      uploadResult.options ?? [],
    )
    const skipHeavyHeal = shouldSkipHeavyMcqHeal({
      preserveVision,
      stem: uploadResult.stem ?? '',
      options: uploadResult.options ?? [],
    })
    if (
      !skipHeavyHeal &&
      ((uploadResult.found ?? 0) < 4 || !String(uploadResult.stem ?? '').trim() || realOptCount < 2)
    ) {
      const recovered = runGuardedUploadStep(
        'recover-single-upload',
        () =>
          tryRecoverSingleUploadParse(rawOcr, {
            engine,
            minFound: uploadResult.found ?? 0,
            sourceFile: picked ?? getOcrSourceFile(),
          }),
        null,
      )
      if (
        recovered &&
        (recovered.found > (uploadResult.found ?? 0) ||
          (!String(uploadResult.stem ?? '').trim() && String(recovered.parsed.text ?? '').trim()))
      ) {
        const status = applySingleParseResult(recovered.parsed, recovered.polished)
        uploadResult = { ...uploadResult, ...status, found: status.found ?? recovered.found }
        if (recovered.polished !== normalized) setExtractedRaw(recovered.polished)
      }
    }

    if (!skipHeavyHeal && (uploadResult.found ?? 0) < 4) {
      const reparsed = runGuardedUploadStep(
        'reparse-mcq-upload',
        () =>
          reparseMcqUpload(rawOcr, {
            engine,
            minFound: uploadResult.found ?? 0,
            sourceFile: picked ?? getOcrSourceFile(),
          }),
        { found: 0, parsed: null, polished: '' },
      )
      if (reparsed.found > (uploadResult.found ?? 0)) {
        const status = applySingleParseResult(reparsed.parsed, reparsed.polished || normalized)
        uploadResult = { ...uploadResult, ...status, found: status.found ?? reparsed.found }
      }
    }

    // Parse plugins are cheap and no-op when they don't match. Always run them —
    // skipHeavyHeal must not freeze OCR soup like "241 | 1 QInx" / fake graphs.
    const registryRepaired = runGuardedUploadStep(
        'mcq-parse-repairs',
        () =>
          applyMcqParseRepairs(
            {
              text: uploadResult.stem ?? '',
              options: uploadResult.options ?? [],
              optionsFound: uploadResult.found ?? 0,
              complete: (uploadResult.found ?? 0) >= 4,
            },
            rawOcr,
            { passes: 3 },
          ),
        null,
      )
      if (registryRepaired) {
      const registryFound = countRealMcqOptions(registryRepaired.text, registryRepaired.options)
      if (
        registryFound > (uploadResult.found ?? 0) ||
        (registryRepaired.text?.trim() && registryRepaired.text.trim() !== String(uploadResult.stem ?? '').trim())
      ) {
        const status = applySingleParseResult(registryRepaired, normalized)
        uploadResult = { ...uploadResult, ...status, found: status.found ?? registryFound }
      }
      }
    if (
      !forceSingle &&
      looksLikeMatchColumnUpload(rawOcr) &&
      !shouldPreferDiagramOverMatrixParse(uploadResult.stem ?? '', normalized, uploadResult.options ?? [])
    ) {
      const mtxRetry = tryApplyMatchColumn(rawOcr, normalized)
      if (mtxRetry) {
        if (picked && isImageFile(picked) && !isPdfFile(picked)) {
          await supplementMatrixRows({ force: true })
        }
        const finalParsed0 = resolveMatrixFromAllOcr() ?? mtxRetry
        const aiMtx = enhanceMatrixParse(finalParsed0, rawOcr)
        const finalParsed = aiMtx.improved ? aiMtx.parsed : finalParsed0
        applyMatrixParse(finalParsed, { scroll: true })
        setAiUploadReport(
          buildAiUploadReport(
            runAiUploadAssist(rawOcr, {
              engine,
              ocrEngine: engine,
              hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
          ),
        )
        setMessage({
          type: 'success',
          text: `Match the Column auto-filled — ${countFilledMatrixRowsNormalized(finalParsed)}/4 rows and ${finalParsed.matrixCols.filter((c) => c.trim()).length} Column II entries.` })
        return 'matrix'
      }
    }
    let stemForDiagram = uploadResult.stem ?? ''
    let optsForDiagram = uploadResult.options ?? []
    let uploadQType = inferUploadQuestionTypeFromResult(uploadResult, stemForDiagram, optsForDiagram, rawOcr)
    let preHealed = null
    if (!skipHeavyHeal) {
      const aiMcq = runGuardedUploadStep(
        'iterative-upload-heal',
        () =>
          iterativeUploadHeal({
            stem: stemForDiagram,
            options: optsForDiagram,
            rawOcr,
            engine,
            questionType: uploadQType,
            maxPasses: (uploadResult.found ?? 0) < 4 ? 3 : 2,
          }),
        null,
      )
      preHealed = aiMcq
      if (aiMcq && (String(aiMcq.stem ?? '').trim() || aiMcq.found > 0)) {
        const mergedOpts = mergeVisionOptionsPreferPreserve(
          optsForDiagram,
          aiMcq.options,
          { preserve: false },
        )
        const status = applySingleParseResult(
          { text: aiMcq.stem, options: mergedOpts, optionsFound: countRealMcqOptions(aiMcq.stem, mergedOpts) },
          normalized,
        )
        stemForDiagram = aiMcq.stem
        optsForDiagram = mergedOpts
        uploadResult = { ...uploadResult, ...status, stem: aiMcq.stem, options: mergedOpts, found: status.found }
      }
      if (aiMcq?.questionType) {
        uploadQType = aiMcq.questionType
      } else {
        uploadQType = inferUploadQuestionTypeFromResult(uploadResult, stemForDiagram, optsForDiagram, rawOcr)
      }
    } else {
      // Keep Gemini stem/options; only soft-polish stem for render.
      if (String(stemForDiagram).trim()) {
        stemForDiagram = polishCloudVisionText(stemForDiagram) || stemForDiagram
        setQText(stemForDiagram)
        uploadResult = { ...uploadResult, stem: stemForDiagram }
      }
      optsForDiagram = mergeVisionOptionsPreferPreserve(
        visionSeed?.options ?? optsForDiagram,
        optsForDiagram,
        { preserve: true },
      )
      uploadResult = {
        ...uploadResult,
        options: optsForDiagram,
        found: Math.max(
          uploadResult.found ?? 0,
          countRealMcqOptions(stemForDiagram, optsForDiagram),
        ),
      }
      // Stand in for the heal we deliberately skipped, so the assist pass below
      // reports on the preserved cloud fields instead of re-healing them.
      preHealed = {
        stem: stemForDiagram,
        options: optsForDiagram,
        questionType: uploadQType,
        found: uploadResult.found ?? 0,
      }
    }
    if (!preHealed) {
      preHealed = {
        stem: stemForDiagram,
        options: optsForDiagram,
        questionType: uploadQType,
        found: uploadResult.found ?? 0,
      }
    }
    stemForDiagram = cleanStemMergedOptionGarbage(stemForDiagram)
    // Last-resort: parse failed but OCR/AI text exists — never leave a silent blank form.
    if (
      !String(stemForDiagram ?? '').trim() &&
      !(optsForDiagram ?? []).some((o) => String(o ?? '').trim()) &&
      rawOcr.trim()
    ) {
      const salvageParse = runGuardedUploadStep(
        'blank-form-salvage',
        () => salvageParseFromOcr(rawOcr, engine),
        null,
      )
      if (
        salvageParse &&
        !salvageParse.multi &&
        !salvageParse.salvageRaw &&
        (salvageParse.text?.trim() || (salvageParse.optionsFound ?? 0) >= 2)
      ) {
        const status = applySingleParseResult(salvageParse, rawOcr)
        uploadResult = { ...uploadResult, ...status, found: status.found ?? salvageParse.optionsFound }
        stemForDiagram = status.stem || salvageParse.text || ''
        optsForDiagram = status.options ?? salvageParse.options ?? optsForDiagram
      } else {
        const rawStem = rawOcr.replace(/\r\n/g, '\n').trim().slice(0, 2500)
        setQText(engine === 'cloud-vision' ? polishCloudVisionText(rawStem) : polishOcrText(rawStem))
        setExtractedRaw(rawStem)
        stemForDiagram = rawStem
        uploadParseAppliedRef.current = true
        uploadResult = {
          ...uploadResult,
          stem: rawStem,
          options: optsForDiagram ?? ['', '', '', ''],
          found: countRealMcqOptions(rawStem, optsForDiagram),
        }
        setMessage({
          type: 'error',
          text:
            'Convert found text but could not split the question and options A–D cleanly. Raw text is in the question box — edit options manually, or press F5 and Convert again.',
        })
      }
    }
    uploadQType = correctUploadTypeForOcr(uploadQType, {
      stem: stemForDiagram,
      options: optsForDiagram,
      rawOcr,
      found: uploadResult.found ?? countRealMcqOptions(stemForDiagram, optsForDiagram) })
    setQType((prev) => (isPassageMetadataType(prev) ? prev : uploadQType))
    const canCropFromImage =
      picked && isImageFile(picked) && !isPdfFile(picked)
    let cachedUploadSrcUrl = null
    const getUploadSrcUrl = async () => {
      if (!cachedUploadSrcUrl && canCropFromImage) {
        cachedUploadSrcUrl = await compressImageFile(picked)
      }
      return cachedUploadSrcUrl
    }
    uploadCropGuardRef.current = !!canCropFromImage
    const needsDiagramCrop =
      canCropFromImage &&
      shouldAttemptDiagramAutoCrop(stemForDiagram, normalized, optsForDiagram, uploadQType)
    const diagramAttached = needsDiagramCrop
      ? false
      : maybeAttachQuestionDiagram(picked, {
          stem: stemForDiagram,
          optionsFound: uploadResult.found ?? 0,
          extractedRaw: normalized,
          options: optsForDiagram })
    let diagramAutoCropped = false
    if (needsDiagramCrop) {
      setQuestionImage(null)
      setStemTextInImage(false)
      setStemImageCrop(false)
      try {
        const srcUrl = await getUploadSrcUrl()
        const mcqCount = countRealMcqOptions(stemForDiagram, optsForDiagram)
        const crop = await tryAutoCropStemDiagramFromSource({
          sourceUrl: srcUrl,
          stem: stemForDiagram,
          extractedRaw: normalized,
          questionType: uploadQType,
          options: optsForDiagram,
          mcqOptionCount: mcqCount })
        if (crop) {
          setQuestionImage(crop.url)
          setStemImageCrop(crop.stemImageCrop)
          setStemTextInImage(crop.stemTextInImage)
          diagramAutoCropped = true
        }
      } catch {
        diagramAutoCropped = false
      }
      if (!diagramAutoCropped) {
        try {
          const url = await getUploadSrcUrl()
          setQuestionImage(url)
          setStemImageCrop(false)
          setStemTextInImage(false)
        } catch {
          /* manual crop still available */
        }
        setSplitCropMode('diagram')
        requestAnimationFrame(() => setSplitCropOpen(true))
        showBankMessage(
          'info',
          'Could not auto-crop the diagram — draw a box around the figure in the crop tool, then Save.',
        )
      } else {
        showBankMessage('success', 'Diagram auto-cropped — review the preview, then Save.')
      }
    } else if (
      picked &&
      isImageFile(picked) &&
      !isPdfFile(picked) &&
      !diagramAttached &&
      !diagramAutoCropped &&
      !questionNeedsFigure(stemForDiagram, normalized)
    ) {
      const imagePlan = planUploadImageActions({
        stem: stemForDiagram,
        options: optsForDiagram,
        extractedRaw: normalized,
        questionType: uploadQType,
        questionImage,
        stemImageCrop,
        stemTextInImage })
      if (imagePlan.dropFullPageQuestionImage) {
        setQuestionImage(null)
        setStemImageCrop(false)
        setStemTextInImage(false)
      } else {
        try {
          const longStem = `${stemForDiagram}\n${normalized}`.trim().length > 100
          const isIntNum = uploadQType === 'integer' || uploadQType === 'numerical'
          if (isIntNum && longStem) {
            setQuestionImage(null)
            setStemImageCrop(false)
            setStemTextInImage(false)
          } else if (
            shouldHideUploadScreenshotInStemPreview(stemForDiagram, optsForDiagram, normalized)
          ) {
            setQuestionImage(null)
            setStemImageCrop(false)
            setStemTextInImage(false)
          } else {
            const url = await getUploadSrcUrl()
            setQuestionImage(url)
            setStemImageCrop(false)
            setStemTextInImage(false)
          }
        } catch {
          /* preview still uses previewUrl */
        }
      }
    }
    let optionsAutoCropped = 0
    /** @type {'cloud-vision' | 'local' | null} */
    let optionsAutoCropSource = null
    const isMcqType = uploadQType === 'single_correct' || uploadQType === 'multiple_correct'
    const canImageCropMcq =
      isMcqType ||
      isMcqLikeFromOcr({
        stem: stemForDiagram,
        options: optsForDiagram,
        rawOcr,
        optionImages })
    const polishedOptsForCrop = polishParsedMcqOptions(stemForDiagram, optsForDiagram, normalized)
    const uploadImagePlan = planUploadImageActions({
      stem: stemForDiagram,
      options: optsForDiagram,
      extractedRaw: normalized,
      questionType: uploadQType,
      questionImage,
      stemImageCrop,
      stemTextInImage })
    const graphOpts = applyGraphOptionPlaceholders(stemForDiagram, polishedOptsForCrop, [])
    const graphNeedForCrop = countGraphOptionsNeedingImage(
      graphOpts,
      [null, null, null, null],
      stemForDiagram,
    )
    const cropBlob = `${stemForDiagram}\n${normalized}`
    const typedTextOptions =
      blobHasTypedTextMcqOptions(cropBlob) ||
      looksLikeContinuityDiscontinuityTextMcq(cropBlob) ||
      looksLikeVerticalTextOptionsMcq(stemForDiagram, polishedOptsForCrop, normalized)
    const shouldAutoCropOptions =
      canImageCropMcq &&
      !typedTextOptions &&
      (uploadImagePlan.attemptOptionsAutoCrop ||
        shouldAttemptOptionsAutoCrop(stemForDiagram, polishedOptsForCrop, [], normalized) ||
        graphNeedForCrop >= 1 ||
        stemSaysOptionsAreFigures(stemForDiagram) ||
        blobMentionsGraphOptions(cropBlob)) &&
      (!shouldSkipOptionsAutoCrop(stemForDiagram, polishedOptsForCrop, normalized) ||
        ((graphNeedForCrop >= 1 ||
          stemSaysOptionsAreFigures(stemForDiagram) ||
          blobMentionsGraphOptions(cropBlob)) &&
          !typedTextOptions))
    if (picked && isImageFile(picked) && !isPdfFile(picked) && shouldAutoCropOptions) {
      try {
        const srcUrl = await getUploadSrcUrl()
        const optionMinFilled = graphNeedForCrop >= 3 ? 1 : 2
        const cropResult = await autoCropOptionsFromSource(srcUrl, stemForDiagram, graphOpts, {
          hasStemDiagram: needsDiagramCrop || diagramAutoCropped,
          force: false,
          minFilled: optionMinFilled })
        optionsAutoCropped = cropResult.filled
        optionsAutoCropSource = cropResult.source
        // Mark attempted only on success so background auto-crop can retry if this failed.
        if (optionsAutoCropped >= 2 && previewUrl) {
          optionsAutoCropAttemptedRef.current = previewUrl
        }
      } catch {
        optionsAutoCropped = 0
        optionsAutoCropSource = null
      }
    }

    let imageFallbackApplied = false
    let fallbackOptionImages = optionImages
    let fallbackQuestionImage = questionImage
    if (canCropFromImage && canImageCropMcq) {
      try {
        const srcUrl = await getUploadSrcUrl()
        if (srcUrl) {
          const fallback = await attemptUploadImageFallback({
            sourceUrl: srcUrl,
            stem: stemForDiagram,
            options: optsForDiagram,
            rawOcr,
            questionType: uploadQType,
            optionImages,
            optionsAutoCropped,
            diagramAutoCropped,
            questionImage })
          if (fallback.applied) {
            imageFallbackApplied = true
            stemForDiagram = fallback.stem ?? stemForDiagram
            optsForDiagram = fallback.options ?? optsForDiagram
            fallbackOptionImages = fallback.optionImages ?? optionImages
            fallbackQuestionImage = fallback.questionImage ?? questionImage
            if (fallback.questionImage) {
              setQuestionImage(fallback.questionImage)
              setStemImageCrop(!!fallback.stemImageCrop)
              setStemTextInImage(!!fallback.stemTextInImage)
              diagramAutoCropped = fallback.stemCropped ?? diagramAutoCropped
            }
            if (fallback.optionImages?.length) {
              setOptionImages(fallback.optionImages)
              optionsAutoCropped = Math.max(
                optionsAutoCropped,
                fallback.optionsCropped ?? 0,
              )
            }
            setOptions(optsForDiagram)
            setQText(stemForDiagram)
            const status = applySingleParseResult(
              {
                text: stemForDiagram,
                options: optsForDiagram,
                optionsFound: countRealMcqOptions(stemForDiagram, optsForDiagram),
                complete: (fallback.optionsCropped ?? 0) >= 4 },
              normalized,
            )
            uploadResult = {
              ...uploadResult,
              ...status,
              stem: stemForDiagram,
              options: optsForDiagram,
              found: Math.max(
                status.found ?? 0,
                fallback.optionsCropped ?? 0,
                countRealMcqOptions(stemForDiagram, optsForDiagram),
              ) }
            uploadQType = fallback.questionType ?? 'single_correct'
            setQType('single_correct')
            if (fallback.message) {
              showBankMessage('success', fallback.message)
            }
          }
        }
      } catch (err) {
        console.warn('[QuestionBank] image fallback failed', err)
      }
    }

    const finalizeBlob = `${stemForDiagram}\n${(optsForDiagram ?? []).join('\n')}\n${rawOcr}`.trim()
    if (
      looksLikeFunctionPropertyTextMcq(finalizeBlob) &&
      (uploadResult.found ?? 0) < 4 &&
      rawOcr
    ) {
      const reparsed = reparseMcqUpload(rawOcr, { engine, sourceFile: picked })
      if (!reparsed.parsed?.multi && (reparsed.found ?? 0) > (uploadResult.found ?? 0)) {
        const status = applySingleParseResult(reparsed.parsed, reparsed.polished || rawOcr)
        uploadResult = { ...uploadResult, ...status, found: reparsed.found }
        stemForDiagram = status.stem ?? stemForDiagram
        optsForDiagram = status.options ?? optsForDiagram
      }
    }
    if (
      looksLikeDomainGreatestIntegerMcq(finalizeBlob) &&
      (uploadResult.found ?? 0) < 4 &&
      rawOcr
    ) {
      const reparsed = reparseMcqUpload(rawOcr, { engine, sourceFile: picked })
      if (!reparsed.parsed?.multi && (reparsed.found ?? 0) > (uploadResult.found ?? 0)) {
        const status = applySingleParseResult(reparsed.parsed, reparsed.polished || rawOcr)
        uploadResult = { ...uploadResult, ...status, found: reparsed.found }
        stemForDiagram = status.stem ?? stemForDiagram
        optsForDiagram = status.options ?? optsForDiagram
      } else {
        const recovered = recoverTextMcqFromFullOcr(
          uploadResult.stem ?? stemForDiagram,
          uploadResult.options ?? optsForDiagram,
          rawOcr,
          picked,
        )
        if (recovered.found > (uploadResult.found ?? 0)) {
          const status = applySingleParseResult(
            {
              text: recovered.stem,
              options: recovered.options,
              optionsFound: recovered.found,
              complete: recovered.found >= 4 },
            rawOcr,
          )
          uploadResult = { ...uploadResult, ...status, found: recovered.found }
          stemForDiagram = status.stem ?? stemForDiagram
          optsForDiagram = status.options ?? optsForDiagram
        }
      }
    }
    if (optionsAutoCropped < 2) {
      setOptionImages((prev) => {
        const merged = optionImagesRef.current.some((img) => !!String(img ?? '').trim())
          ? syncOptionImagesRef(optionImagesRef.current)
          : prev
        return shouldStripMistakenOptionCrops(
          uploadResult.stem ?? stemForDiagram,
          uploadResult.options ?? optsForDiagram,
          merged,
          rawOcr,
        )
          ? [null, null, null, null]
          : merged
      })
    } else if (optionImagesRef.current.some((img) => !!String(img ?? '').trim())) {
      setOptionImages(syncOptionImagesRef(optionImagesRef.current))
      optsForDiagram = (optsForDiagram ?? ['', '', '', '']).map((o, i) =>
        optionImagesRef.current[i]
          ? IMAGE_OPTION_LABELS[i] ?? `Option ${String.fromCharCode(65 + i)}`
          : o,
      )
      setOptions(optsForDiagram)
    }
    if (uploadResult.multi && uploadResult.bulkCount > 1) {
      const bulk = parseBulkQuestions(normalized)
      previewToBank(bulk)
      setTab('bulk')
      setBulkPaste(normalized)
      setAiUploadReport(
        buildAiUploadReport(
          runAiUploadAssist(rawOcr, {
            engine,
            ocrEngine: engine,
            hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
        ),
      )
      setMessage({
        type: 'success',
        text: `Found ${bulk.length} questions. Review on Bulk tab, then Import all.` })
      return 'bulk'
    }
    setTab('single')
    let found = uploadResult.found ?? 0
    if (!forceSingle && looksLikePassageMultiMcq(rawOcr)) {
      const forced = tryApplyPassageBundle(rawOcr, normalized, { allowOptionless: true })
      if (forced >= 2) {
        setQText('')
        setOptions(['', '', '', ''])
        setAiUploadReport(
          buildAiUploadReport(
            runAiUploadAssist(rawOcr, {
              engine,
              ocrEngine: engine,
              hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
          ),
        )
        setMessage({
          type: passageNeedsOptionsRef.current ? 'info' : 'success',
          text: passageNeedsOptionsRef.current
            ? `Passage + ${forced} questions detected, but no options were found. Type options A–D for each question in the panel above, mark the correct one, then Save all.`
            : `Passage + ${forced} questions detected. Review the passage panel above, mark correct options, then Save all.` })
        return 'passage'
      }
      const passageRetry = retryPassageSplitAfterHeal(rawOcr, engine)
      if (passageRetry?.parsed?.subQuestions?.length >= 2) {
        const healedCount = tryApplyPassageBundle(
          passageRetry.raw,
          polishExtractedText(passageRetry.raw, engine),
          { allowOptionless: true },
        )
        if (healedCount >= 2) {
          setAiUploadReport(
            buildAiUploadReport(
              runAiUploadAssist(rawOcr, {
                engine,
                ocrEngine: engine,
                hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)) }),
            ),
          )
          setMessage({
            type: passageNeedsOptionsRef.current ? 'info' : 'success',
            text: `AI re-split passage into ${healedCount} questions — review the passage panel, then Save all.` })
          return 'passage'
        }
      }
      const recovered = parseSingleQuestionUpload(normalized, rawOcr)
      const recoveredFound =
        recovered.optionsFound ?? countRealMcqOptions(recovered.text, recovered.options)
      if (!recovered.multi && recoveredFound >= 3 && String(recovered.text ?? '').trim()) {
        const status = applySingleParseResult(recovered, rawOcr)
        uploadResult = {
          ...uploadResult,
          ...status,
          found: recoveredFound,
          stem: recovered.text,
          options: recovered.options }
        stemForDiagram = recovered.text ?? stemForDiagram
        optsForDiagram = recovered.options ?? optsForDiagram
        found = recoveredFound
        if (optionsAutoCropped < 2) {
          setOptionImages((prev) => {
            const merged = optionImagesRef.current.some((img) => !!String(img ?? '').trim())
              ? syncOptionImagesRef(optionImagesRef.current)
              : prev
            return shouldStripMistakenOptionCrops(recovered.text, recovered.options, merged, rawOcr)
              ? [null, null, null, null]
              : merged
          })
        }
      } else {
        setMessage({
          type: 'error',
          text: 'Passage detected but split failed. Edit extracted text so each question starts on its own line (1., 2., Q1…), then click **Split passage (2+ Q)**.' })
        return 'passage-hint'
      }
    }
    const autoMsq =
      uploadResult.suggestedCorrectIndices?.length &&
      uploadResult.suggestedQuestionType === 'multiple_correct'
    const correctLetters = (uploadResult.suggestedCorrectIndices ?? [])
      .map((i) => String.fromCharCode(65 + i))
      .join(', ')
    const optionsNote =
      optionsAutoCropped >= 2
        ? ` ${formatOptionsAutoCropStatus(optionsAutoCropped, optionsAutoCropSource, { short: true })}.`
        : shouldAutoCropOptions && graphNeedForCrop >= 1
          ? ' Graph options still need images — click **Auto-crop A–D** to retry (Cloud vision when ready).'
          : imageFallbackApplied
            ? ' Cropped images used instead of unreliable OCR text.'
            : ''
    const diagramNote = diagramAutoCropped
      ? ' Diagram auto-cropped and will be saved with this question.'
      : needsDiagramCrop
        ? ' Text extracted — use **Crop graph / diagram** if the figure is missing in preview.'
        : diagramAttached
          ? ' Question diagram image attached (crop to stem only if options are listed below).'
          : ''
    const diagramAndOptionsNote = `${diagramNote}${optionsNote}`
    const fullAssist = runGuardedUploadStep(
      'full-upload-assist',
      () =>
        runFullUploadAssist(rawOcr, {
          engine,
          hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)),
          questionType: uploadQType,
          stem: stemForDiagram,
          options: optsForDiagram,
          // Report on the fields the teacher is actually looking at: stem and
          // options keep changing after the heal above (cleanup, salvage, crops).
          preHealed: preHealed
            ? {
                ...preHealed,
                stem: stemForDiagram,
                options: optsForDiagram,
                questionType: uploadQType,
              }
            : null,
          diagramAutoCropped,
          optionsAutoCropped,
        }),
      null,
    )
    runGuardedUploadStep(
      'ai-upload-report',
      () => {
        if (fullAssist) setAiUploadReport(buildAiUploadReport(fullAssist))
        return true
      },
      false,
    )
    let quality =
      fullAssist?.quality ??
      runGuardedUploadStep(
        'assess-upload-quality',
        () =>
          assessUploadQualityFull({
            detectedType: uploadQType,
            questionType: uploadQType,
            rawOcr,
            polished: normalized,
            stem: stemForDiagram,
            options: optsForDiagram,
            optionImages: imageFallbackApplied
              ? fallbackOptionImages
              : getEffectiveOptionImages(),
            hasSourceImage: !!(picked && isImageFile(picked) && !isPdfFile(picked)),
            optionsAutoCropped,
            diagramAutoCropped,
            questionImage: imageFallbackApplied ? fallbackQuestionImage : questionImage,
            imageFallbackApplied: imageFallbackApplied || optionsAutoCropped >= 2,
          }),
        null,
      )
    if (!quality) {
      quality = {
        confidence: 0,
        readyToSave: false,
        issues: [],
        inferredType: uploadQType,
      }
    }
    if (imageFallbackApplied || optionsAutoCropped >= 2) {
      quality = adjustQualityAfterImageFallback(quality, {
        imageFallbackApplied: true,
        optionImages: imageFallbackApplied ? fallbackOptionImages : getEffectiveOptionImages(),
        questionImage: imageFallbackApplied ? fallbackQuestionImage : questionImage })
      quality = { ...quality, imageFallbackApplied: true }
      if (quality.readyToSave && !validateQuestionMetadata(metadataDefaults()).length) {
        autoSaveAfterCropRef.current = true
      } else if (optionsAutoCropped >= 2 && !validateQuestionMetadata(metadataDefaults()).length) {
        autoSaveAfterCropRef.current = true
      }
    }
    const escalation = fullAssist?.escalation
    found = uploadResult.found ?? countRealMcqOptions(stemForDiagram, optsForDiagram)
    const qualityNote = formatUploadQualityMessage(quality)
    const typeNote =
      quality.inferredType && quality.inferredType !== uploadQType
        ? ` Type set to **${labelForUploadType(uploadQType)}**.`
        : uploadQType !== 'single_correct'
          ? ` Type: **${labelForUploadType(uploadQType)}**.`
          : ''
    const headline = buildUploadFinishHeadline({ found, quality, escalation })
    const msgType = resolveUploadMessageType('success', quality, escalation)
    const formEmpty =
      !String(stemForDiagram ?? '').trim() &&
      !(optsForDiagram ?? []).some((o) => String(o ?? '').trim())
    if (formEmpty) {
      setMessage({
        type: 'warning',
        text:
          rawOcr.trim()
            ? 'Convert ran but the question box and options A–D are still empty. Paste or type the text, or press F5 and Convert again.'
            : 'Convert found no question text. Needs review — use a clearer image, or type the question manually.',
      })
      uploadTimelineSnapRef.current = {
        found: 0,
        confidence: 0,
        readyToSave: false,
        needsReview: true,
        error: 'empty-form-after-convert',
      }
      return 'error'
    }
    setMessage({
      type: msgType,
      text: autoMsq
        ? `${headline}${diagramAndOptionsNote}${typeNote} MSQ correct: ${correctLetters}. ${qualityNote}`
        : `${headline}${diagramAndOptionsNote}${typeNote} ${qualityNote}` })

    const mode = needsDiagramCrop ? 'diagram-split' : 'single'
    uploadTimelineSnapRef.current = {
      found,
      confidence: quality.confidence ?? 0,
      readyToSave: quality.readyToSave ?? false,
      needsReview: uploadNeedsReview(quality, escalation),
      needsAgentRepair: !!escalation?.needsAgentRepair,
      imageFallbackApplied,
      steps: (fullAssist?.steps ?? []).slice(0, 6),
      stemPreview: String(stemForDiagram ?? '').slice(0, 140),
      detectedType: uploadQType }
    return mode
    } catch (e) {
      console.error('processExtractedText', e)
      const friendly = friendlyUploadError(e)
      const salvageText = String(rawOcr || ocrRawTextRef.current || text || '').trim()
      let salvaged = false
      if (!uploadParseAppliedRef.current && salvageText) {
        try {
          const parsed = salvageParseFromOcr(salvageText, engine)
          if (parsed) {
            applySingleParseResult(parsed, salvageText)
            salvaged = true
          }
        } catch (salvageErr) {
          console.warn('[QuestionBank] salvage parse failed', salvageErr)
        }
      }
      const keptForm = salvaged || uploadParseAppliedRef.current
      uploadTimelineSnapRef.current = {
        error: friendly ?? 'Could not process extracted text.',
        salvage: keptForm,
        stemPreview: String(salvageText).slice(0, 140),
      }
      setMessage({
        type: keptForm ? 'warning' : 'error',
        text: keptForm
          ? `${friendly ?? 'A later upload step failed.'} Extracted text was kept in the form — review stem and options A–D before Save.`
          : friendly ?? 'Could not process extracted text.',
      })
      return keptForm ? 'single' : 'error'
    } finally {
      uploadCropGuardRef.current = false
    }
  }

  const handleFile = async (picked, { preferSingle = false } = {}) => {
    if (!picked || !isSupportedUpload(picked)) {
      setMessage({ type: 'error', text: 'Use .docx, .pptx, .pdf, .png, or .jpg' })
      return
    }
    setFile(picked)
    clearCompressImageCache(picked)
    ocrSourceFileRef.current = picked
    matrixSupplementAttemptedRef.current = false
    matrixSupplementGenRef.current += 1
    setPassageBundle(null)
    setMatrixRows(['', '', '', ''])
    setMatrixCols(['', '', '', ''])
    setMatrixColLabels(defaultMatrixColLabels(4))
    setMatrixGridKey({})
    if (preferSingle) setSingleUploadFile(picked)
    setExtractedRaw('')
    setQText('')
    ocrRawTextRef.current = ''
    setOptionImages([null, null, null, null])
    setOptions(['', '', '', ''])
    setCorrectIndex(null)
    setCorrectIndices([])
    setSolution('')
    setExtractLowConfidence(false)
    setExtractCloudNote('')
    optionsAutoCropAttemptedRef.current = ''
    manualOptionSplitRef.current = false
    clearUploadPreview()
    if (isImageFile(picked) && !isPdfFile(picked) && !isWordFile(picked)) {
      const url = createPreviewUrl(picked)
      previewBlobRef.current = url
      setPreviewUrl(url)
    }
    const gen = ++ocrGenRef.current
    const signal = beginOcrRun()
    setLoading(true)
    setProgress(0)
    setParseStatus(null)
    uploadSessionStartedRef.current = Date.now()
    try {
      const useAutoMcqExtract =
        isWordFile(picked) || isImageFile(picked) || isPdfFile(picked)

      if (useAutoMcqExtract) {
        const result = await extractMcqFromImage(picked, reportExtractProgress, {
          signal,
          bookMode: false,
          saveToBank: true,
          paperMeta: buildBankUploadPaperMeta({
            subject,
            section,
            chapter,
            examPatternId: settings.examPatternId,
            exam: settings.examPatternId,
          }),
        })
        if (gen !== ocrGenRef.current) {
          notifyOcrInterrupted()
          return
        }
        if (consumeMathpixBankResult(result)) {
          logUploadSession(picked, result.savedDrafts?.length > 1 ? 'bulk' : 'single', result.engine)
          return
        }
        imageQueueOcrMetaRef.current = {
          lowConfidence: !!result.lowConfidence,
          cloudNote: String(result.cloudNote ?? ''),
          errorMessage: '',
        }
        if (!result.text?.trim()) {
          imageQueueOcrMetaRef.current.errorMessage =
            result.cloudNote ||
            'No text found — Needs review. Use a clearer image or type manually.'
          await processExtractedText('', picked, {
            engine: result.engine,
            lowConfidence: true,
            cloudNote: result.cloudNote,
            localOcrRaw: result.localOcrRaw,
            visionQuestions: result.questions,
          savedDrafts: result.savedDrafts,
          })
          setMessage({
            type: 'warning',
            text: imageQueueOcrMetaRef.current.errorMessage,
          })
          return
        }
        const mode = await processExtractedText(result.text, picked, {
          engine: result.engine,
          lowConfidence: result.lowConfidence,
          cloudNote: result.cloudNote,
          localOcrRaw: result.localOcrRaw,
          visionQuestions: result.questions,
          savedDrafts: result.savedDrafts,
        })
        logUploadSession(picked, mode, result.engine)
        if (mode === 'error') {
          // Still keep any text that processExtractedText managed to set.
          imageQueueOcrMetaRef.current.lowConfidence = true
          imageQueueOcrMetaRef.current.cloudNote =
            imageQueueOcrMetaRef.current.cloudNote ||
            'Extract needs review — check stem and options before Save.'
        }
        if (mode === 'single' || mode === 'diagram-split') {
          return
        }
        if (
          mode !== 'passage' &&
          mode !== 'bulk' &&
          mode !== 'matrix' &&
          mode !== 'passage-hint' &&
          mode !== 'error'
        ) {
          setMessage({
            type: 'success',
            text: `${describeMcqExtractResult(result)} Review previews, then Save.` })
        }
        return
      }

      const text = await extractTextFromFile(picked, reportExtractProgress, {
        signal,
        bookMode: false })
      if (gen !== ocrGenRef.current) {
        notifyOcrInterrupted()
        return
      }
      if (!text?.trim()) {
        setMessage({
          type: 'warning',
          text: 'No text found — Needs review. Use a clearer file or type the question manually.',
        })
        return
      }
      const wordBroken =
        isWordFile(picked) && wordExtractLooksBroken(text)
      const wordBrokenHint = wordBroken
        ? ' Some math still shows as □/? — Word may use pictures/MathType or Symbol font. Prefer Insert → Equation, or re-upload after F5; else use PDF/screenshot + Convert image → text.'
        : ''
      if (preferSingle || (isImageFile(picked) && !isPdfFile(picked))) {
        const mode = await processExtractedText(text, picked, {
          engine: isWordFile(picked) ? 'word' : undefined,
        })
        logUploadSession(picked, mode, isWordFile(picked) ? 'word' : undefined)
        if (wordBroken) {
          setMessage({
            type: 'info',
            text: `Word text imported.${wordBrokenHint}`,
          })
        }
      } else {
        const bulk = parseBulkQuestions(
          polishExtractedText(text, isWordFile(picked) ? 'word' : 'builtin'),
        )
        if (bulk.length <= 1) {
          const mode = await processExtractedText(text, picked, {
            engine: isWordFile(picked) ? 'word' : undefined,
          })
          logUploadSession(picked, mode, isWordFile(picked) ? 'word' : undefined)
          if (wordBroken) {
            setMessage({
              type: 'info',
              text: `Word text imported.${wordBrokenHint}`,
            })
          }
        } else {
          runBulkParse(text, 'word')
          setTab('bulk')
          setBulkPaste(text)
          logUploadSession(picked, 'bulk', isWordFile(picked) ? 'word' : undefined)
          setMessage({
            type: wordBroken ? 'info' : 'success',
            text: isPdfFile(picked)
              ? `Book PDF converted — ${bulk.length} questions found. Review Bulk tab, then Import all.`
              : `Found ${bulk.length} questions. Review Bulk tab, then Import all.${wordBrokenHint}`,
          })
        }
      }
    } catch (e) {
      if (gen === ocrGenRef.current) {
        if (isAbortError(e) || signal.aborted) return
        const { status } = getMathOcrLoadStatus()
        const friendly = friendlyUploadError(e, {
          isPdf: isPdfFile(picked),
          isFirstRun: status !== 'ready' })
        imageQueueOcrMetaRef.current = {
          lowConfidence: true,
          cloudNote: friendly || '',
          errorMessage: friendly || (e instanceof Error ? e.message : 'Extract failed'),
        }
        // If any OCR text landed in the ref before the throw, still try to fill the form.
        const salvage = String(ocrRawTextRef.current ?? '').trim()
        if (salvage) {
          try {
            await processExtractedText(salvage, picked, {
              forceSingle: true,
              lowConfidence: true,
              cloudNote: friendly || 'Partial extract — needs review before Save.',
            })
            imageQueueOcrMetaRef.current.cloudNote =
              friendly || 'Partial extract — needs review before Save.'
            imageQueueOcrMetaRef.current.errorMessage = ''
          } catch {
            /* keep error path */
          }
        }
        if (friendly) {
          setMessage({ type: 'error', text: friendly })
          logUploadSession(picked, 'error')
        }
      }
    } finally {
      finishOcrRun(gen)
      if (gen === ocrGenRef.current) {
        finalizeActiveImageQueueOcr()
      }
    }
  }

  const startImageQueueItem = async (item) => {
    if (!item?.file || loading || saving) return
    setActiveImageQueueId(item.id)
    activeImageQueueIdRef.current = item.id
    imageQueueOcrMetaRef.current = {
      lowConfidence: false,
      cloudNote: '',
      errorMessage: '',
    }
    patchImageQueueItem(item.id, { status: 'processing', errorMessage: undefined })
    setMessage({
      type: 'info',
      text: `Queue: OCR for “${item.name}” — review, then Save or Reject.`,
    })
    await handleFile(item.file, { preferSingle: true })
  }

  const enqueueImageFiles = (fileList) => {
    const images = pickQueueableImages(fileList)
    if (!images.length) return false
    const items = images.map(makeImageQueueItem)
    const next = [...imageUploadQueueRef.current, ...items]
    imageUploadQueueRef.current = next
    setImageUploadQueue(next)

    const activeId = activeImageQueueIdRef.current
    const active = activeId ? next.find((i) => i.id === activeId) : null
    const hold =
      loading ||
      saving ||
      (active &&
        (active.status === 'processing' ||
          active.status === 'ready' ||
          active.status === 'needs_review'))
    if (!hold) {
      const first = findNextPendingImage(next)
      if (first) void startImageQueueItem(first)
    } else {
      setMessage({
        type: 'info',
        text: `Added ${items.length} image(s) to the queue (${next.length} total). Finish the current review first.`,
      })
    }
    return true
  }

  const advanceImageQueue = (finalStatus) => {
    const id = activeImageQueueIdRef.current
    if (id && (finalStatus === 'saved' || finalStatus === 'rejected')) {
      patchImageQueueItem(id, { status: finalStatus })
    }
    resetSingleFormFields()
    setActiveImageQueueId(null)
    activeImageQueueIdRef.current = null
    queueMicrotask(() => {
      const nextItem = findNextPendingImage(imageUploadQueueRef.current)
      if (nextItem) {
        void startImageQueueItem(nextItem)
        return
      }
      const left = imageUploadQueueRef.current.filter((i) =>
        ['pending', 'processing', 'ready', 'needs_review', 'error'].includes(i.status),
      ).length
      if (left === 0 && imageUploadQueueRef.current.length) {
        setMessage({
          type: 'success',
          text: 'Image queue finished — saved items are in the question bank. Clear done items when you like.',
        })
      }
    })
  }

  const rejectActiveImageQueueItem = () => {
    if (loading || saving) return
    const id = activeImageQueueIdRef.current
    if (!id) {
      resetSingleFormFields()
      return
    }
    setMessage({ type: 'info', text: 'Rejected — skipped without saving. Loading next…' })
    advanceImageQueue('rejected')
  }

  const selectImageQueueItem = (id) => {
    if (loading || saving) return
    const item = imageUploadQueueRef.current.find((i) => i.id === id)
    if (!item) return
    if (item.status === 'saved' || item.status === 'rejected') {
      setMessage({ type: 'info', text: `“${item.name}” is already ${item.status}.` })
      return
    }
    if (item.status === 'pending' || item.status === 'error') {
      void startImageQueueItem(item)
      return
    }
    // ready / needs_review — re-run OCR so the form matches this file
    void startImageQueueItem({ ...item, status: 'pending' })
  }

  const clearDoneImageQueue = () => {
    setImageUploadQueue((prev) => {
      const next = prev.filter((i) => i.status !== 'saved' && i.status !== 'rejected')
      imageUploadQueueRef.current = next
      return next
    })
  }

  const clearAllImageQueue = () => {
    if (loading) return
    imageUploadQueueRef.current = []
    setImageUploadQueue([])
    setActiveImageQueueId(null)
    activeImageQueueIdRef.current = null
    resetSingleFormFields()
  }

  const handleSingleTabFiles = (fileList) => {
    const files = [...(fileList ?? [])]
    if (!files.length) return
    const images = pickQueueableImages(files)
    if (images.length >= 1 && images.length === files.length) {
      enqueueImageFiles(images)
      return
    }
    if (images.length >= 2) {
      enqueueImageFiles(images)
      const other = files.find((f) => !images.includes(f))
      if (other) {
        setMessage({
          type: 'info',
          text: `Queued ${images.length} images. Open non-image files one at a time (Word/PDF).`,
        })
      }
      return
    }
    handleFile(files[0], { preferSingle: true })
  }

  const importBulk = () => {
    if (bulkPreview.length === 0) return
    if (!ensureMetadata()) return
    const defaults = metadataDefaults()
    const bankSnapshot = [...saved]
    const candidateRows = []
    let skippedDuplicates = 0

    for (const q of bulkPreview) {
      const merged = applyQuestionMetadata(q, defaults)
      const entry = {
        subject: merged.subject,
        questionType: merged.questionType,
        text: merged.text,
        section: merged.section,
        chapter: merged.chapter,
        topic: merged.topic,
        examIds: merged.examIds,
        toughnessLevel: merged.toughnessLevel,
        source: merged.source,
        options: q.options?.filter((o) => o.trim()) ?? [],
        correctIndex: q.correctIndex,
        correctIndices: q.correctIndices,
        correctInteger: q.correctInteger,
        correctNumerical: q.correctNumerical,
        numericalTolerance: q.numericalTolerance,
        msqMarking: q.questionType === 'multiple_correct' ? q.msqMarking : undefined,
        solution: q.solution,
        videoSolution: q.videoSolution,
        contentMode: q.contentMode,
        questionImage: q.questionImage,
        optionsImage: q.optionsImage,
        optionImages: q.optionImages,
        solutionImage: q.solutionImage,
        ...buildConfidencePersistFields(null, q),
      }
      const dup = findDuplicateQuestions(entry, bankSnapshot)
      const toImport = dup.length ? attachDuplicateReviewFields(entry, dup) : entry
      if (dup.length) skippedDuplicates++
      candidateRows.push(toImport)
      bankSnapshot.unshift(toImport)
    }

    const { ok: qualityOk, skipped: qualitySkipped } = filterBulkImportRows(candidateRows, {
      minConfidence: 35,
      skipBlocking: true })
    const toImport = qualityOk
    const skippedLowQuality = qualitySkipped.length

    if (!toImport.length) {
      setMessage({
        type: 'error',
        text:
          skippedDuplicates > 0
            ? 'Import blocked: every row failed quality checks (empty stem, missing options, etc.). Possible duplicates were still eligible but none passed quality.'
            : 'Import blocked: every row failed quality checks (empty stem, missing options, etc.).' })
      return
    }

    addBulkUploadedQuestionsChunked(toImport)
    refresh()
    setBulkPreview([])
    const dupNote =
      skippedDuplicates > 0
        ? ` ${skippedDuplicates} possible duplicate(s) kept as drafts to compare (not published).`
        : ''
    const qualityNote =
      skippedLowQuality > 0 ? ` Skipped ${skippedLowQuality} low-quality row(s).` : ''
    setMessage({
      type: 'success',
      text: `Imported ${toImport.length} question(s).${dupNote}${qualityNote}` })
  }

  const toggleMsqCorrect = (idx) => {
    setCorrectIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b),
    )
  }

  const metadataDefaults = () => ({
    subject,
    section,
    chapter,
    topic,
    questionType: qType,
    examIds,
    toughnessLevel,
    source })

  const ensureMetadata = () => {
    const errors =
      bulkPreview.length > 0
        ? [
            ...validateQuestionMetadata(metadataDefaults(), { requireQuestionType: false }),
            ...validateBulkPreviewQuestionTypes(bulkPreview),
          ]
        : validateQuestionMetadata(metadataDefaults())
    if (errors.length) {
      setMessage({ type: 'error', text: errors.join(' ') })
      return false
    }
    return true
  }

  const savePdfCropBundleToBank = async (bundle) => {
    if (!ensureMetadata()) return false
    const optionLabels = IMAGE_OPTION_LABELS.slice(0, 4)
    const defaults = metadataDefaults()
    const metaBase = {
      contentMode: 'hybrid',
      subject,
      section: section.trim() || undefined,
      chapter: chapter.trim() || undefined,
      topic: topic.trim() || undefined,
      examIds: [...examIds],
      toughnessLevel:
        toughnessLevel !== '' && toughnessLevel != null ? Number(toughnessLevel) : undefined,
      source: normalizeSource(source) || `PDF crop (page ${bundle.pageNum})`,
    }
    const text = stemTextFromBundle(
      bundle.label.trim() || `PDF page ${bundle.pageNum} question`,
      bundle.ocrMeta,
    )
    const ocrMeta = bundle.ocrMeta ?? {}

    const persistOk = async (entry) => {
      try {
        const out = await persistToBank(entry)
        if (out?.persist === 'duplicate') return false
        return out?.persist === 'saved' || out?.persist === 'updated'
      } catch (e) {
        showBankMessage(
          'error',
          e instanceof Error ? e.message : 'Could not save — storage may be full.',
        )
        return false
      }
    }

    if (bundle.mode === 'full' && bundle.fullImage) {
      const qt =
        bundle.questionType === 'multiple_correct' ? 'multiple_correct' : 'single_correct'
      const fullAsText = ocrMeta.full?.useText === true
      const fullFlags = stemFlagsForSave({ stem: bundle.fullImage }, ocrMeta)
      return persistOk({
        ...metaBase,
        questionType: qt,
        text: fullAsText && ocrMeta.full?.text ? ocrMeta.full.text : text,
        questionImage: fullAsText ? undefined : bundle.fullImage,
        ...fullFlags,
        contentMode: fullAsText ? '' : 'hybrid',
        options: optionLabels,
        correctIndex: bundle.correctIndex ?? 0,
        ...(qt === 'multiple_correct'
          ? { correctIndices: bundle.correctIndices.length ? bundle.correctIndices : [0] }
          : {}),
      })
    }

    const { regions } = bundle
    const stemFlags = stemFlagsForSave(regions, ocrMeta)
    const questionImage = stemImageForSave(regions, ocrMeta)
    const optPayload = optionsPayloadFromRegions(regions, null, ocrMeta)
    const solPayload = solutionPayloadFromBundle(regions, ocrMeta)

    if (bundle.questionType === 'passage_scq' || bundle.questionType === 'passage_integer') {
      const passageMetaType = bundle.questionType
      const passageAsText = ocrUseText(ocrMeta, 'passage_body')
      const passageText =
        passageAsText && ocrText(ocrMeta, 'passage_body')
          ? ocrText(ocrMeta, 'passage_body')
          : text
      const passageImage =
        passageAsText && !regions.passage_diagram
          ? undefined
          : regions.passage_diagram || regions.passage_body || undefined
      const passageImageCrop = !!regions.passage_diagram && !regions.passage_body
      const subs = bundle.subQuestions.filter(
        (sq) => sq.stem || sq.optionsBlock || sq.optionImages.some(Boolean),
      )
      if (!subs.length) {
        showBankMessage('error', 'Passage needs at least one sub-question crop.')
        return false
      }
      try {
        let savedParentId = null
        const contractBatch = []
        const pendingInBatch = []
        for (let i = 0; i < subs.length; i += 1) {
          const sq = subs[i]
          const subOcr = scopedPassageSubOcrMeta(ocrMeta, i)
          const stemLabel =
            ocrUseText(subOcr, 'sub_stem') && ocrText(subOcr, 'sub_stem')
              ? ocrText(subOcr, 'sub_stem')
              : `${passageText} — Q${i + 1}`
          const optPayload = optionsPayloadFromRegions(regions, sq, subOcr)
          const subStemImg = ocrUseText(subOcr, 'sub_stem') ? undefined : sq.stem || undefined
          const sqPayload =
            passageMetaType === 'passage_integer'
              ? {
                  questionType: 'passage_integer',
                  text: stemLabel,
                  correctInteger: parseInt(String(sq.correctInteger || '0'), 10) || 0,
                  contentMode: 'hybrid',
                }
              : buildPassageSubQuestionPayload(
                  'passage_scq',
                  {
                    options: optionLabels,
                    correctIndex: sq.correctIndex ?? bundle.correctIndex ?? 0,
                  },
                  stemLabel,
                )
          const entry = normalizePassageQuestionStorage(
            applyQuestionMetadata(
              {
                ...metaBase,
                ...sqPayload,
                questionImage: subStemImg,
                stemTextInImage: !!subStemImg,
                ...optPayload,
                ...solPayload,
                ...(i === 0
                  ? {
                      passageText,
                      ...(passageImage
                        ? { passageImage, passageImageCrop: passageImageCrop }
                        : {}),
                    }
                  : { passageId: savedParentId, passageText: undefined }),
              },
              defaults,
            ),
            [...saved, ...pendingInBatch],
          )
          const dup = findDuplicateQuestions(entry, [...saved, ...pendingInBatch])
          const toSave = dup.length ? attachDuplicateReviewFields(entry, dup) : entry
          if (dup.length && i === 0) {
            setDuplicateAlarm({ matches: dup, entry: toSave, saved: true, canDiscard: false })
          }
          contractBatch.push(toSave)
          pendingInBatch.push(toSave)
          const savedRow = addUploadedQuestion(toSave)
          if (i === 0) savedParentId = savedRow.id
        }
        assertPassageSetStorageConsistent(contractBatch)
        refresh()
        return true
      } catch (e) {
        showBankMessage(
          'error',
          e instanceof Error ? e.message : 'Could not save passage set.',
        )
        return false
      }
    }

    if (bundle.questionType === 'matrix_match') {
      const mtx = ocrMeta.column_I?.matrixParsed
      return persistOk({
        ...metaBase,
        questionType: 'matrix_match',
        text: ocrMeta.stem?.useText && ocrMeta.stem?.text ? ocrMeta.stem.text : text || 'Match the Column',
        questionImage: questionImage,
        optionsImage: ocrMeta.column_II?.useText ? undefined : regions.column_II || undefined,
        ...stemFlags,
        ...(mtx && ocrMeta.column_I?.useText
          ? {
              matrixRows: mtx.matrixRows,
              matrixCols: mtx.matrixCols,
              matrixColLabels: mtx.matrixColLabels,
            }
          : {
              matrixRows: ['(A)', '(B)', '(C)', '(D)'],
              matrixCols: ['1', '2', '3', '4', '5'],
              matrixColLabels: defaultMatrixColLabels(5),
            }),
        matrixAnswerKey: normalizeMatrixAnswerKey(
          String.fromCharCode(65 + (bundle.correctIndex ?? 0)),
        ),
        correctIndex: bundle.correctIndex ?? 0,
        ...solPayload,
      })
    }

    if (bundle.questionType === 'integer') {
      return persistOk({
        ...metaBase,
        questionType: 'integer',
        text,
        questionImage,
        ...stemFlags,
        ...solPayload,
        correctInteger: parseInt(String(bundle.subQuestions?.[0]?.correctInteger || '0'), 10) || 0,
      })
    }

    if (bundle.questionType === 'numerical') {
      const rawNum = bundle.subQuestions?.[0]?.correctNumerical || '0'
      const numCheck = validateNumericalAnswer(rawNum)
      if (!numCheck.ok) {
        showBankMessage('error', numCheck.error ?? 'Enter a valid numerical answer on the crop item.')
        return false
      }
      return persistOk({
        ...metaBase,
        questionType: 'numerical',
        text,
        questionImage,
        ...stemFlags,
        ...solPayload,
        correctNumerical: numCheck.value,
        numericalTolerance: 0.01,
      })
    }

    return persistOk({
      ...metaBase,
      questionType: bundle.questionType,
      text,
      questionImage,
      ...stemFlags,
      ...optPayload,
      ...solPayload,
      ...(bundle.questionType === 'multiple_correct'
        ? { correctIndices: bundle.correctIndices.length ? bundle.correctIndices : [0] }
        : { correctIndex: bundle.correctIndex ?? 0 }),
    })
  }

  return (
    <PortalPage
      role="upload"
      className="page question-bank-page"
      eyebrow={forceMineBank ? 'Your question bank' : 'Question bank'}
      title={forceMineBank ? 'Organise your questions' : 'Manage Question Bank'}
      subtitle={
        forceMineBank
          ? 'Filter by chapter, topic, type, or toughness. Uploads enter the main Review & publish queue. Delete removes from your bank only after silent publish.'
          : 'Upload new questions, review draft and published saves, and manage meta tags.'
      }
      actions={
        <Link
          to={`/exam/${UPLOADED_TEST_ID}`}
          className="btn btn-primary bank-test-bank-btn"
          title={`${examEligibleCount} questions tagged for ${selectedExamName} (or untagged); ${shownQuestions.length} in this view · ${saved.length} total stored`}
        >
          <span className="bank-test-bank-label">Test bank</span>
          <span className="bank-test-bank-counts">
            {examEligibleCount} for {selectedExamName} · {shownQuestions.length} shown
          </span>
        </Link>
      }
    >
      <QuestionBankHubNav
        hubMode={hubMode}
        onHubChange={handleHubChange}
        viewTab={viewTab}
        onViewTabChange={handleViewTabChange}
        showReviewLink={accessMainBank}
        counts={{
          total: subBankScoped.length,
          draft: draftCount,
          published: publishedCount,
          reportsOpen: countOpenQuestionReports(),
        }}
      />

      <QuestionBankSubBankNav
        activeSubBank={activeSubBank}
        onSubBankChange={handleSubBankChange}
        counts={subBankCounts}
        hybridDraftCount={hybridDraftCount}
        hybridTray={hybridTray}
        onHybridTrayChange={handleHybridTrayChange}
        readyDraftCount={hybridTrayCounts.ready}
        needsActionCount={hybridTrayCounts.needsAction}
      />

      {accessMainBank && (hubMode === 'view' || hubMode === 'review') ? (
        <BankReviewApproveStrip
          draftCount={draftCount}
          hybridDraftCount={hybridDraftCount}
          subBankActive={activeSubBank}
          onSynced={(result) => {
            refresh()
            if (result.added) {
              showBankMessage(
                'success',
                `Synced ${result.added} Hybrid AI draft(s). Review them under Hybrid AI sub-bank.`,
              )
              handleSubBankChange('ai')
              handleHubChange('view')
              handleViewTabChange('draft')
            } else if (postgresHasNoHybridAiRows(result)) {
              showBankMessage(
                hybridDraftCount > 0 ? 'info' : 'error',
                hybridSyncUserMessage(result, { localHybridDraftCount: hybridDraftCount }) ??
                  'Postgres has no Hybrid AI rows to sync.',
              )
            }
          }}
          onOpenReview={() => {
            handleHubChange('review')
            handleViewTabChange('draft')
          }}
        />
      ) : null}

      {hubMode !== panelHub ? (
        <p className="form-hint" role="status">
          {hubMode === 'view'
            ? 'Opening saved questions…'
            : hubMode === 'review'
              ? 'Opening review…'
              : hubMode === 'manage'
                ? 'Opening manage meta…'
                : 'Opening upload…'}
        </p>
      ) : null}

      {forceMineBank ? (
        <p className="form-hint teacher-bank-scope-banner">
          Showing <strong>your</strong> questions only
          {accessMainBank ? ' (owner=teacher). Open Main question bank from Teacher home for the full bank.' : '. Ask an admin for “Access main question bank” to browse the shared bank.'}
        </p>
      ) : null}
      {panelHub === 'upload' && (
      <div className="bank-settings card">
        <h3>Default test settings</h3>
        <p className="form-hint">
          <strong>Test bank</strong> count is filtered by the exam below ({examEligibleCount} of{' '}
          {saved.length} saved). <strong>View saved questions</strong> always shows the full bank (
          {saved.length}). Untagged questions count for every exam. Tag exams in the classification
          panel.
        </p>
        <div className="upload-settings-grid">
          <label>
            Exam
            <select
              value={settings.examPatternId}
              onChange={(e) => updateSettings({ examPatternId: e.target.value })}
            >
              {EXAM_PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Test paper type
            <select
              value={settings.testTypeId}
              onChange={(e) => updateSettings({ testTypeId: e.target.value })}
            >
              {TEST_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bank title
            <input
              value={settings.title}
              onChange={(e) => updateSettings({ title: e.target.value })}
            />
          </label>
        </div>
      </div>
      )}

      {saved.length === 0 && (
        <div className="bank-empty-recovery" role="status">
          <p className="form-hint">
            <strong>0 questions loaded</strong> on {window.location.origin}.{' '}
            {storageDiag.bytes > 0
              ? `Browser storage has ${Math.round(storageDiag.bytes / 1024)} KB but ${
                  storageDiag.parseOk ? `${storageDiag.count} readable` : 'format needs repair'
                } — try Restore below, or open Merge banks / Import backup.`
              : 'This Cursor browser may be empty, or storage was cleared. Try Restore, Copy from localhost, or Import JSON.'}
          </p>
          <div className="extract-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const r = await tryRecoverBankAsync()
                refresh()
                showBankMessage(
                  r.recovered || r.count > 0 ? 'success' : 'error',
                  r.recovered
                    ? `Restored ${r.count} question(s) from ${r.source ?? 'backup'}.`
                    : r.count > 0
                      ? `Bank already has ${r.count} question(s).`
                      : 'No backup found here. Use Copy from localhost or Import JSON.',
                )
              }}
            >
              Restore bank
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigateCopyBankFromLocalhost('/question-bank?hub=view&view=draft')}
            >
              Copy from localhost:5173
            </button>
            <Link to="/merge-banks" className="btn btn-ghost btn-sm">
              Merge / import JSON
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const n = repairBankFromBackups()
                refresh()
                showBankMessage(
                  n > 0 ? 'success' : 'error',
                  n > 0
                    ? `Restored ${n} question(s) from backup storage.`
                    : 'No localStorage backup found. Try Restore bank or Import JSON.',
                )
              }}
            >
              Restore from backup
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => refresh()}>
              Reload from storage
            </button>
          </div>
        </div>
      )}

      <BankStorageNotice
        count={saved.length}
        hostname={typeof window !== 'undefined' ? window.location.hostname : ''}
        onRefresh={refresh}
      />

      <BankSaveModeBar />

      {message.text && (
        <div
          ref={messageBannerRef}
          className={`bank-page-toast ${
            message.type === 'error'
              ? 'upload-error'
              : message.type === 'info'
                ? 'upload-info'
                : 'upload-success'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          <p className="bank-page-toast-text">{message.text}</p>
          <button
            type="button"
            className="bank-page-toast-close"
            aria-label="Close message"
            onClick={clearBankMessage}
          >
            ×
          </button>
        </div>
      )}

      <AiUploadAssistBanner report={aiUploadReport} onDismiss={() => setAiUploadReport(null)} />

      <UploadHistoryTimeline open={uploadHistoryOpen} onClose={() => setUploadHistoryOpen(false)} />

      {duplicateAlarm && (
        <div
          className="duplicate-alarm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-alarm-title"
          onClick={(e) => e.target === e.currentTarget && clearDuplicateAlarm()}
        >
          <div className="duplicate-alarm card duplicate-alarm-compare" role="alert" aria-live="assertive">
            <div className="duplicate-alarm-header">
              <span className="duplicate-alarm-icon" aria-hidden>
                ⚠
              </span>
              <strong id="duplicate-alarm-title">Possible duplicate — compare with original</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm duplicate-alarm-close"
                onClick={clearDuplicateAlarm}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p>
              {duplicateAlarm.purpose === 'publish'
                ? 'This matches a question already in the bank (any sub-bank). Compare them. Keep original only removes this duplicate from Draft. Keep both publishes it once.'
                : formatDuplicateAlarmMessage(duplicateAlarm.matches)}
            </p>
            <div className="duplicate-compare-grid">
              {duplicateAlarm.purpose === 'publish' ? (
                <>
                  <DuplicateCompareColumn
                    title="Original"
                    question={duplicateAlarm.matches[0]?.question}
                  />
                  <DuplicateCompareColumn title="Publishing this" question={duplicateAlarm.entry} />
                </>
              ) : (
                <>
                  <DuplicateCompareColumn title="This copy (draft)" question={duplicateAlarm.entry} />
                  <DuplicateCompareColumn
                    title="Original in your bank"
                    question={duplicateAlarm.matches[0]?.question}
                  />
                </>
              )}
            </div>
            <ul className="duplicate-alarm-list">
              {duplicateAlarm.matches.slice(0, 5).map((m) => (
                <li key={m.question.id}>
                  {formatDuplicateMatchLabel(m)}
                  : {questionPreviewLabel(m.question)}
                </li>
              ))}
            </ul>
            {duplicateAlarm.matches.length > 5 && (
              <p className="form-hint">…and {duplicateAlarm.matches.length - 5} more.</p>
            )}
            <div className="duplicate-alarm-actions">
              {duplicateAlarm.purpose === 'publish' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const id = duplicateAlarm.entry?.id
                      const keepIds = (duplicateAlarm.matches ?? [])
                        .map((match) => match?.question?.id)
                        .filter(Boolean)
                      clearDuplicateAlarm()
                      if (!id) return
                      const removed = removeDuplicateDraftOnly(id, { keepIds })
                      if (removed.blockedEmpty) {
                        showBankMessage(
                          'error',
                          'Could not remove the duplicate — that would empty the whole bank.',
                        )
                        return
                      }
                      if (!removed.removedIds.length) {
                        showBankMessage('error', 'Could not remove the duplicate draft.')
                        return
                      }
                      if (String(viewingQuestionId) === String(id)) setViewingQuestionId(null)
                      if (String(editingQuestionId) === String(id)) clearEditingState()
                      refresh()
                      showBankMessage(
                        'info',
                        'Kept the original only. The duplicate was removed from Draft.',
                      )
                    }}
                  >
                    Keep original only
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const id = duplicateAlarm.entry?.id
                      const silent = duplicateAlarm.silent === true
                      clearDuplicateAlarm()
                      if (id) handlePublishQuestion(id, { silent, allowDuplicate: true })
                    }}
                  >
                    Keep both
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const id = duplicateAlarm.entry?.id
                      clearDuplicateAlarm()
                      setHubMode('view')
                      handleViewTabChange('draft')
                      setViewerOpenMeta(false)
                      setViewerOpenContent(false)
                      if (id) setViewingQuestionId(id)
                    }}
                  >
                    Compare in Saved
                  </button>
                  {duplicateAlarm.canDiscard && duplicateAlarm.entry?.id ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const id = duplicateAlarm.entry.id
                        clearDuplicateAlarm()
                        handleDeleteFromBank(id)
                      }}
                    >
                      Discard this copy
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearDuplicateAlarm}>
                      Close
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {panelHub === 'manage' && (
        <>
          <ErrorBoundary compact title="Generate practice (Hybrid AI)">
            <GeminiScqTrialPanel
              questions={saved}
              onRefresh={refresh}
              onMessage={showBankMessage}
            />
          </ErrorBoundary>
          <ErrorBoundary compact title="Manage meta tags">
            <BankMetaManager
              bankQuestions={saved}
              onRefresh={refresh}
              onMessage={showBankMessage}
            />
          </ErrorBoundary>
        </>
      )}

      {(panelHub === 'view' || (panelHub === 'review' && accessMainBank)) && viewTab === 'draft' && canPublishBank && (
        <ErrorBoundary compact title="Fill with Hybrid AI">
          <BankHybridFill drafts={shownDrafts} onChanged={refresh} />
        </ErrorBoundary>
      )}

      {panelHub === 'view' && (
        <BankSavedView
          questions={shownQuestions}
          viewTab={viewTab}
          onSwitchViewTab={handleViewTabChange}
          filters={bankListFilters}
          onFiltersChange={setBankListFilters}
          teacherPrivateMode={forceMineBank}
          onView={(id) => {
            setViewerOpenMeta(false)
            setViewingQuestionId(id)
          }}
          onViewMeta={(id) => {
            setViewerOpenMeta(true)
            setViewerOpenContent(false)
            setViewingQuestionId(id)
          }}
          onEditQuestionAnswer={(q) => {
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
            setViewingQuestionId(null)
            loadQuestionIntoForm(q)
          }}
          onDelete={handleDeleteFromBank}
          onQuickTagSave={(id, updates) => {
            const q = saved.find((x) => String(x.id) === String(id))
            const ok = q
              ? applyMetadataToPassageSet(q, saved, applySavedQuestionPatch, updates)
              : applySavedQuestionPatch(id, updates)
            if (ok) {
              const set = q ? getPassageSetQuestions(q, saved) : null
              showBankMessage(
                'success',
                set && set.length > 1
                  ? `Metatags saved for all ${set.length} questions in this passage set.`
                  : 'Metadata tags saved.',
              )
            }
          }}
          onRefresh={refresh}
          onMessage={showBankMessage}
          onBackupImport={handleBackupImport}
          canPublish={canPublishBank}
          onPublish={(id) => handlePublishQuestion(id)}
          onPublishSilent={(id) => handlePublishQuestion(id, { silent: true })}
          onUnpublish={handleUnpublishQuestion}
          onPublishFilteredDrafts={(ids, opts) => {
            const unique = [...new Set(ids)]
            const silent = opts?.silent === true
            const readyIds = unique.filter((id) => {
              const q = saved.find((row) => String(row.id) === String(id))
              return q && blockersBesidesDuplicate(getQuestionPublishBlockers(q)).length === 0
            })
            const blocked = unique.length - readyIds.length
            const published = silent
              ? publishQuestionsSilently(readyIds)
              : publishUploadedQuestions(readyIds)
            finishBulkPublish(published, blocked, silent)
          }}
          onUnpublishFiltered={(ids) => {
            const unique = [...new Set(ids)]
            const moved = unpublishUploadedQuestions(unique)
            refresh()
            showBankMessage(
              'success',
              moved.length
                ? `Moved ${moved.length} question(s) back to draft.`
                : 'No questions were moved to draft.',
            )
          }}
        />
      )}

      {panelHub === 'review' && accessMainBank && (
        <BankReviewWorkspace
          questions={shownQuestions}
          reviewMode={reviewMode}
          onReviewModeChange={(mode) => {
            setReviewMode(mode)
            setSelectedQueueId(null)
          }}
          viewTab={viewTab}
          onViewTabChange={handleViewTabChange}
          filters={bankListFilters}
          onFiltersChange={setBankListFilters}
          selectedId={selectedQueueId}
          onSelectId={setSelectedQueueId}
          onView={(id) => {
            setViewerOpenMeta(false)
            setViewingQuestionId(id)
          }}
          onQuickTagSave={(id, updates) => {
            const q = saved.find((x) => String(x.id) === String(id))
            const ok = q
              ? applyMetadataToPassageSet(q, saved, applySavedQuestionPatch, updates)
              : applySavedQuestionPatch(id, updates)
            if (ok) {
              const set = q ? getPassageSetQuestions(q, saved) : null
              showBankMessage(
                'success',
                set && set.length > 1
                  ? `Metatags saved for all ${set.length} questions in this passage set.`
                  : 'Metadata tags saved.',
              )
            }
          }}
          canPublish={canPublishBank}
          onPublish={(id) => handlePublishQuestion(id)}
          onUnpublish={handleUnpublishQuestion}
          onPublishFilteredDrafts={(ids) => {
            const unique = [...new Set(ids)]
            const readyIds = unique.filter((id) => {
              const q = saved.find((row) => String(row.id) === String(id))
              return q && blockersBesidesDuplicate(getQuestionPublishBlockers(q)).length === 0
            })
            const blocked = unique.length - readyIds.length
            const published = publishUploadedQuestions(readyIds)
            finishBulkPublish(published, blocked, false)
          }}
          onUnpublishFiltered={(ids) => {
            const unique = [...new Set(ids)]
            const moved = unpublishUploadedQuestions(unique)
            refresh()
            showBankMessage(
              'success',
              moved.length
                ? `Moved ${moved.length} question(s) back to draft.`
                : 'No questions were moved to draft.',
            )
          }}
        />
      )}

      {panelHub === 'upload' && (
      <>
      <BankMathpixUploadPanel
        onRefresh={refresh}
        onOpenDrafts={openBankDrafts}
        onMessage={showBankMessage}
        paperDefaults={{
          subject,
          section,
          chapter,
          examPatternId: settings.examPatternId,
        }}
      />
      <div className="bank-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bank-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              clearDuplicateAlarm()
              setTab(t.id)
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {!(editingQuestionId && uploadEditFocus === 'content') && (
      <div className="card question-metadata-card question-metadata-card--collapsible">
        <QuestionMetadataForm
          collapsible={tab !== 'compose'}
          defaultOpen={tab === 'compose'}
          subject={subject}
          onSubjectChange={(v) => {
            lockMetaField('subject')
            setSubject(v)
          }}
          section={section}
          onSectionChange={(v) => {
            lockMetaField('section')
            setSection(v)
          }}
          chapter={chapter}
          onChapterChange={(v) => {
            lockMetaField('chapter')
            setChapter(v)
          }}
          topic={topic}
          onTopicChange={(v) => {
            lockMetaField('topic')
            setTopic(v)
          }}
          questionType={qType}
          onQuestionTypeChange={handleQuestionTypeChange}
          examIds={examIds}
          onExamIdsChange={(v) => {
            lockMetaField('examIds')
            setExamIds(v)
          }}
          toughnessLevel={toughnessLevel}
          onToughnessLevelChange={(v) => {
            lockMetaField('toughnessLevel')
            setToughnessLevel(v)
          }}
          source={source}
          onSourceChange={setSource}
          hideQuestionType={bulkPreview.length > 0}
          bankQuestions={saved}
          onHierarchyRenamed={({ level, oldName, newName, questionCount }) => {
            refresh()
            const label = level.charAt(0).toUpperCase() + level.slice(1)
            setMessage({
              type: 'success',
              text: `${label} renamed from “${oldName}” to “${newName}”${questionCount ? ` — ${questionCount} saved question(s) updated` : ''}.` })
          }}
          onTypeRenamed={({ typeId, oldName, newName, restored }) => {
            setMessage({
              type: 'success',
              text: restored
                ? `Question type label restored to “${getQuestionType(typeId).name}”.`
                : `Question type renamed from “${oldName}” to “${newName}”. All questions of this type show the new label.` })
          }}
        />
        {aiSuggestedMeta.length > 0 && (
          <p className="form-hint" role="status">
            AI suggested metatags (you can change any):{' '}
            <strong>{aiSuggestedMeta.join(', ')}</strong>
          </p>
        )}
      </div>
      )}

      {editingQuestionId && !passageBundle?.editParentId && (
        <div className="bank-editing-banner bank-editing-banner-content" role="status">
          <span>
            <strong>Editing question &amp; answer</strong> — change stem, options, and correct answer
            in the highlighted panel below, then click <strong>Update question in bank</strong>.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearEditingState}>
            Cancel edit
          </button>
        </div>
      )}

      {passageBundle?.editParentId && tab === 'single' && (
        <div className="bank-editing-banner" role="status">
          <span>
            Editing passage set ({passageBundle.subQuestions.length} questions) — passage panel
            below; subject, exams, toughness, and solution fields apply to all on update.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearEditingState}>
            Cancel edit
          </button>
        </div>
      )}

      {passageBundle && (
        <div ref={passagePanelRef}>
        <PassageSplitPanel
          passageText={passageBundle.passageText}
          passageImage={passageBundle.passageImage ?? questionImage ?? undefined}
          passageImageCrop={passageBundle.passageImageCrop}
          subQuestions={passageBundle.subQuestions}
          isEditMode={!!passageBundle.editParentId}
          disabled={loading}
          onPassageChange={(passageText) =>
            setPassageBundle((b) =>
              persistPassageBundleFields({
                ...b,
                passageText,
                subQuestions: b?.subQuestions ?? [] }),
            )
          }
          onSubQuestionChange={(idx, patch) =>
            setPassageBundle((b) => ({
              ...b,
              subQuestions: b.subQuestions.map((sq, i) => (i === idx ? { ...sq, ...patch } : sq)) }))
          }
          onSubCorrectIndex={(idx, correctIndex) =>
            setPassageBundle((b) => ({
              ...b,
              subQuestions: b.subQuestions.map((sq, i) =>
                i === idx ? { ...sq, correctIndex } : sq,
              ) }))
          }
          onSubCorrectInteger={(idx, correctInteger) =>
            setPassageBundle((b) => ({
              ...b,
              subQuestions: b.subQuestions.map((sq, i) =>
                i === idx ? { ...sq, correctInteger } : sq,
              ) }))
          }
          onSubCorrectNumerical={(idx, correctNumerical) =>
            setPassageBundle((b) => ({
              ...b,
              subQuestions: b.subQuestions.map((sq, i) =>
                i === idx ? { ...sq, correctNumerical } : sq,
              ) }))
          }
          onSubAnswerMode={(idx, answerMode) =>
            setPassageBundle((b) => ({
              ...b,
              subQuestions: b.subQuestions.map((sq, i) =>
                i === idx
                  ? {
                      ...sq,
                      answerMode,
                      ...(answerMode === 'numerical'
                        ? { correctInteger: undefined }
                        : { correctNumerical: undefined }) }
                  : sq,
              ) }))
          }
          integerMode={isPassageSetIntegerMode(qType, passageBundle.subQuestions)}
          onSaveAll={savePassageBundle}
          onReplacePassageDiagram={(file) => {
            compressImageFile(file)
              .then(async (url) => {
                const passageText = passageBundle?.passageText ?? ''
                const resolved = await resolvePassageDiagramFromSource(url, passageText)
                if (!resolved) return
                setPassageBundle((b) =>
                  b
                    ? {
                        ...b,
                        passageImage: resolved.url,
                        passageImageCrop: resolved.passageImageCrop }
                    : b,
                )
              })
              .catch(() => {})
          }}
          onRemovePassageDiagram={() =>
            setPassageBundle((b) =>
              b ? { ...b, passageImage: undefined, passageImageCrop: false } : b,
            )
          }
          onDismiss={() => {
            if (passageBundle.editParentId) {
              clearEditingState()
              setMessage({ type: 'success', text: 'Passage edit cancelled.' })
              return
            }
            const first = passageBundle.subQuestions[0]
            setPassageBundle(null)
            if (first) {
              setQText(finalizeStemForBank(first.text ?? '', first.options ?? []))
              setOptions([...(first.options ?? []), '', '', '', ''].slice(0, 4))
              setCorrectIndex(first.correctIndex ?? 0)
            }
            setMessage({
              type: 'success',
              text: 'Passage split dismissed — question 1 loaded into the single form below.' })
          }}
        />
        </div>
      )}

      {(tab === 'single' || tab === 'compose') && (
        <div
          ref={editingQuestionId ? contentEditorRef : null}
          className={`card bank-panel ${editingQuestionId ? 'bank-content-editor-panel' : ''} ${tab === 'compose' ? 'compose-question-panel' : ''}`}
        >
          <h3>
            {editingQuestionId
              ? 'Edit question & answer'
              : tab === 'compose'
                ? 'Smart Compose'
                : 'Convert one question'}
          </h3>
          <p className="form-hint">
            {tab === 'compose' ? (
              <>
                Type or paste a full exam question for <strong>JEE</strong> or <strong>NEET</strong>.
                Separate stem, options, solution, marks, and status — with live math preview and soft
                checks before Save. Subject / chapter / topic / exams stay for the next question. For
                screenshots use <strong>Convert (OCR)</strong>.
              </>
            ) : (
              <>
                <strong>Type</strong> the question, upload one <strong>Word (.docx)</strong> file, or
                use a screenshot/PDF. Then mark the <strong>correct answer</strong> and Save.
              </>
            )}
          </p>

          {tab === 'compose' && (
            <ComposeQuestionExtras
              status={composeStatus}
              onStatusChange={setComposeStatus}
              marksCorrect={composeMarksCorrect}
              marksWrong={composeMarksWrong}
              onMarksCorrectChange={setComposeMarksCorrect}
              onMarksWrongChange={setComposeMarksWrong}
              markingHint={getQuestionType(qType)?.markingLabel}
            />
          )}

          {tab === 'compose' && (
            <ComposeSmartPanel
              softIssues={composeSoftIssues}
              similarWarning={composeSimilarWarning}
              assistBusy={composeAssistBusy}
              assistBadge={composeAssistBadge}
              disabled={loading || saving}
              onImproveStem={() => void runComposeAssist('stem')}
              onSuggestLatex={() => void runComposeAssist('latex')}
              onPolishOptions={() => void runComposeAssist('options')}
              showPolishOptions={
                qType === 'single_correct' ||
                qType === 'multiple_correct' ||
                qType === 'matrix_match'
              }
            />
          )}

          {(tab === 'compose' || editingQuestionId) && (
            <DraftFieldConfidence
              fieldConfidence={fieldConfidence}
              question={
                editingQuestionId
                  ? saved.find((x) => String(x.id) === String(editingQuestionId))
                  : null
              }
              variant="breakdown"
              alwaysShow
            />
          )}

          {tab === 'single' && !editingQuestionId && (
            <div className="single-entry-mode-bar" role="tablist" aria-label="How to add this question">
              <button
                type="button"
                role="tab"
                aria-selected={singleEntryMode === 'type'}
                className={`btn btn-sm ${singleEntryMode === 'type' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSingleEntryMode('type')}
              >
                Type question
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={singleEntryMode === 'word'}
                className={`btn btn-sm ${singleEntryMode === 'word' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSingleEntryMode('word')}
              >
                Upload Word
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={singleEntryMode === 'upload'}
                className={`btn btn-sm ${singleEntryMode === 'upload' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSingleEntryMode('upload')}
              >
                Image / PDF OCR
              </button>
            </div>
          )}

          {tab === 'single' && singleEntryMode === 'type' && !editingQuestionId && (
            <div className="single-entry-type-banner">
              <p className="form-hint" style={{ margin: 0 }}>
                Type the <strong>question</strong> and options <strong>A–D</strong> below. Tick{' '}
                <strong>Correct</strong> on the right answer, then Save. Prefer the{' '}
                <strong>Compose</strong> tab for full subject / difficulty / status fields.
              </p>
            </div>
          )}

          {tab === 'single' && singleEntryMode === 'word' && !editingQuestionId && (
            <div
              className="upload-dropzone upload-dropzone-sm single-entry-word-box"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files?.[0]
                if (f && isWordFile(f)) handleFile(f, { preferSingle: true })
                else if (f)
                  showBankMessage('error', 'Please drop a Word (.docx) file on this tab.')
              }}
            >
              <input
                ref={wordInputRef}
                id="bank-single-word"
                type="file"
                hidden
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f, { preferSingle: true })
                  e.target.value = ''
                }}
              />
              <p className="dropzone-title">Upload one Word question (.docx)</p>
              <p className="form-hint" style={{ margin: '0.35rem 0 0.75rem' }}>
                Prefer Insert → Equation in Word. One MCQ with (A)(B)(C)(D) works best. After extract,
                mark the correct answer below, then Save.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => wordInputRef.current?.click()}
              >
                Choose Word file
              </button>
              {singleUploadFile && isWordFile(singleUploadFile) && !loading && (
                <p className="dropzone-file" style={{ marginTop: '0.5rem' }}>
                  {singleUploadFile.name}
                </p>
              )}
            </div>
          )}

          {(tab === 'single' && (singleEntryMode === 'upload' || editingQuestionId)) && (
          <>
          <section className="upload-flow-section" aria-labelledby="upload-step-1">
            <h3 className="upload-flow-section-title" id="upload-step-1">
              <span>
                <span className="upload-flow-step">1</span>
                Upload image
              </span>
            </h3>
          <div className="upload-format-tip upload-format-tip-compact">
            <strong>Best format:</strong>
            <pre>{`Question text here?

A) First option
B) Second option
C) Third option
D) Fourth option`}</pre>
          </div>
          <div className="ocr-toolbar ocr-toolbar-prominent">
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => runAutoImageExtract()}
            >
              Convert image → text
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loading || !canRunImageOcr()}
              onClick={runSingleReExtract}
            >
              Re-extract OCR
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setUploadHistoryOpen(true)}
            >
              Upload history
            </button>
            {loading && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetOcrUi}>
                Reset upload
              </button>
            )}
            {(extractedRaw.trim() || qText.trim()) && (
              <span
                className={`ocr-engine-badge ocr-engine-badge--${
                  ocrEngine === 'cloud-vision' ? 'cloud' : 'local'
                }${extractLowConfidence ? ' ocr-engine-badge--warn' : ''}`}
                title={extractCloudNote || undefined}
              >
                {ocrEngineBadgeLabel(ocrEngine)}
                {extractLowConfidence ? ' · low confidence' : ''}
              </span>
            )}
            {!(extractedRaw.trim() || qText.trim()) && cloudVisionReady && (
              <span
                className={`ocr-engine-badge ocr-engine-badge--${
                  cloudVisionReady.ready ? 'cloud' : 'local'
                }`}
                title={cloudVisionReady.label}
              >
                {cloudVisionReady.ready ? 'AI' : 'AI'}
                {cloudVisionReady.ready ? ' ready' : ' (offline OCR)'}
              </span>
            )}
            <label className="form-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={useLocalAiLearning}
                onChange={(e) => {
                  const on = e.target.checked
                  setUseLocalAiLearning(on)
                  saveLocalAiLearningSettings({ enabled: on })
                  setLocalAiStats(getLocalAiLearningStats())
                }}
              />
              Use learned local improvements
            </label>
            <span className="form-hint" title="Saved only on this computer from past Cloud vision successes">
              Local AI learning from Cloud vision — {localAiStats.exampleCount} example
              {localAiStats.exampleCount === 1 ? '' : 's'}
            </span>
            <span className="form-hint ocr-toolbar-hint">
              Drop image or PDF — Mathpix reads the file, then Gemini fills drafts (not published).
            </span>
          </div>
          <OcrOutputFormatPicker id="bank-single-ocr-format" />
          <div
            className="upload-dropzone upload-dropzone-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleSingleTabFiles(e.dataTransfer.files)
            }}
            onClick={() => singleInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && singleInputRef.current?.click()}
          >
            <input
              ref={singleInputRef}
              id="bank-single-file"
              type="file"
              hidden
              multiple
              accept=".docx,.pptx,.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => {
                const list = e.target.files
                if (list?.length) handleSingleTabFiles(list)
                e.target.value = ''
              }}
            />
            <p className="dropzone-title">
              {loading
                ? progress > 0
                  ? `${getOcrProgressLabel(progress)} ${progress}%`
                  : 'Starting Mathpix OCR…'
                : 'Drop image(s) or PDF → fill form'}
            </p>
            <p className="form-hint" style={{ margin: '0.35rem 0 0' }}>
              Tip: select <strong>many PNG/JPG</strong> at once — the app queues them. For Word, use
              the <strong>Upload Word</strong> tab.
            </p>
            {singleUploadFile && !loading && (
              <p className="dropzone-file">{singleUploadFile.name}</p>
            )}
          </div>

          <SingleImageUploadQueue
            queue={imageUploadQueue}
            activeId={activeImageQueueId}
            busy={loading || saving}
            onSelect={selectImageQueueItem}
            onRejectActive={rejectActiveImageQueueItem}
            onClearDone={clearDoneImageQueue}
            onClearAll={clearAllImageQueue}
          />
          </section>
          </>
          )}

          {(tab === 'single' &&
            (singleEntryMode !== 'type' ||
              editingQuestionId ||
              loading ||
              !!previewUrl ||
              !!extractedRaw.trim())) && (
            <>
          {loading && (
            <div className="ocr-inline-status" role="status" aria-live="polite">
              <div className="ocr-inline-status-text">
                <strong>{getOcrProgressLabel(progress)}</strong>{' '}
                {progress > 0
                  ? `${progress}%`
                  : 'starting Mathpix OCR, then Gemini splits questions'}
                <span className="ocr-cancel-hint"> · Esc to cancel</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm ocr-cancel-btn"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  cancelExtract()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  cancelExtract()
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {parseStatus && qType !== 'integer' && qType !== 'numerical' && (
            <p className={`parse-status ${parseStatus.complete ? 'complete' : 'partial'}`}>
              Options detected: {parseStatus.found}/4
              {parseStatus.complete ? ' ✓' : ' — edit missing fields below'}
            </p>
          )}

          {extractLowConfidence && (extractedRaw.trim() || qText.trim()) && (
            <div className="upload-low-conf-banner" role="alert">
              <strong>Low OCR confidence.</strong>{' '}
              {extractCloudNote ||
                'Stem or options look garbled — fix them before Save, or click Convert image → text again (Cloud vision).'}
            </div>
          )}

          {(previewUrl || qText.trim()) && (parseStatus || qText.trim()) && !passageBundle && (
            <UploadReviewCompare
              sourceUrl={previewUrl || questionImage}
              stem={qText}
              options={options}
              answerSource={answerSource}
              solutionSource={solutionSource}
              ocrEngine={ocrEngine}
              solution={solution}
              correctIndex={correctIndex}
              correctIndices={correctIndices}
              fieldConfidence={fieldConfidence}
              regeneratingSolution={regeneratingSolution}
              onStemChange={setQText}
              onOptionChange={(i, text) =>
                setOptions((prev) => {
                  const next = [...prev]
                  next[i] = text
                  return next
                })
              }
              onRegenerateSolution={async () => {
                setRegeneratingSolution(true)
                try {
                  const deep = await generateDeepSolution(
                    {
                      text: qText,
                      options,
                      correctIndex,
                      correctIndices,
                      correctInteger:
                        correctInteger !== '' && Number.isFinite(Number(correctInteger))
                          ? Number(correctInteger)
                          : undefined,
                      correctNumerical:
                        correctNumerical !== '' && Number.isFinite(Number(correctNumerical))
                          ? Number(correctNumerical)
                          : undefined,
                      answerSource,
                      existingSolution: solution,
                      questionType: qType,
                    },
                    {
                      force: true,
                      preferCloud: true,
                      solveCloud: solveWithCloudVisionClient,
                    },
                  )
                  if (deep.solution) {
                    setSolution(deep.solution)
                    setSolutionSource(deep.solutionSource || 'draft')
                    setMessage({
                      type: 'success',
                      text:
                        deep.quality === 'cloud'
                          ? 'Deep AI solution ready — review steps, then Save.'
                          : 'Step-by-step draft ready — review carefully (add OPENAI_API_KEY or GEMINI_API_KEY for cloud-depth solutions).',
                    })
                  } else {
                    setMessage({
                      type: 'error',
                      text: 'Could not build a solution yet. Set the correct option (or integer), then try again.',
                    })
                  }
                } catch (e) {
                  setMessage({
                    type: 'error',
                    text: e instanceof Error ? e.message : 'Solution regenerate failed.',
                  })
                } finally {
                  setRegeneratingSolution(false)
                }
              }}
            />
          )}

          <details className="upload-advanced-tools">
            <summary className="upload-advanced-tools-summary">
              <span className="upload-advanced-tools-title">Advanced tools</span>
              <span className="upload-advanced-tools-sub">
                Source screenshot · OCR / LaTeX text · Parse &amp; fix
              </span>
            </summary>
          <div className="upload-workspace upload-workspace-compact">
              {previewUrl && !hideOcrSourceScreenshot && (
                <div className="upload-preview">
                  <h4>Source screenshot</h4>
                  <p className="form-hint">
                    Source image only — OCR text appears in the box below. Use <strong>Question
                    diagram</strong> to crop the figure.
                  </p>
                  <img src={previewUrl} alt="Uploaded question" className="upload-preview-img upload-preview-sm" />
                </div>
              )}
              <div className="upload-extract">
                <h4>OCR text / LaTeX source</h4>
                <p className="form-hint">
                  Badges show <strong>AI</strong> when extract ran. Click{' '}
                  <strong>Parse question &amp; options</strong> to re-split stem and A–D.
                </p>
                {!extractedRaw.trim() && previewUrl && !loading && (
                  <p className="parse-status partial">
                    Image attached but OCR text is empty — click <strong>Convert image → text</strong> or{' '}
                    <strong>Parse question &amp; options</strong> (first run may take 2–5 min while the LaTeX
                    model downloads).
                  </p>
                )}
                <textarea
                  className="extract-raw"
                  value={extractedRaw}
                  onChange={(e) => {
                    const v = e.target.value
                    setExtractedRaw(v)
                    ocrRawTextRef.current = v.replace(/\r\n/g, '\n').trim()
                    clearTimeout(pasteParseTimerRef.current)
                    if (
                      /\(\s*A\s*\)/i.test(v) &&
                      /\(\s*B\s*\)/i.test(v) &&
                      !looksLikeMatchColumnUpload(v) &&
                      !looksLikePassageMultiMcq(v)
                    ) {
                      pasteParseTimerRef.current = setTimeout(() => {
                        const r = reparseFromRaw(v)
                        if (r.matrix || r.passage) return
                        setParseStatus({
                          found: r.found ?? 0,
                          complete: !!r.complete })
                        if (r.complete) {
                          showBankMessage('success', 'Question + all 4 options filled from paste.')
                        }
                      }, 500)
                    }
                  }}
                  placeholder="Paste full MCQ LaTeX… question stem then (A) … (B) … (C) … (D)"
                  rows={8}
                />
                <div className="extract-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={loading || (!extractedRaw.trim() && !canRunImageOcr())}
                    onClick={() => parseFromExtractedOrImage()}
                  >
                    Parse question &amp; options
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!extractedRaw.trim() || loading}
                    onClick={fixMathSymbols}
                  >
                    Fix math symbols
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!extractedRaw.trim() || loading}
                    title="Re-run matrix parser if auto-fill missed a row"
                    onClick={() => {
                      const raw = ocrRawTextRef.current || extractedRaw.replace(/\r\n/g, '\n').trim()
                      const norm = normalizeMathText(raw)
                      const parsed = tryApplyMatchColumn(raw, norm)
                      if (parsed) {
                        setMessage({
                          type: 'success',
                          text: `Match the Column re-parsed (${countFilledMatrixRows(parsed)}/4 rows). Review the grid, then Save.` })
                      } else {
                        setMessage({
                          type: 'error',
                          text: 'Could not parse — need Column-I (A–D) and Column-II (P–T or 1–5) in the OCR text.' })
                      }
                    }}
                  >
                    Re-parse match column
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading || (!hasPassageSplitSource && !canRunImageOcr())}
                    onClick={() => splitPassageFromExtractedOrImage()}
                  >
                    Split passage (2+ Q)
                  </button>
                </div>
              </div>
            </div>
          </details>
            </>
          )}

          <section className="upload-flow-section" aria-labelledby="upload-step-edit">
            <h3 className="upload-flow-section-title" id="upload-step-edit">
              <span>
                <span className="upload-flow-step">{tab === 'compose' ? '1' : '2'}</span>
                {tab === 'compose' ? 'Question & options' : 'Edit question'}
              </span>
              {(extractedRaw.trim() || qText.trim()) && (
                <span
                  className={`ocr-engine-badge ocr-engine-badge--${
                    ocrEngine === 'cloud-vision' ? 'cloud' : 'local'
                  }`}
                >
                  {ocrEngineBadgeLabel(ocrEngine)}
                </span>
              )}
            </h3>
          <MathSymbolBar onInsert={handleSymbolInsert} disabled={loading} showCheatSheet={tab === 'compose'} />

          {tab === 'compose' && isPassageMetadataType(qType) && !passageBundle?.subQuestions?.length && (
            <div className="compose-passage-cta card-inner" role="status">
              <h4 className="compose-entry-title">Passage set (PIVQ / PSCQ)</h4>
              <p className="form-hint">
                RankArena stops at one stem. Here you can build a shared passage with two or more
                sub-questions — or paste OCR in Convert and use <strong>Split passage</strong>.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={loading}
                onClick={startComposePassageSet}
              >
                Start passage set
              </button>
            </div>
          )}

          <section className="question-stem-block compose-entry-block compose-stem-block">
            <h4 className="compose-entry-title">
              {tab === 'compose' ? '1 · Stem' : 'Question body (Stem)'}
              {(tab === 'compose' || editingQuestionId) && (
                <FieldConfidenceInline field="stem" score={fieldConfidence?.fields?.stem} />
              )}
            </h4>
            <p className="form-hint compose-entry-hint">
              Type/paste the full question stem. While this box is focused, press <strong>Ctrl+E</strong>{' '}
              for Symbols
              {tab === 'compose' ? (
                <>
                  {' '}
                  · <strong>Ctrl+S</strong> to save
                </>
              ) : null}
              .
            </p>

            <label>
              Stem text
              <textarea
                ref={questionRef}
                value={qText}
                onFocus={() => setActiveField({ type: 'question', index: 0 })}
                onChange={(e) => setQText(e.target.value)}
                onBlur={syncQuestionTextFromRepair}
                rows={tab === 'compose' ? 5 : 3}
                placeholder={
                  tab === 'compose'
                    ? 'Write the full question here. Use $…$ for inline math, or Ctrl+E for symbols.'
                    : undefined
                }
              />
            </label>
            {qType === 'matrix_match' ? (
              <p className="form-hint">
                Matrix match questions are text-only — no diagram crop is required. Use the matrix
                form below; the upload screenshot is only used for OCR.
              </p>
            ) : (
              <QuestionDiagramPanel
                passageBundle={passageBundle}
                stemNeedsDiagram={stemNeedsDiagram}
                questionImage={questionImage}
                stemTextInImage={stemTextInImage}
                splitCropSourceUrl={splitCropSourceUrl}
                loading={loading}
                onDiagramOnlyFile={(f) => attachQuestionDiagram(f, { diagramOnly: true })}
                onFullScreenshotFile={(f) => attachQuestionDiagram(f, { diagramOnly: false })}
                onOpenDiagramSplit={openDiagramSplit}
                onOpenFullSplit={openFullSplit}
                onRemoveDiagram={() => {
                  setQuestionImage(null)
                  setStemImageCrop(false)
                  setStemTextInImage(false)
                }}
                onStemTextInImageChange={setStemTextInImage}
              />
            )}
            {!passageBundle && (effectiveQText.trim() || stemPreviewImage) && (
              <div className="form-preview question-stem-preview">
                <div className="preview-header-row">
                  <span>{tab === 'compose' ? 'Live stem preview' : 'Preview:'}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading}
                    onClick={refreshQuestionPreview}
                  >
                    Refresh preview
                  </button>
                </div>
                <p className="form-hint">
                  {tab === 'compose' ? (
                    <>
                      Updates as you type — LaTeX in <code>$…$</code> renders like the real test.
                    </>
                  ) : (
                    <>
                      Preview shows the <strong>question stem</strong> only (like on the test). Each
                      option A–D has its own preview in the rows below.
                    </>
                  )}
                </p>
                <QuestionStem
                  text={effectiveQText}
                  options={options}
                  questionImage={stemPreviewImage}
                  hideTextWithImage={stemPreviewHideText}
                />
              </div>
            )}
          </section>

          <section className="compose-entry-block compose-solution-block">
            <div className="compose-entry-head">
              <h4 className="compose-entry-title">
                Solution / explanation
                {(tab === 'compose' || editingQuestionId) && (
                  <FieldConfidenceInline field="solution" score={fieldConfidence?.fields?.solution} />
                )}
              </h4>
              {(solutionSource && solutionSource !== 'unknown') || regeneratingSolution ? (
                <span
                  className={`upload-answer-badge upload-answer-badge--${solutionSource || 'draft'}`}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {regeneratingSolution
                    ? 'Writing solution…'
                    : solutionSource === 'from_paper'
                      ? 'From paper'
                      : solutionSource === 'ai_generated'
                        ? 'AI solution'
                        : solutionSource === 'draft'
                          ? 'Draft'
                          : 'Needs check'}
                </span>
              ) : null}
            </div>

            <p className="form-hint compose-entry-hint">
              Shown after test. While this box is focused, press <strong>Ctrl+E</strong> to insert symbols.
            </p>

            <textarea
              ref={solutionRef}
              value={solution}
              onFocus={() => setActiveField({ type: 'solution' })}
              onChange={(e) => {
                setSolution(e.target.value)
                setSolutionSource('manual')
              }}
              rows={5}
              placeholder={
                tab === 'compose'
                  ? 'Step-by-step solution (optional). Math in $…$ previews below.'
                  : 'Step-by-step solution fills here after Cloud vision / local AI — edit freely'
              }
            />
            {tab === 'compose' && solution.trim() ? (
              <div className="form-preview compose-solution-preview">
                <span className="preview-header-row">Live solution preview</span>
                <MathText text={solution} questionContext={qText} />
              </div>
            ) : null}
          </section>

          <label>
            Video solution URL (YouTube / Drive / hosted link)
            <input
              type="url"
              value={videoSolution}
              onChange={(e) => setVideoSolution(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
          </label>

          {qType === 'matrix_match' && (
            <div ref={matrixFormRef}>
            <MatrixMatchForm
              rows={matrixRows}
              ocrRaw={ocrRawTextRef.current || extractedRaw}
              cols={matrixCols}
              colCount={matrixColCount}
              colLabels={matrixColLabels}
              onColLabelsChange={setMatrixColLabels}
              onRowsChange={setMatrixRows}
              onColsChange={setMatrixCols}
              onColCountChange={setMatrixColCount}
              useOptions={matrixUseOptions}
              onUseOptionsChange={setMatrixUseOptions}
              options={options}
              onOptionsChange={setOptions}
              correctIndex={correctIndex}
              onCorrectIndexChange={setCorrectIndex}
              gridKey={matrixGridKey}
              onGridKeyChange={setMatrixGridKey}
              disabled={loading}
            />
            </div>
          )}

          {(qType === 'single_correct' || qType === 'multiple_correct') && (
            <section className="options-one-by-one compose-entry-block compose-options-block">
              <h4 className="compose-entry-title">
                {tab === 'compose' ? '2 · Options A–D' : 'Options A–D'}
                {(tab === 'compose' || editingQuestionId) && (
                  <FieldConfidenceInline field="options" score={fieldConfidence?.fields?.options} />
                )}
              </h4>
              <p className="form-hint">
                While an option box is focused, press <strong>Ctrl+E</strong> to open symbols.
                {' '}
                {tab === 'compose' ||
                singleEntryMode === 'type' ||
                singleEntryMode === 'word' ||
                (optionsAreTextOnlyMcq(options) &&
                  !stemSaysOptionsAreFigures(qText) &&
                  !optionImages.some((img) => !!String(img ?? '').trim())) ? (
                  <>
                    Type each option. Then tick <strong>Correct</strong> next to the right answer
                    {qType === 'multiple_correct' ? 's (you can tick more than one)' : ''} before you
                    Save.
                  </>
                ) : (
                  <>
                    Options as <strong>graphs in the same screenshot</strong>? The app tries{' '}
                    <strong>Auto-crop A–D</strong> automatically. If OCR text is garbled, it also
                    crops the question stem and options as images so you can still Save. Or use{' '}
                    <strong>Split stem &amp; options</strong> / <strong>Attach graph</strong> manually.
                    Always tick <strong>Correct</strong> on the right answer before Save.
                  </>
                )}
              </p>
              {splitCropSourceUrl &&
                (stemSaysOptionsAreFigures(qText) ||
                  countGraphOptionsNeedingImage(options, optionImages, qText) > 0 ||
                  optionImages.some((img) => !!String(img ?? '').trim())) && (
                <div className="option-crop-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading}
                    onClick={handleAutoCropOptions}
                  >
                    ✂ Auto-crop A–D
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading}
                    onClick={openFullSplit}
                  >
                    Split A–D manually
                  </button>
                </div>
              )}
              {countGraphOptionsNeedingImage(options, optionImages, qText) > 0 && (
                <p className="parse-status partial">
                  {countGraphOptionsNeedingImage(options, optionImages, qText)} option(s) look like
                  diagrams — attach a graph image only for those options.
                </p>
              )}
              {options.map((opt, i) => {
                const hasGraphImg = !!String(optionImages[i] ?? '').trim()
                const textOnlyRows =
                  optionsAreTextOnlyMcq(options) &&
                  !stemSaysOptionsAreFigures(qText) &&
                  !(optionImages ?? []).some((img) => !!String(img ?? '').trim())
                const showGraphControls =
                  !textOnlyRows &&
                  (hasGraphImg ||
                    countGraphOptionsNeedingImage(options, optionImages, qText) > 0 ||
                    stemSaysOptionsAreFigures(qText) ||
                    blobMentionsGraphOptions(`${qText}\n${(options ?? []).join('\n')}`))
                return (
                <div
                  key={i}
                  className={`option-step-row ${hasGraphImg ? 'option-step-has-graph' : ''}`}
                >
                  <div className="option-step-main">
                    <span className="option-step-label">{String.fromCharCode(65 + i)}</span>
                    <input
                      ref={(el) => {
                        optionRefs.current[i] = el
                      }}
                      type="text"
                      value={optionInputValue(opt, hasGraphImg, qText)}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      onChange={(e) => {
                        const next = [...options]
                        next[i] = e.target.value
                        setOptions(next)
                      }}
                      onFocus={() => {
                        setOptionStep(i)
                        setActiveField({ type: 'option', index: i })
                      }}
                    />
                    {qType === 'multiple_correct' && (
                      <label className={`msq-check ${correctIndices.includes(i) ? 'msq-check-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={correctIndices.includes(i)}
                          onChange={() => toggleMsqCorrect(i)}
                        />
                        Correct
                      </label>
                    )}
                    {qType === 'single_correct' && (
                      <label className={`msq-check ${correctIndex === i ? 'msq-check-on' : ''}`}>
                        <input
                          type="radio"
                          name="correct"
                          checked={correctIndex === i}
                          onChange={() => setCorrectIndex(i)}
                        />
                        Correct
                      </label>
                    )}
                  </div>
                  {(optionTextForDisplay(opt, hasGraphImg, qText) || hasGraphImg) && (
                    <div className="form-preview option-preview">
                      <OptionBody
                        text={opt}
                        optionImage={optionImages[i]}
                        questionText={qText}
                        allOptions={options}
                        optionLetter={String.fromCharCode(65 + i)}
                      />
                    </div>
                  )}
                  {showGraphControls && (
                  <div className="option-graph-attach">
                    <label className="btn btn-ghost btn-sm file-btn">
                      {hasGraphImg ? 'Replace graph' : 'Attach graph'}
                      <input
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        disabled={loading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) attachOptionGraph(i, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {hasGraphImg && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setOptionImages((prev) => {
                            const next = [...prev]
                            next[i] = null
                            return next
                          })
                        }}
                      >
                        Remove graph
                      </button>
                    )}
                  </div>
                  )}
                </div>
                )
              })}
              {options.length < 6 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={addOptionSlot}>
                  + Add option {String.fromCharCode(65 + options.length)}
                </button>
              )}
            </section>
          )}

          {qType === 'true_false' && (
            <div className="true-false-options-panel compose-entry-block">
              <h4 className="compose-entry-title">
                {tab === 'compose' ? '2 · True / False' : 'True / False'}
                {(tab === 'compose' || editingQuestionId) && (
                  <FieldConfidenceInline field="answer" score={fieldConfidence?.fields?.answer} />
                )}
              </h4>
              <p className="form-hint">
                Write the statement in <strong>Question text</strong> above, then tick the correct
                answer. <strong>CDF only</strong> — tag exams in classification above and set
                toughness to <strong>1</strong>.
              </p>
              <div className="true-false-options" role="radiogroup">
                {TRUE_FALSE_OPTIONS.map((label, i) => (
                  <label
                    key={label}
                    className={`option-row true-false-row ${correctIndex === i ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="tf-correct"
                      checked={correctIndex === i}
                      onChange={() => setCorrectIndex(i)}
                    />
                    <span className="true-false-label">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {qType === 'multiple_correct' && (
            <div className="msq-marking-panel card-inner">
              <h4>MSQ marking scheme</h4>
              <p className="form-hint">{formatMsqMarkingLabel(msqMarking)}</p>
              <div className="msq-marking-grid">
                {['full', 'partial1', 'partial2', 'partial3', 'wrongAny', 'unattempted'].map(
                  (key) => (
                    <label key={key}>
                      {key}
                      <input
                        type="number"
                        value={msqMarking[key]}
                        onChange={(e) =>
                          setMsqMarking((m) => ({ ...m, [key]: Number(e.target.value) }))
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            </div>
          )}

          {qType === 'integer' && (
            <div className="integer-grading-block compose-entry-block">
              {tab === 'compose' ? (
                <h4 className="compose-entry-title">
                  2 · Integer answer
                  {(tab === 'compose' || editingQuestionId) && (
                    <FieldConfidenceInline field="answer" score={fieldConfidence?.fields?.answer} />
                  )}
                </h4>
              ) : null}
              <p className="form-hint">
                Integer questions have <strong>no A–D options</strong>. Students type a number (up to 4
                digits) during the test.
              </p>
              <label>
                Correct integer (0–9999)
                <input
                  type="number"
                  min={0}
                  max={9999}
                  step={1}
                  value={correctInteger}
                  onChange={(e) => setCorrectInteger(e.target.value)}
                  placeholder="e.g. 4"
                />
              </label>
            </div>
          )}
          {qType === 'numerical' && (
            <div className="numerical-grading-block compose-entry-block">
              {tab === 'compose' ? (
                <h4 className="compose-entry-title">
                  2 · Numerical answer
                  {(tab === 'compose' || editingQuestionId) && (
                    <FieldConfidenceInline field="answer" score={fieldConfidence?.fields?.answer} />
                  )}
                </h4>
              ) : null}
              <p className="form-hint">
                Numerical questions have <strong>no A–D options</strong>. Students type a value (up
                to 6 digits, optional <code>-</code> and decimal) during the test.
              </p>
              <NumericalAnswerInput
                label="Correct numerical answer"
                value={correctNumerical}
                disabled={loading}
                onChange={(v) => setCorrectNumerical(v ?? '')}
              />
            </div>
          )}

          </section>

          {!passageBundle && (
            <>
              {qType === 'matrix_match' && !matrixUseOptions && (
                <p className="form-hint">
                  Before saving: tick the <strong>answer grid</strong> for each Column-I row you filled
                  (A–D ×{' '}
                  {(matrixColLabels.length
                    ? matrixColLabels
                    : defaultMatrixColLabels(matrixColCount)
                  )
                    .slice(0, matrixColCount)
                    .join('–')}
                  ).
                  {matrixCols.slice(0, matrixColCount).some((c) => !String(c ?? '').trim()) && (
                    <>
                      {' '}
                      Fill every Column II entry in the form — preview marks empty slots as{' '}
                      <em>(empty)</em>.
                    </>
                  )}
                </p>
              )}
              <section className="upload-flow-section" aria-labelledby="upload-step-save">
                <h3 className="upload-flow-section-title" id="upload-step-save">
                  <span>
                    <span className="upload-flow-step">{tab === 'compose' ? '2' : '3'}</span>
                    Save
                  </span>
                </h3>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || saving}
                onClick={saveSingle}
              >
                {saving
                  ? 'Saving…'
                  : editingQuestionId
                    ? 'Update question in bank'
                    : qType === 'matrix_match'
                      ? 'Save matrix match question'
                      : tab === 'compose'
                        ? composeStatus === 'active'
                          ? 'Save & publish (Ctrl+S)'
                          : 'Save composed question (Ctrl+S)'
                        : activeImageQueueId
                          ? 'Save & next image'
                          : 'Save to question bank'}
              </button>
              {activeImageQueueId && !passageBundle && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={loading || saving}
                  onClick={rejectActiveImageQueueItem}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Reject / skip
                </button>
              )}
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'hybrid' && (
        <div className="card bank-panel hybrid-panel">
          <h3>Hybrid — images + answer key (no OCR)</h3>
          <p className="form-hint">
            Upload question, options, and solution as <strong>separate images</strong>. Students see
            the images in the exam; you only enter the <strong>correct answer</strong> for
            auto-grading. Optional text labels help search and backups.
          </p>
          {hybridPayloadBytes > 0 && (
            <p className="form-hint hybrid-size-hint">
              Images in this form: ~{formatImageSize(hybridPayloadBytes)} (stored in browser).
              Export JSON regularly — large banks may hit storage limits.
            </p>
          )}

          <HybridImageSlot
            label="Question image"
            hint="Screenshot of the question stem"
            required
            busy={false}
            imageRole="stem"
            dataUrl={hybridQuestionImage}
            fileName={hybridQuestionImageName}
            onSet={(url, name) => {
              setHybridQuestionImage(url)
              setHybridQuestionImageName(name)
            }}
            onClear={() => {
              setHybridQuestionImage(null)
              setHybridQuestionImageName('')
            }}
          />

          <label className="hybrid-text-label">
            Short text label (optional)
            <input
              value={hybridQText}
              onChange={(e) => setHybridQText(e.target.value)}
              placeholder="e.g. Vector triangle area — for your reference only"
            />
          </label>

          {(qType === 'single_correct' || qType === 'multiple_correct') && (
            <div className="hybrid-options-section">
              <h4>Options images</h4>
              <div className="hybrid-options-mode">
                <label>
                  <input
                    type="radio"
                    name="hybrid-opt-mode"
                    checked={hybridOptionsMode === 'single'}
                    onChange={() => setHybridOptionsMode('single')}
                  />
                  One image (A–D together)
                </label>
                <label>
                  <input
                    type="radio"
                    name="hybrid-opt-mode"
                    checked={hybridOptionsMode === 'separate'}
                    onChange={() => setHybridOptionsMode('separate')}
                  />
                  Separate image per option
                </label>
              </div>

              {hybridOptionsMode === 'single' ? (
                <HybridImageSlot
                  label="Options image (A, B, C, D)"
                  hint="One screenshot with all four options"
                  required
                  busy={false}
                  imageRole="option"
                  dataUrl={hybridOptionsImage}
                  fileName={hybridOptionsImageName}
                  onSet={(url, name) => {
                    setHybridOptionsImage(url)
                    setHybridOptionsImageName(name)
                  }}
                  onClear={() => {
                    setHybridOptionsImage(null)
                    setHybridOptionsImageName('')
                  }}
                />
              ) : (
                <div className="hybrid-option-slots">
                  {[0, 1, 2, 3].map((i) => (
                    <HybridImageSlot
                      key={i}
                      label={`Option ${String.fromCharCode(65 + i)}`}
                      busy={false}
                      imageRole="option"
                      dataUrl={hybridOptionImages[i]}
                      fileName={hybridOptionImageNames[i]}
                      onSet={(url, name) => {
                        const imgs = [...hybridOptionImages]
                        const names = [...hybridOptionImageNames]
                        imgs[i] = url
                        names[i] = name
                        setHybridOptionImages(imgs)
                        setHybridOptionImageNames(names)
                      }}
                      onClear={() => {
                        const imgs = [...hybridOptionImages]
                        const names = [...hybridOptionImageNames]
                        imgs[i] = null
                        names[i] = ''
                        setHybridOptionImages(imgs)
                        setHybridOptionImageNames(names)
                      }}
                    />
                  ))}
                </div>
              )}

              {qType === 'single_correct' && (
                <div className="hybrid-correct-row">
                  <span className="form-hint">Correct option:</span>
                  {[0, 1, 2, 3].map((i) => (
                    <label key={i} className="hybrid-correct-pill">
                      <input
                        type="radio"
                        name="hybrid-correct"
                        checked={correctIndex === i}
                        onChange={() => setCorrectIndex(i)}
                      />
                      {String.fromCharCode(65 + i)}
                    </label>
                  ))}
                </div>
              )}

              {qType === 'multiple_correct' && (
                <div className="hybrid-correct-row">
                  <span className="form-hint">Correct options (MSQ):</span>
                  {[0, 1, 2, 3].map((i) => (
                    <label key={i} className="hybrid-correct-pill">
                      <input
                        type="checkbox"
                        checked={correctIndices.includes(i)}
                        onChange={() => toggleMsqCorrect(i)}
                      />
                      {String.fromCharCode(65 + i)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {qType === 'integer' && (
            <div className="integer-grading-block">
              <p className="form-hint">
                No option images needed — students type up to 4 digits during the test.
              </p>
              <label>
                Correct integer (0–9999)
                <input
                  type="number"
                  min={0}
                  max={9999}
                  step={1}
                  value={correctInteger}
                  onChange={(e) => setCorrectInteger(e.target.value)}
                  placeholder="e.g. 4"
                />
              </label>
            </div>
          )}
          {qType === 'numerical' && (
            <div className="numerical-grading-block">
              <p className="form-hint">No option images — students type up to 6 digits with optional decimal.</p>
              <NumericalAnswerInput
                label="Correct numerical (for grading)"
                value={correctNumerical}
                disabled={loading}
                onChange={(v) => setCorrectNumerical(v ?? '')}
              />
            </div>
          )}

          <ImageOcrChoicePanel
            label="Solution image (optional)"
            hint="Upload a solution image — OCR runs in the background. Compare and pick text or image, same as PDF crop."
            dataUrl={hybridSolutionImage}
            onImageChange={(url) => {
              setHybridSolutionImage(url)
              setHybridSolutionImageName(url ? hybridSolutionImageName || 'solution.png' : '')
              if (!url) setHybridSolutionUseText(null)
            }}
            textValue={hybridSolution}
            onTextChange={setHybridSolution}
            useTextChoice={hybridSolutionUseText}
            onUseTextChoice={setHybridSolutionUseText}
            parseStepKey="solution"
          />

          <label className="hybrid-text-label">
            Solution text (optional)
            <textarea
              rows={3}
              value={hybridSolution}
              onChange={(e) => setHybridSolution(e.target.value)}
              placeholder="Typed solution — or pick Save as text after image OCR above"
            />
          </label>

          <button type="button" className="btn btn-primary" onClick={saveHybrid}>
            {editingQuestionId ? 'Update hybrid question' : 'Save hybrid question'}
          </button>
        </div>
      )}

      {tab === 'pdf-crop' && (
        <PdfQuestionCropPanel
          defaultQuestionType={qType}
          onSaveBundle={savePdfCropBundleToBank}
          onMessage={(type, text) => {
            if (type) setMessage({ type, text })
            else setMessage({ type: '', text: '' })
          }}
        />
      )}

      {tab === 'jee-test' && (
        <JeeUploadTestPanel onMessage={(msg) => setMessage(msg)} />
      )}

      {tab === 'file' && (
        <div className="card bank-panel">
          <h3>Upload file → extract questions</h3>
          <p className="form-hint">
            Word, PDF, or image. <strong>Mathpix</strong> reads handwriting, photo, or PDF.
            <strong> Local AI</strong> splits questions. <strong>Gemini</strong> fills tags, answers, and
            solutions (not OCR). Drafts are not published. Pick LaTeX (default) or Word below.
          </p>
          <p className="form-hint" data-testid="bank-file-upload-portal-hint">
            Whole test paper or a book / question bank PDF? Use{' '}
            <Link to="/upload?type=paper">Upload PDF → Any test paper</Link> or{' '}
            <Link to="/upload?type=book">Book / question bank PDF</Link> — same checks and review as Official PYQ.
          </p>
          <OcrOutputFormatPicker id="bank-file-ocr-format" />
          <div
            className="upload-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              handleFile(e.dataTransfer.files[0], { preferSingle: false })
            }}
            onClick={() => document.getElementById('bank-file')?.click()}
          >
            <input
              id="bank-file"
              type="file"
              hidden
              accept=".docx,.pptx,.pdf,.png,.jpg,.jpeg,image/*,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={(e) => handleFile(e.target.files?.[0], { preferSingle: false })}
            />
            <p className="dropzone-title">
              {loading ? `Processing… ${progress}%` : 'Drop Word / PDF / Image'}
            </p>
            {file && <p className="dropzone-file">{file.name}</p>}
          </div>
          {previewUrl && (
            <img src={previewUrl} alt="" className="upload-preview-img" />
          )}
        </div>
      )}

      {tab === 'json' && (
        <div className="card bank-panel">
          <h3>JSON import</h3>
          <p className="form-hint">
            Paste JSON array or upload <code>.json</code> file. Supports all question types &
            MSQ marking. If you used both <code>localhost:5173</code> and <code>5174</code>, export
            from the tab with more questions, then <strong>Merge backup</strong> on{' '}
            <code>5173</code> (each port has its own saved bank).
          </p>
          <textarea
            className="bulk-paste-area"
            value={jsonPaste}
            onChange={(e) => setJsonPaste(e.target.value)}
            rows={12}
          />
          <div className="extract-actions">
            <button type="button" className="btn btn-primary" onClick={() => handleJsonImport(jsonPaste)}>
              Parse JSON
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setJsonPaste(JSON_TEMPLATE)}>
              Load template
            </button>
            <label className="btn btn-ghost file-btn">
              Upload .json
              <input type="file" accept=".json,application/json" hidden onChange={(e) => handleJsonFile(e.target.files?.[0])} />
            </label>
            <label className="btn btn-ghost file-btn">
              Merge backup (keep existing)
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  handleBackupImport(e.target.files?.[0], { merge: true })
                  e.target.value = ''
                }}
              />
            </label>
            <label className="btn btn-ghost file-btn">
              Replace bank from backup
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  handleBackupImport(e.target.files?.[0], { merge: false })
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}

      {tab === 'csv' && (
        <div className="card bank-panel">
          <h3>CSV import / export</h3>
          <p className="form-hint">
            Columns: subject, section (unit), chapter, topic, toughnessLevel, source, examIds (pipe-separated), questionType, optionA–F,
            correctIndex, correctIndices (use 0|2 for MSQ), correctInteger, correctNumerical…
          </p>
          <div className="extract-actions" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => saved.length && downloadQuestionsCsv(saved)}
              disabled={!saved.length}
            >
              Download CSV ({saved.length})
            </button>
            <label className="btn btn-primary file-btn">
              Upload CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleCsvFile(f)
              }} />
            </label>
          </div>
          <textarea
            className="bulk-paste-area"
            placeholder="Paste CSV content here (with header row)..."
            rows={8}
            onBlur={(e) => e.target.value.trim() && handleCsvImport(e.target.value)}
          />
        </div>
      )}

      {tab === 'bulk' && (
        <div className="card bank-panel">
          <h3>Bulk paste questions</h3>
          <p className="form-hint">
            Separate questions with Q1, Q2… or blank lines. Use Answer: A or Answer: A,C for MSQ.
            Add Solution: after the answer for post-test review. From Word: if math shows as empty
            boxes, click <strong>Fix Word math</strong> then <strong>Parse all questions</strong>.
          </p>
          <textarea
            className="bulk-paste-area"
            value={bulkPaste}
            onChange={(e) => setBulkPaste(e.target.value)}
            rows={14}
          />
          <div className="extract-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => runBulkParse(bulkPaste)}
            >
              Parse all questions
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const fixed = polishExtractedText(repairWordSymbolFontText(bulkPaste), 'word')
                setBulkPaste(fixed)
                runBulkParse(fixed, 'word')
              }}
            >
              Fix Word math
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setBulkPaste(BULK_TEMPLATE)}
            >
              Load template
            </button>
          </div>
        </div>
      )}

      {bulkPreview.length > 0 && (
        <div className="card bank-panel bulk-preview-panel">
          <h3>Preview ({bulkPreview.length} questions)</h3>
          <p className="form-hint">
            Set <strong>question type</strong> for each row below (auto-detected when possible). Use{' '}
            <strong>Edit</strong> to fix a wrong stem, options, or solution before import. Subject,
            unit, chapter, topic, and exams use the classification panel above.
          </p>
          <ul className="bulk-preview-list">
            {bulkPreview.map((q, i) => (
              <li key={q.id}>
                <span className="bulk-q-num">Q{i + 1}</span>
                {q.uploadQualityScore != null && bulkEditIndex !== i && (
                  <span
                    className={`bulk-q-quality${q.uploadQualityReady ? ' bulk-q-quality--ok' : ''}`}
                    title="AI upload quality score"
                  >
                    {q.uploadQualityScore}/100
                  </span>
                )}
                {bulkEditIndex === i ? (
                  <BulkPreviewEditForm
                    question={q}
                    typeOptions={bulkQuestionTypeOptions}
                    onSave={(patch) => saveBulkPreviewEdit(i, patch)}
                    onCancel={() => setBulkEditIndex(null)}
                  />
                ) : (
                <div className="bulk-q-body">
                  <div className="bulk-q-stem">
                    <QuestionStem text={q.text} options={q.options} className="bulk-q-stem-text" />
                  </div>
                  {((q.options?.length ?? 0) > 0 &&
                    ((q.options ?? []).some((o) => String(o ?? '').trim()) ||
                      q.questionType === 'single_correct' ||
                      q.questionType === 'multiple_correct' ||
                      q.questionType === 'true_false')) &&
                    !matchOptionsFoldedIntoLists(q.text, q.options) && (
                    <ul className="bulk-q-options">
                      {(q.options ?? ['', '', '', ''])
                        .slice(0, q.questionType === 'true_false' ? 2 : 4)
                        .map((opt, oi) => {
                        const body = String(opt ?? '').trim()
                        const correctSet = new Set(
                          q.correctIndices?.length
                            ? q.correctIndices
                            : [q.correctIndex ?? 0],
                        )
                        const isCorrect = correctSet.has(oi)
                        const isMcq =
                          q.questionType === 'single_correct' ||
                          q.questionType === 'multiple_correct' ||
                          q.questionType === 'true_false'
                        const letter =
                          q.questionType === 'true_false'
                            ? oi === 0
                              ? 'T'
                              : 'F'
                            : String.fromCharCode(65 + oi)
                        if (!body && !q.optionImages?.[oi] && !isMcq) return null
                        return (
                          <li
                            key={oi}
                            className={`bulk-q-option${isCorrect ? ' bulk-q-option-correct' : ''}`}
                          >
                            <span className="bulk-q-opt-label">{letter}</span>
                            <div className="bulk-q-opt-body">
                              {body ? (
                                <OptionBody
                                  text={opt}
                                  optionImage={q.optionImages?.[oi]}
                                  questionText={q.text}
                                  allOptions={q.options}
                                  optionLetter={letter}
                                />
                              ) : (
                                <span className="bulk-q-opt-empty">(graph / image option)</span>
                              )}
                              {isCorrect && <span className="bulk-q-opt-key">Correct</span>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {q.solution?.trim() && (
                    <div className="bulk-q-solution">
                      <span className="bulk-q-solution-label">Solution</span>
                      <MathText text={q.solution} questionContext={q.text} />
                    </div>
                  )}
                  <label className="bulk-q-type-field">
                    <span className="bulk-q-type-label">Type</span>
                    <select
                      value={q.questionType || ''}
                      onChange={(e) => updateBulkPreviewItem(i, { questionType: e.target.value })}
                      aria-label={`Question ${i + 1} type`}
                    >
                      <option value="">— Select type —</option>
                      {bulkQuestionTypeOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="bulk-q-meta">
                    {q.subject} · {q.section} · {q.chapter} · {q.topic} ·{' '}
                    {formatExamLabels(q.examIds)}
                    {q.toughnessLevel ? ` · ${formatToughnessLabel(q.toughnessLevel)}` : ''}
                    {q.source ? ` · ${q.source}` : ''}
                    {(q.options?.filter((o) => String(o ?? '').trim()).length ?? 0) > 0 && (
                      <>
                        {' '}
                        · Key:{' '}
                        {(q.correctIndices ?? [q.correctIndex ?? 0])
                          .map((x) => String.fromCharCode(65 + x))
                          .join(', ')}
                      </>
                    )}
                  </span>
                </div>
                )}
                {bulkEditIndex !== i && (
                <div className="bulk-preview-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBulkEditIndex(i)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setBulkPreview((list) => list.filter((_, j) => j !== i))
                    if (bulkEditIndex === i) setBulkEditIndex(null)
                  }}
                >
                  Remove
                </button>
                </div>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={importBulk}>
            Import all to question bank
          </button>
        </div>
      )}

      {editingQuestionId && uploadEditFocus === 'content' && (
        <div className="card question-metadata-card question-metadata-card--collapsible">
          <QuestionMetadataForm
            collapsible
            defaultOpen={false}
            subject={subject}
            onSubjectChange={(v) => {
              lockMetaField('subject')
              setSubject(v)
            }}
            section={section}
            onSectionChange={(v) => {
              lockMetaField('section')
              setSection(v)
            }}
            chapter={chapter}
            onChapterChange={(v) => {
              lockMetaField('chapter')
              setChapter(v)
            }}
            topic={topic}
            onTopicChange={(v) => {
              lockMetaField('topic')
              setTopic(v)
            }}
            questionType={qType}
            onQuestionTypeChange={handleQuestionTypeChange}
            examIds={examIds}
            onExamIdsChange={(v) => {
              lockMetaField('examIds')
              setExamIds(v)
            }}
            toughnessLevel={toughnessLevel}
            onToughnessLevelChange={(v) => {
              lockMetaField('toughnessLevel')
              setToughnessLevel(v)
            }}
            source={source}
            onSourceChange={setSource}
            bankQuestions={saved}
            onHierarchyRenamed={({ level, oldName, newName, questionCount }) => {
              refresh()
              const label = level.charAt(0).toUpperCase() + level.slice(1)
              setMessage({
                type: 'success',
                text: `${label} renamed from “${oldName}” to “${newName}”${questionCount ? ` — ${questionCount} saved question(s) updated` : ''}.` })
            }}
            onTypeRenamed={({ typeId, oldName, newName, restored }) => {
              setMessage({
                type: 'success',
                text: restored
                  ? `Question type label restored to “${getQuestionType(typeId).name}”.`
                  : `Question type renamed from “${oldName}” to “${newName}”. All questions of this type show the new label.` })
            }}
          />
        </div>
      )}

      <BankRecentUploads
        questions={saved}
        onView={(id) => {
          setViewerOpenMeta(false)
          setViewerOpenContent(false)
          setViewingQuestionId(id)
        }}
        onViewMeta={(id) => {
          setViewerOpenMeta(true)
          setViewerOpenContent(false)
          setViewingQuestionId(id)
        }}
        onEditQuestionAnswer={(q) => {
          setViewerOpenMeta(false)
          setViewerOpenContent(true)
          setViewingQuestionId(q.id)
        }}
        onViewAll={() => setHubMode('view')}
      />
      </>
      )}

      {splitCropOpen && splitCropSourceUrl && (
        <ImageSplitCropper
          sourceUrl={splitCropSourceUrl}
          mode={splitCropMode}
          onClose={() => setSplitCropOpen(false)}
          onComplete={applySplitCrops}
        />
      )}

      {viewingQuestion && (
        <SavedQuestionViewer
          question={viewingQuestion}
          allQuestions={saved}
          initialEditMeta={viewerOpenMeta}
          initialEditContent={viewerOpenContent}
          onClose={() => {
            setViewingQuestionId(null)
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
            clearDuplicateAlarm()
          }}
          onSave={(updates) => {
            const isMetaOnly = Object.keys(updates).every((k) =>
              [
                'subject',
                'section',
                'chapter',
                'topic',
                'questionType',
                'examIds',
                'toughnessLevel',
                'source',
              ].includes(k),
            )
            const ok = applyMetadataToPassageSet(
              viewingQuestion,
              saved,
              applySavedQuestionPatch,
              updates,
            )
            if (!ok) return false
            const set = getPassageSetQuestions(viewingQuestion, saved)
            showBankMessage(
              'success',
              isMetaOnly
                ? set && set.length > 1
                  ? `Metatags saved for all ${set.length} questions in this passage set.`
                  : 'Metatags saved.'
                : 'Question and answer saved.',
            )
            setViewingQuestionId(null)
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
            return true
          }}
          onEditFull={() => {
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
            loadQuestionIntoForm(viewingQuestion)
          }}
          onDelete={() => {
            handleDeleteFromBank(viewingQuestion.id)
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
          }}
          canPublish={canPublishBank}
          onPublish={handlePublishQuestion}
          onPublishSilent={(id) => handlePublishQuestion(id, { silent: true })}
          onUnpublish={handleUnpublishQuestion}
          onPatchQuestion={(updates) => {
            const ok = applySavedQuestionPatch(viewingQuestion.id, updates)
            if (ok && ('text' in updates || 'questionImage' in updates || 'options' in updates)) {
              showBankMessage(
                'success',
                'Image converted to OCR text — review the question below. Published questions were moved back to draft.',
              )
            }
            return ok
          }}
          onViewRelated={(id) => {
            setViewerOpenMeta(false)
            setViewerOpenContent(false)
            setViewingQuestionId(id)
          }}
        />
      )}

      {loading && (
        <div className="ocr-cancel-bar" role="status" aria-live="polite">
          <span>
            <strong>{getOcrProgressLabel(progress)}</strong>
            {progress > 0 ? ` — ${progress}%` : ' — please wait…'}
            <span className="ocr-cancel-hint"> (Esc or Cancel)</span>
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm ocr-cancel-btn"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              cancelExtract()
            }}
            onClick={(e) => {
              e.preventDefault()
              cancelExtract()
            }}
          >
            Cancel OCR
          </button>
        </div>
      )}
    </PortalPage>
  )
}


