/**
 * TestVantages hybrid OCR stack (browser runtime).
 *
 * Maps to the 6-layer pipeline:
 * 1. Preprocessing — preprocessImage.js (deskew, contrast, adaptive threshold, watermark)
 * 2. Formula OCR — onnxMathOcr.js + mathRegionDetect.js (ONNX equation crops)
 * 3. Full-page / mixed — Tesseract layout + mathpixStyleLineOcr.js
 * 4. Ensemble — pickBestOcrCandidate.js + hybridOcrFinalize.js (multi-pass PSM + preprocess modes)
 * 5. Validation & repair — ocrExtractPolish.js + latexValidateRepair.js + domain repairs
 * 6. Runtime — recognizeWithHybridOcr.js + extractMcqFromImage (cloud Gemini fallback + queue)
 *
 * Entry points for upload:
 * - extractMcqFromImage() — Convert / image queue (AI first, local hybrid fallback)
 * - recognizeWithHybridOcr() — local hybrid page OCR
 * - extractWithBuiltinOcr() — Tesseract multi-preprocess ensemble
 */

export { preprocessImageForOcr, downscaleImageForOcr } from './preprocessImage.js'
export { recognizeWithHybridOcr } from './recognizeWithHybridOcr.js'
export { pickBestOcrCandidate, scoreOcrCandidate } from './pickBestOcrCandidate.js'
export { pickHybridFinalResult } from './hybridOcrFinalize.js'
export { validateAndRepairLatexInText, repairLatexForUpload } from './latexValidateRepair.js'
export { extractMcqFromImage, describeMcqExtractResult } from './extractDocument.js'

/** Human-readable stack summary for admin / tour copy. */
export { GROK_HYBRID_STACK_LAYERS as HYBRID_OCR_STACK_LAYERS } from './hybridStackExtract.js'
