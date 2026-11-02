/**
 * One-off repair: remove unused imports / prefix unused bindings flagged by ESLint.
 * Run: node scripts/fix-eslint-unused.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const reportPath = path.join(ROOT, 'eslint-current.json')
if (!fs.existsSync(reportPath)) {
  console.error('Run: npx eslint . -f json -o eslint-current.json')
  process.exit(1)
}

/** @type {{ filePath: string, messages: { line: number, message: string }[] }[]} */
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

/** @param {string} name @param {string} src */
function removeNamedImport(name, src) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let next = src

  // import { a, name, b } from 'x'
  next = next.replace(
    new RegExp(`(^|\\n)(import\\s*\\{[^\\}]*?)\\b${escaped}\\b\\s*,?\\s*`, 'm'),
    '$1$2',
  )
  next = next.replace(
    new RegExp(`(^|\\n)(import\\s*\\{[^\\}]*?),\\s*\\b${escaped}\\b\\b`, 'm'),
    '$1$2',
  )
  next = next.replace(/import\s*\{\s*,\s*/g, 'import { ')
  next = next.replace(/,\s*\}/g, ' }')
  next = next.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]+['"];?\s*\n/g, '')

  // import name from 'x'
  next = next.replace(new RegExp(`^import\\s+${escaped}\\s+from\\s+['"][^'"]+['"];?\\s*\\n`, 'm'), '')

  // import { name } from 'x' whole line
  next = next.replace(
    new RegExp(`^import\\s*\\{\\s*${escaped}\\s*\\}\\s*from\\s+['"][^'"]+['"];?\\s*\\n`, 'm'),
    '',
  )

  return next
}

/** @param {string} file @param {number} line @param {string} name @param {string} kind */
function prefixBinding(file, line, name, kind) {
  const lines = file.split(/\r?\n/)
  const idx = line - 1
  if (idx < 0 || idx >= lines.length) return file
  let row = lines[idx]

  if (kind === 'param') {
    row = row.replace(new RegExp(`\\b${name}\\b(?=\\s*[,)=])`), `_${name}`)
  } else if (kind === 'destructure') {
    row = row.replace(new RegExp(`\\b${name}\\b(?=\\s*[,}=])`), `_${name}`)
  } else if (kind === 'const') {
    row = row.replace(new RegExp(`\\b(const|let)\\s+${name}\\b`), `$1 _${name}`)
  }

  lines[idx] = row
  return lines.join('\n')
}

let changed = 0

for (const entry of report) {
  const unused = entry.messages.filter(
    (m) => m.severity === 1 && m.ruleId === 'no-unused-vars',
  )
  if (!unused.length) continue

  let src = fs.readFileSync(entry.filePath, 'utf8')
  let fileChanged = false

  for (const msg of unused) {
    const importMatch = msg.message.match(/^'([^']+)' is defined but never used/)
    const assignMatch = msg.message.match(/^'([^']+)' is assigned a value but never used/)
    if (importMatch) {
      const name = importMatch[1]
      const next = removeNamedImport(name, src)
      if (next !== src) {
        src = next
        fileChanged = true
      }
    } else if (assignMatch) {
      const name = assignMatch[1]
      if (name.startsWith('_')) continue
      const next = prefixBinding(src, msg.line, name, 'const')
      if (next !== src) {
        src = next
        fileChanged = true
      }
    } else if (/^'([^']+)' is defined but never used/.test(msg.message)) {
      const name = msg.message.match(/^'([^']+)'/)?.[1]
      if (name && !name.startsWith('_')) {
        const next = prefixBinding(src, msg.line, name, 'param')
        if (next !== src) {
          src = next
          fileChanged = true
        }
      }
    }
  }

  if (fileChanged) {
    fs.writeFileSync(entry.filePath, src.endsWith('\n') ? src : `${src}\n`)
    changed++
    console.log('fixed', path.relative(ROOT, entry.filePath))
  }
}

console.log(`fix-eslint-unused: updated ${changed} file(s)`)
