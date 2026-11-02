import { computeTestDuration } from './testConfig.js'



import { attachDuplicateReviewFields, findDuplicateQuestions, findWholeBankPublishDuplicates, decidePublishDuplicateChoice } from './detectDuplicateQuestion.js'
import { collectCopyIds, rememberSuppressedHybridQuestion } from './hybridBankIdentity.js'
import { persistQuestionForBank } from './persistUpload.js'
import { mergeAdjacentOptionTails } from './extendTruncatedStem.js'
import { detectBrokenBankStem } from './stemBankGuard.js'
import { normalizePassageQuestionStorage } from './passage.js'
import { normalizeParsedBankRoot, parseStoredBankJson } from './bankParse.js'
import {
  assignApprovedAiQuestionId,
  assignClassifiedQuestionId,
  isTemporaryQuestionId,
  migrateAllClassifiedQuestionIds,
  remapQuestionIdReferences,
} from './classifiedQuestionId.js'
import { stampNewQuestionUploadMeta } from './questionUploadMeta.js'
import {
  applyQuestionHistoryOnUpdate,
  stampNewQuestionDraft,
} from './questionBankHistory.js'
import {
  isQuestionPublished,
  normalizeLegacyBankStatus,
} from './questionUploadFilter.js'
import { updateImportedPyqMeta } from './pyqStore.js'
import { maybeHealHybridDraftQuestion } from './hybridLatexSanitize.js'

const OFFICIAL_PYQ_META_KEYS = [
  'subject',
  'section',
  'chapter',
  'topic',
  'questionType',
  'examIds',
  'toughnessLevel',
  'source',
]

/** Keep student PYQ chapter/subject filters in line with bank tag edits. */
function syncOfficialPyqImportedMeta(oldId, entry, updates) {
  if (!entry?.officialPyq) return
  const idChanged = String(entry.id) !== String(oldId)
  const hasMeta = OFFICIAL_PYQ_META_KEYS.some((k) => k in updates)
  if (!hasMeta && !idChanged) return
  try {
    updateImportedPyqMeta(oldId, {
      id: entry.id,
      subject: entry.subject,
      chapter: entry.chapter,
      questionType: entry.questionType,
      topic: entry.topic,
      section: entry.section,
      toughnessLevel: entry.toughnessLevel,
      source: entry.source,
    })
  } catch {
    /* student PYQ copy is best-effort — bank save already succeeded */
  }
}

