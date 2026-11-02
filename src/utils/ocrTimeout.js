/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 */
export function withOcrTimeout(promise, ms, message) {
  return raceStepTimeout(promise, ms, message)
}

/**
 * Per-step deadline. Does not wait for a hung fetch to reject.
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [message]
 * @param {string} [code]
 * @returns {Promise<T>}
 */
export function raceStepTimeout(promise, ms, message, code = 'STEP_TIMEOUT') {
  const wait = Math.max(1000, Number(ms) || 0)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(message || `This step timed out after ${Math.round(wait / 1000)} seconds.`)
      err.code = code
      reject(err)
    }, wait)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
