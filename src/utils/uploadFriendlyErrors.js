/**
 * Turn technical OCR/upload errors into short, actionable messages.
 * @param {unknown} err
 * @param {{ isPdf?: boolean, isFirstRun?: boolean }} [ctx]
 * @returns {string | null} null when user cancelled (no toast needed)
 */
export function friendlyUploadError(err, ctx = {}) {
  const raw = err instanceof Error ? err.message : String(err ?? 'Extract failed')
  if (/cancelled|aborted/i.test(raw)) return null
  if (/No text found/i.test(raw)) {
    return 'No text found in this file. Use a clearer screenshot (crop tight around the question) or type the question manually.'
  }
  if (/timed out|timeout/i.test(raw)) {
    if (ctx.isPdf) {
      return 'This PDF took too long to read. Try a smaller file (fewer pages) or upload one question image at a time.'
    }
    if (ctx.isFirstRun) {
      return 'First upload can take 1–2 minutes while the formula reader loads in your browser. Keep the bottom panel open, wait, then try the same image again — it will be much faster.'
    }
    return 'Reading this image took too long. Press F5, wait for the app to restart, then upload again. If it keeps failing, use Admin → Reset to Standard OCR.'
  }
  if (/LaTeX model|math OCR|ONNX|worker/i.test(raw)) {
    return 'Formula reader had a problem. Your text was read with basic OCR — review the preview, click Parse question & options if needed, then Save. Admin → Reset to Standard OCR fixes most cases.'
  }
  if (/Canvas not supported|Failed to render/i.test(raw)) {
    return 'Could not render this file in the browser. Try PNG or JPG instead of PDF for a single question.'
  }
  if (/Could not process extracted/i.test(raw)) {
    return 'Question was read but could not be split automatically. Check the text box, click Parse question & options, then Save.'
  }
  if (/No options|options incomplete|0\/4/i.test(raw)) {
    return 'Could not find options A–D. Crop tighter around one question, or type A–D in the boxes, then Save.'
  }
  if (/MATHPIX_NOT_CONFIGURED|Mathpix is off|MATHPIX_APP_ID|MATHPIX_APP_KEY/i.test(raw)) {
    return 'Mathpix keys were not loaded. Keep the bottom panel open (Ctrl+J then Ctrl+`), then press F5 so port 3001 re-reads onlinetest/.env. Gemini generate still works.'
  }
  if (/VISION_NOT_CONFIGURED|Cloud vision is off|OPENAI_API_KEY|GEMINI_API_KEY/i.test(raw) &&
      !/Cloud vision failed \(HTTP/i.test(raw)) {
    return 'Gemini needs an API key to fill answers and tags. Add GEMINI_API_KEY to onlinetest/.env, restart (F5), then try again. Mathpix OCR still needs MATHPIX_APP_ID / MATHPIX_APP_KEY.'
  }
  if (/VISION_AUTH_FAILED|HTTP 401|HTTP 403|UNAUTHENTICATED|ACCESS_TOKEN_TYPE/i.test(raw)) {
    return raw.length > 280 ? `${raw.slice(0, 260)}…` : raw
  }
  if (/VISION_MODEL_UNAVAILABLE|no longer available|GEMINI_VISION_MODEL/i.test(raw)) {
    return raw.length > 280 ? `${raw.slice(0, 260)}…` : raw
  }
  if (/VISION_QUOTA|HTTP 429|quota|rate[- ]?limit|RESOURCE_EXHAUSTED|exceeded your current/i.test(raw)) {
    return 'AI reading hit its rate limit (too many uploads this minute). Backup Local OCR should fill the form — review carefully, wait ~1 minute, then Convert again for cleaner AI text.'
  }
  if (/VISION_NETWORK|Failed to fetch|NetworkError|network error|ECONNRESET|ETIMEDOUT/i.test(raw)) {
    return 'Could not reach the AI reader (network). Local OCR backup should fill the form — keep the bottom panel open, press F5 if needed, then Convert again.'
  }
  if (/VISION_EMPTY|empty response/i.test(raw)) {
    return 'AI returned no text. Backup Local OCR should fill the form — review carefully (Needs review), then Save or Convert again.'
  }
  if (/HTTP 5\d\d|502|503|504/i.test(raw) && /AI extract|Cloud vision|Gemini|VISION_/i.test(raw)) {
    return 'AI reader had a temporary server problem. Backup Local OCR should fill the form — review carefully, then Convert again in a minute.'
  }
  if (/Cloud vision failed|VISION_EXTRACT|VISION_SOLVE|Gemini vision HTTP|AI extract failed/i.test(raw)) {
    // Keep status code + Google message so the user knows cloud failed (not silent Local OCR).
    return raw.length > 320 ? `${raw.slice(0, 300)}…` : raw
  }
  if (/More than one question/i.test(raw)) {
    return 'More than one question was found in the image. Crop tighter around a single question, then Convert again.'
  }
  if (/Extract failed|Image conversion failed/i.test(raw)) {
    return 'Could not read this file. Try a clearer image, crop tighter around one question, or paste LaTeX in the text box.'
  }
  return raw.length > 200 ? `${raw.slice(0, 180)}…` : raw
}
