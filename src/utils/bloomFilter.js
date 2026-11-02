/**
 * Bloom taxonomy filter for client-side master / practice pools.
 */

export const BLOOM_LEVEL_VALUES = [
  'Knowledge',
  'Understanding',
  'Application',
  'Analysis',
  'Evaluation',
  'Creation',
]

/** @param {string | null | undefined} raw */
export function normalizeBloomLevel(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const hit = BLOOM_LEVEL_VALUES.find((v) => v.toLowerCase() === text.toLowerCase())
  return hit ?? null
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {string[] | null | undefined} bloomLevels
 */
export function filterQuestionsByBloom(questions, bloomLevels) {
  const list = Array.isArray(questions) ? questions : []
  const wanted = (bloomLevels ?? [])
    .map((v) => normalizeBloomLevel(v))
    .filter(Boolean)
  if (!wanted.length) return list
  const allow = new Set(wanted)
  return list.filter((q) => {
    const level = normalizeBloomLevel(q?.bloom_level ?? q?.bloomLevel ?? q?.metadata?.bloom_level)
    return level != null && allow.has(level)
  })
}
