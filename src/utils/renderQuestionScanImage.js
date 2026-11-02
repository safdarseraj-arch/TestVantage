/**
 * Render plain question text as a PNG scan-like image for OCR upload tests.
 * @param {string} text
 * @param {string} [filename]
 * @returns {Promise<File>}
 */
export async function renderQuestionScanImage(text, filename = 'jee-upload-test.png') {
  const body = String(text ?? '').trim()
  if (!body) throw new Error('Empty question text')

  const lines = body.split(/\r?\n/)
  const fontSize = 22
  const lineHeight = 30
  const pad = 36
  const width = 920
  const height = Math.min(1400, Math.max(420, pad * 2 + lines.length * lineHeight + 40))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#f8f6f0'
  ctx.fillRect(0, 0, width, height)

  // Light paper texture
  for (let i = 0; i < 800; i += 1) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`
    ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1)
  }

  ctx.fillStyle = '#111'
  ctx.font = `${fontSize}px Georgia, 'Times New Roman', serif`
  ctx.textBaseline = 'top'

  let y = pad
  for (const line of lines) {
    wrapLine(ctx, line, pad, y, width - pad * 2, lineHeight)
    y += lineHeight * Math.max(1, Math.ceil(measureWrappedLines(ctx, line, width - pad * 2)))
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png', 0.92)
  })

  return new File([blob], filename, { type: 'image/png' })
}

/** @param {CanvasRenderingContext2D} ctx */
function measureWrappedLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/)
  let line = ''
  let lines = 1
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines += 1
      line = word
    } else {
      line = test
    }
  }
  return lines
}

/** @param {CanvasRenderingContext2D} ctx */
function wrapLine(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/)
  let line = ''
  let yy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = word
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
}

/**
 * Load a cached web image from /jee-upload-test/ if present.
 * @param {string} testCaseId
 * @returns {Promise<File | null>}
 */
export async function loadCachedJeeTestImage(testCaseId) {
  const url = `/jee-upload-test/${testCaseId}.jpg`
  try {
    const resp = await fetch(url, { method: 'HEAD' })
    if (!resp.ok) return null
    const blob = await fetch(url).then((r) => r.blob())
    if (!blob.size) return null
    return new File([blob], `${testCaseId}.jpg`, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}
