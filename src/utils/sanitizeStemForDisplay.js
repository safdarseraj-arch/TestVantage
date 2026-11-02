/**
 * One display/save stem clean-up for every screen: Official PYQ, Question Bank,
 * exam, results, Convert, Word/PDF. Not a preview-only patch.
 *
 * Flatten match tables, repair smashed $ / Mathpix figures, wrap bare LaTeX.
 * Never invent reagents, list rows, or missing math.
 */

import {
  flattenTabularMatchLists,
  normalizeMatchAnswerKey,
  rewriteLatexItemLabels,
  separateInterleavedMatchColumns,
  stripUnlabeledListTwoDump,
} from './parseMatchingListDisplay.js'
import { latexExtractionIncomplete, linearizeChemReactionAligned, normalizeSmashedChemDollars, spaceLatexCommandsAfterWords, splitGluedChemDisplayEquations } from './healTruncatedLatex.js'
import {
  normalizeBrokenMathpixGraphics,
  stripEmptyFigureShells,
  stripEmptyImageMarkdown,
} from './mathpixMedia.js'
import {
  repairArrayBodiesMissingRowBreaks,
  unwrapProseTabular,
} from './repairMatrixStem.js'
import { stripPageBreakAndSectionGlue, stripTrailingPyqSectionHeader } from './bulkExtractClean.js'
import {
  wrapBareLatexRuns,
  wrapOrDropLeftoverArray,
  repairOrphanAlignedBody,
  repairSmashedPiecewiseCases,
  repairOrphanPiecewiseArray,
  rejoinSplitMathEnvironments,
  stripRepeatedQuestionNumberPrefix,
} from './wrapBareLatexRuns.js'
import { peelForeignComprehensionFromStem, stripOfficialPyqPaperChrome } from './passage.js'
import { peelGluedMcqOptions } from './peelGluedMcqOptions.js'
import { stripLeakedOptionsFromStem } from './stripLeakedOptionsFromStem.js'
import {
  cleanMathpixCardText,
} from './mathpixCleanPipeline.js'
import { flattenNestedTabulars } from './latexTabularDisplay.js'

/** Drop OCR of a drawing that already has \\includegraphics — never invent reagents. */
export function stripMatchFigureCaptionLeftovers(text) {
  let s = String(text ?? '')
  if (!/\\includegraphics/i.test(s) || !/(?:List|Column)\s*[-–]?\s*I/i.test(s)) return s
  s = s.replace(
    /(\(\s*[PQRS]\s*\)\s*)\n[\s$_\\]{0,40}b\)\s*\$+\\mathrm\{H\}_\{2\}O_\{2\}[\s\S]{0,80}?(?=\\includegraphics|\(\s*[PQRS]\s*\)|List-II)/gi,
    '$1\n',
  )
  s = s.replace(
    /(\(\s*[PQRS]\s*\)\s*)\n\s*[_\\$].{0,80}?\\mathrm\{H\}_\{2\}O_\{2\}[\s\S]{0,60}?(?=\\includegraphics|\(\s*[PQRS]\s*\)|List-II)/gi,
    '$1\n',
  )
  s = s.replace(
    /(?:^|\n)\s*(?:i{1,3}|[iv]+|[a-d])\)\s*\$?\\mathrm\{O\}_\{3\}[^\n]{0,80}/gi,
    '\n',
  )
  s = s.replace(
    /(?:^|\n)\s*(?:ii+\)\s*)?(?:aq\.\s*)?\$*\\mathrm\{NaOH\}[^\n]{0,60}/gi,
    '\n',
  )
  s = s.replace(/(?:^|\n)\s*ethylene glycol[^\n]{0,40}/gi, '\n')
  s = s.replace(
    /(?:^|\n)\s*\$*\\mathrm\{H\}_\{3\}\s*\\mathrm\{O\}\s*\^\{?\+?\}?\$*[^\n]*/gi,
    '\n',
  )
  s = s.replace(/(?:^|\n)\s*\$*\\mathrm\{NaBH\}_\{4\}\$*[^\n]*/gi, '\n')
  s = s.replace(
    /(List-II[\s\S]{0,240}?\\includegraphics\{([^}]+)\}[\s\S]*?)(?:\n\s*List-II[\s\S]{0,240}?\\includegraphics\{\2\})/i,
    '$1',
  )
  return s.replace(/\n{3,}/g, '\n\n')
}

/**
 * One stem heal for Official PYQ, any-paper upload, bank, exam, preview, publish.
 * Optional options: also cut glued A–D / reagent sequences off the stem.
 */
