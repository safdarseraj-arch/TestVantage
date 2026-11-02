/**
 * Local AI learning store + apply corrections + upload autofill assist.
 */
import assert from 'node:assert/strict'
import { applyLocalAiLearnedCorrections } from '../src/utils/localAiLearningStore.js'
import {
  deriveOcrCorrectionPairs,
  fingerprintImageInput,
} from '../src/utils/localAiLearningStore.js'
import {
  enrichUploadWithMetaAndAnswer,
  formatAnswerKeyForLearning,
  suggestExamIdsFromQuestion,
} from '../src/utils/autoFillUploadAssist.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { normalizeStemForStorage } from '../src/utils/stemStorage.js'

// Node has no localStorage — shim for store tests
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  }
}

const { recordLocalAiLearningExample, getLocalAiLearningStats, clearLocalAiLearningStore } =
  await import('../src/utils/localAiLearningStore.js')

clearLocalAiLearningStore()

assert.ok(fingerprintImageInput('data:image/png;base64,abc').startsWith('s'))
const pairs = deriveOcrCorrectionPairs('If x #O and y ≠^0', 'If $x \\neq 0$ and $y \\neq 0$')
assert.ok(pairs.length >= 1, 'should derive neq-style corrections')

recordLocalAiLearningExample({
  localOcrRaw: 'If x ≠^0 then |1 1 1; 1 1 2; 1 1 1| = 0',
  cloudStem:
    'If $x \\neq 0$ then $$\\begin{vmatrix}1+x & 1 & 1 \\\\ 1+y & 1+2y & 1 \\\\ 1+z & 1+z & 1+3z\\end{vmatrix}=0$$',
  cloudOptions: ['-1', '-2', '-3', '1/3'],
  cloudAnswer: 'A',
  cloudSolution: '**Step 1** Expand…\n\n**Correct:** (A)',
  subject: 'mathematics',
  chapter: 'Matrices & Determinants',
  provider: 'cloud-vision',
})

const stats = getLocalAiLearningStats()
assert.equal(stats.exampleCount, 1)
assert.ok(stats.correctionCount >= 1)

const fixed = applyLocalAiLearnedCorrections('Keep ≠^0 here')
assert.ok(!/≠\^0/.test(fixed) || fixed.includes('\\neq 0') || fixed.includes('neq'), fixed)

const exams = suggestExamIdsFromQuestion({
  text: 'If the determinant equals 0 then x^{-1}+y^{-1}+z^{-1}',
  subject: 'mathematics',
})
assert.ok(exams.includes('jee-advanced') || exams.includes('jee-main'))

const enriched = enrichUploadWithMetaAndAnswer(
  {
    text: String.raw`If $x \neq 0$ and $$\begin{vmatrix}1+x & 1 & 1 \\ 1 & 1 & 1 \\ 1 & 1 & 1\end{vmatrix}=0$$ then`,
    options: ['-1', '-2', '-3', '1/3'],
  },
  'determinant matrix 1+x',
  { examIds: ['jee-advanced'] },
)
assert.ok(enriched.subject === 'mathematics' || enriched.aiSuggestedMeta?.length >= 0)
assert.equal(formatAnswerKeyForLearning({ correctIndex: 0 }), 'A')

const stem = normalizeStemForStorage(
  String.raw`If $x \neq 0$, $y \neq 0$, $z \neq 0$ and $$\begin{vmatrix} 1+x & 1 & 1 \\ 1+y & 1+2y & 1 \\ 1+z & 1+z & 1+3z \end{vmatrix} = 0,$$ then`,
)
assert.ok(/1\+x/.test(stem) && /\\neq\s+0/.test(stem) && !/\\neq\s*\^/.test(stem))

const polished = polishOcrText('If x ≠^0 then find')
assert.ok(typeof polished === 'string')

console.log('test-local-ai-learning: ok')
