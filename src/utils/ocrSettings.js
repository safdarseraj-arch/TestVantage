const STORAGE_KEY = 'testvantage-ocr-settings'
const SETTINGS_VERSION = 7

/** Default built-in engine: Tesseract layout + ONNX equation crops + LaTeX synthesis. */
export const HYBRID_OCR_LATEX_ENGINE = 'hybrid-ocr-latex'

/** @deprecated Legacy id — treat same as {@link HYBRID_OCR_LATEX_ENGINE}. */
export const HYBRID_OCR_LATEX_ENGINE_LEGACY = 'hybrid-onnx-tesseract'

/** @param {string} [engine] */
export function isHybridOcrLatexEngine(engine) {
  return engine === HYBRID_OCR_LATEX_ENGINE || engine === HYBRID_OCR_LATEX_ENGINE_LEGACY
}

/** @typedef {'auto' | 'standard' | 'advanced'} OcrMode */

/**
 * @typedef {{
 *   settingsVersion?: number
 *   mode: OcrMode
 *   fullScienceOcr?: boolean
 *   mathpixAppId: string
 *   mathpixAppKey: string
 *   useLocalMathOcr: boolean
 *   useMathpixApi: boolean
 *   mathpixFallback: boolean
 *   localOcrQualityBoost: boolean
 *   mathpixStyleLineOcr?: boolean
 *   mathOcrDevice: 'auto' | 'webgpu' | 'wasm'
 *   useCloudVision?: boolean | 'auto'
 *   preferCloudVision?: boolean
 * }} OcrSettings
 */

/**
 * Mathpix credentials from Admin OCR settings only.
 * Never read VITE_* env keys here — Vite would bake them into the public JS bundle.
 * Page OCR (PDF / image / handwriting) is always Mathpix. Local AI and Gemini do not read pixels.
 * @returns {{ appId: string, appKey: string }}
 */
export function getMathpixCredentials(settings = loadOcrSettings()) {
  return {
    appId: settings.mathpixAppId?.trim() || '',
    appKey: settings.mathpixAppKey?.trim() || '',
  }
}

/** Best for JEE/NEET: equations, integrals, limits, determinants, chemistry, graphs. */
export const FULL_SCIENCE_OCR_PRESET = {
  settingsVersion: SETTINGS_VERSION,
  mode: /** @type {OcrMode} */ ('advanced'),
  fullScienceOcr: true,
  useLocalMathOcr: false,
  useMathpixApi: true,
  mathpixFallback: false,
  localOcrQualityBoost: false,
  mathpixStyleLineOcr: true,
  mathOcrDevice: /** @type {'auto'} */ ('auto'),
  useCloudVision: /** @type {'auto'} */ ('auto'),
  preferCloudVision: false,
}

const DEFAULTS = {
  settingsVersion: SETTINGS_VERSION,
  mode: /** @type {OcrMode} */ ('standard'),
  fullScienceOcr: false,
  mathpixAppId: '',
  mathpixAppKey: '',
  useLocalMathOcr: false,
  useMathpixApi: true,
  mathpixFallback: false,
  localOcrQualityBoost: false,
  mathpixStyleLineOcr: true,
  mathOcrDevice: /** @type {'auto'} */ ('auto'),
  useCloudVision: /** @type {'auto'} */ ('auto'),
  preferCloudVision: false,
}

/** @returns {OcrSettings} */
export function loadOcrSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULTS }
    }
    const saved = { ...DEFAULTS, ...JSON.parse(raw) }
    if ((saved.settingsVersion ?? 0) < SETTINGS_VERSION) {
      saved.settingsVersion = SETTINGS_VERSION
      saved.useMathpixApi = true
      saved.useLocalMathOcr = false
      saved.mathpixFallback = false
      saved.localOcrQualityBoost = false
      saved.preferCloudVision = false
      if (saved.mathpixStyleLineOcr === undefined) saved.mathpixStyleLineOcr = true
      if (saved.useCloudVision === undefined) saved.useCloudVision = 'auto'
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      } catch {
        /* ignore */
      }
    }
    if ((saved.settingsVersion ?? 0) < 3 && saved.fullScienceOcr === true) {
      saved.fullScienceOcr = false
      saved.mode = 'standard'
    }
    return saved
  } catch {
    return { ...DEFAULTS }
  }
}

/** @param {Partial<OcrSettings>} patch */
export function saveOcrSettings(patch) {
  const next = {
    ...loadOcrSettings(),
    ...patch,
    settingsVersion: SETTINGS_VERSION,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

/** Apply recommended settings for math, chemistry, graphs, determinants, limits, integrals. */
export function applyFullScienceOcrPreset() {
  return saveOcrSettings({ ...FULL_SCIENCE_OCR_PRESET })
}

/** Restore earlier default — fixes over-aggressive ONNX on plain MCQs. */
export function applyStandardOcrPreset() {
  return saveOcrSettings({
    mode: 'standard',
    fullScienceOcr: false,
    useLocalMathOcr: true,
    mathOcrDevice: 'auto',
    useMathpixApi: false,
    mathpixFallback: false,
    localOcrQualityBoost: true,
    mathpixStyleLineOcr: true,
  })
}

/** Mathpix-style typed line_data + geometry MCQ split (local, no cloud). */
export function isMathpixStyleLineOcrEnabled(settings = loadOcrSettings()) {
  return settings.mathpixStyleLineOcr !== false
}

/** Cloud vision: false = never; true / 'auto' = when API key + weak local OCR; preferCloudVision forces try. */
export function isCloudVisionEnabled(settings = loadOcrSettings()) {
  return settings.useCloudVision !== false
}

export function prefersCloudVision(settings = loadOcrSettings()) {
  return settings.preferCloudVision === true
}

/** @param {OcrSettings} [settings] */
export function shouldUseFullScienceOnnx(settings = loadOcrSettings()) {
  return settings.mode === 'advanced' || settings.fullScienceOcr === true
}

/** @param {OcrSettings} [settings] */
export function isMathpixConfigured(settings = loadOcrSettings()) {
  const { appId, appKey } = getMathpixCredentials(settings)
  return !!(appId && appKey)
}

/** @param {OcrSettings} [settings] */
export function shouldUseLocalOcrQualityBoost(settings = loadOcrSettings()) {
  return settings.localOcrQualityBoost !== false && isLocalMathOcrEnabled(settings)
}

/** @param {OcrSettings} [settings] */
export function shouldUseMathpixFallback(settings = loadOcrSettings()) {
  return settings.mathpixFallback === true && isMathpixConfigured(settings)
}

/** Page OCR is always Mathpix. Local AI / Gemini never read PDF, image, or handwriting. */
export function resolveOcrEngine(_settings = loadOcrSettings()) {
  void _settings
  return 'mathpix'
}

/** @param {OcrSettings} [settings] */
export function shouldUseMathpixOcr(_settings = loadOcrSettings()) {
  void _settings
  return true
}

/** @param {OcrSettings} [settings] */
export function isLocalMathOcrEnabled(settings = loadOcrSettings()) {
  return settings.useLocalMathOcr !== false
}

/** @param {OcrSettings} [settings] */
export function getOcrModeLabel(_settings = loadOcrSettings()) {
  void _settings
  return 'Mathpix OCR (PDF / image / handwriting). Local AI splits questions. Gemini fills tags, answers, and solutions — not OCR.'
}
