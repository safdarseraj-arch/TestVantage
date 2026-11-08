/**
 * Shared Official PYQ post-process quality scan (Mathpix reparse -> pending display).
 */
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import { stripLeakedOptionsFromStem } from './stripLeakedOptionsFromStem.js'
import {
  peelOfficialPyqCardForDisplay,
  officialPyqCardAllowsPassage,
} from './passage.js'
import { parsePaperSectionMap, stampQuestionTypesFromSectionMap } from './parsePaperSectionMap.js'
import { looksLikeMatchingListStem, parseMatchingListForDisplay } from './parseMatchingListDisplay.js'

export const OFFICIAL_PYQ_PASSAGE_PAIR_SLOTS = new Set([
  14, 15, 16, 17, 31, 32, 33, 34, 48, 49, 50, 51,
])

function mathStripped(s) {
  return String(s || '').replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$[^$]*\$/g, ' ')
}

export function scanOfficialPyqPaper(paper, opts = {}) {
  const pairOk = opts.passagePairOk || OFFICIAL_PYQ_PASSAGE_PAIR_SLOTS
  let qs = paper?.questions || []
  const ocr = String(paper?.preparedText || '')
  const map = parsePaperSectionMap(ocr)
  qs = stampQuestionTypesFromSectionMap(qs, ocr, map)
  const CLASSES = {
    foreign_passage: 0,
    glued_in_stem: 0,
    raw_array: 0,
    options_leaked: 0,
    chem_on_phys_list: 0,
    eof_marker: 0,
    match_missing_lists: 0,
    match_weak: 0,
    short_stem: 0,
    missing_subject: 0,
    missing_type: 0,
  }
  const details = []
  const types = {}
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]
    const slot = Number(q.pyqSlot || i + 1)
    const peeled = peelOfficialPyqCardForDisplay(q, ocr)
    const optsList = peeled.options || q.options || []
    const text = String(peeled.text || q.text || '')
    const pass = String(peeled.passageText || q.passageText || '').trim()
    const san = sanitizeStemForDisplay(text, optsList)
    const stripped = stripLeakedOptionsFromStem(san, optsList)
    const blob = `${text}\n${pass}`
    const issues = []
    const t = peeled.questionType || q.questionType || '?'
    types[t] = (types[t] || 0) + 1
    const subjTag = String(q.subject || peeled.subject || '').trim().toLowerCase()
    if (!subjTag || subjTag === 'unknown') {
      CLASSES.missing_subject += 1
      issues.push('missing-subject')
    }
    if (!t || t === '?') {
      CLASSES.missing_type += 1
      issues.push('missing-type')
    }
    if (pass && !pairOk.has(slot) && !officialPyqCardAllowsPassage(peeled, ocr, map)) {
      CLASSES.foreign_passage += 1
      issues.push('foreign-passage')
    }
    if (/relations R from S|two questions based on\s+PARAGRAPH/i.test(text)) {
      CLASSES.glued_in_stem += 1
      issues.push('glued-para-in-stem')
    }
    if (/\\end\{array\}/.test(mathStripped(san))) {
      CLASSES.raw_array += 1
      issues.push('raw-end-array')
    }
    if (/\([A-D]\)\s/.test(String(stripped)) && optsList.some((o) => String(o || '').trim())) {
      CLASSES.options_leaked += 1
      issues.push('options-leaked-stem')
    }
    const chem = /\b(NaOH|H2SO4|KMnO4|phenol|alkene|SN1|SN2|carbonyl|amine)\b/i
    const listBlob = JSON.stringify(q.matchListII || q.listII || q.matchLists || '')
    const subj = String(q.subject || '').toLowerCase()
    if (
      (subj.includes('phys') || (slot >= 18 && slot <= 34)) &&
      chem.test(listBlob + text) &&
      /List-I|List-II/i.test(text + listBlob)
    ) {
      CLASSES.chem_on_phys_list += 1
      issues.push('chem-on-phys-list')
    }
    if (/END OF THE QUESTION PAPER/i.test(blob)) {
      CLASSES.eof_marker += 1
      issues.push('eof-marker')
    }
    if (looksLikeMatchingListStem(san) || t === 'matrix_match') {
      const parsed = parseMatchingListForDisplay(san, optsList)
      const hasI = (parsed?.listI?.length || 0) >= 2 || /List-I|Column I/i.test(text)
      const hasII = (parsed?.listII?.length || 0) >= 2
      if (!hasI || !hasII) {
        const figRows = (san.match(/\(\s*[PQRS]\s*\)[\s\S]{0,40}\\includegraphics/gi) || []).length
        if (figRows >= 2 && hasII) {
          /* ok */
        } else if (figRows >= 2 && /List-II/i.test(san)) {
          /* ok */
        } else {
          CLASSES.match_missing_lists += 1
          issues.push('match-missing-lists')
        }
      } else if ((parsed?.listI?.length || 0) < 3 || (parsed?.listII?.length || 0) < 4) {
        const listIChunk = san.split(/List-II/i)[0] || san
        const stemMarkersI = (listIChunk.match(/\(\s*[PQRS]\s*\)/gi) || []).length
        const figRowsI = (listIChunk.match(/\(\s*[PQRS]\s*\)[\s\S]{0,40}\\includegraphics/gi) || [])
          .length
        const weakI =
          (parsed?.listI?.length || 0) < 3 && stemMarkersI < 3 && figRowsI < 2
        const weakII = (parsed?.listII?.length || 0) < 4
        if (weakI || weakII) {
          CLASSES.match_weak += 1
          issues.push(`match-weak:${parsed?.listI?.length || 0}/${parsed?.listII?.length || 0}`)
        }
      }
    }
    if (text.trim().length < 20) {
      CLASSES.short_stem += 1
      issues.push('short-stem')
    }
    if (issues.length) {
      details.push({ slot, type: t, issues, head: san.replace(/\s+/g, ' ').slice(0, 90) })
    }
  }
  const hardZeros =
    CLASSES.foreign_passage === 0 &&
    CLASSES.raw_array === 0 &&
    CLASSES.options_leaked === 0 &&
    CLASSES.chem_on_phys_list === 0 &&
    CLASSES.eof_marker === 0 &&
    CLASSES.glued_in_stem === 0 &&
    CLASSES.match_missing_lists === 0 &&
    CLASSES.missing_subject === 0 &&
    CLASSES.missing_type === 0
  return { qs, CLASSES, hardZeros, details, types, count: qs.length }
}
