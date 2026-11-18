/**
 * Q77: ranking options must not strip (A)–(E) stem drawings.
 */
import assert from 'node:assert/strict'
import { sanitizeStemForDisplay } from '../src/utils/sanitizeStemForDisplay.js'
import { peelLetteredStemStructures } from '../src/utils/smilesDisplay.js'
import { keepLabelledStemStructures } from '../src/utils/restorePyqOptionFiguresFromOcr.js'

const text = [
  'The ascending order of acidity of $-\\mathrm{OH}$ group in the following compounds is:',
  '(A) $\\mathrm{Bu}-\\mathrm{OH}$',
  '(B)',
  '<smiles>O=[N+]([O-])c1ccc(O)cc1</smiles>',
  '(C)',
  '<smiles>COc1ccc(O)cc1</smiles>',
  '(D)',
  '<smiles>Oc1ccccc1</smiles>',
  '(E)',
  '<smiles>O=[N+]([O-])c1ccc(O)c([N+](=O)[O-])c1</smiles>',
  'Choose the correct answer from the options given below:',
].join('\n')

const opts = [
  '(C) < (A) < (D) < (B) < (E)',
  '(C) < (D) < (B) < (A) < (E)',
  '(A) < (D) < (C) < (B) < (E)',
  '(A) < (C) < (D) < (B) < (E)',
]

assert.equal(keepLabelledStemStructures(text, opts), true)

const san = sanitizeStemForDisplay(text, opts)
assert.match(san, /<smiles>/i, 'sanitize keeps SMILES')
assert.match(san, /\(E\)/, 'sanitize keeps (E)')
assert.match(san, /Bu/, 'sanitize keeps Bu-OH')

const peeled = peelLetteredStemStructures(san)
assert.ok(peeled && peeled.items.length >= 4, 'peel lettered structures')
assert.equal(peeled.items[0].label, 'A')
assert.ok(peeled.items.some((i) => i.label === 'E' && i.smiles), 'keeps (E) smiles')

console.log('test-q77-ranking-stem-structures: ok')
