import { extractMcqFromImage } from './extractDocument.js'
import { parseMatchColumnUpload } from './parseMatchColumnUpload.js'
import { resolvePassageUpload } from './parsePassageUpload.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { classifyOcrUpload } from './jeeUploadTestClassify.js'
import { buildJeeQuestionText } from './jeeUploadTestManifest.js'
import { loadCachedJeeTestImage, renderQuestionScanImage } from './renderQuestionScanImage.js'

export { classifyOcrUpload } from './jeeUploadTestClassify.js'

/**
 * @param {import('./jeeUploadTestManifest.js').buildJeeUploadTestCases extends (...args: any) => infer R ? R[number] : never} testCase
 * @param {{ onProgress?: (n: number) => void, signal?: AbortSignal, preferWebImage?: boolean }} [opts]
 */
export async function runJeeUploadTestCase(testCase, opts = {}) {
  const { onProgress, signal, preferWebImage = true } = opts
  const questionText = buildJeeQuestionText(testCase)

  let file = null
  let imageSource = 'canvas'
  if (preferWebImage) {
    file = await loadCachedJeeTestImage(testCase.id)
    if (file) imageSource = 'web'
  }
  if (!file) {
    file = await renderQuestionScanImage(questionText, `${testCase.id}.png`)
    imageSource = 'canvas'
  }

  const ocr = await extractMcqFromImage(file, onProgress, { signal })
  const classification = classifyOcrUpload(ocr.text ?? '', testCase.questionTypeId)

  return {
    testCase,
    imageSource,
    ocrText: ocr.text ?? '',
    engine: ocr.engine ?? 'builtin',
    ...classification,
  }
}

/**
 * @param {Awaited<ReturnType<typeof runJeeUploadTestCase>>} result
 */
export function jeeUploadTestResultToBankQuestion(result) {
  const { testCase, polished, parsed, detectedType } = result
  const base = {
    subject: testCase.subject,
    section: testCase.section,
    chapter: testCase.chapter,
    topic: 'JEE upload test',
    examIds: ['jee-advanced'],
    questionType: detectedType || testCase.questionTypeId,
    toughnessLevel: 2,
    solution: `Auto upload test (${result.imageSource} image). Engine: ${result.engine}.`,
  }

  if (detectedType === 'matrix_match') {
    const mtx = parseMatchColumnUpload(result.ocrText, polished)
    return {
      ...base,
      text: 'Match the Column',
      questionType: 'matrix_match',
      matrixRows: mtx?.matrixRows ?? ['', '', '', ''],
      matrixCols: mtx?.matrixCols ?? ['', '', '', ''],
    }
  }

  if (detectedType === 'passage_scq' || detectedType === 'passage_integer') {
    const passage = resolvePassageUpload(result.ocrText, polished, { allowOptionless: true })
    return {
      ...base,
      questionType: detectedType,
      passageText: passage?.passageText ?? polished.slice(0, 1200),
      subQuestions: passage?.subQuestions ?? [],
      text: passage?.subQuestions?.[0]?.text ?? polished.slice(0, 500),
      options: passage?.subQuestions?.[0]?.options ?? [],
    }
  }

  const p = parsed ?? parseSingleQuestionUpload(polished, result.ocrText)
  return {
    ...base,
    text: p.text ?? polished.slice(0, 2000),
    options: p.options ?? [],
    correctIndex: p.correctIndex,
    correctIndices: p.correctIndices,
    correctInteger: detectedType === 'integer' ? '42' : undefined,
    correctNumerical: detectedType === 'numerical' ? '3.14' : undefined,
  }
}
