import { SCALE } from '../config.js'
import { getRedis, useRedis } from './client.js'
import { sessionKey } from '../examStore.js'

const PREFIX = 'tv:exam:'

function redisKey(ownerKey, testId) {
  return `${PREFIX}${sessionKey(ownerKey, testId)}`
}

function ttlSeconds(snapshot) {
  const deadline = Number(snapshot?.deadlineAt) || 0
  const remain = Math.ceil((deadline - Date.now()) / 1000)
  return Math.max(300, remain + SCALE.examSessionGraceSec)
}

/**
 * @param {object} snapshot
 */
export async function saveExamSessionRedis(snapshot) {
  const c = getRedis()
  if (!c) throw new Error('Redis not connected')
  const entry = {
    ...snapshot,
    sessionKey: sessionKey(snapshot.ownerKey, snapshot.testId),
    updatedAt: Date.now(),
  }
  const key = redisKey(snapshot.ownerKey, snapshot.testId)
  await c.set(key, JSON.stringify(entry), { EX: ttlSeconds(snapshot) })
  await c.sAdd(`${PREFIX}owner:${snapshot.ownerKey}`, key)
  await c.expire(`${PREFIX}owner:${snapshot.ownerKey}`, ttlSeconds(snapshot))
  return entry
}

/**
 * @param {string} ownerKey
 * @param {string} testId
 */
export async function loadExamSessionRedis(ownerKey, testId) {
  const c = getRedis()
  if (!c) return null
  const raw = await c.get(redisKey(ownerKey, testId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** @param {string} ownerKey @param {string} testId */
export async function clearExamSessionRedis(ownerKey, testId) {
  const c = getRedis()
  if (!c) return
  const key = redisKey(ownerKey, testId)
  await c.del(key)
  await c.sRem(`${PREFIX}owner:${ownerKey}`, key)
}

/** @param {string} ownerKey */
export async function listExamSessionsForOwnerRedis(ownerKey) {
  const c = getRedis()
  if (!c) return []
  const keys = await c.sMembers(`${PREFIX}owner:${ownerKey}`)
  if (!keys.length) return []
  const values = await c.mGet(keys)
  const out = []
  for (const raw of values) {
    if (!raw) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/** @returns {Promise<number>} */
export async function countExamSessionsRedis() {
  const c = getRedis()
  if (!c) return 0
  let n = 0
  for await (const _ of c.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 500 })) {
    const key = String(_)
    if (key.includes('owner:')) continue
    n += 1
  }
  return n
}

export { useRedis }
