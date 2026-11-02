/**
 * Upload pipeline invariants — single source of truth for tests and save-time checks.
 * When fixing OCR/passage/metadata bugs: add a fixture here + a test in scripts/.
 * Run: npm run test:regression
 *
 * @see .cursor/rules/question-upload-pipeline.mdc
 */

import {
  isPassageMetadataType,
  isPassageSetIntegerMode,
  resolvePassageSetMetaType } from '../data/questionTypes.js'
import { getAllowedQuestionTypeIdsForExams } from '../data/examPatterns.js'
import { buildStoredFigureImageFields, normalizeFigureQuestionOnMigrate } from './figureQuestionImage.js'
import { applyPassagePivqAnswerInput, passagePivqAnswerDisplay, passageSubAnswerMode } from './passageSubAnswer.js'
/** @typedef {'passage_integer' | 'passage_scq'} PassageMetaTypeId */

/**
 * Metadata type for an entire passage set (must match QuestionBank savePassageBundle).
 * @param {string} qType
 * @param {{ options?: string[], correctInteger?: number | string, correctIndex?: number, text?: string }[]} subQuestions
 * @returns {PassageMetaTypeId}
 */
export function passageSetMetaTypeFromForm(qType, subQuestions) {
  return resolvePassageSetMetaType(qType, subQuestions)
}

/**
 * Core payload for one sub-question in a passage set (shared by UI save + regression tests).
 * @param {PassageMetaTypeId} metaType
 * @param {{ text?: string, options?: string[], correctInteger?: number | string, correctNumerical?: number | string, correctIndex?: number, answerMode?: string }} sq
 * @param {string} stem
 */
export function buildPassageSubQuestionPayload(metaType, sq, stem) {
  const usePivq = metaType === 'passage_integer'
  if (usePivq) {
    const raw = passagePivqAnswerDisplay(sq)
    const applied = applyPassagePivqAnswerInput(sq, raw)
    if (!applied.ok) {
      throw new Error(applied.error ?? 'Passage PIVQ sub-question needs a valid answer.')
    }
    if (applied.answerMode === 'numerical') {
      return {
        questionType: 'passage_integer',
        text: stem,
        answerMode: 'numerical',
        correctNumerical: applied.correctNumerical,
        numericalTolerance: sq.numericalTolerance ?? 0.01,
        contentMode: 'hybrid' }
    }
    return {
      questionType: 'passage_integer',
      text: stem,
      answerMode: 'integer',
      correctInteger: applied.correctInteger,
      contentMode: 'hybrid' }
  }
  const opts = [...(sq.options ?? [])]
  while (opts.length < 4) opts.push('')
  if (opts.filter((o) => String(o ?? '').trim()).length < 2) {
    throw new Error('Passage SCQ sub-question needs at least 2 options.')
  }
  return {
    questionType: 'passage_scq',
    text: stem,
    options: opts.slice(0, 4),
    // Never invent Answer A — leave unset until paper/AI/user marks it.
    ...(sq.correctIndex != null && Number.isFinite(Number(sq.correctIndex))
      ? { correctIndex: Number(sq.correctIndex) }
      : {}),
  }
}

/**
 * Every row in a saved passage set must share passage_integer or passage_scq when parent uses PIVQ/PSCQ.
 * @param {import('../data/tests').Question[]} rows
 */
