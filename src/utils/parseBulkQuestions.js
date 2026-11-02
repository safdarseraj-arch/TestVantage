import {
  cleanBulkOptions,
  cleanBulkStem,
  extractQuestionNumber,
  inferBulkQuestionType,
  isAnswerKeyOnlyBlock,
  instructionLikeOptions,
  isPyqInstructionBlock,
  looksLikeAnswerKeyMappingBlob,
  looksLikePyqSectionInstructionStem,
  JEE_Q_OPENER,
  looksLikeQuestionBlock,
  parseGlobalAnswerKeyMap,
  prepareBulkExtractText,
  AFTER_OPTION_D_NEXT_STEM,
} from './bulkExtractClean.js'
import { parseQuestionText } from './parseQuestionText.js'
import { mergeOrphanStemContinuations, looksLikeOptionTailFragment } from './extendTruncatedStem.js'
import { applyUploadQualityGuards } from './uploadQualityGuards.js'
import { looksLikeMatchingListStem } from './parseMatchingListDisplay.js'
import {
  detectAnswerFromPaper,
  detectSolutionFromPaper,
  enrichParsedWithAnswerProvenance,
} from './answerProvenance.js'
import { splitGluedPaperItemText, splitMathpixQuestionBlocks } from './mathpixQuestionSplit.js'
import {
  attachOfficialPyqPassages,
  peelOfficialPyqParagraph,
} from './passage.js'

/**
 * @typedef {Object} ParsedBulkQuestion
 * @property {string} text
 * @property {string[]} options
 * @property {number} [correctIndex]
 * @property {number[]} [correctIndices]
 * @property {string} [solution]
 * @property {string} [questionType]
 * @property {string} [answerSource]
 * @property {string} [solutionSource]
 * @property {number} [answerConfidence]
 * @property {number} [solutionConfidence]
 */

const QUESTION_SPLIT =
  /(?=(?:^|\n)\s*(?:Q(?:uestion)?\s*\.?\s*\d{1,3}[\.\)\:\-\s]|Q\.?\s*\d{1,3}\b|(?:^|\n)\s*\d{1,3}[\.\)]\s+[A-Za-z])|^---+$|^===+$|\n\n{2,})/im

const ANSWER_LINE =
  /^(?:Ans(?:wer)?s?|Key|Correct(?:\s+option)?|Ans\.?)\s*[\:\-\=]?\s*(?:is\s+)?(?:option\s+)?([A-D1-4,\s\/&;]+)/i
const SOLUTION_LINE = /^(?:Solution|Explanation|Sol\.?|Hint)\s*[\:\-]?\s*(.*)$/i

let stemOpenerRe
function stemOpenerPattern() {
  if (!stemOpenerRe) {
    stemOpenerRe = new RegExp(
      `^(?:\\d{1,3}[\\.\\)]\\s*)?(?:${JEE_Q_OPENER}|Fill|State|Define|Sketch|Graph|Prove that|Area)`,
      'i',
    )
  }
  return stemOpenerRe
}

/** @param {string} text */
function normalizeBulkRaw(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

/** @param {string} text */
function splitByRegex(text, re) {
  return text
    .split(re)
    .map((p) => p.trim())
    .filter((p) => p.length >= 15)
}

/** @param {string} text */
function splitOnPageMarkers(text) {
  if (!text.includes('--- page ---')) return []
  return text
    .split(/\n*--- page ---\n*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 25)
}

/** True when `index` is a real "12. Let…" opener, not "from 1 to 9. The". */
function isStandaloneQuestionNumber(text, index) {
  if (looksLikeOptionTailFragment(String(text ?? '').slice(index))) return false
  if (index <= 0) return true
  const before = text.slice(Math.max(0, index - 16), index)
  if (/(?:to|from|and|or|than|of|at|by|into|onto)\s+$/i.test(before)) return false
  if (/(?:^|\n)\s*$/.test(before)) return true
  if (/--- page ---\s*$/i.test(before)) return true
  if (/\(\s*[A-D]\s*\)\s*$/i.test(before)) return true
  return /[\n.!?]\s+$/.test(before) && !/(?:to|from)\s+\d{1,2}\s*$/i.test(before)
}

/** Split JEE sheets: "4. Which… (D)… 5. If…" on one line. */
function splitOnJeeQuestionNumbers(text) {
  const re = new RegExp(
    `(?:(?:^|\\n)|(?<=--- page ---)|(?<=\\)\\s))(?<![0-9/])(\\d{1,2})[\\.\\)]\\s+(?=${JEE_Q_OPENER})`,
    'gi',
  )
  const starts = []
  let match
  while ((match = re.exec(text)) !== null) {
    const at = match.index + match[0].search(/\d/)
    if (!isStandaloneQuestionNumber(text, at)) continue
    starts.push(at)
  }
  if (starts.length < 2) return []

  const parts = []
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i], starts[i + 1]).trim()
    if (chunk.length >= 20) parts.push(chunk)
  }
  return parts.length >= 2 ? parts : []
}

