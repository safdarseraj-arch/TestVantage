import { SCALE, SERVER, FEATURES, VISION, PIX2TEXT, MATHPIX } from './config.js'
import {
  assistWithCloudVision,
  extractWithCloudVision,
  generateScqTrialChapter,
  generatePyqReplicaPapers,
  getVisionEnv,
  getVisionStatus,
  locateOptionRegionsWithCloudVision,
  solveWithCloudVision,
  structureOcrWithGemini,
  enrichOcrLightWithGemini,
} from './vision.js'
import { extractWithMathpix, getMathpixStatus } from './mathpix.js'
import { extractWithPix2Text, getPix2TextStatus } from './pix2text.js'
import { getStorageInfo, isPlatformReady } from './bootstrap.js'
import { geminiQueueStatus, runGeminiQueued } from './geminiGenerationQueue.js'
import { buildOfficialCareerCompassBundle } from '../src/utils/careerCompassOfficialMerge.js'
import { getExamPulseBundle, refreshExamPulseBundle } from './examPulse.js'
import {
  OFFICIAL_PYQ_PORTALS,
  OFFICIAL_PYQ_SOURCE_SLOTS,
  listOfficialPyqSourceSlots,
} from '../src/data/officialPyqSources.js'
import {
  bulkUpsertQuestions,
  loadQuestions,
  upsertQuestion,
} from './stores/questions.js'
import {
  addQuestionReportFile,
  listQuestionReportsFile,
  setQuestionReportStatusFile,
} from './questionReportsStore.js'
import {
  clearExamSession,
  listExamSessionsForOwner,
  loadExamSession,
  saveExamSession,
} from './stores/examSessions.js'
import { listAttempts, saveAttemptRecord } from './stores/attempts.js'
import { loadOrgData, saveOrgData } from './stores/orgData.js'
import { loadCustomTestsData, saveCustomTestsData } from './stores/customTestsData.js'
import {
  getCircleFile,
  getMeritFile,
  getPulseLinkFile,
  getPulseProfileFile,
  listCirclesForOwnerFile,
  saveCircleFile,
  saveMeritFile,
  setPulseLinkFile,
  upsertPulseProfileFile,
} from './pulseFileStore.js'
import { authenticateLogin, requireAdmin, ADMIN_USING_DEFAULT_PASSWORD } from './auth.js'
import {
  getCounsellingUpdateStatus,
  startCounsellingFillUpdate,
} from './counsellingFillUpdate.js'
import { checkRateLimit } from './stores/rateLimit.js'
import { readJsonBody, sendJson, clientIp, studentHeaders, teacherEmail } from './lib/http.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SCQ_TRIAL_PROGRESS_FILENAME,
  SCQ_TRIAL_DRAFTS_FILENAME,
} from '../src/utils/geminiScqTrial.js'
import { readJsonFileUtf8OrUtf16 } from './readJsonFile.js'
import { readTrialLive, startTrialScript, mergeTrialHeartbeat } from './scqTrialLive.js'
import { getLatestReplicaJob, getReplicaJob } from './pyqReplicaLive.js'

const ROUTER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {ReturnType<typeof buildOfficialCareerCompassBundle> | null} */
let careerCompassCache = null

