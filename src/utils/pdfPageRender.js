import { openPdfFromFile } from './pdfDocumentCache.js'

/**
 * Render one PDF page to a PNG data URL (browser only — file never leaves the device).
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {number} [scale]
 * @returns {Promise<string>}
 */
export async function renderPdfPageToDataUrl(page, scale = 2) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported in this browser.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

/**
 * @param {File | Blob} file
 * @param {number} pageNumber 1-based
 * @param {number} [scale]
 */
export async function renderPdfFilePage(file, pageNumber, scale = 2) {
  const { pdf, numPages } = await openPdfFromFile(file)
  const page = Math.min(Math.max(1, pageNumber), numPages)
  const proxy = await pdf.getPage(page)
  const dataUrl = await renderPdfPageToDataUrl(proxy, scale)
  return { dataUrl, numPages, page }
}
