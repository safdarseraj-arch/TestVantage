/**
 * Gemini SCQ trial runner. Drafts only. Resume via data/gemini-scq-trial-progress.json.
 *
 *   node scripts/run-gemini-scq-trial.mjs --smoke
 *   node scripts/run-gemini-scq-trial.mjs --full
 *   node scripts/run-gemini-scq-trial.mjs --exam=jee-main --subject=mathematics
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJsonFileUtf8OrUtf16, writeUtf8RepairUtf16 } from '../server/readJsonFile.js'

import '../server/loadEnv.js'
import { generateScqTrialChapter, getVisionEnv } from '../server/vision.js'
import { bulkUpsertQuestions, loadQuestions } from '../server/stores/questions.js'
import {
  SCQ_TRIAL_COUNT,
  SCQ_TRIAL_GAP_MS,
  SCQ_TRIAL_PROGRESS_FILENAME,
  SCQ_TRIAL_DRAFTS_FILENAME,
  SCQ_TRIAL_LIVE_FILENAME,
  listAllTrialJobs,
  listTrialChapters,
  pickSmokeChapter,
  trialJobKey,
  trialItemToBankDraft,
  trialItemToPyqBankItem,
  trialDraftIsIncomplete,
  applyTrialDuplicatePolicy,
  emptyTrialProgress,
  jobIsComplete,
  sleepMs,
  isQuotaError,
  quotaBackoffMs,
  countTrialDraftsBySubject,
  subjectLabel,
  buildTrialLiveSnapshot,
  stemPreview,
} from '../src/utils/geminiScqTrial.js'
import { clearTrialLock } from '../server/scqTrialLive.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'data')
const PROGRESS_PATH = join(DATA_DIR, SCQ_TRIAL_PROGRESS_FILENAME)
const DRAFTS_PATH = join(DATA_DIR, SCQ_TRIAL_DRAFTS_FILENAME)
const LIVE_PATH = join(DATA_DIR, SCQ_TRIAL_LIVE_FILENAME)
const PUBLIC_LIVE_PATH = join(ROOT, 'public', SCQ_TRIAL_LIVE_FILENAME)

function writeUtf8(filePath, text) {
  writeUtf8RepairUtf16(filePath, text)
}

function writeLiveFile(text) {
  writeUtf8(LIVE_PATH, text)
  try {
    writeUtf8(PUBLIC_LIVE_PATH, text)
  } catch {
    /* public copy is a UI fallback only */
  }
}

let liveLog = []

function pushLog(text, level = 'info') {
  liveLog.push({ t: Date.now(), level, text: String(text) })
  liveLog = liveLog.slice(-40)
}

function flushLive(progress, running) {
  const last = progress?.questions?.[progress.questions.length - 1]
  writeLiveFile(
    JSON.stringify(
      buildTrialLiveSnapshot(progress, {
        running,
        log: liveLog,
        lastStem: last?.text,
        lastChapter: last?.chapter,
        lastSubject: last?.subject,
      }),
    ),
  )
}

function loadProgress() {
  const parsed = readJsonFileUtf8OrUtf16(PROGRESS_PATH)
  if (!parsed) return emptyTrialProgress()
  return {
    version: 1,
    updatedAt: Number(parsed?.updatedAt) || 0,
    jobs: parsed?.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {},
    questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
  }
}

function saveProgress(progress) {
  mkdirSync(DATA_DIR, { recursive: true })
  const next = { ...progress, updatedAt: Date.now() }
  writeUtf8(PROGRESS_PATH, JSON.stringify(next))
  writeUtf8(
    DRAFTS_PATH,
    JSON.stringify({
      settings: { examPatternId: 'jee-main', testTypeId: 'chapter', title: 'Gemini SCQ trial drafts' },
      questions: next.questions,
    }),
  )
  return next
}

function parseArgs(argv) {
  const out = { smoke: false, full: false, exam: '', subject: '', resume: true, pyqStyle: false, year: 0, date: '', shift: 0, paper: '' }
  for (const a of argv) {
    if (a === '--smoke') out.smoke = true
    else if (a === '--full') out.full = true
    else if (a === '--no-resume') out.resume = false
    else if (a === '--pyq-style') out.pyqStyle = true
    else if (a.startsWith('--exam=')) out.exam = a.slice(7)
    else if (a.startsWith('--subject=')) out.subject = a.slice(10)
    else if (a.startsWith('--year=')) out.year = Number(a.slice(7))
    else if (a.startsWith('--date=')) out.date = a.slice(7)
    else if (a.startsWith('--shift=')) out.shift = Number(a.slice(8))
    else if (a.startsWith('--paper=')) out.paper = a.slice(8)
  }
  return out
}