const STORAGE_KEY = 'testvantage-uploaded-questions'
const STORAGE_BACKUP_KEY = 'testvantage-uploaded-questions-backup'
const BANK_MIGRATE_VERSION_KEY = 'testvantage-bank-migrate-version'
/**
 * v18: figure MCQs — cropped diagram only (stemImageCrop, stemTextInImage false).
 * v20: passage sets — trim passageText, strip duplicate sub-stems, drop redundant passageImage.
 * v21: foolproof passage/sub dedupe — stripSubStemsFromPassageBody on parent rows.
 * v22: inline "What is the" stems (no newline) + viewer uses raw passage for dup check.
 * v23: show trimmed passage beside full-page image; sanitize on passage textarea edit.
 * v24: passage sub-rows inherit parent PIVQ / PSCQ metadata type.
 * v25: persist upload pipeline — normalizeStemForStorage on every bank row (math + passage).
 * v26: fix F(a,b) OCR + evaluate-sum $…$ merge (+F$\\left red LaTeX).
 * v27: F$\\left shard repair + auto-save repaired stems on bank load.
 * v28: matrix OCR (bmatri x^2), $$ delimiters on save, fixSimpleExponents after matrix repair.
 * v29: operatorname/trace OCR; store stems without display-only prep (MathText renders once).
 * v30: flat numeric bracket matrix; skip scalar-triple collapse on bmatrix; no unwrapEnglish on operatorname stems.
 * v31: repair [3 \\quad 4 \\quad …] flat bracket matrices (list + saved view).
 * v32: M^{-1}=A=[…] inline repair; fix $$$ delimiters; edit preview uses bank repair.
 * v33: [begin{bmatrix}…] OCR; flat [3\\ 4\\ …]; viewer auto-repair; heal broken rows on load.
 * v34: KaTeX-safe $$M^{-1}$$ blocks; flat [3 4 54 …] spaces; list preview uses live repair.
 * v35: final matrix gate — always repair loop, flat A=[digits], single-row bmatrix, reload all stems.
 * v36: protect \\begin{array} row breaks from operatorname collapse; heal flat N_p passage rows on reload.
 * v37: repair flat 2×2 bmatrix blocks (P/A style); detect row breaks per matrix not across neighbors.
 * v38: fix \\beta → beta corruption (OCR typo + operatorname backslash collapse); heal β integral stems.
 * v39: chemistry OCR repair (\\ce{}, \\pu{}), mhchem render, selective book ONNX + fast path.
 * v40: repair y²=7x intersection + lim x→P sin(sin x) garbled OCR stems.
 * v41: strip mistaken optionImages on text/fraction MCQs (auto-crop only for graphs).
 * v42: strip leaked trailing (A) option marker from MCQ question stems.
 * v43: ln/fraction identical-function MCQ OCR repair (f(x)=x/ln x, g(x)=ln x/x).
 * v44: triangle locus MCQ OCR repair (A(3,0) B(0,3) P(a,b) area 3/2).
 * v45: semiperimeter determinant integer OCR repair (a,b,c ΔABC, 3×3 vmatrix).
 * v46: Vandermonde det + parallel planes integer OCR repair (210d).
 * v47: unified determinant OCR repair (repairDeterminantOcr.js).
 * v48: α,β roots x²-4x+2=0 determinant SCQ repair (125/64/25/16 options).
 * v49: trig range f(x) determinant SCQ + generic determinant MCQ repair.
 * v50: polynomial coeff vmatrix (ax³+bx²+cx+d, value of a) generic repair.
 * v51: generic flat/pipe vmatrix repair for all determinant uploads.
 * v52: hybrid pipe+end vmatrix OCR + refresh preview re-parse.
 * v53: skip option auto-crop on determinant questions (strip wrong row crops).
 * v54: poly coeff determinant MCQ type + auto-fill A-D when OCR omits options.
 * v55: keep deliberate manual-split optionImages on determinant / text MCQs.
 * v56: z⁵ imaginary roots exp-determinant MCQ golden stem + options 0, e, 1, e⁵.
 * v57: stop passage false-positive on single “find the value of” determinant MCQs.
 * v58: classified questions get MAQ12345 ids (Subject + Unit + Chapter letters + chapter sequence).
 * v59: preserve numeric MCQ options (0, 1) through watermark strip; heal z⁵ det empty A/C options.
 * v60: slimmer JPEG bank images — strip empty image slots; re-compress large stored images on load.
 * v61: explicit bankStatus on legacy rows; only published questions in practice/tests.
 * v62: drop full composite stem image when A–D option graph crops exist (text + option crops only).
 * v63: text MCQ with complete OCR (cases/piecewise) — strip redundant stem crop; hide in viewer/exam.
 * v64: possible-duplicate drafts keep duplicateOfId so the new item can be compared with the original.
 * v65: Hybrid AI / trial draft LaTeX heal (bmatrix row breaks, \\hat{i}→I, IfA spacing) on load/save.
 */
/** Bump when stored question shape changes; keep scripts/test-bank-migrate-version.mjs in sync. */
export const CURRENT_BANK_MIGRATE_VERSION = 65

/** Normalize stem/options when persisting or merging into the bank. */
function prepareQuestionForBank(q, all = []) {
  return persistQuestionForBank(q, all)
}

/** @param {Question} q @param {Question[]} all @param {{ excludeIds?: string[] }} [opts] */
function finalizeBankQuestion(q, all, opts = {}) {
  return assignClassifiedQuestionId(prepareQuestionForBank(q, all), all, opts)
}



