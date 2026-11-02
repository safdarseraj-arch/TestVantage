/**
 * AI-built / student sessions were sessionStorage-only and disappeared after reload.
 * Persist in localStorage; migrate any legacy session entries on read.
 */

/** @type {Map<string, Record<string, unknown>>} */
const memoryMaps = new Map()

/** @param {string} key */
export function loadDynamicTestMap(key) {
  if (memoryMaps.has(key)) return { ...memoryMaps.get(key) }
  try {
    if (typeof localStorage === 'undefined') return {}
    const fromLocal = localStorage.getItem(key)
    if (fromLocal) return JSON.parse(fromLocal)

    if (typeof sessionStorage !== 'undefined') {
      const fromSession = sessionStorage.getItem(key)
      if (fromSession) {
        localStorage.setItem(key, fromSession)
        return JSON.parse(fromSession)
      }
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * @param {string} key
 * @param {Record<string, import('../data/tests').Test>} map
 */
export function saveDynamicTestMap(key, map) {
  const raw = JSON.stringify(map)
  try {
    if (typeof localStorage === 'undefined') {
      memoryMaps.set(key, { ...map })
      return
    }
    localStorage.setItem(key, raw)
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, raw)
      }
    } catch {
      /* quota — local copy is enough for history */
    }
  } catch {
    memoryMaps.set(key, { ...map })
  }
}
