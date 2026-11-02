/**
 * Lightweight PowerPoint (.pptx) text extract via JSZip (already a dependency).
 * Reads slide XML <a:t> runs — good enough for typed MCQ slides.
 */

import JSZip from 'jszip'

/** @param {File | Blob} file */
export function isPptxFile(file) {
  if (!file) return false
  const name = String(file.name || '')
  const type = String(file.type || '')
  return (
    /\.pptx$/i.test(name) ||
    type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )
}

/**
 * @param {string} xml
 */
function extractTextFromSlideXml(xml) {
  const texts = []
  const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi
  let m
  while ((m = re.exec(xml))) {
    const t = String(m[1] ?? '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .trim()
    if (t) texts.push(t)
  }
  return texts.join(' ')
}

/**
 * @param {File | Blob} file
 * @returns {Promise<string>}
 */
export async function extractTextFromPptx(file) {
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0)
      return na - nb
    })
  if (!slideNames.length) {
    throw new Error('No slides found in this PowerPoint file.')
  }
  const parts = []
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string')
    const text = extractTextFromSlideXml(xml).trim()
    if (text) parts.push(text)
  }
  const joined = parts.join('\n\n--- slide ---\n\n').trim()
  if (!joined) {
    throw new Error('No text found in PowerPoint slides. Use a text slide or export to PDF/image.')
  }
  return joined
}
