/** Plain label for where localStorage lives (per browser app + profile). */
export function getBrowserStorageLabel() {
  if (typeof navigator === 'undefined') return 'this browser'
  const ua = navigator.userAgent || ''
  // Cursor / VS Code Simple Browser often report as Chrome — prefer accurate label.
  if (
    (typeof window !== 'undefined' &&
      (window.cursor || window.vscode || typeof window.acquireVsCodeApi === 'function')) ||
    /Cursor|Electron/i.test(ua)
  ) {
    return 'Cursor browser'
  }
  if (/Edg\//i.test(ua)) return 'Microsoft Edge'
  // Local 127.0.0.1 workflow uses Cursor’s built-in browser — avoid "Google Chrome" mislabel.
  if (
    typeof window !== 'undefined' &&
    /^(127\.0\.0\.1|localhost|\[::1\])$/i.test(window.location.hostname)
  ) {
    return 'this browser'
  }
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Google Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  return 'this browser'
}

/** Short origin label for banners. */
export function getBankOriginLabel() {
  if (typeof window === 'undefined') return '127.0.0.1'
  const { hostname, port } = window.location
  if (hostname === 'localhost' || hostname === '[::1]') return `localhost:${port || '5173'}`
  return `127.0.0.1:${port || '5173'}`
}