function getCareerCompassApiBundle() {
  if (!careerCompassCache) {
    careerCompassCache = buildOfficialCareerCompassBundle({
      pulledAt: Date.now(),
      note: 'API bundle — NTA marks curves + JoSAA / CSAB / MCC cutoffs (2024–2026 curated benchmarks).',
    })
  }
  return careerCompassCache
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function handleApiRequest(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname
  const ip = clientIp(req)

  const skipRateLimit =
    req.method === 'GET' &&
    (path === '/api/health' ||
      path === '/api/ready' ||
      path === '/api/vision/scq-trial/live')

  if (!skipRateLimit) {
    const limit = await checkRateLimit(ip)
    if (!limit.ok) {
      sendJson(res, 429, {
        error: 'Too many requests — please slow down',
        retryAfterSec: limit.retryAfterSec,
      })
      return
    }
  }

  const storage = getStorageInfo()

  try {
    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        mode: 'production-scale',
        targetConcurrentStudents: SCALE.targetConcurrentStudents,
        instanceId: SERVER.instanceId,
        storage,
        features: FEATURES,
        liveAuth: true,
        liveBackup: true,
        adminPasswordIsDefault: ADMIN_USING_DEFAULT_PASSWORD,
      })
      return
    }

    if (req.method === 'GET' && path === '/api/ready') {
      if (!isPlatformReady()) {
        sendJson(res, 503, { ready: false, storage, instanceId: SERVER.instanceId })
        return
      }
      sendJson(res, 200, {
        ready: true,
        storage,
        instanceId: SERVER.instanceId,
        liveAuth: true,
        liveBackup: true,
      })
      return
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      const body = await readJsonBody(req, 32 * 1024)
      const email = body?.email ?? ''
      const password = body?.password ?? ''
      const role = body?.role === 'admin' ? 'admin' : 'any'
      const result = await authenticateLogin(email, password, role)
      if (!result.ok) {
        sendJson(res, 401, { error: result.error })
        return
      }
      sendJson(res, 200, { ok: true, session: result.session })
      return
    }

    if (req.method === 'GET' && path === '/api/backup') {
      const auth = await requireAdmin(req)
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error || 'Admin login required' })
        return
      }
      const bank = await loadQuestions()
      const org = await loadOrgData()
      const attempts = await listAttempts({ limit: 500 })
      sendJson(res, 200, {
        ok: true,
        exportedAt: Date.now(),
        questionCount: bank.questions.length,
        attemptCount: attempts.length,
        questions: bank.questions,
        schools: org.schools,
        classes: org.classes,
        assignments: org.assignments,
        users: org.users.map((u) => ({ ...u, password: '[redacted]' })),
        attempts,
      })
      return
    }

    if (req.method === 'GET' && path === '/api/questions') {
      const bank = await loadQuestions()
      sendJson(res, 200, { questions: bank.questions, updatedAt: bank.updatedAt })
      return
    }

    if (req.method === 'PUT' && path.startsWith('/api/questions/')) {
      const id = decodeURIComponent(path.slice('/api/questions/'.length))
      const body = await readJsonBody(req, 25 * 1024 * 1024)
      const question = body?.question ?? body
      if (!question || question.id !== id) {
        sendJson(res, 400, { error: 'Body must include question with matching id' })
        return
      }
      const saved = await upsertQuestion(question)
      sendJson(res, 200, { ok: true, question: saved, teacher: teacherEmail(req) })
      return
    }

    if (req.method === 'GET' && path === '/api/question-reports') {
      sendJson(res, 200, { reports: listQuestionReportsFile() })
      return
    }

    if (req.method === 'POST' && path === '/api/question-reports') {
      const body = await readJsonBody(req, 64 * 1024)
      try {
        const report = addQuestionReportFile(body?.report ?? body)
        sendJson(res, 200, { ok: true, report })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid report' })
      }
      return
    }

    if (req.method === 'PATCH' && path.startsWith('/api/question-reports/')) {
      const id = decodeURIComponent(path.slice('/api/question-reports/'.length))
      const body = await readJsonBody(req, 8 * 1024)
      try {
        const report = setQuestionReportStatusFile(id, body?.status)
        if (!report) {
          sendJson(res, 404, { error: 'Report not found' })
          return
        }
        sendJson(res, 200, { ok: true, report })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid status' })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/vision/status') {
      sendJson(res, 200, getVisionStatus())
      return
    }

    if (req.method === 'GET' && path === '/api/mathpix/status') {
      sendJson(res, 200, getMathpixStatus())
      return
    }

    if (req.method === 'POST' && path === '/api/mathpix/extract') {
      const body = await readJsonBody(req, MATHPIX.maxBodyBytes)
      try {
        const result = await extractWithMathpix(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'MATHPIX_NOT_CONFIGURED'
            ? 503
            : e?.code === 'MATHPIX_AUTH_FAILED'
              ? 401
              : e?.code === 'MATHPIX_BAD_INPUT'
                ? 400
                : e?.code === 'MATHPIX_TIMEOUT'
                  ? 504
                  : 502
        sendJson(res, code, {
          error: e instanceof Error ? e.message : 'Mathpix OCR failed',
          code: e?.code || 'MATHPIX_EXTRACT_FAILED',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/enrich-ocr-light') {
      const body = await readJsonBody(req, 512 * 1024)
      try {
        const result = await enrichOcrLightWithGemini(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'VISION_QUOTA' || e?.status === 429
              ? 429
              : 502
        sendJson(res, code, {
          error: e instanceof Error ? e.message : 'Gemini light enrich failed',
          code: e?.code || 'VISION_ENRICH_FAILED',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/structure-ocr') {
      const body = await readJsonBody(req, 2 * 1024 * 1024)
      try {
        const result = await structureOcrWithGemini(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'STRUCTURE_OCR_EMPTY'
              ? 400
            : e?.code === 'VISION_QUOTA' || e?.status === 429
              ? 429
              : e?.code === 'VISION_TIMEOUT'
                ? 504
                : 502
        sendJson(res, code >= 400 && code < 600 ? code : 502, {
          error: e instanceof Error ? e.message : 'Gemini structure failed',
          code: e?.code || 'STRUCTURE_OCR_FAILED',
        })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/ocr/stack-status') {
      const [vision, pix2text] = await Promise.all([getVisionStatus(), getPix2TextStatus()])
      const mathpix = getMathpixStatus()
      sendJson(res, 200, {
        ok: true,
        vision,
        pix2text,
        mathpix,
        localHybrid: { ready: true, engine: 'browser-hybrid' },
        pipeline: [
          '1 mathpix-ocr',
          '2 local-ai-split-clean',
          '3 gemini-flash-lite-tags-answers-solutions',
          '4 review-ui',
        ],
        readyForMathUpload: mathpix.ready,
      })
      return
    }

    if (req.method === 'GET' && path === '/api/pix2text/status') {
      sendJson(res, 200, await getPix2TextStatus())
      return
    }

    if (req.method === 'POST' && path === '/api/pix2text/extract') {
      const body = await readJsonBody(req, PIX2TEXT.maxBodyBytes)
      try {
        const result = await extractWithPix2Text(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'PIX2TEXT_DISABLED' || e?.code === 'PIX2TEXT_NOT_READY'
            ? 503
            : e?.code === 'PIX2TEXT_TIMEOUT'
              ? 504
              : 502
        sendJson(res, code, {
          error: e instanceof Error ? e.message : 'Pix2Text extract failed',
          code: e?.code || 'PIX2TEXT_EXTRACT_FAILED',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/extract') {
      const body = await readJsonBody(req, VISION.maxBodyBytes)
      try {
        const result = await extractWithCloudVision(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'VISION_AUTH_FAILED'
              ? 401
              : e?.status && Number.isFinite(Number(e.status))
                ? Number(e.status)
                : 502
        sendJson(res, code >= 400 && code < 600 ? code : 502, {
          error: e instanceof Error ? e.message : 'Cloud vision extract failed',
          code: e?.code || 'VISION_EXTRACT_FAILED',
          status: e?.status || code,
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/solve') {
      const body = await readJsonBody(req, 512 * 1024)
      try {
        const result = await solveWithCloudVision(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code = e?.code === 'VISION_NOT_CONFIGURED' ? 503 : 502
        sendJson(res, code, {
          error: e instanceof Error ? e.message : 'Cloud vision solve failed',
          code: e?.code || 'VISION_SOLVE_FAILED',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/option-regions') {
      const body = await readJsonBody(req, VISION.maxBodyBytes)
      try {
        const result = await locateOptionRegionsWithCloudVision(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'VISION_AUTH_FAILED'
              ? 401
              : e?.status && Number.isFinite(Number(e.status))
                ? Number(e.status)
                : 502
        sendJson(res, code >= 400 && code < 600 ? code : 502, {
          error: e instanceof Error ? e.message : 'Option region locate failed',
          code: e?.code || 'VISION_OPTION_REGIONS_FAILED',
          status: e?.status || code,
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/assist') {
      const body = await readJsonBody(req, 512 * 1024)
      try {
        const result = await assistWithCloudVision(body ?? {})
        sendJson(res, 200, result)
      } catch (e) {
        const code = e?.code === 'VISION_NOT_CONFIGURED' ? 503 : 502
        sendJson(res, code, {
          error: e instanceof Error ? e.message : 'Cloud assist failed',
          code: e?.code || 'VISION_ASSIST_FAILED',
        })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/vision/gemini-queue/status') {
      sendJson(res, 200, { ok: true, ...geminiQueueStatus() })
      return
    }

    if (req.method === 'GET' && path === '/api/vision/scq-trial/status') {
      const { geminiKey } = getVisionEnv()
      const vision = getVisionStatus()
      const live = readTrialLive()
      sendJson(res, 200, {
        ok: true,
        geminiKeyPresent: Boolean(geminiKey),
        geminiKeyLength: geminiKey ? geminiKey.length : 0,
        configured: vision.configured,
        message: geminiKey
          ? 'Gemini key found. Trial questions save as drafts only.'
          : 'Add GEMINI_API_KEY to onlinetest/.env, then press F5.',
        live,
      })
      return
    }

    if (req.method === 'GET' && path === '/api/vision/scq-trial/live') {
      try {
        const { geminiKey } = getVisionEnv()
        sendJson(res, 200, {
          ok: true,
          geminiKeyPresent: Boolean(geminiKey),
          ...readTrialLive(),
        })
      } catch (e) {
        sendJson(res, 200, {
          ok: true,
          error: e instanceof Error ? e.message : 'Could not read live log',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/vision/scq-trial/start') {
      const body = (await readJsonBody(req, 16 * 1024).catch(() => ({}))) ?? {}
      const { geminiKey } = getVisionEnv()
      if (!geminiKey) {
        sendJson(res, 503, {
          ok: false,
          error: 'GEMINI_API_KEY is missing. Add it to onlinetest/.env, then press F5.',
          code: 'VISION_NOT_CONFIGURED',
        })
        return
      }
      const result = startTrialScript({
        smoke: Boolean(body.smoke),
        full: body.full !== false,
      })
      sendJson(res, result.ok ? 200 : 500, result)
      return
    }

    if (req.method === 'POST' && path === '/api/vision/scq-trial/heartbeat') {
      const body = (await readJsonBody(req, 32 * 1024).catch(() => ({}))) ?? {}
      const live = mergeTrialHeartbeat(body)
      sendJson(res, 200, { ok: true, live })
      return
    }

    if (req.method === 'GET' && path === '/api/vision/scq-trial/drafts') {
      const progressPath = join(ROUTER_ROOT, 'data', SCQ_TRIAL_PROGRESS_FILENAME)
      const draftsPath = join(ROUTER_ROOT, 'data', SCQ_TRIAL_DRAFTS_FILENAME)
      const parsed =
        readJsonFileUtf8OrUtf16(progressPath) ?? readJsonFileUtf8OrUtf16(draftsPath)
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : []
      sendJson(res, 200, {
        ok: true,
        questions: questions.map((q) => ({ ...q, bankStatus: 'draft' })),
        jobs: parsed?.jobs ?? {},
      })
      return
    }

    if (req.method === 'POST' && path === '/api/vision/scq-trial') {
      const body = await readJsonBody(req, 512 * 1024)
      const chapter = String(body?.chapter ?? body?.section ?? 'chapter').slice(0, 80)
      try {
        const result = await runGeminiQueued(`scq-trial:${chapter}`, () =>
          generateScqTrialChapter(body ?? {}),
        )
        sendJson(res, 200, result)
      } catch (e) {
        const status =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'VISION_QUOTA' || e?.status === 429
              ? 429
              : e?.code === 'SCQ_TRIAL_BAD_SUBJECT' || e?.code === 'SCQ_TRIAL_BAD_CHAPTER'
                ? 400
                : e?.status && Number.isFinite(Number(e.status))
                  ? Number(e.status)
                  : 502
        sendJson(res, status >= 400 && status < 600 ? status : 502, {
          error: e instanceof Error ? e.message : 'SCQ trial generate failed',
          code: e?.code || 'SCQ_TRIAL_FAILED',
        })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/vision/pyq-replica-papers/live') {
      const jobId = new URL(req.url || '', 'http://local').searchParams.get('jobId')
      const job = jobId ? getReplicaJob(jobId) : getLatestReplicaJob()
      sendJson(res, 200, job ? { ok: true, ...job } : { ok: false, running: false })
      return
    }

    if (req.method === 'POST' && path === '/api/vision/pyq-replica-papers') {
      const body = await readJsonBody(req, 4 * 1024 * 1024)
      const jobId = `pyq-replica-${Date.now()}`
      try {
        const result = await generatePyqReplicaPapers(body ?? {}, jobId)
        sendJson(res, 200, { ...result, jobId })
      } catch (e) {
        const status =
          e?.code === 'VISION_NOT_CONFIGURED'
            ? 503
            : e?.code === 'VISION_QUOTA' || e?.status === 429
              ? 429
              : e?.code === 'PYQ_REPLICA_EMPTY' || e?.code === 'PYQ_REPLICA_BAD_PAPER'
                ? 400
                : e?.status && Number.isFinite(Number(e.status))
                  ? Number(e.status)
                  : 502
        sendJson(res, status >= 400 && status < 600 ? status : 502, {
          error: e instanceof Error ? e.message : 'PYQ replica generate failed',
          code: e?.code || 'PYQ_REPLICA_FAILED',
          jobId,
          details: e?.details,
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/questions/sync') {
      const body = await readJsonBody(req, 25 * 1024 * 1024)
      const list = Array.isArray(body?.questions) ? body.questions : []
      if (!list.length) {
        sendJson(res, 400, { error: 'questions array is required' })
        return
      }
      const result = await bulkUpsertQuestions(list)
      sendJson(res, 200, {
        ok: true,
        synced: result.synced,
        questions: result.questions,
        teacher: teacherEmail(req),
      })
      return
    }

    if (req.method === 'GET' && path === '/api/org') {
      const org = await loadOrgData()
      sendJson(res, 200, org)
      return
    }

    if (req.method === 'PUT' && path === '/api/org') {
      const body = await readJsonBody(req, 10 * 1024 * 1024)
      const saved = await saveOrgData({
        schools: Array.isArray(body?.schools) ? body.schools : undefined,
        classes: Array.isArray(body?.classes) ? body.classes : undefined,
        assignments: Array.isArray(body?.assignments) ? body.assignments : undefined,
        users: Array.isArray(body?.users) ? body.users : undefined,
      })
      sendJson(res, 200, { ok: true, ...saved, teacher: teacherEmail(req) })
      return
    }

    if (req.method === 'GET' && path === '/api/tests') {
      const data = await loadCustomTestsData()
      sendJson(res, 200, data)
      return
    }

    if (req.method === 'PUT' && path === '/api/tests') {
      const body = await readJsonBody(req, 25 * 1024 * 1024)
      const list = Array.isArray(body?.tests) ? body.tests : []
      const saved = await saveCustomTestsData({ tests: list })
      sendJson(res, 200, { ok: true, ...saved, teacher: teacherEmail(req) })
      return
    }

    if (req.method === 'GET' && path === '/api/attempts') {
      const ownerKeysParam = url.searchParams.get('ownerKeys')?.trim()
      const ownerKeys = ownerKeysParam
        ? ownerKeysParam.split(',').map((k) => decodeURIComponent(k.trim())).filter(Boolean)
        : undefined
      const limit = Number(url.searchParams.get('limit')) || 200
      const attempts = await listAttempts({ ownerKeys, limit })
      sendJson(res, 200, { attempts, count: attempts.length })
      return
    }

    if (!FEATURES.examSessions) {
      sendJson(res, 503, { error: 'Exam sessions disabled on this instance' })
      return
    }

    if (req.method === 'GET' && path.startsWith('/api/exam-sessions/')) {
      const parts = path.slice('/api/exam-sessions/'.length).split('/')
      const ownerKey = decodeURIComponent(parts[0] ?? '')
      const testId = decodeURIComponent(parts[1] ?? '')
      if (!ownerKey || !testId) {
        sendJson(res, 400, { error: 'Use /api/exam-sessions/:ownerKey/:testId' })
        return
      }
      const session = await loadExamSession(ownerKey, testId)
      if (!session) {
        sendJson(res, 404, { error: 'No active session' })
        return
      }
      sendJson(res, 200, { session })
      return
    }

    if (req.method === 'GET' && path === '/api/exam-sessions') {
      const ownerKey = url.searchParams.get('ownerKey')?.trim()
      if (!ownerKey) {
        sendJson(res, 400, { error: 'ownerKey query param required' })
        return
      }
      const sessions = await listExamSessionsForOwner(ownerKey)
      sendJson(res, 200, { sessions })
      return
    }

    if (req.method === 'PUT' && path === '/api/exam-sessions') {
      const body = await readJsonBody(req, SCALE.maxBodyBytes)
      const snapshot = body?.session ?? body
      if (!snapshot?.testId || !snapshot?.ownerKey) {
        sendJson(res, 400, { error: 'session with testId and ownerKey is required' })
        return
      }
      const { studentId } = studentHeaders(req)
      if (studentId && studentId !== snapshot.ownerKey) {
        sendJson(res, 403, { error: 'Student id mismatch' })
        return
      }
      const saved = await saveExamSession(snapshot)
      sendJson(res, 200, { ok: true, session: saved })
      return
    }

    if (req.method === 'DELETE' && path.startsWith('/api/exam-sessions/')) {
      const parts = path.slice('/api/exam-sessions/'.length).split('/')
      const ownerKey = decodeURIComponent(parts[0] ?? '')
      const testId = decodeURIComponent(parts[1] ?? '')
      if (!ownerKey || !testId) {
        sendJson(res, 400, { error: 'Use /api/exam-sessions/:ownerKey/:testId' })
        return
      }
      await clearExamSession(ownerKey, testId)
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && path === '/api/attempts') {
      const body = await readJsonBody(req, SCALE.maxBodyBytes)
      const attempt = body?.attempt ?? body
      if (!attempt?.testId || !attempt?.ownerKey) {
        sendJson(res, 400, { error: 'attempt with testId and ownerKey is required' })
        return
      }
      const saved = await saveAttemptRecord(attempt)
      await clearExamSession(attempt.ownerKey, attempt.testId)
      sendJson(res, 202, { ok: true, accepted: true, attemptId: saved.id })
      return
    }

    if (req.method === 'GET' && path === '/api/career-compass') {
      try {
        const bundle = getCareerCompassApiBundle()
        sendJson(res, 200, {
          ...bundle,
          updatedAt: bundle.pulledAt,
        })
      } catch (e) {
        sendJson(res, 503, {
          error: e instanceof Error ? e.message : 'Career Compass catalog unavailable',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/career-compass/refresh') {
      try {
        careerCompassCache = buildOfficialCareerCompassBundle({
          pulledAt: Date.now(),
          note: 'Refreshed official benchmarks snapshot (curated NTA / JoSAA / CSAB / MCC, 2024–2026).',
        })
        sendJson(res, 200, {
          ok: true,
          updatedAt: careerCompassCache.pulledAt,
          collegeCount: careerCompassCache.collegeCount,
          sourcesUsed: careerCompassCache.sourcesUsed,
        })
      } catch (e) {
        sendJson(res, 500, {
          error: e instanceof Error ? e.message : 'Career Compass refresh failed',
        })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/career-compass/update-counselling') {
      const auth = await requireAdmin(req)
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error || 'Admin login required' })
        return
      }
      sendJson(res, 200, { ok: true, ...getCounsellingUpdateStatus() })
      return
    }

    if (req.method === 'POST' && path === '/api/career-compass/update-counselling') {
      const auth = await requireAdmin(req)
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error || 'Admin login required' })
        return
      }
      const body = (await readJsonBody(req, 16 * 1024).catch(() => ({}))) ?? {}
      const started = startCounsellingFillUpdate({
        resume: body.force !== true,
        localOnly: body.localOnly === true,
      })
      sendJson(res, 200, { ok: true, ...started })
      return
    }

    if (req.method === 'GET' && path === '/api/exam-pulse') {
      try {
        const force =
          url.searchParams.get('force') === '1' || url.searchParams.get('refresh') === '1'
        const bundle = force ? await refreshExamPulseBundle() : await getExamPulseBundle()
        sendJson(res, 200, bundle)
      } catch (e) {
        sendJson(res, 503, {
          error: e instanceof Error ? e.message : 'Exam Pulse unavailable',
        })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/exam-pulse/refresh') {
      try {
        const bundle = await refreshExamPulseBundle()
        sendJson(res, 200, {
          ok: true,
          refreshedAt: bundle.refreshedAt,
          itemCount: bundle.items?.length ?? 0,
          mode: bundle.mode,
          aiUsed: bundle.aiUsed,
        })
      } catch (e) {
        sendJson(res, 500, {
          error: e instanceof Error ? e.message : 'Exam Pulse refresh failed',
        })
      }
      return
    }

    // Peer Pulse / Study Circle / Merit — shared directory across devices
    if (req.method === 'GET' && path === '/api/pulse/profile') {
      const code = url.searchParams.get('code')?.trim()
      if (!code) {
        sendJson(res, 400, { error: 'code query param required' })
        return
      }
      sendJson(res, 200, { profile: getPulseProfileFile(code) })
      return
    }

    if (req.method === 'PUT' && path === '/api/pulse/profile') {
      const body = await readJsonBody(req, 256 * 1024)
      try {
        const profile = upsertPulseProfileFile(body?.profile ?? body)
        sendJson(res, 200, { ok: true, profile })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid profile' })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/pulse/link') {
      const ownerKey = url.searchParams.get('ownerKey')?.trim()
      if (!ownerKey) {
        sendJson(res, 400, { error: 'ownerKey query param required' })
        return
      }
      sendJson(res, 200, { peerCode: getPulseLinkFile(ownerKey) })
      return
    }

    if (req.method === 'PUT' && path === '/api/pulse/link') {
      const body = await readJsonBody(req, 64 * 1024)
      const ownerKey = String(body?.ownerKey || '').trim()
      if (!ownerKey) {
        sendJson(res, 400, { error: 'ownerKey required' })
        return
      }
      try {
        const peerCode = setPulseLinkFile(ownerKey, body?.peerCode ?? null)
        sendJson(res, 200, { ok: true, peerCode })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid link' })
      }
      return
    }

    if (req.method === 'GET' && path === '/api/pulse/circle') {
      const code = url.searchParams.get('code')?.trim()
      if (!code) {
        sendJson(res, 400, { error: 'code query param required' })
        return
      }
      sendJson(res, 200, { circle: getCircleFile(code) })
      return
    }

    if (req.method === 'GET' && path === '/api/pulse/circles') {
      const ownerKey = url.searchParams.get('ownerKey')?.trim()
      if (!ownerKey) {
        sendJson(res, 400, { error: 'ownerKey query param required' })
        return
      }
      sendJson(res, 200, { circles: listCirclesForOwnerFile(ownerKey) })
      return
    }

    if (req.method === 'PUT' && path === '/api/pulse/circle') {
      const body = await readJsonBody(req, 256 * 1024)
      try {
        const circle = saveCircleFile(body?.circle ?? body)
        sendJson(res, 200, { ok: true, circle })
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid circle' })
      }
      return
    }

    if (req.method === 'POST' && path === '/api/pulse/circle/join') {
      const body = await readJsonBody(req, 64 * 1024)
      const code = String(body?.code || '')
        .trim()
        .toUpperCase()
      const ownerKey = String(body?.ownerKey || '').trim()
      const name = String(body?.name || 'Member').trim() || 'Member'
      const sparCode = String(body?.sparCode || '').trim().toUpperCase()
      if (!code || !ownerKey) {
        sendJson(res, 400, { error: 'code and ownerKey required' })
        return
      }
      const existing = getCircleFile(code)
      if (!existing) {
        sendJson(res, 404, { error: 'No Study Circle with that Cohort Code' })
        return
      }
      const members = Array.isArray(existing.members) ? [...existing.members] : []
      if (!members.some((m) => m.ownerKey === ownerKey)) {
        members.push({
          ownerKey,
          sparCode: sparCode || ownerKey.slice(0, 6).toUpperCase(),
          name,
          joinedAt: Date.now(),
        })
      }
      const circle = saveCircleFile({ ...existing, members })
      sendJson(res, 200, { ok: true, circle })
      return
    }

    if (req.method === 'GET' && path === '/api/pulse/merit') {
      const ownerKey = url.searchParams.get('ownerKey')?.trim()
      if (!ownerKey) {
        sendJson(res, 400, { error: 'ownerKey query param required' })
        return
      }
      sendJson(res, 200, { state: getMeritFile(ownerKey) })
      return
    }

    if (req.method === 'PUT' && path === '/api/pulse/merit') {
      const body = await readJsonBody(req, 256 * 1024)
      const ownerKey = String(body?.ownerKey || '').trim()
      if (!ownerKey || !body?.state) {
        sendJson(res, 400, { error: 'ownerKey and state required' })
        return
      }
      const state = saveMeritFile(ownerKey, body.state)
      sendJson(res, 200, { ok: true, state })
      return
    }

    // Official PYQ — curated sources only (no coaching scrapes). Client holds pending bank.
    if (req.method === 'GET' && path === '/api/official-pyq/sources') {
      const exam = url.searchParams.get('exam') || ''
      const yearRaw = url.searchParams.get('year')
      const year = yearRaw ? Number(yearRaw) : undefined
      const slots =
        exam || year != null
          ? listOfficialPyqSourceSlots(exam || undefined, Number.isFinite(year) ? year : undefined)
          : OFFICIAL_PYQ_SOURCE_SLOTS
      sendJson(res, 200, {
        note: 'Official NTA / JEE Advanced / NEET portals only. Download PDFs yourself, import into the pending bank, then approve. Never scrape coaching sites.',
        portals: OFFICIAL_PYQ_PORTALS,
        slots,
        slotCount: slots.length,
        pulledAt: Date.now(),
      })
      return
    }

    if (req.method === 'POST' && path === '/api/official-pyq/import') {
      const body = await readJsonBody(req)
      const exam = String(body?.exam || '')
      const year = Number(body?.year)
      const questions = Array.isArray(body?.questions) ? body.questions : []
      if (!['jee-main', 'jee-advanced', 'neet'].includes(exam)) {
        sendJson(res, 400, { error: 'exam must be jee-main, jee-advanced, or neet' })
        return
      }
      if (!Number.isFinite(year) || year < 2000) {
        sendJson(res, 400, { error: 'year is required (e.g. 2024)' })
        return
      }
      if (!questions.length) {
        sendJson(res, 400, {
          error:
            'questions array is required. Parse an official PDF first, then POST questions here for the client pending bank — this API only validates the payload.',
        })
        return
      }
      const sourceLabel = String(body?.sourceLabel || 'Official source').trim()
      sendJson(res, 200, {
        ok: true,
        status: 'pending_review',
        message:
          'Payload looks valid. Save it in the Official PYQ (Pending) page — nothing is published until Approve & publish.',
        paper: {
          exam,
          year,
          session: body?.session ? String(body.session) : undefined,
          paperLabel: body?.paperLabel ? String(body.paperLabel) : `${exam} ${year}`,
          sourceUrl: body?.sourceUrl ? String(body.sourceUrl) : undefined,
          sourceLabel,
          questionCount: questions.length,
          status: 'pending_review',
        },
      })
      return
    }

    if (
      req.method === 'POST' &&
      (path === '/api/generate/batch' || path === '/api/questions/clone-scaled')
    ) {
      const hybridBase = String(process.env.TESTVANTAGE_HYBRID_AI_URL ?? 'http://127.0.0.1:8000').replace(
        /\/$/,
        '',
      )
      const body = await readJsonBody(req, res, SCALE.maxBodyBytes)
      if (body === null) return
      try {
        const upstream = await fetch(`${hybridBase}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(body),
        })
        const text = await upstream.text()
        let data = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = { error: text || 'Invalid response from TestVantage AI API' }
        }
        sendJson(res, upstream.status, data)
      } catch {
        sendJson(res, 503, {
          error:
            'TestVantage AI API is not running. Start FastAPI (uvicorn main:app --port 8000) and try again.',
        })
      }
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Server error',
    })
  }
}
