/**
 * Unified upload structure router — classify OCR → structure zones → parse path.
 * Local Hybrid OCR + ONNX LaTeX + geometry (no Mathpix cloud required).
 */

import { classifyUploadFromOcr, inferUploadQuestionType } from './classifyUploadFromOcr.js'
import { enhanceMatrixParse } from './aiUploadAssist.js'
import {
  looksLikeMatchColumnUpload,
  looksLikeMatrixAlgebraQuestion,
  resolveMatchColumnUpload,
} from './parseMatchColumnUpload.js'
import { enhanceMatrixColsFromGeometry } from './columnGeometry.js'
import { looksLikePassageMultiMcq, resolvePassageUpload } from './parsePassageUpload.js'
import { parseBulkQuestions } from './parseBulkQuestions.js'
import { shouldPreferDiagramOverMatrixParse } from './stemDiagramDetect.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import { getLastOcrLayout } from './ocrLineDataCache.js'
import { buildDocumentStructureFromSource, parseFromDocumentStructure } from './structureAwareUpload.js'
import { processMcqUploadExtract } from './uploadPipeline.js'
import { buildOnnxEnrichedStructure } from './onnxStructureEnrich.js'

/**
 * @typedef {'matrix'|'passage'|'bulk'|'single'|'matrix-deferred'|'passage-deferred'|'continue'} UploadRouteMode
 */

/**
 * @param {{
 *   rawOcr: string
 *   normalized?: string
 *   sourceFile?: File | Blob | null
 *   engine?: string
 *   forceSingle?: boolean
 *   useOnnxStructure?: boolean
 * }} ctx
 */
export function routeUploadExtract(ctx) {
  const rawOcr = String(ctx.rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  const normalized = ctx.normalized ?? polishExtractedText(rawOcr, ctx.engine ?? 'builtin')
  const forceSingle = !!ctx.forceSingle

  if (!rawOcr) {
    return { mode: 'continue', rawOcr, normalized, classified: null, structure: null }
  }

  const layout = ctx.sourceFile ? getLastOcrLayout(ctx.sourceFile) : null
  let structure = buildDocumentStructureFromSource(ctx.sourceFile)
  if (structure && layout?.lineData?.length) {
    structure = {
      ...structure,
      lineData: layout.lineData,
      imageSize: layout.imageSize ?? {},
    }
  }

  const structParse = structure
    ? parseFromDocumentStructure(structure, rawOcr)
    : null

  if (!forceSingle && structParse?.kind === 'matrix' && structParse.matrix) {
    const layoutData = layout?.lineData ?? []
    let matrix = structParse.matrix
    if (layoutData.length) {
      matrix = enhanceMatrixColsFromGeometry(matrix, layoutData, layout?.imageSize ?? {})
    }
    const enhanced = enhanceMatrixParse(matrix, rawOcr)
    return {
      mode: 'matrix',
      rawOcr,
      normalized,
      structure,
      structParse,
      matrix: enhanced.improved ? enhanced.parsed : matrix,
      matrixSteps: enhanced.steps ?? [],
      source: 'document-structure+geometry',
    }
  }

  if (!forceSingle && structParse?.kind === 'passage' && structParse.passage?.subQuestions?.length >= 2) {
    return {
      mode: 'passage',
      rawOcr,
      normalized,
      structure,
      structParse,
      passage: structParse.passage,
      passageCount: structParse.passage.subQuestions.length,
      source: 'document-structure',
    }
  }

  if (
    !forceSingle &&
    !looksLikeMatrixAlgebraQuestion(rawOcr) &&
    !shouldPreferDiagramOverMatrixParse('', normalized, []) &&
    looksLikeMatchColumnUpload(rawOcr)
  ) {
    let matrix = resolveMatchColumnUpload(rawOcr)
    if (matrix && layout?.lineData?.length) {
      matrix = enhanceMatrixColsFromGeometry(matrix, layout.lineData, layout?.imageSize ?? {})
    }
    if (matrix) {
      const enhanced = enhanceMatrixParse(matrix, rawOcr)
      return {
        mode: 'matrix',
        rawOcr,
        normalized,
        structure,
        matrix: enhanced.improved ? enhanced.parsed : matrix,
        matrixSteps: enhanced.steps ?? [],
        source: 'text-parse+geometry',
      }
    }
  }

  if (!forceSingle && !looksLikeMatchColumnUpload(rawOcr)) {
    const passage = resolvePassageUpload(rawOcr, normalized, { allowOptionless: true })
    const count = passage?.subQuestions?.length ?? 0
    // Prefer single MCQ unless detector agrees — header/cue alone must not invent a passage.
    if (count >= 2 && (looksLikePassageMultiMcq(rawOcr) || looksLikePassageMultiMcq(normalized))) {
      return {
        mode: 'passage',
        rawOcr,
        normalized,
        structure,
        passage,
        passageCount: count,
        source: 'text-parse',
      }
    }
  }

  if (!forceSingle && !looksLikePassageMultiMcq(rawOcr)) {
    const bulk = parseBulkQuestions(normalized)
    if (bulk.length > 1) {
      return { mode: 'bulk', rawOcr, normalized, structure, bulk, bulkCount: bulk.length }
    }
  }

  const mcqFromStructure =
    structParse?.kind === 'mcq' || structParse?.kind === 'integer_diagram'
      ? structParse.parsed
      : null

  const extracted = processMcqUploadExtract(rawOcr, {
    engine: ctx.engine ?? 'builtin',
    sourceFile: ctx.sourceFile ?? null,
  })

  let single = extracted
  if (mcqFromStructure && (mcqFromStructure.optionsFound ?? 0) >= (extracted.found ?? 0)) {
    single = {
      ...extracted,
      parsed: mcqFromStructure,
      polished: extracted.polished,
      found: mcqFromStructure.optionsFound ?? extracted.found,
      pass: 'document-structure-mcq',
    }
  }

  const classified = classifyUploadFromOcr(rawOcr, { engine: ctx.engine })
  const questionType = inferUploadQuestionType({
    stem: single.parsed?.text ?? '',
    options: single.parsed?.options ?? [],
    found: single.found,
    rawOcr,
    suggestedQuestionType: single.parsed?.suggestedQuestionType,
  })

  return {
    mode: 'single',
    rawOcr,
    normalized,
    structure,
    structParse,
    single,
    classified,
    questionType,
    diagramBboxes: structParse?.diagramBboxes ?? structure?.diagramBboxes ?? [],
    source: single.pass ?? 'hybrid-ocr',
  }
}

/**
 * Async ONNX structure refresh (call when first parse quality is low).
 * @param {File | Blob} sourceFile
 * @param {File | Blob} imageBlob
 * @param {AbortSignal} [signal]
 */
export async function routeUploadWithOnnxEnrich(sourceFile, imageBlob, signal) {
  const structure = await buildOnnxEnrichedStructure(sourceFile, imageBlob, signal)
  if (!structure) return null
  return structure
}
