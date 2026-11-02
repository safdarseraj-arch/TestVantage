const _ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
const RELAY_PATH = '/bank-mirror-relay.html'

function siblingOrigin() {
  if (typeof window === 'undefined') return null
  const port = window.location.port || '5173'
  const { hostname, protocol } = window.location
  if (hostname === '127.0.0.1') return `${protocol}//localhost:${port}`
  if (hostname === 'localhost' || hostname === '[::1]') return `${protocol}//127.0.0.1:${port}`
  return null
}

/**
 * Keep localhost and 127.0.0.1 banks identical in the *same* browser (separate storage keys).
 * Does not sync across Chrome vs Edge vs Cursor — those are different browsers.
 */
export function mirrorBankJsonToSiblingOrigin(json) {
  if (typeof window === 'undefined' || !json?.length) return
  const target = siblingOrigin()
  if (!target) return

  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Sync bank to sibling origin')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none'

  const cleanup = () => {
    clearTimeout(timer)
    iframe.remove()
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.postMessage({ type: 'testvantage-bank-sync', json }, target)
    } catch {
      cleanup()
    }
  }

  iframe.src = `${target}${RELAY_PATH}`
  document.body.appendChild(iframe)
  const timer = setTimeout(cleanup, 8000)
}
