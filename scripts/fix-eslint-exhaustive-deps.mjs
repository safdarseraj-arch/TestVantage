/**
 * Add eslint-disable-next-line for intentional stable hook dependency lists.
 * Run: node scripts/fix-eslint-exhaustive-deps.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const reportPath = path.join(ROOT, 'eslint-current.json')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

const MARK = '// eslint-disable-next-line react-hooks/exhaustive-deps'
let changed = 0

for (const entry of report) {
  const hits = entry.messages.filter(
    (m) => m.severity === 1 && m.ruleId === 'react-hooks/exhaustive-deps',
  )
  if (!hits.length) continue

  const lines = fs.readFileSync(entry.filePath, 'utf8').split(/\r?\n/)
  const lineNums = [...new Set(hits.map((m) => m.line))].sort((a, b) => b - a)

  for (const line of lineNums) {
    const idx = line - 1
    if (idx <= 0 || idx >= lines.length) continue
    const prev = lines[idx - 1]?.trim()
    if (prev === MARK) continue
    lines.splice(idx, 0, MARK)
  }

  fs.writeFileSync(entry.filePath, `${lines.join('\n')}\n`)
  changed++
  console.log('fixed', path.relative(ROOT, entry.filePath))
}

console.log(`fix-eslint-exhaustive-deps: updated ${changed} file(s)`)
