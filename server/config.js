/**
 * Production scale targets — 10 lakh (1,000,000) concurrent students.
 */
import './loadEnv.js'

export const SCALE = {
  targetConcurrentStudents: 1_000_000,
  maxBodyBytes: 512 * 1024,
  rateLimitPerMinute: 300,
  examAutosaveMs: 5000,
  sessionShards: 256,
  /** Redis TTL padding after exam deadline (seconds). */
  examSessionGraceSec: 3600,
}

export const SERVER = {
  port: Number(process.env.TESTVANTAGE_API_PORT) || 3001,
  host: process.env.TESTVANTAGE_API_HOST || '127.0.0.1',
  instanceId: process.env.TESTVANTAGE_INSTANCE_ID || `api-${process.pid}`,
  dataDir: process.env.TESTVANTAGE_BANK_DATA_DIR || null,
  /** CORS: * (default) or a single public origin, e.g. https://app.example.com */
  corsOrigin: String(process.env.TESTVANTAGE_CORS_ORIGIN ?? '*').trim() || '*',
}

export const DB = {
  url:
    process.env.DATABASE_URL ||
    process.env.TESTVANTAGE_DATABASE_URL ||
    '',
  /** Force postgres even without URL (docker internal). */
  required: process.env.TESTVANTAGE_REQUIRE_POSTGRES === '1',
}

export const REDIS_CFG = {
  url: process.env.REDIS_URL || process.env.TESTVANTAGE_REDIS_URL || '',
  required: process.env.TESTVANTAGE_REQUIRE_REDIS === '1',
}

export const FEATURES = {
  examSessions: process.env.TESTVANTAGE_EXAM_SESSIONS !== '0',
  rateLimit: process.env.TESTVANTAGE_RATE_LIMIT !== '0',
}

/** Cloud vision body budget (base64 page photos). */
export const VISION = {
  maxBodyBytes: Number(process.env.TESTVANTAGE_VISION_MAX_BODY) || 18 * 1024 * 1024,
}

/** Mathpix OCR (images + PDFs). Keys stay on the server — never VITE_*. */
export const MATHPIX = {
  maxBodyBytes: Number(process.env.TESTVANTAGE_MATHPIX_MAX_BODY) || 40 * 1024 * 1024,
  pollTimeoutMs: Number(process.env.MATHPIX_POLL_TIMEOUT_MS) || 5 * 60 * 1000,
}

/** Pix2Text formula OCR sidecar (Docker or local `p2t serve -p 8503`). */
export const PIX2TEXT = {
  /** Base URL without trailing slash. Local: http://127.0.0.1:8503 · Docker: http://pix2text:8503 */
  url: String(process.env.PIX2TEXT_URL ?? process.env.TESTVANTAGE_PIX2TEXT_URL ?? '').trim(),
  /** auto = on when URL set or default local ping succeeds; 0 = off; 1 = force on */
  enabled: String(process.env.PIX2TEXT_ENABLED ?? 'auto').trim().toLowerCase(),
  timeoutMs: Number(process.env.PIX2TEXT_TIMEOUT_MS) || 120_000,
  maxBodyBytes: Number(process.env.PIX2TEXT_MAX_BODY) || 18 * 1024 * 1024,
}