/** Split after a full MCQ (option D) when another question follows. */
function splitOnMcqSequences(text) {
  const marked = String(text ?? '').replace(
    new RegExp(`(\\(\\s*D\\s*\\)[^\\n]{0,600}?)(?=\\s*${AFTER_OPTION_D_NEXT_STEM})`, 'gi'),
    '$1\n\n---mcq-bound---\n\n',
  )
  if (!marked.includes('---mcq-bound---')) return []
  return marked
    .split(/\n*---mcq-bound---\n*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 25)
}

/**
 * Dense single-line / packed pages: "(D) … 12. If …" or four option markers then next Q#.
 */
function splitOnDensePackedMcq(text) {
  const src = String(text ?? '')
  const re =
    /(\(\s*D\s*\)[^\n]{0,400}?)(?=\s+(?:\d{1,2}|Q\.?\s*\d{1,2})[\.\)\:]\s+(?:If|Let|Given|Find|Which|What|The|For|Match|A\s))/gi
  const marked = src.replace(re, '$1\n\n---dense-mcq---\n\n')
  if (!marked.includes('---dense-mcq---')) return []
  const parts = marked
    .split(/\n*---dense-mcq---\n*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 30)
  return parts.length >= 2 ? parts : []
}

/** @param {string} text */
function splitOnQDotNumbers(text) {
  const re = /(?=(?:^|\n)\s*(?:[^\n]{0,80}\s+)?Q\s*\.\s*\d{1,3}\b)/gi
  const parts = splitByRegex(text, re)
  return parts.length >= 2 ? parts : []
}

/** Mathpix `\\item[Q.]` / Q.10 page markers — never treat a full paper as one block. */
function splitOnMathpixItemQ(text) {
  const { blocks } = splitMathpixQuestionBlocks(text)
  return blocks.length >= 2 ? blocks : []
}

/** @param {string} text */
function splitOnQNoLabels(text) {
  const re =
    /(?=(?:^|\n)\s*Q(?:uestion)?\s*\.?\s*(?:No\.?\s*)?\d{1,3}[\.\)\:\-\s])/gi
  const parts = splitByRegex(text, re)
  return parts.length >= 2 ? parts : []
}

/** @param {string} text */
function splitOnNumberedItems(text) {
  const jee = splitOnJeeQuestionNumbers(text)
  if (jee.length >= 2) return jee

  const re =
    /(?:(?:^|\n)|(?<=[.!?\)\]\$:])|(?<=\^)|(?<=--- page ---))(?<![0-9/])\s*(\d{1,2})[\.\)]\s+(?=[A-Za-z$\\(])/g
  const starts = []
  let match
  while ((match = re.exec(text)) !== null) {
    const at = match.index + match[0].search(/\d/)
    if (!isStandaloneQuestionNumber(text, at)) continue
    starts.push(at)
  }
  if (starts.length < 2) return []

  const parts = []
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i], starts[i + 1]).trim()
    if (chunk.length >= 15) parts.push(chunk)
  }
  return parts.length >= 2 ? parts : []
}

