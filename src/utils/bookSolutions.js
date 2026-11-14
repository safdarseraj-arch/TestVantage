/**
 * Answers and solutions of a book that are not printed next to their exercise: in a later page
 * range of the same book (answers at the end of the chapter or of the book) or in a separate
 * solutions PDF. Each block names its exercise and chapter; it goes on the pending paper of that
 * exercise by printed question number, whichever of the two was read first. Blocks are kept on
 * the server (see bookRangeImport.js), so reading the exercise later, or again, still gets them.
 */
import { applyAnswerFileToOfficialPyqPaper } from './officialPyqAnswerFile.js'
import { bookExerciseKey, normalizeBookAnswerKey, shiftAnswerNumbers } from './bookRangeSplit.js'
import { isBookPaper, loadOfficialPyqPendingPapers } from './officialPyqPendingStore.js'

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 }

/**
 * "Chapter 3: Kinematics", "3. Kinematics", "Unit III" → number 3 and the words "kinematics".
 * @param {unknown} title
 */
export function bookChapterKey(title) {
  const s = String(title ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const m =
    s.match(/^(?:chapter|unit|ch\.?|lesson)\s*[-:#.\u2013]?\s*(\d{1,3}|[ivx]{1,5})\b/) || s.match(/^(\d{1,3})(?=[\s.:)\-\u2013]|$)/)
  const raw = m?.[1] || ''
  const number = /^\d+$/.test(raw) ? String(Number(raw)) : raw ? String(ROMAN[raw] || '') : ''
  const words = (m ? s.slice(m.index + m[0].length) : s)
    .replace(/\b(?:chapter|unit|lesson|part)\b/g, ' ')
    .replace(/[^a-z]+/g, '')
  return { number, words }
}

/**
 * @param {unknown} a chapter of the block
 * @param {unknown} b chapter of the paper
 * @returns {'same' | 'different' | 'unknown'}
 */
export function chapterRelation(a, b) {
  const x = bookChapterKey(a)
  const y = bookChapterKey(b)
  if (x.number && y.number) return x.number === y.number ? 'same' : 'different'
  if (x.words && y.words) return x.words.includes(y.words) || y.words.includes(x.words) ? 'same' : 'different'
  return 'unknown'
}

/** "EXERCISE 3.3 (continued, Q 21-40)" is part of exercise 3.3. */
export function bookPaperExerciseKey(paper) {
  return bookExerciseKey(String(paper?.bookExercise ?? '').replace(/\s*\(continued\b.*$/i, ''))
}

/**
 * Pending book papers a block belongs to: same exercise name, and the same chapter when the
 * chapters can be told apart. "Exercise 1" printed in several chapters is never guessed.
 * @param {import('./bookRangeSplit.js').BookSolutionBlock} block
 * @param {Array<Record<string, any>>} papers this book's pending papers
 * @returns {{ targets: Array<Record<string, any>>, reason?: 'waiting' | 'chapter' | 'several-chapters' | 'no-name' | 'several-exercises' }}
 */
export function findSolutionTargets(block, papers) {
  const pool = papers.filter((p) => p.status !== 'published' && p.status !== 'rejected')
  let found
  if (block.key) {
    found = pool.filter((p) => bookPaperExerciseKey(p) === block.key)
  } else {
    if (!block.chapter) return { targets: [], reason: 'no-name' }
    const inChapter = pool.filter((p) => p.bookPartKind !== 'examples' && chapterRelation(block.chapter, p.bookChapter) === 'same')
    const keys = new Set(inChapter.map(bookPaperExerciseKey))
    if (keys.size > 1) return { targets: [], reason: 'several-exercises' }
    found = inChapter
  }
  if (!found.length) return { targets: [], reason: 'waiting' }
  const same = found.filter((p) => chapterRelation(block.chapter, p.bookChapter) === 'same')
  if (same.length) return { targets: same }
  const open = found.filter((p) => chapterRelation(block.chapter, p.bookChapter) === 'unknown')
  if (!open.length) return { targets: [], reason: 'chapter' }
  const chapters = new Set(open.map((p) => String(p.bookChapter || '').trim().toLowerCase()))
  return chapters.size === 1 ? { targets: open } : { targets: [], reason: 'several-chapters' }
}

/**
 * @param {import('./bookRangeSplit.js').BookSolutionBlock} block
 * @param {Record<string, any>} paper
 * @param {string} fileName
 */
function applyBlockToPaper(block, paper, fileName) {
  const offset = Number(paper.bookNumberOffset) || 0
  const text = offset ? shiftAnswerNumbers(block.text, offset).mine : block.text
  if (!String(text).trim()) return null
  const numericOptions =
    /\(\s*[1-4]\s*\)/.test(text) &&
    !/\(\s*[a-dA-D]\s*\)/.test(text) &&
    (paper.questions || []).some((q) => (q.options || []).filter((o) => String(o).trim()).length >= 4)
  let res
  try {
    res = applyAnswerFileToOfficialPyqPaper(paper.id, normalizeBookAnswerKey(text, { numericOptions }), { fileName })
  } catch (e) {
    res = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  return {
    paperId: paper.id,
    paperLabel: paper.paperLabel || paper.paperName || paper.bookExercise,
    ok: res?.ok !== false,
    answers: Number(res?.answers) || 0,
    solutions: Number(res?.solutions) || 0,
    error: res?.ok === false ? res.error : undefined,
  }
}

/**
 * @typedef {{
 *   title: string
 *   chapter: string
 *   applied: Array<{ paperId: string, paperLabel: string, ok: boolean, answers: number, solutions: number, error?: string }>
 *   reason?: string
 * }} BookSolutionResult
 */

/**
 * Put blocks on the matching pending papers of one book.
 * @param {{
 *   bookId: string
 *   blocks: Array<import('./bookRangeSplit.js').BookSolutionBlock & { fileName?: string }>
 *   onlyPaperIds?: string[] only these papers (the ones just read)
 *   fileName?: string
 * }} args
 * @returns {BookSolutionResult[]}
 */
export function applyBookSolutionBlocks(args) {
  const only = args.onlyPaperIds ? new Set(args.onlyPaperIds) : null
  const papers = loadOfficialPyqPendingPapers().filter((p) => isBookPaper(p) && p.bookId === args.bookId)
  return args.blocks.map((block) => {
    const { targets, reason } = findSolutionTargets(block, papers)
    const mine = only ? targets.filter((p) => only.has(p.id)) : targets
    const applied = mine.map((p) => applyBlockToPaper(block, p, block.fileName || args.fileName || '')).filter(Boolean)
    return { title: block.title, chapter: block.chapter, applied: /** @type {any[]} */ (applied), ...(reason ? { reason } : {}) }
  })
}

/** Plain words for a block that was kept but not put on a paper yet. */
export function solutionWaitingNote(result) {
  const name = result.title || (result.chapter ? `${result.chapter} (no exercise name)` : 'Text with no exercise name')
  switch (result.reason) {
    case 'chapter':
      return `${name}: no exercise of this name in chapter “${result.chapter}” yet. It is kept and goes on when that chapter is read (if the chapter is named differently in the book, type the book's chapter name for this range).`
    case 'several-chapters':
      return `${name}: several chapters have an exercise of this name. Type the chapter for this range, then read it again.`
    case 'several-exercises':
      return `${name}: no exercise name, and its chapter has several exercises. Check the pages; nothing was put on.`
    case 'no-name':
      return `${name}: no chapter or exercise name found. Type the chapter for this range, then read it again.`
    default:
      return `${name}: kept; it goes on the exercise when its pages are read.`
  }
}
