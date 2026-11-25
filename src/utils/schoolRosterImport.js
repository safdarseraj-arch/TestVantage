/**
 * Bulk CSV roster import for a class (SMS Phase-1 Day-2 playbook).
 * Columns: name, loginId (optional), password (optional), rollNo (optional)
 */

import { enrollStudentInClass } from './classesStore.js'
import { createStudentAccount, generateStudentCredentials } from './users.js'

export const ROSTER_CSV_TEMPLATE = `name,loginId,password,rollNo
Aarav Sharma,,,1
Diya Patel,,,2
Kabir Singh,,,3
`

/**
 * Parse a CSV/TSV text blob into row objects.
 * @param {string} text
 * @returns {{ ok: true, rows: object[], headers: string[] } | { ok: false, error: string }}
 */
export function parseRosterCsv(text) {
  const raw = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (!raw) return { ok: false, error: 'Paste or upload a CSV with at least one student row.' }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    return { ok: false, error: 'CSV needs a header row plus at least one student.' }
  }

  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = splitCsvLine(lines[0], delim).map((h) => h.trim().toLowerCase())
  if (!headers.includes('name')) {
    return { ok: false, error: 'CSV must include a "name" column.' }
  }

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delim)
    const row = {}
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim()
    })
    if (!row.name) continue
    rows.push({
      name: row.name,
      loginId: row.loginid || row.login || row.userid || row.email || '',
      password: row.password || row.pass || '',
      rollNo: row.rollno || row.roll || row.roll_no || '',
      line: i + 1,
    })
  }

  if (!rows.length) return { ok: false, error: 'No student names found under the header.' }
  return { ok: true, rows, headers }
}

/**
 * Preview validation without writing accounts.
 * @param {object[]} rows
 */
export function previewRosterRows(rows) {
  const errors = []
  const seenLogins = new Set()
  let withLogin = 0
  let withPassword = 0
  let autoCreds = 0
  for (const row of rows) {
    if (!row.name || row.name.length < 2) {
      errors.push({ line: row.line, message: `Line ${row.line}: name is too short.` })
    }
    const login = String(row.loginId || '').trim().toLowerCase()
    const password = String(row.password || '').trim()
    if (login) {
      withLogin += 1
      if (seenLogins.has(login)) {
        errors.push({
          line: row.line,
          message: `Line ${row.line}: duplicate login "${login}" in this file.`,
        })
      }
      seenLogins.add(login)
    }
    if (password) withPassword += 1
    if (!login || !password) autoCreds += 1
  }
  return {
    ok: errors.length === 0,
    errors,
    count: rows.length,
    withLogin,
    withPassword,
    autoCreds,
    summary:
      rows.length === 0
        ? 'No student rows yet.'
        : `${rows.length} student${rows.length === 1 ? '' : 's'} ready` +
          (autoCreds
            ? ` · ${autoCreds} will get auto-generated User ID/password`
            : ' · all rows have login + password'),
  }
}

/**
 * Format a short multi-error message for toast UI (first few lines).
 * @param {{ line?: number, message: string }[]} errors
 * @param {number} [limit=4]
 */
export function formatRosterErrors(errors, limit = 4) {
  const list = Array.isArray(errors) ? errors : []
  if (!list.length) return 'Fix CSV errors before importing.'
  const shown = list.slice(0, limit).map((e) => e.message)
  const extra = list.length - shown.length
  return extra > 0 ? `${shown.join(' · ')} · +${extra} more` : shown.join(' · ')
}

/**
 * Create student accounts and enroll them in a class.
 * @param {{
 *   classId: string
 *   className?: string
 *   rows: object[]
 *   createdBy?: string
 * }} opts
 */
export function importRosterToClass({ classId, className, rows, createdBy }) {
  if (!classId) return { ok: false, error: 'Select a class first.' }
  const preview = previewRosterRows(rows || [])
  if (!preview.ok) {
    return {
      ok: false,
      error: formatRosterErrors(preview.errors),
      errors: preview.errors,
    }
  }

  const created = []
  const failed = []

  for (const row of rows) {
    let loginId = String(row.loginId || '').trim()
    let password = String(row.password || '').trim()
    if (!loginId || !password) {
      const creds = generateStudentCredentials(row.name, className)
      if (!loginId) loginId = creds.loginId
      if (!password) password = creds.password
    }

    const result = createStudentAccount({
      name: row.name,
      loginId,
      password,
      createdBy: createdBy || 'roster-import',
    })
    if (!result.ok) {
      failed.push({ line: row.line, name: row.name, error: result.error })
      continue
    }

    const enroll = enrollStudentInClass(classId, result.user.id)
    if (!enroll.ok) {
      failed.push({ line: row.line, name: row.name, error: enroll.error })
      continue
    }

    created.push({
      id: result.user.id,
      name: result.user.name,
      loginId: result.user.email,
      password,
      rollNo: row.rollNo || '',
    })
  }

  return {
    ok: created.length > 0,
    created,
    failed,
    error:
      created.length === 0
        ? failed[0]?.error || 'No students were imported.'
        : failed.length
          ? `Imported ${created.length}; ${failed.length} row(s) failed.`
          : undefined,
  }
}

/** Minimal CSV splitter that respects double quotes. */
function splitCsvLine(line, delim = ',') {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === delim && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}
