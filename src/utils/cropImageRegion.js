/**
 * Crop a region from a loaded <img> (preferred) or from a data / blob / http src.
 * @param {HTMLImageElement} img
 * @param {{ x: number, y: number, width: number, height: number }} rect natural pixels
 * @param {{ maxWidth?: number, quality?: number, srcHint?: string }} [opts]
 * @returns {string} data URL
 */
export function cropLoadedImage(img, rect, { maxWidth = 880, quality = 0.74, srcHint = '' } = {}) {
  if (!img?.naturalWidth || !img?.naturalHeight) {
    throw new Error('Image not ready — wait a moment and try again.')
  }
  const x = Math.max(0, Math.round(rect.x))
  const y = Math.max(0, Math.round(rect.y))
  const w = Math.min(Math.round(rect.width), img.naturalWidth - x)
  const h = Math.min(Math.round(rect.height), img.naturalHeight - y)
  if (w < 8 || h < 8) {
    throw new Error('Crop area is too small — drag a larger box.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not crop image.')
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h)

  const scale = w > maxWidth ? maxWidth / w : 1
  if (scale < 1) {
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const scaled = document.createElement('canvas')
    scaled.width = cw
    scaled.height = ch
    const sctx = scaled.getContext('2d')
    if (!sctx) throw new Error('Could not resize crop.')
    sctx.drawImage(canvas, 0, 0, cw, ch)
    return scaled.toDataURL('image/jpeg', quality)
  }

  const isPng = srcHint.startsWith('data:image/png')
  if (isPng) {
    try {
      const data = ctx.getImageData(0, 0, w, h).data
      for (let i = 3; i < data.length; i += 28) {
        if (data[i] < 248) return canvas.toDataURL('image/png')
      }
    } catch {
      /* fall through to jpeg */
    }
  }
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Crop a region from a data URL or remote image src.
 * @param {string} src
 * @param {{ x: number, y: number, width: number, height: number }} rect natural pixels
 * @param {{ maxWidth?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data URL
 */
export async function cropImageDataUrl(src, rect, opts = {}) {
  const img = await loadImageForCrop(src)
  return cropLoadedImage(img, rect, { ...opts, srcHint: src })
}

/**
 * @param {HTMLImageElement} img
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {{ maxWidth?: number, quality?: number, srcHint?: string }} [opts]
 */
export async function cropFromDisplayedImage(img, rect, opts = {}) {
  if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    try {
      if (img.decode) await img.decode()
    } catch {
      /* draw may still work */
    }
    return cropLoadedImage(img, rect, opts)
  }
  const src = img?.currentSrc || img?.src
  if (!src) throw new Error('Could not load image for cropping.')
  return cropImageDataUrl(src, rect, opts)
}

/** @param {string} src */
export async function loadImageForCrop(src) {
  if (!src?.trim()) throw new Error('Could not load image for cropping.')

  if (src.startsWith('blob:')) {
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const copy = URL.createObjectURL(blob)
      try {
        return await loadImageElement(copy, { revokeOnLoad: true })
      } catch (e) {
        URL.revokeObjectURL(copy)
        throw e
      }
    } catch {
      throw new Error(
        'Could not load image for cropping. Re-upload the screenshot or close and open the crop tool again.',
      )
    }
  }

  return loadImageElement(src)
}

/** @param {string} src @param {{ revokeOnLoad?: boolean }} [opts] */
function loadImageElement(src, { revokeOnLoad = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      const done = () => {
        if (revokeOnLoad) URL.revokeObjectURL(src)
        resolve(img)
      }
      if (typeof img.decode === 'function') {
        img.decode().then(done).catch(done)
      } else {
        done()
      }
    }
    img.onerror = () => {
      if (revokeOnLoad) URL.revokeObjectURL(src)
      reject(new Error('Could not load image for cropping.'))
    }
    img.src = src
  })
}

/**
 * Map a selection made on the displayed image to natural pixel coordinates.
 * @param {{ left: number, top: number, width: number, height: number }} displayRect
 * @param {{ displayWidth: number, displayHeight: number, naturalWidth: number, naturalHeight: number }} dims
 */
export function displayRectToNatural(displayRect, dims) {
  const sx = dims.naturalWidth / dims.displayWidth
  const sy = dims.naturalHeight / dims.displayHeight
  return {
    x: displayRect.left * sx,
    y: displayRect.top * sy,
    width: displayRect.width * sx,
    height: displayRect.height * sy,
  }
}
