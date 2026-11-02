/**
 * Question-bank Mathpix to Gemini helpers (no live API, does not touch stored bank).
 */
import assert from 'node:assert/strict'
import {
  bankDraftsSuccessMessage,
  buildBankUploadPaperMeta,
  consumeBankMathpixExtractResult,
  isGarbageRawLatexCard,
  namedPaperTitleError,
  normalizeNamedPaperTitle,
  savedBankDraftCount,
  stampBankUploadIds,
  suggestedPaperNameFromFile,
} from '../src/utils/bankMathpixUpload.js'
import { getOcrProgressLabel } from '../src/utils/ocrProgressLabel.js'
import { pyqId } from '../src/utils/questionId.js'
import { structureTextThenMaybeSave } from '../src/utils/mathpixGeminiPipeline.js'

const multiLatex = `
\\item[Q.] 1 Let $x=1$. Then $x+1$ is
(A) $1$
(B) $2$
(C) $3$
(D) $4$
\\item[Q.] 2 The order of the reaction is
(A) $0$
(B) $1$
(C) $2$
(D) $3$
`

assert.equal(
  isGarbageRawLatexCard([{ text: multiLatex, options: ['', '', '', ''] }], multiLatex),
  true,
  'one blob of a two-question Mathpix dump is garbage',
)
assert.equal(
  isGarbageRawLatexCard(
    [
      { text: 'The value of $2+2$ is', options: ['3', '4', '5', '6'] },
      { text: 'Next', options: ['0', '1', '2', '3'] },
    ],
    multiLatex,
  ),
  false,
)

const stamped = stampBankUploadIds(
  [
    {
      text: 'A stem about quadratics that is long enough.',
      options: ['1', '2', '3', '4'],
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
      bankStatus: 'draft',
    },
  ],
  [],
  { labelledPyq: true, exam: 'jee-advanced', year: 2024 },
)
assert.equal(stamped[0].id, pyqId('MAQ00001', 'advanced', 2024))
assert.equal(stamped[0].id, 'MAQ00001A2024')

const normal = stampBankUploadIds(
  [
    {
      text: 'Normal bank stem',
      options: ['1', '2', '3', '4'],
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
      bankStatus: 'draft',
    },
  ],
  [],
  {},
)
assert.equal(normal[0].id, 'MAQ00001')

assert.equal(normalizeNamedPaperTitle('  Class test 12 April  '), 'Class test 12 April')
assert.equal(namedPaperTitleError('   '), 'Type the name of this paper. It cannot be empty.')
assert.equal(namedPaperTitleError('Class test'), '')
assert.equal(suggestedPaperNameFromFile({ name: 'my_class_test.pdf' }), 'my class test')

const namedMeta = buildBankUploadPaperMeta({
  paperName: '  Unit test 3  ',
  subject: 'physics',
})
assert.equal(namedMeta.paperName, 'Unit test 3')
assert.equal(namedMeta.paperLabel, 'Unit test 3')
assert.equal(namedMeta.sourceLabel, 'Unit test 3')
assert.equal(namedMeta.labelledPyq, false)
assert.notEqual(namedMeta.officialPyq, true)

const namedDrafts = stampBankUploadIds(
  [
    {
      text: 'A stem about quadratics that is long enough.',
      options: ['1', '2', '3', '4'],
      subject: 'mathematics',
      section: 'Algebra',
      chapter: 'Quadratic Equations',
      bankStatus: 'draft',
    },
  ],
  [],
  { paperName: 'Unit test 3' },
)
assert.equal(namedDrafts[0].paperName, 'Unit test 3')
assert.equal(namedDrafts[0].paperLabel, 'Unit test 3')
assert.equal(namedDrafts[0].source, 'Unit test 3')
assert.equal(namedDrafts[0].id.startsWith('MAQ'), true)
assert.doesNotMatch(String(namedDrafts[0].id), /A20\d\d$/)

const meta = buildBankUploadPaperMeta({
  labelledPyq: true,
  exam: 'jee-main',
  year: '2023',
  subject: 'physics',
})
assert.equal(meta.labelledPyq, true)
assert.equal(meta.exam, 'jee-main')
assert.equal(meta.year, 2023)

assert.equal(savedBankDraftCount({ savedDrafts: [{ id: 'a' }, { id: 'b' }] }), 2)
assert.match(bankDraftsSuccessMessage({ savedDrafts: [{ id: 'a' }] }), /Draft/)
assert.match(
  bankDraftsSuccessMessage({ savedDrafts: [{ id: 'a' }], paperName: 'Unit test 3' }),
  /Unit test 3/,
)

let opened = false
const consumed = consumeBankMathpixExtractResult(
  {
    savedDrafts: [{ id: 'MAQ00001', bankStatus: 'draft' }],
    cloudNote: 'Gemini filled 1 question from Mathpix text.',
    engine: 'mathpix',
  },
  {
    refresh() {},
    openDrafts() {
      opened = true
    },
    setMessage() {},
  },
)
assert.equal(consumed, true)
assert.equal(opened, true)

const emptyHandled = consumeBankMathpixExtractResult(
  {
    savedDrafts: [],
    questions: [],
    engine: 'mathpix',
    cloudNote: 'Mathpix keys were not loaded from onlinetest/.env.',
    mathpixMissing: true,
  },
  { setMessage() {} },
)
assert.equal(emptyHandled, true, 'missing Mathpix must not fall through to a raw-LaTeX card')

assert.match(getOcrProgressLabel(10), /Mathpix/)
assert.match(getOcrProgressLabel(64), /Mathpix|Splitting/i)
assert.doesNotMatch(getOcrProgressLabel(64), /formula model/i)
assert.match(getOcrProgressLabel(86), /Gemini/)
assert.match(getOcrProgressLabel(100), /Finished/)

const ticks = []
const split = await structureTextThenMaybeSave(multiLatex, {
  saveToBank: false,
  officialPyq: true,
  progress: (p) => ticks.push(p),
})
assert.ok(split.questions.length >= 2, `backup split got ${split.questions.length}`)
assert.equal(ticks.at(-1), 100, 'progress must finish at 100')
assert.ok(!isGarbageRawLatexCard(split.questions, multiLatex))

console.log('test-bank-mathpix-upload: drafts split, IDs, progress 100, no garbage card')
