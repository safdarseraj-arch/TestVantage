/**
 * Single shared worker for Official PYQ Mathpix splits (large OCR blobs).
 */

/** @type {Worker | null} */
let splitWorker = null
/** @type {number} */
let requestSeq = 0
/** Last worker split kept so a hung merge/heal can still show cards. */
let lastSplitKeep = /** @type {{ id: string, questions: unknown[], count: number } | null} */ (null)

export function rememberOfficialPyqSplitKeep(id, questions) {
  const list = Array.isArray(questions) ? questions : []
  lastSplitKeep = {
    id: String(id || ''),
    questions: list,
    count: list.length,
  }
  return lastSplitKeep
}

export function peekOfficialPyqSplitKeep() {
  return lastSplitKeep
}

function spawnSplitWorker() {
  return new Worker(new URL('../workers/officialPyqSplit.worker.js', import.meta.url), {
    type: 'module',
  })
}

function getSplitWorker() {
  if (!splitWorker) {
    splitWorker = spawnSplitWorker()
    splitWorker.onerror = () => {
      try {
        splitWorker?.terminate()
      } catch {
        /* ignore */
      }
      splitWorker = null
    }
  }
  return splitWorker
}

/** Stop in-flight split (tab change / new re-parse). */
export function resetOfficialPyqSplitWorker() {
  if (!splitWorker) return
  try {
    splitWorker.terminate()
  } catch {
    /* ignore */
  }
  splitWorker = null
}

/**
 * @param {string} ocr
 * @param {Record<string, unknown>} paperMeta
 * @param {{ signal?: AbortSignal }} [opts]
 */
export function splitOcrInWorker(ocr, paperMeta, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const requestId = ++requestSeq
    const worker = getSplitWorker()
    let settled = false
    const timeoutMs = 40_000

    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }

    const timer = setTimeout(() => {
      resetOfficialPyqSplitWorker()
      finish(() => reject(new Error('Split worker timeout')))
    }, timeoutMs)

    const onAbort = () => {
      resetOfficialPyqSplitWorker()
      finish(() => reject(new DOMException('Aborted', 'AbortError')))
    }

    const onMessage = (event) => {
      const msg = event.data ?? {}
      if (msg.requestId !== requestId) return
      if (msg.type === 'result') {
        finish(() => resolve(Array.isArray(msg.items) ? msg.items : []))
        return
      }
      if (msg.type === 'error') {
        finish(() => reject(new Error(msg.message || 'Worker split failed')))
      }
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    worker.addEventListener('message', onMessage)
    worker.postMessage({ type: 'split', requestId, ocr, paperMeta })
  })
}
