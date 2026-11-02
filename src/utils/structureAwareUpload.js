/**
 * Structure-first upload parsing — uses local line_data zones (not Mathpix cloud).
 * Improves stem / option / column / passage / diagram splits before text parsers run.
 */

import {
  inferStructureKind,
  matrixBlobFromStructure,
  mcqPayloadFromStructure,
  passageBlobFromStructure,
  segmentLineDataIntoStructure,
} from './documentStructure.js'
import { getLastOcrLayout } from './ocrLineDataCache.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { resolveMatchColumnUpload } from './parseMatchColumnUpload.js'
import { resolvePassageUpload } from './parsePassageUpload.js'
import { enhanceMatrixParse } from './aiUploadAssist.js'
import { refineLineDataDiagramTypes } from './diagramClassifier.js'
import { enhanceMatrixColsFromGeometry } from './columnGeometry.js'

/**
 * @param {File | Blob | null | undefined} sourceFile
 * @returns {import('./documentStructure.js').DocumentStructure | null}
 */
export function buildDocumentStructureFromSource(sourceFile) {
  if (!sourceFile) return null
  const layout = getLastOcrLayout(sourceFile)
  if (!layout?.lineData?.length) return null
  const lineData = refineLineDataDiagramTypes(layout.lineData, layout.imageSize ?? {})
  const structure = segmentLineDataIntoStructure(lineData, layout.imageSize ?? {})
  return { ...structure, lineData, imageSize: layout.imageSize ?? {} }
}

/**
 * @param {import('./documentStructure.js').DocumentStructure | null} structure
 * @param {string} rawOcr
 */
export function parseFromDocumentStructure(structure, rawOcr = '') {
  if (!structure?.zones?.length) return null

  const kind = structure.kind ?? inferStructureKind(structure.zones)

  if (kind === 'matrix') {
    const blob = matrixBlobFromStructure(structure) || rawOcr
    let parsed = resolveMatchColumnUpload(blob)
    if (!parsed) return null
    if (structure.lineData?.length) {
      parsed = enhanceMatrixColsFromGeometry(parsed, structure.lineData, structure.imageSize ?? {})
    }
    const enhanced = enhanceMatrixParse(parsed, blob)
    return {
      kind: 'matrix',
      pass: 'document-structure',
      matrix: enhanced.parsed ?? parsed,
      steps: enhanced.steps ?? [],
    }
  }

  if (kind === 'passage') {
    const blob = passageBlobFromStructure(structure) || rawOcr
    const passage = resolvePassageUpload(blob)
    if (!passage?.subQuestions?.length) return null
    return { kind: 'passage', pass: 'document-structure', passage }
  }

  const mcq = mcqPayloadFromStructure(structure)
  if (!mcq || (mcq.optionsFound ?? 0) < 2) return null

  const optBlock = mcq.options
    .map((o, i) => (String(o ?? '').trim() ? `(${String.fromCharCode(65 + i)}) ${String(o).trim()}` : ''))
    .filter(Boolean)
    .join('\n')
  const polished = optBlock ? `${mcq.text}\n${optBlock}` : mcq.text
  const parsed = parseSingleQuestionUpload(polished, rawOcr || polished)
  const found = parsed.optionsFound ?? mcq.optionsFound ?? 0

  return {
    kind: kind === 'integer_diagram' ? 'integer_diagram' : 'mcq',
    pass: 'document-structure',
    parsed: {
      ...parsed,
      text: parsed.text || mcq.text,
      options: (parsed.optionsFound ?? 0) >= found ? parsed.options : mcq.options,
      optionsFound: Math.max(found, parsed.optionsFound ?? 0),
      complete: Math.max(found, parsed.optionsFound ?? 0) >= 4,
      multi: false,
    },
    diagramBboxes: structure.diagramBboxes ?? [],
    structure,
  }
}

/**
 * @param {{ sourceFile?: File | Blob | null, rawOcr?: string }} ctx
 */
export function runStructureAwareParse(ctx = {}) {
  const structure = buildDocumentStructureFromSource(ctx.sourceFile)
  if (!structure) return null
  return parseFromDocumentStructure(structure, String(ctx.rawOcr ?? '').trim())
}
