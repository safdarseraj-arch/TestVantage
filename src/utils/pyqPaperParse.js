import { getExamPattern } from '../data/examPatterns.js'
import { formatMarkingLabel } from '../data/questionTypes.js'
import {
  extractQuestionNumber,
  isAnswerKeyOnlyBlock,
  isPyqInstructionBlock,
  looksLikeQuestionBlock,
  prepareBulkExtractText,
} from './bulkExtractClean.js'
import { fixOcrStructure } from './fixOcrStructure.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import {
  parseBulkQuestions,
  splitIntoQuestionBlocks,
} from './parseBulkQuestions.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'
import { getAssemblyBlueprint } from './patternResolver.js'
import { countMathpixQuestionMarkers, paperItemsFromMathpixOcr } from './mathpixQuestionSplit.js'

const INSTRUCTION_HEAD =
  /^(?:instructions?|general instructions?|important instructions?|read the following|time allotted|maximum marks|note\s*:|candidate[s']?\s+(?:must|should|are))/im

const INSTRUCTION_BODY =
  /\b(?:all questions are compulsory|attempt any|use of calculator|rough work|do not write|omr sheet|bubble|negative marking|marks for each|duration of|time limit|read carefully|answer all|do not turn|break the seal)\b/i

/** @param {string} text */
function stripSubjectSectionHeaders(text) {
  return String(text ?? '')
    .replace(/(?:^|\n)\s*(?:PHYSICS|CHEMISTRY|MATHEMATICS|MATHS|BOTANY|ZOOLOGY|BIOLOGY)\s*(?:\(.*?\))?\s*(?:\n|$)/gi, '\n')
    .replace(/(?:^|\n)\s*PART[\s-]*[A-Z][\s\S]{0,40}?(?:\n|$)/gi, '\n')
}

/**
 * Full OCR polish pipeline for PYQ PDFs (same as Question Bank bulk upload).
 * @param {string} raw
 * @param {'mathpix' | 'builtin' | 'word'} [engine]
 */
export function preparePyqExtractText(raw, engine = 'builtin') {
  let text = String(raw ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return ''
  text = fixOcrStructure(text)
  text = polishExtractedText(text, engine)
  text = stripSubjectSectionHeaders(text)
  return prepareBulkExtractText(text)
}

/** @deprecated use isPyqInstructionBlock */
export function isInstructionBlock(block) {
  return isPyqInstructionBlock(block)
}

/** Text before question 1 — usually general instructions. */
export function extractLeadingInstructions(raw) {
  const text = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!text) return ''

  const firstQ = text.search(
    /(?:^|\n)\s*(?:Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?)?1[\.\)\:\-\s](?=[A-Za-z$\\(])|(?:^|\n)\s*Q\s*\.\s*1\b|\\item\s*\[\s*Q\s*\.?\s*\]\s*1\b/im,
  )
  if (firstQ > 40) {
    const chunk = text.slice(0, firstQ).trim()
    if (chunk.length >= 40 && !looksLikeQuestionBlock(chunk)) {
      if (INSTRUCTION_BODY.test(chunk) || INSTRUCTION_HEAD.test(chunk)) return chunk
    }
  }
  return ''
}

/** @param {string} section @param {string} examPatternId */
export function sectionToSubject(section, examPatternId) {
  const s = String(section ?? '').toLowerCase()
  if (s.includes('physics')) return 'physics'
  if (s.includes('chem')) return 'chemistry'
  if (s.includes('math')) return 'mathematics'
  if (s.includes('botany')) return 'botany'
  if (s.includes('zoology') || s.includes('biology')) return 'zoology'
  return getExamPattern(examPatternId)?.subjects?.[0] ?? 'physics'
}

/**
 * Flatten exam / paper pattern into numbered question slots.
 * @param {string} examPatternId
 * @param {string} [paperPatternId]
 */
export function flattenPaperQuestionMap(examPatternId, paperPatternId) {
  const bp = getAssemblyBlueprint(examPatternId, paperPatternId)
  /** @type {Array<{ questionNumber: number, section: string, questionTypeId: string, subject: string, marking: object, markingLabel: string }>} */
  const map = []
  let qNum = 1
  for (const slot of bp.slots) {
    const subject = sectionToSubject(slot.section, examPatternId)
    for (let i = 0; i < slot.count; i += 1) {
      map.push({
        questionNumber: qNum,
        section: slot.section ?? '',
        questionTypeId: slot.questionTypeId,
        subject,
        marking: slot.marking,
        markingLabel: formatMarkingLabel(slot.marking),
      })
      qNum += 1
    }
  }
  return map
}

/**
 * @param {import('./parseBulkQuestions').ParsedBulkQuestion[]} questions
 * @param {string[]} questionBlocks
 */
function assignQuestionNumbers(questions, questionBlocks) {
  const numbered = questionBlocks
    .map((b) => ({ num: extractQuestionNumber(b), text: b }))
    .filter((x) => x.num != null)

  let seq = 0
  return questions.map((q, i) => {
    if (q.questionNumber != null && numbered.some((n) => n.num === q.questionNumber)) {
      return q
    }
    let qNum = q.questionNumber ?? null
    const stemKey = q.text.slice(0, 40).replace(/\s+/g, ' ').trim()
    for (const { num, text } of numbered) {
      const body = text
        .replace(/^(?:Q\s*\.\s*)?\d{1,2}[\.\)]\s+/, '')
        .replace(/^[^\n]{0,120}\bQ\s*\.\s*\d+\s*/i, '')
        .slice(0, 60)
      if (stemKey.length >= 15 && body.includes(stemKey.slice(0, 18))) {
        qNum = num
        break
      }
    }
    if (qNum == null && numbered[i]?.num != null) qNum = numbered[i].num
    if (qNum == null) {
      seq += 1
      qNum = seq
    } else {
      seq = Math.max(seq, qNum)
    }
    return { ...q, questionNumber: qNum }
  })
}

/** @param {import('./parseBulkQuestions').ParsedBulkQuestion[]} a @param {import('./parseBulkQuestions').ParsedBulkQuestion[]} b */
function pickRicherQuestionList(a, b) {
  if (b.length > a.length) return b
  if (a.length > b.length) return a
  const aOpts = a.filter((q) => (q.options ?? []).filter((o) => o.trim()).length >= 2).length
  const bOpts = b.filter((q) => (q.options ?? []).filter((o) => o.trim()).length >= 2).length
  return bOpts > aOpts ? b : a
}

/** @param {string[]} blocks */
function parseQuestionBlocks(blocks) {
  /** @type {import('./parseBulkQuestions').ParsedBulkQuestion[]} */
  const out = []
  for (const block of blocks) {
    if (isAnswerKeyOnlyBlock(block)) continue
    if (isPyqInstructionBlock(block) && !looksLikeQuestionBlock(block)) continue
    const parsed = parseBulkQuestions(block)
    const blockNum = extractQuestionNumber(block)
    parsed.forEach((p) => {
      out.push({
        ...p,
        questionNumber:
          (parsed.length === 1 ? blockNum : undefined) ??
          p.questionNumber ??
          blockNum ??
          out.length + 1,
      })
    })
  }
  return out
}

/**
 * Split PYQ paper OCR into instructions + numbered questions.
 * Uses the same bulk parser as Question Bank, then refines with per-block splits.
 * @param {string} raw
 * @param {'mathpix' | 'builtin' | 'word'} [engine]
 * @param {{ alreadyPrepared?: boolean }} [opts]
 */
export function parsePyqPaperContent(raw, engine = 'builtin', opts = {}) {
  const { alreadyPrepared = false } = opts
  const normalized = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const leading = extractLeadingInstructions(normalized)

  const prepared = alreadyPrepared
    ? prepareBulkExtractText(normalized)
    : preparePyqExtractText(normalized, engine)

  const blocks = splitIntoQuestionBlocks(prepared)
  const questionBlocks = blocks.filter(
    (b) =>
      !isAnswerKeyOnlyBlock(b) &&
      !(isPyqInstructionBlock(b) && !looksLikeQuestionBlock(b)),
  )

  const strictInstructions = blocks
    .filter((b) => isPyqInstructionBlock(b) && !looksLikeQuestionBlock(b))
    .map((b) => b.trim())
    .filter(Boolean)

  const fullParse = parseBulkQuestions(prepared)
  const blockParse = parseQuestionBlocks(questionBlocks)
  let questions = pickRicherQuestionList(fullParse, blockParse)

  if (questions.length <= 2 && prepared.length > 400) {
    const allBlocks = parseQuestionBlocks(blocks.filter((b) => !isAnswerKeyOnlyBlock(b)))
    questions = pickRicherQuestionList(questions, allBlocks)
  }

  questions = assignQuestionNumbers(questions, questionBlocks)

  const markerCount = countMathpixQuestionMarkers(normalized)
  if (markerCount >= 2) {
    const mathpix = paperItemsFromMathpixOcr(normalized).map((q, i) => ({
      ...q,
      questionNumber: Number(q.printedNumber || q.questionNumber) || i + 1,
    }))
    if (mathpix.length >= 2) {
      questions = pickRicherQuestionList(questions, mathpix)
    }
  }

  const instructionParts = [leading, ...strictInstructions].filter(Boolean)
  return {
    instructionText: instructionParts.join('\n\n---\n\n'),
    instructions: instructionParts,
    questions: applyUploadQualityGuards(questions, normalized),
    preparedText: prepared,
  }
}

/** @param {number} questionNumber @param {string} examPatternId @param {string} [paperPatternId] */
export function getPaperSlotForQuestion(questionNumber, examPatternId, paperPatternId) {
  const map = flattenPaperQuestionMap(examPatternId, paperPatternId)
  return map.find((s) => s.questionNumber === questionNumber) ?? null
}
