import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mammoth from 'mammoth'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/content/jee-complete-problem-solving-strategies.docx')
const dest = join(root, 'src/content/jeeCompleteProblemSolvingHtml.js')

const buf = readFileSync(src)
const { value } = await mammoth.convertToHtml({ buffer: buf })
const html = String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/\son\w+=(["']).*?\1/gi, '')
  .replace(/javascript:/gi, '')
  .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')

const out = [
  '/** Auto-extracted from jee-complete-problem-solving-strategies.docx. Read-only in-app. */',
  'export const JEE_COMPLETE_STRATEGY_TITLE = "Complete JEE problem-solving strategies"',
  `export const JEE_COMPLETE_STRATEGY_HTML = ${JSON.stringify(html)}`,
  '',
].join('\n')

writeFileSync(dest, out, 'utf8')
console.log('extract-jee-strategy-docx: ok', html.length)