/** @typedef {import('../data/tests').Question} Question */



const DEFAULT_SETTINGS = {

  examPatternId: 'jee-advanced',

  testTypeId: 'chapter',

  title: 'My Uploaded Questions',

}

/** @param {Question} q */
export function questionSortTime(q) {
  const updated = Number(q?.updatedAt)
  if (Number.isFinite(updated) && updated > 0) return updated
  const saved = Number(q?.savedAt)
  if (Number.isFinite(saved) && saved > 0) return saved
  const m = String(q?.id ?? '').match(/(?:^|-)(\d{10,})(?:-|$)/)
  if (m) return Number(m[1])
  return 0
}

/** @param {Question[]} questions */
export function sortQuestionsNewestFirst(questions) {
  return [...questions].sort((a, b) => questionSortTime(b) - questionSortTime(a))
}



/** @returns {{ settings: typeof DEFAULT_SETTINGS, questions: Question[] }} */

function readRawBankFromBrowser() {
  if (typeof window === 'undefined') return null
  let raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    try {
      const pending = sessionStorage.getItem('testvantage-bank-pending-127')
      if (pending) {
        localStorage.setItem(STORAGE_KEY, pending)
        sessionStorage.removeItem('testvantage-bank-pending-127')
        raw = pending
      }
    } catch {
      /* ignore */
    }
  }
  if (!raw) raw = localStorage.getItem(STORAGE_BACKUP_KEY)
  if (!raw) {
    try {
      raw = sessionStorage.getItem('testvantage-bank-session-backup')
    } catch {
      /* ignore */
    }
  }
  return raw
}

export function loadQuestionBank() {
  try {
    const raw = readRawBankFromBrowser()
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, questions: [] }

    let parsed = parseStoredBankJson(raw)
    if (!parsed?.questions?.length) {
      const backupRaw = localStorage.getItem(STORAGE_BACKUP_KEY)
      if (backupRaw && backupRaw !== raw) {
        parsed = parseStoredBankJson(backupRaw)
        if (parsed?.questions?.length) {
          localStorage.setItem(STORAGE_KEY, backupRaw)
        }
      }
    }

    if (!parsed) return { settings: { ...DEFAULT_SETTINGS }, questions: [] }

    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      questions: parsed.questions,
    }
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, questions: [] }
  }
}

/** Fast read for UI — no migration side effects. */
export function peekUploadedQuestions() {
  return loadQuestionBank().questions
}

/** Restore main bank key from backup / session copy when parse returned empty. */
export function repairBankFromBackups() {
  if (typeof window === 'undefined') return 0
  if (peekUploadedQuestions().length > 0) return 0

  const sources = [
    localStorage.getItem(STORAGE_BACKUP_KEY),
    sessionStorage.getItem('testvantage-bank-session-backup'),
  ].filter(Boolean)

  for (const raw of sources) {
    try {
      const parsed = parseStoredBankJson(raw)
      if (!parsed?.questions?.length) continue
      saveQuestionBank({
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        questions: parsed.questions,
      })
      return parsed.questions.length
    } catch {
      /* try next */
    }
  }
  return 0
}



/** @returns {Question[]} */

