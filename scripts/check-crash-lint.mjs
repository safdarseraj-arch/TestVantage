/**
 * Fails on lint rules that mean a guaranteed runtime crash (ReferenceError /
 * TypeError), not on style. `check-src-syntax` only proves a file parses — it
 * cannot see a `const` reassigned later or a variable used outside its block,
 * and both of those have shipped and broken image upload before.
 *
 * Also fails on UTF-16 source files (OneDrive/editor hazard): Node and Vite
 * then throw "Invalid or unexpected token" on line 1, and ESLint parse errors
 * used to be ignored because they have no crash-rule id.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const CRASH_RULES = {
  'no-const-assign': 'error',
  'no-undef': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-class-assign': 'error',
  'no-dupe-args': 'error',
  'no-dupe-class-members': 'error',
  'no-dupe-keys': 'error',
  'no-obj-calls': 'error',
  'no-unreachable': 'error',
  'no-unsafe-negation': 'error',
  'no-unsafe-optional-chaining': 'error',
  'getter-return': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error',
  'constructor-super': 'error',
  'no-this-before-super': 'error',
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function walkSourceFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkSourceFiles(p, files)
    else if (/\.(js|jsx|mjs|cjs)$/.test(name)) files.push(p)
  }
  return files
}

/** UTF-16 LE/BE (BOM or ASCII-as-UTF-16 with null odd bytes). */
function isUtf16Source(buf) {
  if (!buf || buf.length < 2) return false
  if (buf[0] === 0xff && buf[1] === 0xfe) return true
  if (buf[0] === 0xfe && buf[1] === 0xff) return true
  if (buf[1] !== 0 || buf.length < 8) return false
  const n = Math.min(buf.length, 64)
  let zeros = 0
  let pairs = 0
  for (let i = 1; i < n; i += 2) {
    pairs += 1
    if (buf[i] === 0) zeros += 1
  }
  return pairs > 0 && zeros / pairs >= 0.8
}

const encodingFailures = []
for (const dirName of ['src', 'scripts', 'server']) {
  const dir = join(root, dirName)
  try {
    if (!statSync(dir).isDirectory()) continue
  } catch {
    continue
  }
  for (const file of walkSourceFiles(dir)) {
    const buf = readFileSync(file)
    if (isUtf16Source(buf)) {
      encodingFailures.push(`${file}: UTF-16 (Node/Vite crash on line 1)`)
    }
  }
}

if (encodingFailures.length) {
  console.error(`check-crash-lint: ${encodingFailures.length} UTF-16 source file(s)\n`)
  for (const f of encodingFailures) console.error(`  ${f}`)
  console.error('\nRe-save as UTF-8. OneDrive/editor tools sometimes write UTF-16.')
  process.exit(1)
}

const eslint = new ESLint({
  overrideConfig: [
    {
      rules: Object.fromEntries(
        Object.keys(CRASH_RULES).map((r) => [r, 'error']),
      ),
    },
  ],
})

// `scripts/` is skipped for ESLint: the regression suite executes those files
// directly, so a crash there already fails the gate. `src/` ships to the
// browser and only a fraction of it is ever executed under test.
const results = await eslint.lintFiles(['src', 'server'])

const crashRuleIds = new Set(Object.keys(CRASH_RULES))
const failures = []
for (const result of results) {
  for (const m of result.messages) {
    if (m.fatal) {
      failures.push(`${result.filePath}:${m.line}:${m.column}  parse-error  ${m.message}`)
      continue
    }
    if (m.ruleId && crashRuleIds.has(m.ruleId)) {
      failures.push(`${result.filePath}:${m.line}:${m.column}  ${m.ruleId}  ${m.message}`)
    }
  }
}

if (failures.length) {
  console.error(`check-crash-lint: ${failures.length} crash-class problem(s)\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error(
    '\nThese throw at runtime (ReferenceError / TypeError) even though the file parses.',
  )
  process.exit(1)
}

console.log(`check-crash-lint: ok (${results.length} files)`)
