/** @param {AbortSignal | undefined} signal */
export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException('OCR cancelled', 'AbortError')
  }
}

/** @param {unknown} err */
export function isAbortError(err) {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.message === 'OCR cancelled')
  )
}

/** Yield so Cancel clicks can run between heavy main-thread steps. */
export function yieldToMain() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