function selectJobs(args) {
  if (args.smoke && !args.full && !args.exam) {
    const smoke = pickSmokeChapter()
    return smoke ? [smoke] : []
  }
  if (args.exam && args.subject) {
    return listTrialChapters(args.exam, args.subject)
  }
      if (args.exam) {
    const exam = args.exam === 'jeee-main' ? 'jee-main' : args.exam
    const subs =
      exam === 'neet'
        ? ['physics', 'chemistry', 'biology']
        : ['mathematics', 'physics', 'chemistry']
    return subs.flatMap((s) => listTrialChapters(exam, s))
  }
  return listAllTrialJobs()
}

function keyPresent() {
  const { geminiKey } = getVisionEnv()
  return Boolean(geminiKey)
}

async function persistToServerBank(entries) {
  if (!entries.length) return 0
  try {
    const existing = await loadQuestions()
    const bank = Array.isArray(existing?.questions) ? existing.questions : []
    const byId = new Set(bank.map((q) => q?.id).filter(Boolean))
    const toAdd = entries.filter((q) => q?.id && !byId.has(q.id))
    if (!toAdd.length) return 0
    const result = await bulkUpsertQuestions(toAdd)
    return result?.synced ?? toAdd.length
  } catch (e) {
    console.warn('Server bank merge skipped:', e instanceof Error ? e.message : e)
    return 0
  }
}