/** Re-split a block that still contains multiple numbered questions. */
function resplitMergedBlock(block) {
  const pageSec = String(block ?? '')
    .split(/\n*--- page ---\n*|(?:\n|^)\s*(?=SECTION\s+[A-Z0-9()])/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 15)
  if (pageSec.length >= 2) {
    return pageSec.flatMap((unit) => resplitNumberedUnit(unit))
  }
  return resplitNumberedUnit(block)
}

function resplitNumberedUnit(block) {
  const qdot = splitOnQDotNumbers(block)
  if (qdot.length >= 2) return qdot

  const mcq = splitOnMcqSequences(block)
  if (mcq.length >= 2) return mcq

  const dense = splitOnDensePackedMcq(block)
  if (dense.length >= 2) return dense

  const glued = splitGluedPaperItemText(block)
  if (glued.stems.length >= 2) return glued.stems

  const re = new RegExp(
    `(?<![0-9/])(\\d{1,2})[\\.\\)]\\s+(?=${JEE_Q_OPENER})`,
    'gi',
  )
  const starts = []
  let match
  while ((match = re.exec(block)) !== null) {
    if (!isStandaloneQuestionNumber(block, match.index)) continue
    starts.push(match.index)
  }
  if (starts.length <= 1) return [block]

  const parts = []
  for (let i = 0; i < starts.length; i++) {
    const chunk = block.slice(starts[i], starts[i + 1]).trim()
    if (chunk.length >= 20) parts.push(chunk)
  }
  return parts.length >= 2 ? parts : [block]
}

/** Split each PDF page, then numbered stems within the page. */
function splitPagesThenNumbers(text) {
  if (!text.includes('--- page ---')) return []
  const pages = text
    .split(/\n*--- page ---\n*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 15)
  if (pages.length < 1) return []

  const parts = []
  for (const page of pages) {
    const numbered = splitOnNumberedItems(page)
    if (numbered.length >= 2) parts.push(...numbered)
    else parts.push(page)
  }
  return parts.length >= 2 ? parts : []
}

/** Cut at SECTION 1 / SECTION 2 headers so they are not glued onto the previous stem. */
function splitOnSectionThenNumbers(text) {
  const src = String(text ?? '')
  if (!/\bSECTION\s+[A-Z0-9()]/i.test(src)) return []
  const chunks = src
    .split(/(?:--- page ---|(?:\n|^))\s*(?=SECTION\s+[A-Z0-9()])/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 15)
  if (chunks.length < 2) return []
  const parts = []
  for (const chunk of chunks) {
    const numbered = splitOnNumberedItems(chunk)
    if (numbered.length >= 2) parts.push(...numbered)
    else if (!looksLikePyqSectionInstructionStem(chunk) || looksLikeQuestionBlock(chunk)) {
      parts.push(chunk)
    }
  }
  return parts.length >= 2 ? parts : []
}

/** @param {string} text */
function splitOnQuestionLabels(text) {
  const re =
    /(?=(?:^|\n)\s*(?:Question|Problem|Exercise|Example)\s*[#.:]?\s*\d{1,3}\b)/gi
  const parts = splitByRegex(text, re)
  return parts.length >= 2 ? parts : []
}

/** @param {string} text */
function splitByDoubleNewline(text) {
  return text.split(/\n{2,}/).filter((b) => b.trim().length >= 20)
}

/** Option tail or mid-equation fragment — not a standalone question block. */
function looksLikeSplitFragment(block) {
  const t = String(block ?? '').trim()
  if (!t) return true
  if (/^given by\b/i.test(t)) return true
  if (/\\item\s*\[\s*Q/i.test(t) && t.length >= 20) return false
  if (/^Q\s*\.?\s*\d{1,3}\b/i.test(t) && t.length >= 20) return false
  if (/^\d{1,2}[\.\)]\s+\S/.test(t) && t.length >= 20) return false
  if (looksLikeMatchingListStem(t)) return false
  if (looksLikePyqSectionInstructionStem(t) && !looksLikeQuestionBlock(t)) return true
  if (t.length < 40 && !/(\(\s*[A-D]\s*\)|^\d{1,2}[\.\)]\s)/i.test(t)) return true
  if (!looksLikeQuestionStem(t) && !/(\(\s*[A-D]\s*\)[\s\S]*){2,}/i.test(t)) return true
  return false
}

/** @param {string[]} parts */
function scoreSplit(parts) {
  const tiny = parts.filter((p) => p.length < 35).length
  const fragments = parts.filter(looksLikeSplitFragment).length
  const instructions = parts.filter(
    (p) => looksLikePyqSectionInstructionStem(p) && !looksLikeQuestionBlock(p),
  ).length
  let score = parts.length - tiny * 0.75 - fragments * 2.5 - instructions * 4
  if (parts.length >= 15 && parts.length <= 80) score += 10
  if (parts.length >= 40 && parts.length <= 60) score += 14
  for (const p of parts) {
    if (looksLikePyqSectionInstructionStem(p) && !looksLikeQuestionBlock(p)) continue
    const parsed = parseQuestionText(p)
    if ((parsed.optionsFound ?? 0) >= 2) score += 1.5
    else if (looksLikeMatchingListStem(p) || looksLikeQuestionStem(p) || /^\d{1,2}[\.\)]\s/.test(p)) {
      score += 1
    }
  }
  return score
}