export function loadUploadedQuestions() {
  const bank = loadQuestionBank()
  if (!bank.questions.length) return []

  try {
    const migrateVersion = localStorage.getItem(BANK_MIGRATE_VERSION_KEY)
    const needsFullMigrate = migrateVersion !== String(CURRENT_BANK_MIGRATE_VERSION)

    if (!needsFullMigrate) {
      let hybridHealDirty = false
      const mapped = bank.questions.map((q) => {
        const withStatus = normalizeLegacyBankStatus(q)
        const next = maybeHealHybridDraftQuestion(withStatus)
        if (next !== withStatus) hybridHealDirty = true
        return next
      })
      const healed = mergeAdjacentOptionTails(mapped)
      const sorted = sortQuestionsNewestFirst(healed.filter(Boolean))
      const shapeChanged = sorted.length !== bank.questions.length
      if (hybridHealDirty || shapeChanged) {
        saveQuestionBank({ ...bank, questions: sorted })
      }
      return sorted
    }

    let questions = bank.questions.map((q) => {
      const withStatus = normalizeLegacyBankStatus(q)
      const prepared = prepareQuestionForBank(withStatus, bank.questions)
      const raw = String(withStatus.text ?? '')
      if (raw && detectBrokenBankStem(raw).length > 0) {
        return prepareQuestionForBank(withStatus, bank.questions)
      }
      if (detectBrokenBankStem(prepared.text ?? '').length > 0) {
        return prepareQuestionForBank(prepared, bank.questions)
      }
      return prepared
    })

    if (needsFullMigrate) {
      questions = migrateAllClassifiedQuestionIds(questions)
    }

    const sorted = sortQuestionsNewestFirst(questions.filter(Boolean))
    if (sorted.length < bank.questions.length) {
      return bank.questions
    }

    const prevById = new Map(bank.questions.map((q) => [q.id, q]))
    const stemsChanged =
      needsFullMigrate ||
      sorted.some((next) => {
        const q = prevById.get(next.id)
        if (!q) return true
        return (
          q.text !== next.text ||
          q.bankStatus !== next.bankStatus ||
          q.passageText !== next.passageText ||
          JSON.stringify(q.subQuestions) !== JSON.stringify(next.subQuestions) ||
          JSON.stringify(q.optionImages) !== JSON.stringify(next.optionImages)
        )
      })

    if (stemsChanged) {
      saveQuestionBank({ ...bank, questions: sorted })
      localStorage.setItem(BANK_MIGRATE_VERSION_KEY, String(CURRENT_BANK_MIGRATE_VERSION))
    } else if (bank.questions.map((q) => q.id).join('|') !== sorted.map((q) => q.id).join('|')) {
      saveQuestionBank({ ...bank, questions: sorted })
    }
    return sorted
  } catch {
    return bank.questions
  }
}

/** @returns {import('../data/tests').Question[]} Published questions only (for papers & student practice). */
export function loadPublishedUploadedQuestions() {
  return loadUploadedQuestions().filter(isQuestionPublished)
}

export {
  effectiveBankStatus,
  isQuestionPublished,
  bankStatusLabel,
  filterPublishedQuestions,
  normalizeLegacyBankStatus,
} from './questionUploadFilter.js'



/**
 * Force re-run the full normalize/repair pipeline over every stored question,
 * ignoring the migrate-version gate. Used by the explicit "Repair" action so a
 * stale version stamp (e.g. set during a partial HMR reload) can't skip fixes.
 * @returns {Question[]}
 */
export function repairUploadedQuestions() {
  const bank = loadQuestionBank()
  const questions = sortQuestionsNewestFirst(
    bank.questions.map((q) => prepareQuestionForBank(normalizeLegacyBankStatus(q), bank.questions)),
  )
  saveQuestionBank({ ...bank, questions })
  localStorage.setItem(BANK_MIGRATE_VERSION_KEY, String(CURRENT_BANK_MIGRATE_VERSION))
  return questions
}

/** @param {{ settings?: Partial<typeof DEFAULT_SETTINGS>, questions: Question[] }} bank */

/**
 * @param {{ settings?: Partial<typeof DEFAULT_SETTINGS>, questions: Question[] }} bank
 * @param {{ allowEmptyOverwrite?: boolean }} [opts]
 */
