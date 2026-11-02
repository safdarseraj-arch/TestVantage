import { useEffect, useState } from 'react'

/**
 * False until the browser has painted the current key, then true.
 * Tab clicks can update labels immediately while cards wait one frame.
 */
export function useAfterFirstPaint(resetKey) {
  const [paintedKey, setPaintedKey] = useState(null)

  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPaintedKey(resetKey))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [resetKey])

  return paintedKey === resetKey
}

/**
 * False until the browser is idle (or 400ms), then true.
 * Use for duplicate/readiness scans that must not block the first paint.
 */
export function useIdleReady(resetKey) {
  const [idleKey, setIdleKey] = useState(null)

  useEffect(() => {
    let idleId = 0
    let timeoutId = 0
    const finish = () => setIdleKey(resetKey)
    const outer = requestAnimationFrame(() => {
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(finish, { timeout: 400 })
      } else {
        timeoutId = window.setTimeout(finish, 0)
      }
    })
    return () => {
      cancelAnimationFrame(outer)
      if (typeof cancelIdleCallback === 'function' && idleId) cancelIdleCallback(idleId)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [resetKey])

  return idleKey === resetKey
}

/**
 * Keep the previous panel mounted until after the new tab highlight has painted.
 */
export function useDeferredPanelKey(activeKey) {
  const [panelKey, setPanelKey] = useState(activeKey)

  useEffect(() => {
    if (panelKey === activeKey) return undefined
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPanelKey(activeKey))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [activeKey, panelKey])

  return panelKey
}