/** @param {string[][]} lists */
function pickBestSplit(lists) {
  const viable = lists.filter((arr) => arr.length >= 2)
  if (!viable.length) return null
  return viable.reduce((best, cur) => (scoreSplit(cur) > scoreSplit(best) ? cur : best))
}

/**
 * Split document into question blocks (PDF pages, Q1/Q2, numbered stems, etc.)
 * @param {string} raw
 */
export function splitIntoQuestionBlocks(raw) {
  const normalized = prepareBulkExtractText(normalizeBulkRaw(raw))
  if (!normalized) return []

  const strategies = [
    () => splitOnMathpixItemQ(normalized),
    () => splitOnJeeQuestionNumbers(normalized),
    () => splitOnSectionThenNumbers(normalized),
    () => splitOnQDotNumbers(normalized),
    () => splitOnMcqSequences(normalized),
    () => splitOnDensePackedMcq(normalized),
    () => splitPagesThenNumbers(normalized),
    () => splitOnNumberedItems(normalized),
    () => splitOnQNoLabels(normalized),
    () => {
      const glued = splitGluedPaperItemText(normalized)
      return glued.stems.length >= 2 ? glued.stems : []
    },
    () => splitByRegex(normalized, QUESTION_SPLIT),
    () => splitOnPageMarkers(normalized),
    () => splitOnQuestionLabels(normalized),
    () => splitByDoubleNewline(normalized),
  ]

  const best = pickBestSplit(strategies.map((fn) => fn()))
  if (best) {
    return best.flatMap((block) => resplitMergedBlock(block))
  }

  return [normalized]
}

/**
 * @param {string} block
 */
function parseSolution(block) {
  return detectSolutionFromPaper(block).solution
}

function stripMetaLines(block) {
  return block
    .split('\n')
    .filter((line) => !SOLUTION_LINE.test(line.trim()) && !ANSWER_LINE.test(line.trim()))
    .join('\n')
    .trim()
}

function parseAnswerKey(block) {
  const paper = detectAnswerFromPaper(block)
  if (paper.correctIndices?.length) return { correctIndices: paper.correctIndices }
  if (paper.correctIndex != null) return { correctIndex: paper.correctIndex }
  if (paper.correctInteger != null) return { correctInteger: paper.correctInteger }
  if (paper.correctNumerical != null) return { correctNumerical: paper.correctNumerical }

  // Legacy fallback for compact "Answer: B, C" style already covered by detectAnswerFromPaper
  const lines = block.split('\n')
  for (const line of lines) {
    const m = line.trim().match(ANSWER_LINE)
    if (!m) continue
    const key = m[1].toUpperCase()
    const letters = key.match(/[A-D]/g) ?? []
    if (letters.length > 1) {
      return { correctIndices: letters.map((l) => l.charCodeAt(0) - 65) }
    }
    if (letters.length === 1) {
      return { correctIndex: letters[0].charCodeAt(0) - 65 }
    }
  }
  return {}
}

