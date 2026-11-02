/**
 * localhost and 127.0.0.1 use separate localStorage — the bank looks empty on one URL
 * while questions exist on the other.
 */
import {
  navigateImportLocalhostBankPage,
  openLocalhostBankCopyPopup } from './bankLocalhostCopy.js'
const BANK_KEY = 'testvantage-uploaded-questions'
const BACKUP_KEY = 'testvantage-uploaded-questions-backup'
const PENDING_KEY = 'testvantage-bank-pending-127'
/**
 * Full-page navigation from 127 → localhost copy helper (works when dev server listens on both).
 * @param {string} [returnPath]
 */
/** Opens localhost popup (postMessage). Falls back to /import-localhost-bank.html on 127. */
export function navigateCopyBankFromLocalhost(returnPath = '/question-bank?hub=view&view=all') {
  if (typeof window === 'undefined') return
  if (!openLocalhostBankCopyPopup(returnPath)) {
    navigateImportLocalhostBankPage()
  }
}

export function redirectLocalhostTo127() {
  if (typeof window === 'undefined') return false
  const { hostname, port, pathname, search, hash, protocol } = window.location
  if (hostname !== 'localhost' && hostname !== '[::1]') return false

  const p = port || '5173'
  const base = `${protocol}//127.0.0.1:${p}`
  const bank = localStorage.getItem(BANK_KEY) || localStorage.getItem(BACKUP_KEY)
  if (bank && bank.length > 40) {
    window.location.replace(`${base}/import-localhost-bank.html`)
    return true
  }
  const params = new URLSearchParams(search)
  params.delete('copyTo127')
  const returnPath = params.get('return')
  params.delete('return')

  const dest = returnPath
    ? `${base}${decodeURIComponent(returnPath)}`
    : `${base}${pathname}${params.toString() ? `?${params}` : ''}${hash}`

  window.location.replace(dest)
  return true
}

/** One-time import after localhost → 127.0.0.1 redirect (same browser session). */
export function consumePendingBankFromLocalhostRedirect() {
  if (typeof window === 'undefined') return null
  try {
    const pending = sessionStorage.getItem(PENDING_KEY)
    if (!pending) return null
    sessionStorage.removeItem(PENDING_KEY)
    return pending
  } catch {
    return null
  }
}

/** @returns {'imported' | 'empty' | null} */
export function consumeBankCopyResultBanner() {
  if (typeof window === 'undefined') return null
  try {
    const v = sessionStorage.getItem('testvantage-bank-copy-result')
    if (!v) return null
    sessionStorage.removeItem('testvantage-bank-copy-result')
    if (v === 'empty') return 'empty'
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? 'imported' : 'empty'
  } catch {
    return null
  }
}

