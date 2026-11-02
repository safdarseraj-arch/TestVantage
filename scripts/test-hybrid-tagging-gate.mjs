/**
 * Hybrid AI tagging: JS/Python contract + mapHybridPoolRowToBankDraft round-trip shapes.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  hybridSyncUserMessage,
  mapHybridPoolRowToBankDraft,
  postgresHasNoHybridAiRows,
  repairHybridDraftForBank,
} from '../src/utils/hybridAiSync.js'
import {
  healQuestionLatexForBank,
  normalizeHybridSourceLabel,
  sanitizeHybridLatexText,
  sanitizeHybridOption,
  stemIsIncompleteMatrixOnly,
} from '../src/utils/hybridLatexSanitize.js'
import {
  HYBRID_CANONICAL_EXAMS,
  HYBRID_CANONICAL_SUBJECT_LABELS,
  HYBRID_QUESTION_TYPE_CODES,
  applyHybridCurriculumTags,
  curriculumTopicsForChapter,
  curriculumUnitsForSubject,
  mapExamSlugToHybridLabel,
  mapGeneratorQuestionTypeLabelToCode,
  mapHybridExamLabelToSlug,
  mapHybridSubjectLabelToSlug,
  mapHybridPoolQuestionTypeToBankId,
  mapSubjectSlugToHybridLabel,
  mapTrialTypeMixToHybridCode,
} from '../src/utils/hybridMetadata.js'
import {
  SUB_BANK_TYPE_AI,
  SUB_BANK_TYPE_SIMILAR_PYQ,
  normalizeSubBankType,
  resolveSubBankType,
} from '../src/utils/subBankType.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const py = spawnSync('python', ['python/tests/test_hybrid_metadata.py'], {
  cwd: root,
  encoding: 'utf-8',
})
assert.equal(py.status, 0, py.stderr || py.stdout)

const pyLatex = spawnSync('python', ['python/tests/test_hybrid_latex.py'], {
  cwd: root,
  encoding: 'utf-8',
})
assert.equal(pyLatex.status, 0, pyLatex.stderr || pyLatex.stdout)

assert.deepEqual(HYBRID_QUESTION_TYPE_CODES, ['SCQ', 'MSQ', 'NVQ'])
assert.equal(mapExamSlugToHybridLabel('jee-advanced'), 'JEE Advanced')
assert.equal(mapHybridExamLabelToSlug('JEE Advanced'), 'jee-advanced')
assert.equal(mapSubjectSlugToHybridLabel('physics'), 'Physics')
assert.equal(mapHybridSubjectLabelToSlug('Chemistry'), 'chemistry')
assert.equal(mapGeneratorQuestionTypeLabelToCode('Multiple Choice'), 'MSQ')
assert.equal(mapTrialTypeMixToHybridCode('multiple_correct'), 'MSQ')
assert.equal(mapHybridPoolQuestionTypeToBankId('SCQ', ['A', 'B']), 'single_correct')
assert.equal(mapHybridPoolQuestionTypeToBankId('MSQ', ['A', 'B']), 'multiple_correct')
assert.equal(mapHybridPoolQuestionTypeToBankId('NVQ', []), 'integer')

assert.equal(mapHybridExamLabelToSlug(mapExamSlugToHybridLabel('jee-advanced')), 'jee-advanced')
assert.equal(mapHybridExamLabelToSlug(mapExamSlugToHybridLabel('neet')), 'neet')

for (const sub of HYBRID_CANONICAL_SUBJECT_LABELS) {
  const slug = mapHybridSubjectLabelToSlug(sub)
  if (sub === 'Physics') assert.equal(slug, 'physics')
  else if (sub === 'Chemistry') assert.equal(slug, 'chemistry')
  else if (sub === 'Mathematics') assert.equal(slug, 'mathematics')
  else assert.equal(slug, 'biology')
}

const poolRow = {
  id: 'TV-AI-PHYS-abc',
  exam: 'JEE Advanced',
  subject: 'Physics',
  chapter: 'Rotation',
  topic: 'Torque',
  difficulty: 'Medium',
  bloom_level: 'Application',
  question_type: 'SCQ',
  text: 'Sample stem',
  options: ['1', '2', '3', '4'],
  correct_answer: 'A',
  step_by_step_solution: 'Because…',
  sub_bank_type: SUB_BANK_TYPE_AI,
}
const draft = mapHybridPoolRowToBankDraft(poolRow)
assert.ok(draft)
assert.equal(draft.subject, 'physics')
assert.equal(draft.examPatternId, 'jee-advanced')
assert.equal(draft.questionType, 'single_correct')
assert.equal(normalizeSubBankType(draft.sub_bank_type), SUB_BANK_TYPE_AI)
assert.equal(draft.bankSource, 'ai_hybrid')
assert.equal(draft.subBankType, SUB_BANK_TYPE_AI)
assert.equal(draft.section, 'Mechanics')
assert.equal(draft.chapter, 'Rotation')
assert.equal(draft.topic, 'Torque')
assert.notEqual(draft.section, 'Rotation')

assert.deepEqual(curriculumUnitsForSubject('Mathematics'), [
  'Algebra',
  'Trigonometry',
  'Coordinate Geometry',
  'Calculus',
  'Vectors & 3D',
  'Probability & Statistics',
])
const matrixTags = applyHybridCurriculumTags('Mathematics', {
  section: 'Matrices & Determinants',
  chapter: 'Matrices & Determinants',
  topic: 'Determinants',
})
assert.equal(matrixTags.mapped, true)
assert.equal(matrixTags.section, 'Algebra')
assert.equal(matrixTags.chapter, 'Matrices & Determinants')
assert.notEqual(matrixTags.section, 'Matrices & Determinants')
assert.equal(matrixTags.topic, 'Determinants')

const matrixRow = {
  ...poolRow,
  id: 'TV-AI-MATHEMATICS-demo',
  subject: 'Mathematics',
  unit: 'Matrices & Determinants',
  chapter: 'Matrices & Determinants',
  topic: 'Determinants',
}
const matrixDraft = mapHybridPoolRowToBankDraft(matrixRow)
assert.ok(matrixDraft)
assert.equal(matrixDraft.section, 'Algebra')
assert.equal(matrixDraft.chapter, 'Matrices & Determinants')
assert.notEqual(matrixDraft.section, matrixDraft.chapter)
assert.equal(matrixDraft.topic, 'Determinants')

assert.deepEqual(curriculumTopicsForChapter('Mathematics', 'Matrices & Determinants'), [
  'Operations',
  'Determinants',
  'Inverse',
])

const readyMatrices = mapHybridPoolRowToBankDraft({
  id: 'TV-AI-MATHEMATICS-pass',
  exam: 'JEE Main',
  subject: 'Mathematics',
  unit: 'Algebra',
  chapter: 'Matrices & Determinants',
  topic: 'Determinants',
  question_type: 'SCQ',
  toughness_level: 5,
  difficulty: 'Medium',
  text: 'Let A be a 2 by 2 matrix. Find the determinant of A.',
  options: ['-2', '-1', '2', '10'],
  correct_answer: 'A',
  step_by_step_solution: 'det = (1)(4) - (2)(3) = -2.',
  sub_bank_type: SUB_BANK_TYPE_AI,
  needs_action: false,
  marking: { correct: 4, wrong: -1, unattempted: 0 },
})
assert.ok(readyMatrices)
assert.equal(readyMatrices.needsAction, false)
assert.equal(readyMatrices.subject, 'mathematics')
assert.equal(readyMatrices.section, 'Algebra')
assert.equal(readyMatrices.chapter, 'Matrices & Determinants')
assert.equal(readyMatrices.topic, 'Determinants')
assert.equal(readyMatrices.questionType, 'single_correct')
assert.equal(readyMatrices.toughnessLevel, 5)
assert.equal(readyMatrices.difficulty, 'Medium')
assert.deepEqual(readyMatrices.examIds, ['jee-main'])
assert.equal(readyMatrices.source, 'Hybrid AI (Postgres)')
assert.equal(readyMatrices.subBankType, SUB_BANK_TYPE_AI)
assert.deepEqual(readyMatrices.marking, { correct: 4, wrong: -1, unattempted: 0 })

const needsActionMatrices = mapHybridPoolRowToBankDraft({
  id: 'TV-AI-MATHEMATICS-fix',
  exam: 'JEE Main',
  subject: 'Mathematics',
  unit: 'Algebra',
  chapter: 'Matrices & Determinants',
  topic: 'Determinants',
  question_type: 'SCQ',
  toughness_level: 5,
  difficulty: 'Medium',
  text: String.raw`$\begin{bmatrix} L & e & t \\ A & b & e \\ a & 3 & t \end{bmatrix}$ is equal to`,
  options: ['64', '96', '128', '192'],
  correct_answer: 'A',
  approval_status: 'NEEDS_ACTION',
  needs_action: true,
  sub_bank_type: SUB_BANK_TYPE_AI,
})
assert.ok(needsActionMatrices)
assert.equal(needsActionMatrices.needsAction, true)
assert.equal(needsActionMatrices.subject, '')
assert.equal(needsActionMatrices.section, '')
assert.equal(needsActionMatrices.chapter, '')
assert.equal(needsActionMatrices.topic, undefined)
assert.equal(needsActionMatrices.questionType, '')
assert.equal(needsActionMatrices.toughnessLevel, undefined)
assert.equal(needsActionMatrices.difficulty, undefined)
assert.deepEqual(needsActionMatrices.examIds, [])
assert.equal(needsActionMatrices.source, undefined)
assert.equal(needsActionMatrices.marking, undefined)
assert.equal(needsActionMatrices.subBankType, SUB_BANK_TYPE_AI)

const shortMatrices = applyHybridCurriculumTags('Mathematics', { chapter: 'Matrices' })
assert.equal(shortMatrices.section, 'Algebra')
assert.equal(shortMatrices.chapter, 'Matrices & Determinants')

const unknownTags = applyHybridCurriculumTags('mathematics', {
  section: 'Not A Real Chapter',
  chapter: 'Not A Real Chapter',
})
assert.equal(unknownTags.mapped, false)
assert.equal(unknownTags.section, '')
assert.notEqual(unknownTags.section, 'Not A Real Chapter')

const repaired = repairHybridDraftForBank({
  questionType: 'single_correct',
  options: ['(A) 1', 'B) 2', '3', '4'],
  correct_answer: 'A',
})
assert.deepEqual(repaired.options, ['1', '2', '3', '4'])
assert.equal(repaired.sub_bank_type, SUB_BANK_TYPE_AI)

const cloneRow = { ...poolRow, sub_bank_type: SUB_BANK_TYPE_SIMILAR_PYQ, parent_id: 'PYQ1', is_child: true }
const cloneDraft = mapHybridPoolRowToBankDraft(cloneRow)
assert.equal(cloneDraft?.bankSource, 'ai_similar_pyq')
assert.equal(cloneDraft?.similarToPyq, true)

const mamBroken = String.raw`IfA=\begin{bmatrix}11\\ O & 1\end{bmatrix} , then for any positive integer n , the matrix A^n is equal to:`
const mamHealed = healQuestionLatexForBank({ text: mamBroken, options: [] })
assert.match(mamHealed.text, /If \$A =/)
assert.match(mamHealed.text, /1 & 1/)
assert.match(mamHealed.text, /0 & 1/)

const hatStem = String.raw`If $A = \begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}$ satisfies $A^3 = 5A^2 + kA + 16\hat{i}$, then the value of $k$ is:`
const hatHealed = healQuestionLatexForBank({ text: hatStem, options: [] })
assert.match(hatHealed.text, /16I/)
assert.doesNotMatch(hatHealed.text, /\\hat\{i\}/)

const matrixStem = String.raw`If $A=\begin{bmatrix} 1 1 \\ 0 & 1\end{bmatrix}$ find $A^n$.`
assert.match(sanitizeHybridLatexText(matrixStem), /1 & 1/)
const matrixOpt = String.raw`A = \begin{bmatrix} 1 & 2 \\ 0 & 1 \end{bmatrix}`
assert.doesNotMatch(sanitizeHybridOption(matrixStem, matrixOpt), /^\s*A\s*=/)

const letProse = 'Let A be a 3×3 matrix with positive entries.'
assert.equal(sanitizeHybridLatexText(letProse), letProse)
assert.doesNotMatch(sanitizeHybridLatexText(letProse), /bmatrix/)
assert.equal(stemIsIncompleteMatrixOnly('Let A be a 3×3 matrix is equal to'), true)
assert.equal(
  stemIsIncompleteMatrixOnly('Let A be a 3×3 matrix. Find the determinant of A.'),
  false,
)

const smashedLet = String.raw`$\begin{bmatrix} L e t \\ A b e \\ a 3 t \end{bmatrix}$ is equal to`
assert.doesNotMatch(sanitizeHybridLatexText(smashedLet), /L & e & t/)
assert.equal(stemIsIncompleteMatrixOnly(smashedLet), true)
assert.equal(sanitizeHybridOption(smashedLet, '64 is equal to'), '64')
assert.equal(sanitizeHybridOption(smashedLet, 'is equal to'), '')
assert.match(sanitizeHybridOption(smashedLet, String.raw`is equal to $2\sqrt{5}$`), /is equal to/)

const legacySource = repairHybridDraftForBank({
  questionType: 'single_correct',
  source: 'Gemini SCQ trial',
  hybridSyncedFromPostgres: true,
  text: 'Sample',
  options: ['1', '2', '3', '4'],
})
assert.equal(normalizeHybridSourceLabel('Gemini SCQ trial'), 'Hybrid AI (Postgres)')
assert.equal(legacySource.source, 'Hybrid AI (Postgres)')

const poolMamRow = {
  ...poolRow,
  text: mamBroken,
  options: ['1', '2', '3', '4'],
  correct_answer: 'A',
}
const poolMamDraft = mapHybridPoolRowToBankDraft(poolMamRow)
assert.ok(poolMamDraft)
assert.match(poolMamDraft.text, /If \$A =/)
assert.match(poolMamDraft.text, /1 & 1/)
assert.equal(poolMamDraft.subBankType, SUB_BANK_TYPE_AI)
assert.equal(resolveSubBankType(poolMamDraft), SUB_BANK_TYPE_AI)

const modelsPy = fs.readFileSync(path.join(root, 'models.py'), 'utf8')
for (const t of ['normal', 'pyq', 'ai', 'similar_pyq']) {
  assert(modelsPy.includes(`"${t}"`), `models.py sub_bank ${t}`)
  assert(normalizeSubBankType(t), t)
}

assert.equal(postgresHasNoHybridAiRows({ poolAiCount: 0, poolCount: 12 }), true)
assert.equal(postgresHasNoHybridAiRows({ poolAiCount: 3, poolCount: 12 }), false)
assert.equal(postgresHasNoHybridAiRows({ poolCount: 0 }), true)
const localHint = hybridSyncUserMessage(
  { added: 0, poolAiCount: 0, poolCount: 0 },
  { localHybridDraftCount: 58 },
)
assert.match(localHint, /58/)
assert.match(localHint, /Hybrid AI sub-bank/)
assert.match(localHint, /date filter/i)

console.log('test-hybrid-tagging-gate: ok')
