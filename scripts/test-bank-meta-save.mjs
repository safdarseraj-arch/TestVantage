/**
 * Metatag-only save must not throw (normalizePassageQuestionStorage import in questionBank).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(path.join(root, 'src/utils/questionBank.js'), 'utf8')
assert.match(src, /import\s*\{[^}]*normalizePassageQuestionStorage[^}]*\}\s*from\s*['"]\.\/passage\.js['"]/)
assert.match(src, /normalizePassageQuestionStorage\(merged,\s*bank\.questions\)/)
assert.match(src, /syncOfficialPyqImportedMeta/)
assert.match(src, /updateImportedPyqMeta/)

console.log('test-bank-meta-save: ok')
