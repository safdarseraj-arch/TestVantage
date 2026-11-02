import { mergeBankBackup, peekUploadedQuestions } from './questionBank.js'

const AUTO_IMPORT_KEY = 'testvantage-auto-localhost-import'

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

/**
 * Listen for bank payload from localhost copy popup / iframe.
 * @param {(result: { added: number, total: number, count: number }) => void} onMerged
 * @returns {() => void} cleanup
 */
export function listenForLocalhostBankMerge(onMerged) {
  if (typeof window === 'undefined') return () => {}

  const handler = (event) => {
    if (!ALLOWED_ORIGINS.has(event.origin)) return
    if (event.data?.type !== 'testvantage-bank-merge') return
    const payload = event.data.payload
    if (!payload?.questions?.length) return
    try {
      const { added, total } = mergeBankBackup(payload)
      onMerged({ added, total, count: payload.questions.length })
    } catch (e) {
      console.error('Bank merge failed', e)
    }
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

/**
 * Open localhost copy popup (postMessage — sessionStorage cannot cross origins).
 * @param {string} [returnPath]
 * @returns {boolean} false if popup blocked
 */
export function openLocalhostBankCopyPopup(returnPath = '/question-bank?hub=view&view=all') {
  if (typeof window === 'undefined') return false
  const port = window.location.port || '5173'
  const ret = encodeURIComponent(returnPath)
  const url = `http://localhost:${port}/copy-bank-to-127.html?relay=1&return=${ret}`
  const popup = window.open(url, 'testvantage-copy-localhost', 'width=520,height=380')
  return !!popup
}

/** Full-page relay on 127.0.0.1 (iframe + sessionStorage on same origin). */
export function navigateImportLocalhostBankPage() {
  if (typeof window === 'undefined') return
  const port = window.location.port || '5173'
  window.location.href = `http://127.0.0.1:${port}/import-localhost-bank.html`
}

/**
 * When 127.0.0.1 bank is empty, silently read localhost storage via hidden iframe (no popup).
 * Runs once per browser session. Browsers forbid reading localhost localStorage from 127 directly.
 * @param {(result: { added: number, total: number, count: number, empty?: boolean }) => void} onDone
 * @returns {() => void} cleanup
 */
export function autoImportFromLocalhostIfEmpty(onDone) {
  if (typeof window === 'undefined') return () => {}

  const { hostname } = window.location
  if (hostname !== '127.0.0.1') return () => {}
  if (peekUploadedQuestions().length > 0) return () => {}
  if (sessionStorage.getItem(AUTO_IMPORT_KEY)) return () => {}

  let finished = false
  const finish = (result) => {
    if (finished) return
    finished = true
    sessionStorage.setItem(AUTO_IMPORT_KEY, '1')
    onDone?.(result)
    offMessage()
    iframe?.remove()
    clearTimeout(timer)
  }

  const offMessage = listenForLocalhostBankMerge((result) => {
    finish(result)
  })

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Auto-import bank from localhost')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  const port = window.location.port || '5173'
  iframe.src = `http://localhost:${port}/copy-bank-to-127.html?relay=parent`
  document.body.appendChild(iframe)

  const timer = setTimeout(() => {
    finish({ added: 0, total: peekUploadedQuestions().length, count: 0, empty: true })
  }, 12000)

  return () => finish({ added: 0, total: 0, count: 0, empty: true })
}