export function assertPassageSetStorageConsistent(rows) {
  const parent = rows.find((r) => r.passageText && !r.passageId)
  if (!parent) {
    throw new Error('Passage contract: missing parent row (passageText, no passageId).')
  }
  const meta = parent.questionType
  if (!isPassageMetadataType(meta) || meta === 'passage') {
    return
  }
  const expected = meta === 'passage_integer' ? 'passage_integer' : 'passage_scq'
  const linked = rows.filter((r) => r.id === parent.id || r.passageId === parent.id)
  for (const row of linked) {
    if (row.questionType !== expected) {
      throw new Error(
        `Passage contract: row ${row.id ?? '?'} has type "${row.questionType}"; whole set must be "${expected}".`,
      )
    }
    if (expected === 'passage_integer') {
      const mode = passageSubAnswerMode(row)
      if (mode === 'numerical') {
        const cn = row.correctNumerical
        if (cn === '' || cn == null || Number.isNaN(Number(cn))) {
          throw new Error(`Passage contract: PIVQ row ${row.id ?? '?'} missing correctNumerical.`)
        }
      } else {
        const ci = row.correctInteger
        if (ci === '' || ci == null || Number.isNaN(Number(ci))) {
          throw new Error(`Passage contract: PIVQ row ${row.id ?? '?'} missing correctInteger.`)
        }
      }
    } else if (expected === 'passage_scq') {
      const filled = (row.options ?? []).filter((o) => String(o ?? '').trim()).length
      if (filled < 2) {
        throw new Error(`Passage contract: PSCQ row ${row.id ?? '?'} needs ≥2 options.`)
      }
    }
  }
}

/**
 * Figure MCQs must not persist full-page OCR as the stored diagram contract.
 * @param {import('../data/tests').Question} q
 */
export function assertFigureImageStorageContract(q) {
  if (!q?.questionImage?.trim()) return
  if (q.passageText || q.passageId) return
  const needsCrop = q.stemImageCrop === true || q.stemTextInImage === false
  if (q.stemTextInImage === true && !needsCrop) {
    throw new Error('Figure contract: stemTextInImage:true without crop is not allowed for diagram MCQs.')
  }
  const fields = buildStoredFigureImageFields({
    questionImage: q.questionImage,
    stemImageCrop: q.stemImageCrop,
    stemTextInImage: q.stemTextInImage,
    needsFigure: true })
  if (fields.stemTextInImage === true) {
    throw new Error('Figure contract: buildStoredFigureImageFields must not set stemTextInImage:true for figures.')
  }
  const migrated = normalizeFigureQuestionOnMigrate({
    ...q,
    stemImageCrop: true,
    stemTextInImage: true })
  if (migrated.questionImage && migrated.stemTextInImage === true) {
    throw new Error('Figure contract: migration must strip full-page stemTextInImage:true shots.')
  }
}

/** @param {string[]} examIds @param {string} typeId */
export function assertExamAllowsQuestionType(examIds, typeId) {
  const allowed = getAllowedQuestionTypeIdsForExams(examIds)
  if (!allowed) return
  const expanded = new Set(allowed)
  if (examIds.length) {
    expanded.add('passage_integer')
    expanded.add('passage_scq')
  }
  if (!expanded.has(typeId)) {
    throw new Error(`Exam contract: "${typeId}" not allowed for exams [${examIds.join(', ')}].`)
  }
}

