/**
 * Catch accidental duplicate code tails (cause red Vite overlay / broken saves).
 * Run: npm run test:integrity · included in test:regression
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Line-level orphans from bad paste/merge. */
const ORPHAN_LINE = [
  /^\s*answer'\}\s*$/,
  /^q = countRealMcqOptions/,
  /^eX render/,
  /^\s*\}\s*answer'\}/,
]

/** Per-file duplicate export names that must appear once. */
const UNIQUE_EXPORTS = ['prepareMathForRender']

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, files)
    else if (/\.(js|jsx)$/.test(name)) files.push(p)
  }
  return files
}

const problems = []

for (const file of walk(root)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    for (const re of ORPHAN_LINE) {
      if (re.test(lines[i])) {
        problems.push(`${file}:${i + 1} orphan line: ${lines[i].trim()}`)
      }
    }
  }
  const src = lines.join('\n')
  for (const name of UNIQUE_EXPORTS) {
    const re = new RegExp(`export function ${name}\\b`, 'g')
    const count = (src.match(re) || []).length
    if (count > 1) {
      problems.push(`${file}: ${count}× export function ${name}`)
    }
  }
}

if (problems.length) {
  console.error('check-src-integrity: FAIL\n' + problems.join('\n'))
  process.exit(1)
}
console.log('check-src-integrity: ok')
