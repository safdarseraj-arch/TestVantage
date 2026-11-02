import { loadImageForCrop } from './cropImageRegion.js'

/** Reuse compressed data URLs for the same File/Blob during one upload pass. */
const compressCache = new WeakMap()

/**
 * @param {File | Blob} file
 * @param {{ maxWidth?: number, quality?: number, role?: keyof typeof BANK_IMAGE_PRESETS }} opts
 */
function compressCacheKey(file, opts) {
  const preset = BANK_IMAGE_PRESETS[opts.role ?? 'stem'] ?? BANK_IMAGE_PRESETS.stem
  const maxWidth = opts.maxWidth ?? preset.maxWidth
  const quality = opts.quality ?? preset.quality
  return `${opts.role ?? 'stem'}:${maxWidth}:${quality}`
}

/** Clear cached compress for a file (e.g. new upload). */
export function clearCompressImageCache(file) {
  if (file) compressCache.delete(file)
}

/** Tighter presets — MCQ option graphs need less resolution than full stem diagrams. */
export const BANK_IMAGE_PRESETS = {
  stem: { maxWidth: 960, quality: 0.74 },
  option: { maxWidth: 560, quality: 0.7 },
  passage: { maxWidth: 960, quality: 0.74 },
  solution: { maxWidth: 880, quality: 0.72 },
  crop: { maxWidth: 880, quality: 0.74 },
}

/**
 * Compress and encode question images for localStorage (hybrid bank).
 * @param {File} file
 * @param {{ maxWidth?: number, quality?: number, role?: keyof typeof BANK_IMAGE_PRESETS }} [opts]
 * @returns {Promise<string>} data URL
 */
export async function compressImageFile(file, opts = {}) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Upload a PNG or JPG image.')
  }

  const key = compressCacheKey(file, opts)
  let roleMap = compressCache.get(file)
  if (!roleMap) {
    roleMap = new Map()
    compressCache.set(file, roleMap)
  }
  if (roleMap.has(key)) {
    return roleMap.get(key)
  }

  const work = compressImageFileWork(file, opts)
  roleMap.set(key, work)
  return work
}

async function compressImageFileWork(file, opts = {}) {

  const preset = BANK_IMAGE_PRESETS[opts.role ?? 'stem'] ?? BANK_IMAGE_PRESETS.stem
  const maxWidth = opts.maxWidth ?? preset.maxWidth
  const quality = opts.quality ?? preset.quality

  const bitmap = await createImageBitmap(file)
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not process image.')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const usePng = file.type === 'image/png' && canvasHasMeaningfulAlpha(ctx, w, h)
  return canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', usePng ? undefined : quality)
}

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h */
function canvasHasMeaningfulAlpha(ctx, w, h) {
  try {
    const data = ctx.getImageData(0, 0, w, h).data
    for (let i = 3; i < data.length; i += 28) {
      if (data[i] < 248) return true
    }
  } catch {
    return false
  }
  return false
}

/** @param {string} dataUrl */
export function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl?.startsWith('data:')) return 0
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.round((base64.length * 3) / 4)
}

/** @param {number} bytes */
export function formatImageSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Drop empty image fields and trim trailing blank option slots before JSON save.
 * @param {import('../data/tests').Question} q
 */
export function slimQuestionImageFields(q) {
  if (!q || typeof q !== 'object') return q
  const next = { ...q }

  for (const key of ['questionImage', 'passageImage', 'optionsImage', 'solutionImage']) {
    if (typeof next[key] === 'string' && !next[key].trim()) delete next[key]
  }

  if (Array.isArray(next.optionImages)) {
    const slots = next.optionImages.map((img) => {
      const s = typeof img === 'string' ? img.trim() : ''
      return s || undefined
    })
    const lastUsed = slots.reduce((max, img, i) => (img ? i : max), -1)
    if (lastUsed < 0) {
      delete next.optionImages
    } else {
      const compact = slots.slice(0, lastUsed + 1).map((img) => img ?? '')
      next.optionImages = compact
    }
  }

  const hasImage =
    next.questionImage ||
    next.passageImage ||
    next.optionsImage ||
    next.solutionImage ||
    (Array.isArray(next.optionImages) && next.optionImages.some(Boolean))
  if (!hasImage && next.contentMode === 'hybrid') {
    delete next.contentMode
  } else if (hasImage && next.contentMode !== 'hybrid') {
    next.contentMode = 'hybrid'
  }

  return next
}

/**
 * Re-encode an existing data URL with bank presets (only when result is smaller).
 * @param {string} dataUrl
 * @param {{ role?: keyof typeof BANK_IMAGE_PRESETS, minBytesToReencode?: number }} [opts]
 */
export async function compressDataUrl(dataUrl, opts = {}) {
  const url = String(dataUrl ?? '').trim()
  if (!url.startsWith('data:image/')) return dataUrl

  const before = estimateDataUrlBytes(url)
  const minBytes = opts.minBytesToReencode ?? 40 * 1024
  if (before < minBytes) return url

  const preset = BANK_IMAGE_PRESETS[opts.role ?? 'stem'] ?? BANK_IMAGE_PRESETS.stem
  const img = await loadImageForCrop(url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return url

  const scale = w > preset.maxWidth ? preset.maxWidth / w : 1
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return url
  ctx.drawImage(img, 0, 0, cw, ch)

  const usePng = url.startsWith('data:image/png') && canvasHasMeaningfulAlpha(ctx, cw, ch)
  const out = canvas.toDataURL(
    usePng ? 'image/png' : 'image/jpeg',
    usePng ? undefined : preset.quality,
  )
  const after = estimateDataUrlBytes(out)
  return after < before ? out : url
}

/**
 * Compress all image fields on one question (async — uses canvas).
 * @param {import('../data/tests').Question} q
 */
export async function compressQuestionImages(q) {
  let next = slimQuestionImageFields(q)

  if (next.questionImage) {
    next = {
      ...next,
      questionImage: await compressDataUrl(next.questionImage, { role: 'stem' }),
    }
  }
  if (next.passageImage) {
    next = {
      ...next,
      passageImage: await compressDataUrl(next.passageImage, { role: 'passage' }),
    }
  }
  if (next.optionsImage) {
    next = {
      ...next,
      optionsImage: await compressDataUrl(next.optionsImage, { role: 'option' }),
    }
  }
  if (next.solutionImage) {
    next = {
      ...next,
      solutionImage: await compressDataUrl(next.solutionImage, { role: 'solution' }),
    }
  }
  if (Array.isArray(next.optionImages) && next.optionImages.length) {
    const imgs = await Promise.all(
      next.optionImages.map((img) =>
        img?.trim() ? compressDataUrl(img, { role: 'option' }) : '',
      ),
    )
    next = { ...next, optionImages: imgs }
    next = slimQuestionImageFields(next)
  }

  return next
}

/** @param {import('../data/tests').Question} q */
export function isHybridQuestion(q) {
  return (
    q.contentMode === 'hybrid' ||
    !!q.questionImage ||
    !!q.optionsImage ||
    (Array.isArray(q.optionImages) && q.optionImages.some(Boolean)) ||
    !!q.solutionImage
  )
}

/** Default MCQ labels when options are image-only. */
export const IMAGE_OPTION_LABELS = ['Option A', 'Option B', 'Option C', 'Option D']
