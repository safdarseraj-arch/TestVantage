/**
 * Run async work over items with a fixed concurrency limit.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
export async function mapConcurrent(items, limit, fn) {
  const list = items ?? []
  if (!list.length) return []
  const cap = Math.max(1, Math.min(limit, list.length))
  const results = new Array(list.length)
  let next = 0

  const workers = Array.from({ length: cap }, async () => {
    while (next < list.length) {
      const idx = next++
      results[idx] = await fn(list[idx], idx)
    }
  })

  await Promise.all(workers)
  return results
}