export function saveQuestionBank(bank, opts = {}) {
  const json = JSON.stringify({
    settings: bank.settings,
    questions: bank.questions,
  })
  const prevCount = (() => {
    try {
      const prev = localStorage.getItem(STORAGE_KEY)
      if (!prev) return 0
      const parsed = parseStoredBankJson(prev)
      return parsed?.questions?.length ?? 0
    } catch {
      return 0
    }
  })()
  const nextCount = bank.questions?.length ?? 0
  // Never silently wipe a non-empty bank with an empty payload (except explicit clear).
  if (nextCount === 0 && prevCount > 0 && !opts.allowEmptyOverwrite) {
    console.warn(
      `[questionBank] blocked empty overwrite of ${prevCount} question(s). Use clearQuestionBank() to wipe.`,
    )
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, json)
    if (nextCount > 0) {
      try {
        localStorage.setItem(STORAGE_BACKUP_KEY, json)
        sessionStorage.setItem('testvantage-bank-session-backup', json)
      } catch {
        /* backup optional if quota tight */
      }
      if (typeof window !== 'undefined') {
        import('./bankMirrorOrigin.js')
          .then((m) => m.mirrorBankJsonToSiblingOrigin(json))
          .catch(() => {})
        import('./bankIdbStore.js')
          .then((m) => m.writeBankJsonToIdb(json))
          .catch(() => {})
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Keep durable copy even when localStorage is full.
      if (typeof window !== 'undefined' && nextCount > 0) {
        import('./bankIdbStore.js')
          .then((m) => m.writeBankJsonToIdb(json))
          .catch(() => {})
      }
      throw new Error(
        'Browser storage full. Export your bank as JSON, delete old questions, or use smaller images.',
      )
    }
    throw e
  }
}



/** @param {Partial<typeof DEFAULT_SETTINGS>} settings */

export function saveUploadSettings(settings) {

  const bank = loadQuestionBank()

  bank.settings = { ...bank.settings, ...settings }

  saveQuestionBank(bank)

}



/** @param {Question[]} questions */

export function saveUploadedQuestions(questions) {

  const bank = loadQuestionBank()

  bank.questions = sortQuestionsNewestFirst(questions)

  saveQuestionBank(bank)

}



/** @param {Omit<Question, 'id'> & { id?: string }} question */

export function addUploadedQuestion(question) {

  const bank = loadQuestionBank()

  const now = Date.now()
  const others = bank.questions
  const entry = finalizeBankQuestion(
    stampNewQuestionDraft(
      stampNewQuestionUploadMeta({
        ...question,
        id: question.id ?? `uq-${now}`,
        savedAt: question.savedAt ?? now,
      }),
    ),
    others,
  )

  bank.questions.unshift(entry)

  saveQuestionBank(bank)

  return entry

}

/**
 * Add many drafts in one localStorage write. Does not replace existing questions.
 * @param {Array<Omit<Question, 'id'> & { id?: string }>} questions
 */
export function addUploadedQuestionsBulk(questions) {
  const list = Array.isArray(questions) ? questions.filter(Boolean) : []
  if (!list.length) return []

  const bank = loadQuestionBank()
  const now = Date.now()
  const saved = []
  for (let i = 0; i < list.length; i++) {
    const question = list[i]
    const others = bank.questions
    const entry = finalizeBankQuestion(
      stampNewQuestionDraft(
        stampNewQuestionUploadMeta({
          ...question,
          id: question.id ?? `uq-${now}-${i}`,
          savedAt: question.savedAt ?? now + i,
        }),
      ),
      others,
    )
    bank.questions.unshift(entry)
    saved.push(entry)
  }
  saveQuestionBank(bank)
  return saved
}



/** @param {string} id @param {Partial<Question>} updates @param {{ publishAction?: boolean, unpublishAction?: boolean, silent?: boolean, skipHistory?: boolean }} [opts] */