async function runChapter(job, progress) {
  const result = await generateScqTrialChapter({
    examId: job.examId,
    subject: job.subject,
    section: job.section,
    chapter: job.chapter,
    topics: job.topics ?? [],
    count: SCQ_TRIAL_COUNT,
    pyqStyle: Boolean(job.pyqStyle),
    pyqYear: job.pyqYear,
    pyqDate: job.pyqDate,
    pyqShift: job.pyqShift,
    pyqSession: job.pyqSession,
  })
  const now = Date.now()
  const bank = [...progress.questions]
  const savedRows = []
  let duplicates = 0
  result.questions.slice(0, SCQ_TRIAL_COUNT).forEach((item, i) => {
    const draft = job.pyqStyle
      ? trialItemToPyqBankItem(item, job, { now, index: i })
      : trialItemToBankDraft(item, job, { now, index: i })
    draft.bankStatus = 'draft'
    if (trialDraftIsIncomplete(draft)) return
    const { entry, duplicate } = applyTrialDuplicatePolicy(draft, bank)
    entry.bankStatus = 'draft'
    bank.unshift(entry)
    savedRows.push(entry)
    if (duplicate) duplicates += 1
  })
  return {
    savedRows,
    duplicates,
    model: result.model,
    parseErrors: result.parseErrors ?? [],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!keyPresent()) {
    console.error(
      'GEMINI_API_KEY is missing. Add it to onlinetest/.env (or .env.local), then press F5 and re-run:',
    )
    console.error('  npm run gemini:scq-trial:smoke')
    process.exit(2)
  }
  console.log('GEMINI_API_KEY: present (value not printed)')

  let jobs = args.smoke && !args.full ? selectJobs({ ...args, smoke: true, full: false }) : selectJobs(args)
  if (args.smoke && args.full) {
    const smoke = pickSmokeChapter()
    const rest = listAllTrialJobs().filter((j) => trialJobKey(j) !== (smoke ? trialJobKey(smoke) : ''))
    jobs = smoke ? [smoke, ...rest] : rest
  }
  if (args.pyqStyle) {
    const year = Number(args.year) > 0 ? Number(args.year) : 2024
    jobs = jobs.map((j) => ({
      ...j,
      pyqStyle: true,
      pyqYear: year,
      pyqDate: args.date || undefined,
      pyqShift: args.shift === 1 || args.shift === 2 ? args.shift : undefined,
      pyqSession: args.paper || (j.examId === 'jee-advanced' ? 'Paper 1' : undefined),
    }))
  }
  if (!jobs.length) {
    console.error('No curriculum chapters matched.')
    process.exit(1)
  }

  mkdirSync(DATA_DIR, { recursive: true })
  let progress = args.resume ? loadProgress() : emptyTrialProgress()
  if (!args.resume) progress = emptyTrialProgress()

  console.log(`Jobs: ${jobs.length} chapter(s) x ${SCQ_TRIAL_COUNT} SCQ drafts. Resume: ${args.resume}`)
  pushLog(`Jobs: ${jobs.length} chapter(s) × ${SCQ_TRIAL_COUNT} drafts. Resume: ${args.resume}`)
  flushLive(progress, {
    pid: process.pid,
    phase: 'starting',
    jobIndex: 0,
    jobCount: jobs.length,
    generatingIndex: 0,
    generatingOf: SCQ_TRIAL_COUNT,
  })
  let ran = 0
  let skipped = 0
  let errors = 0

  try {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      const key = trialJobKey(job)
      const label = `${job.examId} / ${subjectLabel(job.subject)} / ${job.section} / ${job.chapter}`
      if (args.resume && jobIsComplete(progress.jobs[key])) {
        skipped += 1
        console.log(`[${i + 1}/${jobs.length}] skip (done) ${label}`)
        continue
      }
      const running = {
        pid: process.pid,
        examId: job.examId,
        examLabel: job.examLabel,
        subject: job.subject,
        section: job.section,
        chapter: job.chapter,
        jobIndex: i + 1,
        jobCount: jobs.length,
        generatingIndex: 0,
        generatingOf: SCQ_TRIAL_COUNT,
        phase: 'calling-gemini',
      }
      console.log(`[${i + 1}/${jobs.length}] ${label}`)
      pushLog(`[${i + 1}/${jobs.length}] ${label} — calling Gemini…`)
      flushLive(progress, running)
      let attempt = 0
      let ok = false
      while (attempt < 4 && !ok) {
        try {
          const out = await runChapter(job, progress)
          progress.questions.push(...out.savedRows)
          progress.jobs[key] = {
            status: out.savedRows.length >= SCQ_TRIAL_COUNT ? 'done' : 'partial',
            saved: out.savedRows.length,
            duplicates: out.duplicates,
            model: out.model,
            parseErrors: out.parseErrors,
            at: Date.now(),
          }
          saveProgress(progress)
          await persistToServerBank(out.savedRows)
          const last = out.savedRows[out.savedRows.length - 1]
          const line =
            `  saved ${out.savedRows.length}/${SCQ_TRIAL_COUNT}` +
            (out.duplicates ? `, ${out.duplicates} duplicate_review` : '') +
            (out.model ? ` [${out.model}]` : '')
          console.log(line)
          pushLog(line)
          if (last?.text) pushLog(`  stem: ${stemPreview(last.text, 120)}`)
          flushLive(progress, {
            ...running,
            phase: 'saved',
            generatingIndex: out.savedRows.length,
          })
          ran += 1
          ok = true
        } catch (e) {
          const parseFail =
            e?.code === 'SCQ_TRIAL_PARSE' || /no questions array|no valid SCQ/i.test(String(e?.message ?? ''))
          if ((isQuotaError(e) || parseFail) && attempt < 3) {
            const wait = isQuotaError(e) ? quotaBackoffMs(attempt) : 4000 * (attempt + 1)
            const waitLine = `  ${isQuotaError(e) ? '429 quota' : 'parse miss'} — wait ${Math.round(wait / 1000)}s then retry`
            console.warn(waitLine)
            pushLog(waitLine, isQuotaError(e) ? 'error' : 'warn')
            flushLive(progress, {
              ...running,
              phase: isQuotaError(e) ? 'waiting-quota' : 'parse-retry',
            })
            await sleepMs(wait)
            attempt += 1
            continue
          }
          errors += 1
          const errText = e instanceof Error ? e.message : String(e)
          progress.jobs[key] = {
            status: 'error',
            saved: Number(progress.jobs[key]?.saved) || 0,
            error: errText,
            at: Date.now(),
          }
          saveProgress(progress)
          console.error(`  ERROR: ${errText}`)
          pushLog(`  ERROR: ${errText}`, 'error')
          flushLive(progress, { ...running, phase: 'error' })
          ok = true
        }
      }
      if (i < jobs.length - 1) await sleepMs(SCQ_TRIAL_GAP_MS)
    }

    const counts = countTrialDraftsBySubject(progress.questions)
    console.log('')
    console.log('--- Gemini SCQ trial summary ---')
    console.log(`Chapters this run: ${ran}  skipped: ${skipped}  errors: ${errors}`)
    console.log(`Drafts in progress file: ${counts.drafts}  duplicate_review: ${counts.duplicates}`)
    for (const [sub, n] of Object.entries(counts.bySubject)) {
      console.log(`  ${sub}: ${n}`)
    }
    pushLog(
      `Done. This run saved ${ran} chapter(s), skipped ${skipped}, errors ${errors}. Drafts file: ${counts.drafts}.`,
    )
    console.log(`Progress: ${PROGRESS_PATH}`)
    console.log('See drafts: Question Bank -> Saved questions -> Draft filter (source: Gemini SCQ trial).')
    console.log('They are NEVER auto-published. Import the drafts JSON on Saved if this device bank is empty.')
  } finally {
    flushLive(progress, null)
    clearTrialLock()
  }
}

main().catch((e) => {
  console.error(e)
  pushLog(`FATAL: ${e instanceof Error ? e.message : e}`, 'error')
  try {
    flushLive(loadProgress(), null)
  } catch {
    /* ignore */
  }
  clearTrialLock()
  process.exit(1)
})
