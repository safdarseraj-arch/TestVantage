const MODE_KEY = 'testvantage-bank-save-mode'

/** @typedef {'offline' | 'online'} BankSaveMode */

/** @returns {BankSaveMode} */
export function getBankSaveMode() {
  if (typeof window === 'undefined') return 'online'
  const raw = localStorage.getItem(MODE_KEY)
  if (raw === 'offline') return 'offline'
  return 'online'
}

/** @param {BankSaveMode} mode */
export function setBankSaveMode(mode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(MODE_KEY, mode === 'online' ? 'online' : 'offline')
}

/** @param {BankSaveMode} mode */
export function bankSaveModeLabel(mode) {
  return mode === 'online' ? 'Online — save to server when possible' : 'Offline — device only until you sync'
}