export function updateUploadedQuestion(id, updates, opts = {}) {

  const bank = loadQuestionBank()
  const key = String(id ?? '')

  const idx = bank.questions.findIndex((q) => String(q.id) === key)

  if (idx === -1) return null

  const prev = bank.questions[idx]
  const merged = opts.skipHistory
    ? { ...prev, ...updates, updatedAt: Date.now() }
    : applyQuestionHistoryOnUpdate(prev, { ...updates, updatedAt: Date.now() }, opts)
  // Only re-run the (text-mangling) migration when the stem/options text actually
  // changes. Answer/metadata edits must never re-transform already-finalized LaTeX,
  // otherwise re-processing can break good math into raw source on each save.
  const textChanged =
    ('text' in updates && updates.text !== bank.questions[idx].text) ||
    'options' in updates ||
    'passageText' in updates ||
    'subQuestions' in updates
  const others = bank.questions.filter((q) => String(q.id) !== key)
  let prepared = textChanged
    ? prepareQuestionForBank(merged, bank.questions)
    : normalizePassageQuestionStorage(merged, bank.questions)
  if (opts.publishAction) {
    prepared = assignApprovedAiQuestionId(prepared, others, { excludeIds: [key] })
  }
  let entry = assignClassifiedQuestionId(prepared, others, { excludeIds: [key] })
  if (opts.publishAction && String(entry.id) !== key && isTemporaryQuestionId(key)) {
    if (!entry.aiTempId) entry.aiTempId = key
    if (!entry.hybridPostgresId && /^tv-ai-/i.test(key)) entry.hybridPostgresId = key
  }
  let rest = bank.questions.filter(
    (q) => String(q.id) !== key && String(q.id) !== String(entry.id),
  )
  if (String(entry.id) !== key) {
    rest = remapQuestionIdReferences(rest, key, entry.id)
  }
  bank.questions = [entry, ...rest]

  saveQuestionBank(bank)
  syncOfficialPyqImportedMeta(id, entry, updates)

  return entry

}

/** Collect question ids in a passage set (parent + children). */
function passageSetIdsForQuestion(q, bankQuestions) {
  const ids = [q.id]
  if (q.passageText) {
    for (const row of bankQuestions) {
      if (row.passageId === q.id && row.id) ids.push(row.id)
    }
  }
  return ids
}

/** @param {string} id @param {{ silent?: boolean, allowDuplicate?: boolean }} [opts] */
export function publishUploadedQuestion(id, opts = {}) {
  const bank = loadQuestionBank()
  const q = bank.questions.find((row) => String(row.id) === String(id))
  if (!q) return null
  const ids = passageSetIdsForQuestion(q, bank.questions).map((value) => String(value))
  const matches = findWholeBankPublishDuplicates(q, bank.questions, { excludeIds: ids })
  const choice = opts.allowDuplicate === true ? 'keep-both' : null
  const decision = decidePublishDuplicateChoice(matches.length > 0, choice)
  if (!decision.publish) {
    const err = new Error(
      'This question matches one already in the bank. Compare them, then choose Keep original only or Keep both.',
    )
    err.code = 'PUBLISH_DUPLICATE'
    err.matches = matches
    err.question = q
    throw err
  }
  const silent = opts.silent === true
  let last = null
  for (const qid of ids) {
    last = updateUploadedQuestion(
      qid,
      silent ? { silentPublish: true } : { silentPublish: false },
      { publishAction: true, silent },
    )
  }
  return last
}

/** @param {string} id */
export function unpublishUploadedQuestion(id) {
  const bank = loadQuestionBank()
  const q = bank.questions.find((row) => String(row.id) === String(id))
  if (!q) return null
  const ids = passageSetIdsForQuestion(q, bank.questions)
  let last = null
  for (const qid of ids) {
    last = updateUploadedQuestion(qid, {}, { unpublishAction: true })
  }
  return last
}

/** @param {string[]} ids @param {{ silent?: boolean, allowDuplicate?: boolean }} [opts] */
export function publishUploadedQuestions(ids, opts = {}) {
  const published = []
  const needsCompare = []
  for (const id of ids) {
    try {
      const entry = publishUploadedQuestion(id, opts)
      if (entry) published.push(entry)
    } catch (err) {
      if (err?.code === 'PUBLISH_DUPLICATE') {
        needsCompare.push({
          id: String(id),
          matches: err.matches,
          question: err.question,
        })
        continue
      }
      throw err
    }
  }
  published.needsCompare = needsCompare
  return published
}