export function sanitizeStemForDisplay(text, options = []) {
  const raw = linearizeChemReactionAligned(
    cleanMathpixCardText(flattenNestedTabulars(String(text ?? '').replace(/\r\n/g, '\n'))),
  )
  try {
    let t = stripEmptyImageMarkdown(stripEmptyFigureShells(raw))
    t = t.replace(/^\s*(?:XII|XI|VIII|VII|VI|IV|IX|III|II|I|V|X)\s*[”"']\s*/i, '')
    t = t.replace(/\\includegraphics\{([^}]*)\}/gi, (block, url) =>
      block.replace(url, String(url).replace(/\\&/g, '&')),
    )
    t = unwrapProseTabular(t)
    t = repairArrayBodiesMissingRowBreaks(t)
    t = flattenTabularMatchLists(t)
    t = peelForeignComprehensionFromStem(t)
    t = stripOfficialPyqPaperChrome(t)
    t = normalizeBrokenMathpixGraphics(t)
    t = stripRepeatedQuestionNumberPrefix(t)
    t = rewriteLatexItemLabels(t)
    t = separateInterleavedMatchColumns(t)
    t = normalizeMatchAnswerKey(t)
    t = repairSmashedPiecewiseCases(t)
    t = repairOrphanPiecewiseArray(t)
    t = stripMatchFigureCaptionLeftovers(t)
    t = stripPageBreakAndSectionGlue(t)
    t = stripTrailingPyqSectionHeader(t)
    t = normalizeSmashedChemDollars(t)
    t = spaceLatexCommandsAfterWords(t)
    t = wrapBareLatexRuns(repairOrphanAlignedBody(t))
    t = wrapOrDropLeftoverArray(t)
    t = normalizeSmashedChemDollars(t)
    t = peelGluedMcqOptions(t, options).text
    t = stripLeakedOptionsFromStem(t, options)
    t = wrapOrDropLeftoverArray(t)
    if (/\\begin\{array\}/i.test(t) && !/\\end\{array\}/i.test(t)) {
      t = t.replace(
        /(\\begin\{array\}(?:\{[^}]*\})?[\s\S]+?)(?=Then which|Define |\s*$)/i,
        '$$$$$1\\end{array}$$',
      )
    }
    t = t.replace(/(\\begin\{(?:array|cases)\}[\s\S]*?\\end\{(?:array|cases)\})/g, (block, _, offset, str) => {
      const before = String(str).slice(0, offset)
      // Already inside \left\{ / \left[ / \left( … \right. — do not insert $$ between delimiter and begin.
      if (/\\left(?:\\\{|\[|\()\s*$/.test(before)) return block
      // Open $ or $$ must keep the environment. A $$ that only closed the
      // previous display is not a reason to wrap a cases block that still
      // belongs to that formula (\right comes after the cases).
      let i = 0
      let inInline = false
      let inDisplay = false
      while (i < before.length) {
        if (before[i] === '\\') {
          i += 2
          continue
        }
        if (before.startsWith('$$', i)) {
          if (inInline) inInline = false
          inDisplay = !inDisplay
          i += 2
          continue
        }
        if (before[i] === '$') {
          if (!inDisplay) inInline = !inInline
          i += 1
          continue
        }
        i += 1
      }
      if (inInline || inDisplay) return block
      return `$$${block}$$`
    })
    // wrapBare / wrapOrDrop / $$ wrap can re-smash \left\{$$\begin{array}; peel last.
    t = repairOrphanPiecewiseArray(t)
    // Collapse runaway $ around display arrays so prepareMath sees balanced $$…$$.
    t = t.replace(/\$+(?=\$\$\\begin\{array\})/gi, '')
    t = t.replace(/(\$\$\\begin\{array\}[\s\S]*?\\end\{array\})\$+/gi, '$1$$')
    // Ensure every display-opened array has a $$ close.
    t = t.replace(/\$\$(\\begin\{array\}[\s\S]*?\\end\{array\})(?!\s*\$\$)/gi, '$$$$$1$$$$')
    t = t.replace(/(\$\$\s*)?(\\begin\{tabular\}[\s\S]*?\\end\{tabular\})\s*\$\$/g, (full, open, block) =>
      open ? full : block,
    )
    t = stripUnlabeledListTwoDump(t)
    t = t.replace(
      /\\begin\{tabular\}(?:\[[^\]]*\])?(?:\{[^}]*\})?\s*(?:\\hline\s*)*(?:\\end\{tabular\})?\s*$/gi,
      '',
    )
    t = stripEmptyImageMarkdown(stripEmptyFigureShells(t))
    t = rejoinSplitMathEnvironments(t)
    t = splitGluedChemDisplayEquations(t)
    if (/\bGiven\s*:/i.test(t)) {
      t = t.replace(/([.?!])[ \t]+(\$[^$\n]{1,16}\$\s+is the\s)/g, '$1\n$2')
    }
    return t.replace(/---\s*page\s*---/gi, '\n').replace(/[ \t]{2,}/g, ' ').trim()
  } catch (err) {
    console.error('sanitizeStemForDisplay failed', err)
    return raw.replace(/---\s*page\s*---/gi, '\n').replace(/[ \t]{2,}/g, ' ').trim()
  }
}

/**
 * Incomplete banner / publish block after the same clean-up students see.
 * A stem ending in "Then" is torn from its formula only when no options finish the sentence.
 * @param {unknown} text
 * @param {unknown[]} [options]
 */
export function stemLooksIncompleteOnDisplay(text, options) {
  const shown = sanitizeStemForDisplay(text)
  const filled = (Array.isArray(options) ? options : []).filter((opt) => String(opt ?? '').trim()).length
  const checked = filled >= 2 ? shown.replace(/\s*\bThen\s*$/i, '') : shown
  return latexExtractionIncomplete(checked)
}
