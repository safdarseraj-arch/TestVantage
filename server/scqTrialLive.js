import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonFileUtf8OrUtf16, writeUtf8RepairUtf16 } from './readJsonFile.js'
import {
  SCQ_TRIAL_LIVE_FILENAME,
  SCQ_TRIAL_LOCK_FILENAME,
  emptyTrialLiveSnapshot,
} from '../src/utils/geminiScqTrial.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const LIVE_PATH = join(DATA_DIR, SCQ_TRIAL_LIVE_FILENAME)
const PUBLIC_LIVE_PATH = join(ROOT, 'public', SCQ_TRIAL_LIVE_FILENAME)
const LOCK_PATH = join(DATA_DIR, SCQ_TRIAL_LOCK_FILENAME)
const SCRIPT_PATH = join(ROOT, 'scripts', 'run-gemini-scq-trial.mjs')

function isPidAlive(pid) {
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (e) {
    return e && e.code === 'EPERM'
  }
}

function readLock() {
  const parsed = readJsonFileUtf8OrUtf16(LOCK_PATH)
  if (!parsed || typeof parsed !== 'object') return null
  return parsed
}

function writeLock(info) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeUtf8RepairUtf16(LOCK_PATH, JSON.stringify({ ...info, pid: info.pid, startedAt: info.startedAt ?? Date.now() }))
}

export function clearTrialLock() {
  try {
    if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH)
  } catch {
    /* ignore */
  }
}

export function writeTrialLive(snapshot) {
  mkdirSync(DATA_DIR, { recursive: true })
  const text = JSON.stringify(snapshot)
  writeUtf8RepairUtf16(LIVE_PATH, text)
  try {
    writeUtf8RepairUtf16(PUBLIC_LIVE_PATH, text)
  } catch {
    /* public copy is a UI fallback only */
  }
}

export function mergeTrialHeartbeat(body = {}) {
  const prev = readJsonFileUtf8OrUtf16(LIVE_PATH) || emptyTrialLiveSnapshot()
  const log = Array.isArray(prev.log) ? [...prev.log] : []
  if (body.logLine) {
    log.push({
      t: Date.now(),
      level: body.level || 'info',
      text: String(body.logLine),
    })
  }
  const running = body.running === undefined ? prev.running : body.running
  const next = {
    ...prev,
    updatedAt: Date.now(),
    running,
    current: running
      ? {
          examId: running.examId ?? prev.current?.examId ?? '',
          examLabel: running.examLabel ?? prev.current?.examLabel ?? '',
          subject: running.subject ?? prev.current?.subject ?? '',
          section: running.section ?? prev.current?.section ?? '',
          chapter: running.chapter ?? prev.current?.chapter ?? '',
          jobIndex: Number(running.jobIndex ?? prev.current?.jobIndex) || 0,
          jobCount: Number(running.jobCount ?? prev.current?.jobCount) || 0,
          generatingIndex: Number(running.generatingIndex ?? prev.current?.generatingIndex) || 0,
          generatingOf: Number(running.generatingOf ?? prev.current?.generatingOf) || 10,
          phase: running.phase ?? prev.current?.phase ?? 'working',
        }
      : null,
    lastStem: body.lastStem != null ? String(body.lastStem) : prev.lastStem,
    lastChapter: body.lastChapter != null ? String(body.lastChapter) : prev.lastChapter,
    lastSubject: body.lastSubject != null ? String(body.lastSubject) : prev.lastSubject,
    log: log.slice(-40),
  }
  if (body.error) {
    const recentErrors = Array.isArray(prev.recentErrors) ? [...prev.recentErrors] : []
    recentErrors.push({
      key: String(body.errorKey ?? next.current?.chapter ?? 'ui'),
      error: String(body.error),
      at: Date.now(),
    })
    next.recentErrors = recentErrors.slice(-10)
  }
  writeTrialLive(next)
  return next
}

export function readTrialLive() {
  const lock = readLock()
  const scriptRunning = isPidAlive(lock?.pid)
  if (!scriptRunning && lock) clearTrialLock()
  const live = readJsonFileUtf8OrUtf16(LIVE_PATH)
  const base = live && typeof live === 'object' ? live : emptyTrialLiveSnapshot()
  return {
    ...base,
    scriptRunning,
    geminiKeyHint: undefined,
  }
}

/**
 * @param {{ smoke?: boolean, full?: boolean }} [opts]
 */
export function startTrialScript(opts = {}) {
  const lock = readLock()
  if (isPidAlive(lock?.pid)) {
    return { ok: true, alreadyRunning: true, pid: lock.pid, live: readTrialLive() }
  }
  mkdirSync(DATA_DIR, { recursive: true })
  const args = [SCRIPT_PATH]
  if (opts.smoke) args.push('--smoke')
  else args.push('--full')
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  if (!child.pid) {
    return { ok: false, error: 'Could not start the trial script. Press F5 and try again.' }
  }
  writeLock({ pid: child.pid, startedAt: Date.now(), mode: opts.smoke ? 'smoke' : 'full' })
  child.unref()
  const live = mergeTrialHeartbeat({
    logLine: opts.smoke
      ? 'Started smoke trial (first chapter). Watch this panel.'
      : 'Started / resumed full JEE + NEET trial. Watch this panel.',
    running: {
      pid: child.pid,
      phase: 'starting',
      jobIndex: 0,
      jobCount: 0,
      generatingIndex: 0,
      generatingOf: 10,
    },
  })
  return { ok: true, alreadyRunning: false, pid: child.pid, live }
}

export { LIVE_PATH, LOCK_PATH }