/** @param {string[]} ids */
export function unpublishUploadedQuestions(ids) {
  const moved = []
  for (const id of ids) {
    const entry = unpublishUploadedQuestion(id)
    if (entry) moved.push(entry)
  }
  return moved
}



/**
 * Remove many questions in one save.
 * A passage set must not drop the children and then leave the parent behind
 * when a later single-row save is blocked.
 * Refuses to wipe a non-empty bank down to zero.
 * @param {Array<string | number>} ids
 * @returns {{ removedIds: string[], blockedEmpty: boolean }}
 */
export function removeUploadedQuestions(ids) {
  const want = new Set(
    (ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean),
  )
  if (!want.size) return { removedIds: [], blockedEmpty: false }

  const bank = loadQuestionBank()
  const drop = new Set(collectCopyIds(bank.questions, [...want]))
  /** @type {import('../data/tests').Question[]} */
  const removed = []
  const next = []
  for (const q of bank.questions) {
    if (drop.has(String(q.id))) removed.push(q)
    else next.push(q)
  }
  if (!removed.length) return { removedIds: [], blockedEmpty: false }
  if (next.length === 0 && bank.questions.length > 0) {
    return { removedIds: [], blockedEmpty: true }
  }
  for (const q of removed) rememberSuppressedHybridQuestion(q)
  bank.questions = next
  saveQuestionBank(bank)
  return { removedIds: removed.map((q) => String(q.id)), blockedEmpty: false }
}

/** @param {string} id @returns {boolean} true when the question was removed */
export function removeUploadedQuestion(id) {
  const { removedIds } = removeUploadedQuestions([id])
  return removedIds.length > 0
}

/**
 * Remove the duplicate the user chose not to keep.
 * Drops that row only (and its own passage children). Does not remove the original,
 * even when the wording matches.
 * @param {string | number} id
 * @param {{ keepIds?: Array<string | number> }} [opts]
 * @returns {{ removedIds: string[], blockedEmpty: boolean }}
 */
export function removeDuplicateDraftOnly(id, opts = {}) {
  const key = String(id ?? '').trim()
  const keep = new Set(
    (opts.keepIds ?? []).map((value) => String(value ?? '').trim()).filter(Boolean),
  )
  if (!key || keep.has(key)) return { removedIds: [], blockedEmpty: false }

  const bank = loadQuestionBank()
  const target = bank.questions.find((q) => String(q.id) === key)
  if (!target) return { removedIds: [], blockedEmpty: false }

  const linked = new Set(
    [target.id, target.aiTempId, target.hybridPostgresId, target.postgresId]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean),
  )
  const drop = new Set()
  for (const row of bank.questions) {
    const rowId = String(row?.id ?? '').trim()
    if (!rowId || keep.has(rowId)) continue
    const rowIds = [row.id, row.aiTempId, row.hybridPostgresId, row.postgresId]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
    const sameRow = rowId === key || rowIds.some((value) => linked.has(value))
    const ownChild = target.passageText && String(row.passageId) === key
    if (sameRow || ownChild) drop.add(rowId)
  }
  if (!drop.size) return { removedIds: [], blockedEmpty: false }

  const removed = []
  const next = []
  for (const q of bank.questions) {
    if (drop.has(String(q.id))) removed.push(q)
    else next.push(q)
  }
  if (!removed.length) return { removedIds: [], blockedEmpty: false }
  if (next.length === 0 && bank.questions.length > 0) {
    return { removedIds: [], blockedEmpty: true }
  }
  for (const q of removed) rememberSuppressedHybridQuestion(q)
  bank.questions = next
  saveQuestionBank(bank)
  return { removedIds: removed.map((q) => String(q.id)), blockedEmpty: false }
}



/** @param {Omit<Question, 'id'>[]} items */