/** @param {string} text */
function stripQuestionPrefix(text) {
  return text
    .replace(/^\\item\s*\[\s*Q[^\]]*\]\s*\d{0,3}\s*/i, '')
    .replace(/^Q(?:uestion)?\s*\.?\s*\d{1,3}[\.\)\:\-\s]*/i, '')
    .replace(/^Q\.?\s*\d{1,3}[\.\)\:\-\s]*/i, '')
    .replace(/^(?:Question|Problem|Exercise|Example)\s*[#.:]?\s*\d{1,3}[\.\)\:\-\s]*/i, '')
    .replace(/^\d{1,3}[\.\)]\s+/, '')
    .trim()
}

/** @param {string} text */
function looksLikeQuestionStem(text) {
  const t = stripQuestionPrefix(text).trim()
  if (t.length < 12) return false
  if (stemOpenerPattern().test(t)) return true
  if (/\?/.test(t)) return true
  if (/=\s*\?/.test(t)) return true
  if (/\b(?:find|calculate|evaluate|prove|show that)\b/i.test(t) && t.length >= 20) return true
  return false
}


/** Keep the paragraph as its own block; put child stems in the next blocks. */
function expandPyqParagraphBlocks(blocks) {
  const out = []
  for (const block of blocks) {
    const t = String(block ?? '').trim()
    if (
      !/^Paragraph\s+for\b/i.test(t) &&
      !/^(?:Passage|Comprehension)\s*:/i.test(t) &&
      !/^Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d/i.test(t) &&
      !/^(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?[IVXL\d])/i.test(t)
    ) {
      out.push(block)
      continue
    }
    const peeled = peelOfficialPyqParagraph(t)
    if (!peeled.passageText) {
      out.push(block)
      continue
    }
    const header = (t.match(/^\s*(?:\\section\*?\{[^}]*PARAGRAPH[^}]*\}|PARAGRAPH\s*[“"'"]?[IVXL\d][”"']?|Paragraph\s+for\s+[^\n]+|Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d{1,3}(?:\s*(?:,|and)\s*\d{1,3})*|(?:Passage|Comprehension)\s*:)/i) || [''])[0]
    out.push(`${header}\n${peeled.passageText}`.trim())
    if (peeled.stem) {
      const kids = splitIntoQuestionBlocks(peeled.stem)
      if (kids.length >= 2) out.push(...kids)
      else out.push(peeled.stem)
    }
  }
  return out
}

/**
 * @param {string} raw
 * @returns {ParsedBulkQuestion[]}
 */
export function parseBulkQuestions(raw) {
  const rawNorm = normalizeBulkRaw(raw)
  const answerKeyMap = parseGlobalAnswerKeyMap(rawNorm)
  const normalized = prepareBulkExtractText(rawNorm)
  const blocks = expandPyqParagraphBlocks(splitIntoQuestionBlocks(normalized))
  const results = []
  /** @type {{ passageText: string, left: number, group: string } | null} */
  let pendingPassage = null

  for (const block of blocks) {
    if (isAnswerKeyOnlyBlock(block)) continue
    if (looksLikeAnswerKeyMappingBlob(block)) continue
    if (isPyqInstructionBlock(block) && !looksLikeQuestionBlock(block)) continue
    if (looksLikePyqSectionInstructionStem(block)) continue
    if (/^Subjective\s*:/i.test(block.trim()) && !/^Paragraph\s+for\b/i.test(block.trim()) && !/^\d{1,2}[\.\)]/.test(block.trim())) {
      continue
    }
    if (
      (/^Paragraph\s+for\b/i.test(block.trim()) ||
        /^Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*\d/i.test(block.trim()) ||
        /^(?:\\section\*?\{[^}]*PARAGRAPH|PARAGRAPH\s*[“"'"]?[IVXL\d])/i.test(block.trim())) &&
      !/^\d{1,2}[\.\)]/.test(block.trim())
    ) {
      const peeled = peelOfficialPyqParagraph(block)
      if (peeled.passageText) {
        pendingPassage = {
          passageText: peeled.passageText,
          left: Math.max(peeled.nums.length, 2),
          group: peeled.group,
        }
      }
      if (peeled.isPassageOnly || !peeled.stem) continue
    }

    const takePending = (row) => {
      if (!pendingPassage) return row
      const next = {
        ...row,
        passageText: row.passageText || pendingPassage.passageText,
        passageGroup: row.passageGroup || pendingPassage.group,
      }
      pendingPassage.left -= 1
      if (pendingPassage.left <= 0) pendingPassage = null
      return next
    }

    const qNum = extractQuestionNumber(block)
    const cleaned = stripQuestionPrefix(block)
    const solution = parseSolution(cleaned)
    const answer =
      (qNum != null && answerKeyMap[qNum]) || parseAnswerKey(cleaned)
    const withoutMeta = stripMetaLines(cleaned)
    const parsed = parseQuestionText(withoutMeta)
    const hasOptions = parsed.optionsFound >= 2
    const stemText = withoutMeta || cleaned
    const stemOk =
      looksLikeQuestionStem(stemText) ||
      inferBulkQuestionType(stemText, parsed) === 'single_correct'
    const isNumbered = qNum != null || /^\d{1,2}[\.\)]/.test(block.trim())

    if (!hasOptions && !stemOk) {
      if (isNumbered && stemText.trim().length >= 20) {
        const stem = cleanBulkStem(stemText, [])
        results.push(
          takePending(
            enrichParsedWithAnswerProvenance(
              {
                text: stem,
                options: ['', '', '', ''],
                solution,
                questionType: inferBulkQuestionType(stem, parsed) ?? 'integer',
                questionNumber: qNum,
                ...answer,
              },
              cleaned,
            ),
          ),
        )
        continue
      }
      if (blocks.length === 1 && normalized.length > 30) {
        const retry = parseQuestionText(normalized)
        if (retry.optionsFound >= 2 || retry.text) {
          const stem = cleanBulkStem(retry.text || normalized, retry.options)
          results.push(
            takePending(
              enrichParsedWithAnswerProvenance(
                {
                  text: stem,
                  options: retry.options,
                  solution: parseSolution(normalized),
                  questionType: inferBulkQuestionType(stem, retry),
                  ...parseAnswerKey(normalized),
                },
                normalized,
              ),
            ),
          )
        }
      }
      continue
    }

    const rawStem = parsed.text || withoutMeta || cleaned
    const qType =
      inferBulkQuestionType(rawStem, parsed) ??
      inferBulkQuestionType(cleanBulkStem(rawStem, hasOptions ? parsed.options : []), parsed) ??
      (stemOk ? 'integer' : undefined)
    const opts = cleanBulkOptions(hasOptions ? parsed.options : [], rawStem)
    const stem = cleanBulkStem(rawStem, opts)
    if (looksLikePyqSectionInstructionStem(stem)) continue
    if (looksLikeAnswerKeyMappingBlob(stem)) continue
    if (instructionLikeOptions(opts)) continue

    results.push(
      takePending(
        enrichParsedWithAnswerProvenance(
          {
            text: stem,
            options: opts,
            solution,
            questionType: qType,
            questionNumber: qNum,
            ...answer,
          },
          cleaned,
        ),
      ),
    )
  }

  return applyUploadQualityGuards(
    attachOfficialPyqPassages(
      mergeOrphanStemContinuations(results).filter(
        (q) => !/^(?:is equal to|then)\s*[:.]?\s*$/i.test(String(q?.text ?? '').trim()),
      ),
      rawNorm,
    ),
    rawNorm,
  )
}

/**
 * Parse JSON bulk format: [{ text, options, correctIndex, subject, questionType }]
 * @param {string} jsonStr
 */
export function parseBulkJson(jsonStr) {
  const data = JSON.parse(jsonStr)
  const arr = Array.isArray(data) ? data : data.questions
  if (!Array.isArray(arr)) throw new Error('JSON must be an array or { questions: [] }')
  return arr
}
