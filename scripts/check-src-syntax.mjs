/**
 * Parse-check shipped browser JS under src/ (one ESLint pass — not 400+ node --check spawns).
 */
import { ESLint } from 'eslint'

const eslint = new ESLint({
  overrideConfig: [
    {
      rules: {},
    },
  ],
})

const results = await eslint.lintFiles(['src/**/*.js'])
const bad = []
for (const result of results) {
  for (const m of result.messages) {
    if (m.fatal) {
      bad.push(`${result.filePath}:${m.line}:${m.column}  ${m.message}`)
    }
  }
}

if (bad.length) {
  console.error('Syntax errors in:')
  for (const f of bad) console.error(' ', f)
  process.exit(1)
}
console.log(`All src JS syntax OK (${results.length} files)`)
