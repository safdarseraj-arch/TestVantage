import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(path.join(root, 'src/utils/questionBank.js'), 'utf8')

const exportMatch = src.match(/export const CURRENT_BANK_MIGRATE_VERSION = (\d+)/)
assert.ok(exportMatch, 'questionBank.js must export CURRENT_BANK_MIGRATE_VERSION')
const version = Number(exportMatch[1])

const commentVersions = [...src.matchAll(/\* v(\d+):/g)].map((m) => Number(m[1]))
assert.ok(commentVersions.length, 'questionBank.js must document migrate versions in header comments')
const commentVersion = Math.max(...commentVersions)
assert.equal(
  commentVersion,
  version,
  `Header comment says v${commentVersion} but export is ${version}`,
)

console.log(`test-bank-migrate-version: ok (v${version})`)