export function addBulkUploadedQuestions(items) {

  const bank = loadQuestionBank()

  const base = Date.now()
  const others = bank.questions
  const pending = []
  const added = items.map((q, i) => {
    const row = finalizeBankQuestion(
      {
        ...q,
        id: q.id ?? `uq-${base}-${i}`,
        savedAt: q.savedAt ?? base + i,
      },
      [...others, ...pending],
    )
    pending.push(row)
    return row
  })

  bank.questions.unshift(...added.reverse())

  saveQuestionBank(bank)

  return added

}



export function clearQuestionBank() {
  const bank = loadQuestionBank()
  bank.questions = []
  saveQuestionBank(bank, { allowEmptyOverwrite: true })
  try {
    localStorage.removeItem(STORAGE_BACKUP_KEY)
    sessionStorage.removeItem('testvantage-bank-session-backup')
  } catch {
    /* ignore */
  }
}



/** @param {unknown} data */
export function normalizeBankBackupPayload(data) {
  if (typeof data === 'string') {
    try {
      return normalizeParsedBankRoot(JSON.parse(data))
    } catch {
      return null
    }
  }
  return normalizeParsedBankRoot(data)
}

/** Import full backup { settings, questions } — replaces current bank */

export function importFullBankBackup(data) {
  const payload = normalizeBankBackupPayload(data)
  if (!payload) throw new Error('Invalid backup')

  const bank = loadQuestionBank()

  if (payload.settings) bank.settings = { ...bank.settings, ...payload.settings }

  bank.questions = sortQuestionsNewestFirst(payload.questions.map((q) => prepareQuestionForBank(q)))

  saveQuestionBank(bank)

  return bank
}

/**
 * Add questions from another backup without removing existing ones.
 * Skips same id. Near-duplicate stems are kept as draft copies linked to the original.
 * @returns {{ added: number, skipped: number, total: number }}
 */
export function mergeBankBackup(data) {
  const payload = normalizeBankBackupPayload(data)
  if (!payload) throw new Error('Invalid backup')

  const bank = loadQuestionBank()
  const byId = new Map(bank.questions.map((q) => [q.id, q]))
  let added = 0
  let skipped = 0

  for (const q of payload.questions) {
    if (!q || typeof q !== 'object') {
      skipped++
      continue
    }
    if (q.id && byId.has(q.id)) {
      skipped++
      continue
    }
    const entry = prepareQuestionForBank(q)
    const dup = findDuplicateQuestions(entry, bank.questions)
    const toAdd = dup.length ? attachDuplicateReviewFields(entry, dup) : entry
    bank.questions.push(toAdd)
    if (toAdd.id) byId.set(toAdd.id, toAdd)
    added++
  }

  bank.questions = sortQuestionsNewestFirst(bank.questions)
  if (payload.settings) bank.settings = { ...bank.settings, ...payload.settings }
  saveQuestionBank(bank)
  return { added, skipped, total: bank.questions.length }
}



export const UPLOADED_TEST_ID = 'uploaded-custom'



/** @returns {import('../data/tests').Test | null} */

export function buildUploadedTest() {

  const { settings } = loadQuestionBank()
  const questions = loadPublishedUploadedQuestions()

  const filtered = sortQuestionsNewestFirst(questions).filter(

    (q) =>
      (q.questionType ?? 'single_correct') !== 'true_false' &&
      (!q.examIds?.length || q.examIds.includes(settings.examPatternId)),

  )

  if (filtered.length === 0) return null

  return {

    id: UPLOADED_TEST_ID,

    title: settings.title,

    description: `Uploaded questions · ${settings.examPatternId} · ${settings.testTypeId}`,

    examPatternId: settings.examPatternId,

    testTypeId: settings.testTypeId,

    durationMinutes: computeTestDuration(

      settings.examPatternId,

      settings.testTypeId,

      filtered.length,

    ),

    totalQuestions: filtered.length,

    questions: filtered,

  }

}