/** Regression fixtures — extend when fixing a new production bug. */
export const UPLOAD_SMOKE_FIXTURES = {
  functionalEquationScq: {
    raw: 'The function f is not defined for x= 0, but for all non zero real number x, f(x) + 2f 2) =3x. The X equation f(x) = f(-x) is satisfied by\n(A) exactly one real number\n(B) exactly two real numbers\n(C) no real numbers\n(D) all non zero real numbers',
    minFound: 4,
    mustStemMatch: /f\(x\)\s*=\s*f\s*\(\s*-x\s*\)/i,
    mustOptionMatch: /exactly one real number/i },
  lnFractionIdenticalScq: {
    raw: `f fix) = . and g (x) = -. Then identify the CORRECT statement
(A) 7) and f(x) are identical functio
(B) T(x) and g(x) are identical functions
(C) f(x) g(x) = 1 forall x > 0`,
    minFound: 4,
    mustStemMatch: /\\frac\{x\}\{\\ln x\}/,
    mustOptionMatch: /\\frac\{1\}\{g\(x\)\}/ },
  graphDiagramScq: {
    raw: 'Consider the graph of real valued function f(x) defined for all x in R as shown above. The number of real solutions of the equation f(f(x)) = 2 is equal to\n(A) 0\n(B) 1\n(C) 2\n(D) 3',
    minFound: 4,
    imagePlan: { attemptDiagramAutoCrop: true } },
  integerType: {
    raw: 'The value of the integral from 0 to 1 of x squared dx is equal to',
    minFound: 0,
    maxFound: 1,
    mustStemMatch: /integral|value/i },
  triangleLocusScq: {
    raw: `If area of the triangle formed by the points A(3, 0), B(0, 3) & P(a, b) is : sq. units, then identify the correct statement(s)
(A) locus of P will be a union of two parallel lines
(B) Locus of P will be a union of two perpendicular lines
(C) Locus of P is given by xX + a +2xy-6(x+y)+8= 0
(D) Locus of P is given by x -y +2y-6x+8= 0`,
    minFound: 4,
    mustStemMatch: /\\frac\{3\}\{2\}/,
    mustOptionMatch: /x\^2 \+ y\^2 \+ 2xy/ },
  bulkLocusOneLine: {
    raw: 'If area of the triangle formed by the points A(3, 0), B(0, 3) & P(a, b) is : sq. units, then identify the correct statement(s) (A) locus of P will be a union of two parallel lines (B) Locus of P will be a union of two perpendicular lines (C) Locus of P is given by xX + a +2xy-6(x+y)+8= 0 (D) Locus of P is given by x -y +2y-6x+8= 0',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /\\frac\{3\}\{2\}/ },
  /** z⁵ roots + exp vmatrix SCQ — garbled OCR must not defer as passage or auto-crop. */
  z5ImaginaryRootsDetMcq: {
    raw: "eo elu eld _g Let a, B, 7, & are distinct imaginary roots of 1° = 1, then find the value of [¢\" e* e¥'-e™| is- CU Sr (A) 0 B)e 1 D)e'",
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /\\begin\{vmatrix\}[\s\S]*e\^\\alpha/i,
    mustOptions: ['0', '$e$', '1', '$e^5$'],
    mustNotPassage: true,
    skipOptionsAutoCrop: true },
  z5ImaginaryRootsDetMcqPolished: {
    raw: 'eo elu eld _g Let a, B, 7, & are distinct imaginary roots of $1^\\circ = 1$, then find the value of [¢" e* e¥\'-e™| is- CU Sr (A) 0 B)e 1 D)e\'',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /z\^5\s*=\s*1/,
    mustOptions: ['0', '$e$', '1', '$e^5$'],
    mustNotPassage: true,
    skipOptionsAutoCrop: true },
  /** limit f(x) + integral g(x) MSQ — hybrid OCR must fill text options without crop. */
  limitGxMcqHybrid: {
    raw: 'If f(x) = \\lim_{n \\to \\infty} e^{x \\tan(1/n) \\log(1/n)} , and = g(x) + C (C being the constant of integration). Then : (A) g \\left(',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /\\sqrt\[3\]\{\\sin\^\{11\}/,
    mustOptionMatch: /continuous for all/i,
    skipOptionsAutoCrop: true },
  surjectiveNotInjectiveMcq: {
    raw: "Which of the following function is surjective but not injective (A)f:R>R f(x) = x^2 + 2x^3 - x^2 + 1(B)f : R > R lx)=x^2 + x + 1(C)f : R \\to",
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /surjective but not injective/i,
    mustOptionMatch: /x\^4 \+ 2x\^3/,
    skipOptionsAutoCrop: true },
  fxPlusOneTimesEightMcq: {
    raw: 'If f : R — R is a function such that ( f x + 1) x =8, x >0, then the value is equal to (A) 4 (B) 8 (C) 32 (D) 64',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /f\(x\+1\)\)x\s*=\s*8/i,
    mustOptions: ['$4$', '$8$', '$32$', '$64$'],
    skipOptionsAutoCrop: true },
  fRplusPowFunctionMcq: {
    raw: 'a 256 If f : R^2 — Ris a function such that ( fx* + 1)" =8, x >0, then the value (+ (2 + J (A) 4 (B) 8 (C) 32 (D) 64',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /mathbb\{R\}\^\+.*x\^2 \+ 1.*256/i,
    mustOptions: ['$4$', '$8$', '$32$', '$64$'],
    skipOptionsAutoCrop: true },
  sinGiPiOneOneOntoMcq: {
    raw: 'If f:R>R& f(x) = -5-">+2x-1+, [x(x -1) + - (where [x] denotes integral part of X), then f(x) is - X"+2x+3 4 (A) one-one but not onto (B) one-one & onto (C) onto but not $$# One-one$ \\newcommand{\\vec{s}} (D) neither one-one nor onto',
    minFound: 4,
    maxFound: 4,
    mustStemMatch: /\\frac\{\\sin\(\[x\]\\pi\)\}/,
    mustOptions: [
      'one-one but not onto',
      'one-one & onto',
      'onto but not one-one',
      'neither one-one nor onto',
    ],
    mustNotPassage: true,
    skipOptionsAutoCrop: true },
  /** PCMB Class 11–12 smoke — Physics / Chemistry / Biology (Math covered above). */
  physicsOhmLawScq: {
    raw: 'A wire of resistance $R=4\\,\\Omega$ carries current $I=2\\,\\mathrm{A}$. The potential difference across it is\n(A) $2\\,\\mathrm{V}$\n(B) $4\\,\\mathrm{V}$\n(C) $8\\,\\mathrm{V}$\n(D) $16\\,\\mathrm{V}$',
    minFound: 4,
    mustStemMatch: /resistance|\\Omega|potential difference/i,
    mustOptionMatch: /8.*V|\\mathrm\{V\}/i,
    skipOptionsAutoCrop: true },
  chemistryHydrogenBondScq: {
    raw: 'Which of the following shows hydrogen bonding?\n(A) H2O\n(B) H2S\n(C) CH4\n(D) C2H6',
    minFound: 4,
    mustStemMatch: /hydrogen bonding/i,
    mustOptionMatch: /H2O|\\ce\{H2O\}/,
    skipOptionsAutoCrop: true },
  biologyAlleleScq: {
    raw: 'In humans, the ABO blood group is controlled by alleles $I^A$, $I^B$ and $i$. A person with genotype $I^A I^B$ has blood group\n(A) A\n(B) B\n(C) AB\n(D) O',
    minFound: 4,
    mustStemMatch: /ABO|I\^A|blood group/i,
    mustOptionMatch: /\bAB\b/,
    skipOptionsAutoCrop: true },
  physicsCircuitFigureHint: {
    raw: 'In the circuit shown in the figure, the reading of the ammeter is\n(A) 1 A\n(B) 2 A\n(C) 3 A\n(D) 4 A',
    minFound: 4,
    mustStemMatch: /circuit|ammeter/i,
    imagePlan: { attemptDiagramAutoCrop: true },
    skipOptionsAutoCrop: true },
}

export const PASSAGE_REGRESSION_FIXTURES = {
  functionFConsiderQuadratic: {
    mustBeInPassage: /expression \$F\(a,\s*b\)/i,
    mustNotBeInPassage: /Consider\s+the\s+quadratic/i,
    q1MustMatch: /Let\s*\$?F\s*\(\s*a\s*,/i,
    q2MustMatch: /Consider\s+the\s+quadratic/i },
  vanDerWaalsOneLine: {
    passageText: `The plot of Density vs Pressure is shown below for a Van der Waals gas (R = 0.08). The slope of the plot at 400 K is 1.25 (at low P) What is the molar mass of the gas (in g mol-1) What is the inversion temperature of the gas (in K)`,
    mustNotMatchInTrimmedPassage: /What is the/i },
  gasesInteger: {
    subStem: 'Partial pressure of X after adding 2W grams is (P = 6 atm)',
    mustNotBeInTrimmedPassage: /Partial\s+pressure\s+of\s+X/i } }

export { isPassageSetIntegerMode, resolvePassageSetMetaType }
export { passageSubAnswerMode, passageQuestionUsesNumerical } from './passageSubAnswer.js'
