export {
  MATH_OCR_MODEL_PRIMARY as MATH_OCR_MODEL_ID,
  MATH_OCR_MODEL_FALLBACK,
  MATH_OCR_MODEL_LABEL,
} from './mathOcrConstants.js'
/** Max equation crops per page (latency guard). */
export const MAX_MATH_REGIONS_PER_PAGE = 16

/** Full ONNX on every book PDF page (slow). When false, use selective mode below. */
export const LOCAL_MATH_OCR_BOOK_MODE = false

/** ONNX only on book pages with math/chemistry/garbled lines — faster than full book ONNX. */
export const LOCAL_MATH_OCR_BOOK_SELECTIVE = true

/** First ONNX load budget — fall back to Tesseract text when exceeded. */
export const MATH_OCR_MODEL_LOAD_MS = 90_000

/** Equation crops are short — lower than full-page Nougat defaults. */
export const MATH_OCR_MAX_NEW_TOKENS = 128

/** Parallel ONNX region crops across worker pool. */
export const MATH_OCR_REGION_CONCURRENCY = 4

/** ONNX worker pool size (parallel inference after model load). */
export const MATH_OCR_WORKER_POOL_SIZE = 2

/** Layout-only Tesseract is enough when text is long and confident. */
export const HYBRID_LAYOUT_MIN_CHARS = 35
export const HYBRID_LAYOUT_MIN_CONFIDENCE = 38

/** Fast path: skip ONNX when layout exceeds these thresholds and prose is clean. */
export const HYBRID_FAST_LAYOUT_MIN_CHARS = 70
export const HYBRID_FAST_LAYOUT_CONFIDENCE = 50

/** Min crop size in natural pixels. */
export const MIN_MATH_REGION_PX = 18

/** Max fraction of page height sent to math model (exclude MCQ option band). */
export const MATH_REGION_MAX_BOTTOM_FRAC = 0.78
