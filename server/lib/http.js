import { SERVER } from '../config.js'

/**
 * @param {import('http').IncomingMessage} req
 * @param {number} [maxBytes]
 */
export function readJsonBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > maxBytes) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw.trim()) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

const LOCAL_DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

/** @param {import('http').ServerResponse} res @param {number} code @param {object} body */
export function sendJson(res, code, body) {
  const json = JSON.stringify(body)
  const origin = resolveCorsOrigin(res.req)
  /** @type {Record<string, string | number>} */
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, X-Teacher-Email, X-Student-Id, X-Student-Email, X-Request-Id, X-Admin-Email, X-Admin-Password',
    'X-TestVantages-Instance': globalThis.__TV_INSTANCE_ID ?? 'api',
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    if (origin !== '*') headers.Vary = 'Origin'
  }
  res.writeHead(code, headers)
  res.end(json)
}

/**
 * CORS origin for API responses.
 * Default * for local Cursor / 127.0.0.1. In production set TESTVANTAGE_CORS_ORIGIN to a comma-separated
 * allowlist, e.g. https://www.testvantages.com,https://testvantages.com
 */
function resolveCorsOrigin(req) {
  const raw = String(SERVER.corsOrigin ?? process.env.TESTVANTAGE_CORS_ORIGIN ?? '*').trim()
  if (!raw || raw === '*') return '*'
  const allowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!allowlist.length) return '*'
  const requestOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim() : ''
  if (requestOrigin && (allowlist.includes(requestOrigin) || LOCAL_DEV_ORIGINS.has(requestOrigin))) {
    return requestOrigin
  }
  return allowlist[0]
}

/** @param {import('http').IncomingMessage} req */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress ?? 'unknown'
}

/** @param {import('http').IncomingMessage} req */
export function studentHeaders(req) {
  return {
    studentId: String(req.headers['x-student-id'] ?? '').trim(),
    studentEmail: String(req.headers['x-student-email'] ?? '').trim().toLowerCase(),
    requestId: String(req.headers['x-request-id'] ?? '').trim(),
  }
}

/** @param {import('http').IncomingMessage} req */
export function teacherEmail(req) {
  return String(req.headers['x-teacher-email'] ?? '').trim() || 'unknown'
}
