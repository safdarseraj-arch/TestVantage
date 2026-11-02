const STORAGE_KEY = 'testvantage-schools'

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   code?: string
 *   address?: string
 *   createdAt: number
 * }} School
 */

/** @returns {School[]} */
export function loadSchools() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.schools) ? data.schools : []
  } catch {
    return []
  }
}

/** @param {School[]} schools */
function saveSchools(schools) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schools }))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/** @param {string} id */
export function getSchoolById(id) {
  return loadSchools().find((s) => s.id === id) ?? null
}

/**
 * @param {{ name: string, code?: string, address?: string }} data
 */
export function addSchool({ name, code, address }) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, error: 'School name is required.' }

  const schools = loadSchools()
  const normalized = trimmed.toLowerCase()
  if (schools.some((s) => s.name.toLowerCase() === normalized)) {
    return { ok: false, error: 'A school with this name already exists.' }
  }

  const school = {
    id: `school-${Date.now()}`,
    name: trimmed,
    code: code?.trim() || undefined,
    address: address?.trim() || undefined,
    createdAt: Date.now(),
  }
  schools.push(school)
  saveSchools(schools)
  return { ok: true, school }
}

/**
 * @param {string} id
 * @param {{ name?: string, code?: string, address?: string }} updates
 */
export function updateSchool(id, updates) {
  const schools = loadSchools()
  const idx = schools.findIndex((s) => s.id === id)
  if (idx < 0) return { ok: false, error: 'School not found.' }

  if (updates.name != null) {
    const trimmed = updates.name.trim()
    if (!trimmed) return { ok: false, error: 'School name is required.' }
    if (schools.some((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, error: 'A school with this name already exists.' }
    }
    schools[idx] = { ...schools[idx], name: trimmed }
  }
  if (updates.code != null) {
    schools[idx] = { ...schools[idx], code: updates.code.trim() || undefined }
  }
  if (updates.address != null) {
    schools[idx] = { ...schools[idx], address: updates.address.trim() || undefined }
  }
  saveSchools(schools)
  return { ok: true, school: schools[idx] }
}

/** @param {string} id */
export function deleteSchool(id) {
  const schools = loadSchools()
  const next = schools.filter((s) => s.id !== id)
  if (next.length === schools.length) return { ok: false, error: 'School not found.' }
  saveSchools(next)
  return { ok: true }
}
