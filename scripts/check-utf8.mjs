/**
 * Encoding guard: every text/code file must be UTF-8 without BOM.
 *
 *   node scripts/check-utf8.mjs              list UTF-16 / UTF-8-BOM files, exit 1 if any
 *   node scripts/check-utf8.mjs --fix        convert them in place (content verified before/after)
 *   node scripts/check-utf8.mjs --all <dir>  scan a whole folder tree instead of the default set
 *
 * Default set: git tracked + untracked (not ignored) files in onlinetest, plus the top-level
 * guides and .vscode/.cursor folders of the two parent TestVantage folders.
 *
 * Windows PowerShell 5.1 reads BOM-less .ps1 files as ANSI, so a .ps1 that contains
 * non-ASCII characters keeps (or gets) a UTF-8 BOM.
 */
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const FIX = args.includes('--fix')
const allIdx = args.indexOf('--all')
const ALL_DIR = allIdx >= 0 ? resolve(args[allIdx + 1] || '.') : null

const TEXT_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.jsonl', '.css', '.scss', '.html', '.htm',
  '.py', '.md', '.mdc', '.txt', '.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.sh', '.yml', '.yaml',
  '.toml', '.ini', '.cfg', '.conf', '.svg', '.xml', '.csv', '.tsv', '.sql', '.tex', '.log',
  '.code-workspace', '.example', '.production', '.local', '.development', '.env',
])
const TEXT_NAMES = new Set([
  '.gitignore', '.gitattributes', '.dockerignore', '.editorconfig', '.env', '.nvmrc', '.npmrc',
  '.prettierrc', '.eslintrc', 'Dockerfile', 'Makefile', 'Procfile', 'LICENSE',
])
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'venv', '.venv', '__pycache__', '.pytest_cache', 'coverage',
])
const PS_EXTS = new Set(['.ps1', '.psm1', '.psd1'])

function isTextFile(file) {
  const name = basename(file)
  return TEXT_NAMES.has(name) || name.startsWith('.env') || TEXT_EXTS.has(extname(name).toLowerCase())
}

function inSkippedDir(rel) {
  return rel.split(/[\\/]/).slice(0, -1).some((part) => SKIP_DIRS.has(part))
}

function walk(dir, out = [], recurse = true) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (recurse && !SKIP_DIRS.has(e.name)) walk(p, out, true)
    } else if (e.isFile() && isTextFile(p)) {
      out.push(p)
    }
  }
  return out
}

function gitFiles() {
  try {
    const raw = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    }).toString('utf8')
    return raw.split('\0').filter(Boolean).filter((rel) => !inSkippedDir(rel)).map((rel) => join(ROOT, rel))
  } catch {
    return walk(ROOT)
  }
}

function defaultTargets() {
  const files = gitFiles()
  for (const parent of [resolve(ROOT, '..'), resolve(ROOT, '..', '..')]) {
    walk(parent, files, false)
    for (const sub of ['.vscode', '.cursor']) {
      const d = join(parent, sub)
      if (existsSync(d)) walk(d, files, true)
    }
  }
  return [...new Set(files)].filter((f) => isTextFile(f) && existsSync(f))
}

function readHead(file, size = 8192) {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(size)
    const n = readSync(fd, buf, 0, size, 0)
    return buf.subarray(0, n)
  } finally {
    closeSync(fd)
  }
}

function detect(head) {
  if (head.length >= 4 && head[0] === 0xff && head[1] === 0xfe && head[2] === 0 && head[3] === 0) return 'utf32'
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xfe) return 'utf16le-bom'
  if (head.length >= 2 && head[0] === 0xfe && head[1] === 0xff) return 'utf16be-bom'
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf8-bom'
  let even = 0
  let odd = 0
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) i % 2 ? odd++ : even++
  }
  const half = head.length / 2
  if (head.length >= 4 && odd > half * 0.6 && even < half * 0.05 && looksLikeText(head, 'le')) return 'utf16le'
  if (head.length >= 4 && even > half * 0.6 && odd < half * 0.05 && looksLikeText(head, 'be')) return 'utf16be'
  if (even + odd > 0) return 'nul-bytes'
  return 'utf8'
}

function looksLikeText(head, order) {
  const body = Buffer.from(head.subarray(0, head.length - (head.length % 2)))
  const text = (order === 'be' ? body.swap16() : body).toString('utf16le')
  const chars = [...text]
  let bad = 0
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i].codePointAt(0)
    if (c === 0) return false
    if (c >= 0xd800 && c <= 0xdfff && i < chars.length - 1) return false
    if ((c < 0x20 && c !== 9 && c !== 10 && c !== 13 && c !== 12 && c !== 27) || c === 0xfffd) bad++
  }
  return bad <= chars.length * 0.01
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

function decode(buf, kind) {
  if (kind === 'utf8-bom') return strictUtf8.decode(buf.subarray(3))
  const body = buf.subarray(kind.endsWith('-bom') ? 2 : 0)
  if (body.length % 2) throw new Error('odd byte count for UTF-16')
  const le = kind.startsWith('utf16be') ? Buffer.from(body).swap16() : body
  const text = le.toString('utf16le')
  if (!Buffer.from(text, 'utf16le').equals(le)) throw new Error('UTF-16 decode not lossless')
  return text
}

function wantsBom(file, text) {
  return PS_EXTS.has(extname(file).toLowerCase()) && /[^\x00-\x7f]/.test(text)
}

function convert(file, kind) {
  const original = readFileSync(file)
  const nowKind = detect(original.subarray(0, 8192))
  if (nowKind !== kind) return `skipped (changed to ${nowKind} since scan)`
  const text = decode(original, kind)
  const bom = wantsBom(file, text)
  const out = Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, 'utf8')])
  writeFileSync(file, out)
  const again = readFileSync(file)
  const back = strictUtf8.decode(again.subarray(bom ? 3 : 0))
  if (back !== text) {
    writeFileSync(file, original)
    throw new Error('verification failed, original restored')
  }
  return bom ? 'converted to UTF-8 with BOM (PowerShell non-ASCII)' : 'converted to UTF-8 (no BOM)'
}

const targets = ALL_DIR ? walk(ALL_DIR) : defaultTargets()
const base = ALL_DIR || ROOT
const problems = []
const warnings = []

for (const file of targets) {
  let head
  try {
    if (!statSync(file).isFile()) continue
    head = readHead(file)
  } catch {
    continue
  }
  const kind = detect(head)
  if (kind === 'utf8') {
    try {
      if (statSync(file).size <= 5 * 1024 * 1024) strictUtf8.decode(readFileSync(file))
    } catch {
      warnings.push([file, 'not valid UTF-8 (likely ANSI/Windows-1252) — left unchanged'])
    }
    continue
  }
  if (kind === 'nul-bytes' || kind === 'utf32') {
    warnings.push([file, `${kind} — left unchanged, check by hand`])
    continue
  }
  if (kind === 'utf8-bom') {
    const rest = readFileSync(file).subarray(3)
    if (wantsBom(file, rest.toString('utf8'))) continue
  }
  problems.push([file, kind])
}

const show = (f) => relative(base, f) || f

for (const [file, msg] of warnings) console.warn(`warn  ${show(file)}: ${msg}`)

if (!problems.length) {
  console.log(`check:utf8 OK — ${targets.length} text files are UTF-8 without BOM`)
  process.exit(0)
}

if (!FIX) {
  console.error(`check:utf8 found ${problems.length} file(s) that are not UTF-8 without BOM:`)
  for (const [file, kind] of problems) console.error(`  ${kind.padEnd(12)} ${show(file)}`)
  console.error('Run: npm run check:utf8 -- --fix')
  process.exit(1)
}

let failed = 0
for (const [file, kind] of problems) {
  try {
    console.log(`fixed ${kind.padEnd(12)} ${show(file)} — ${convert(file, kind)}`)
  } catch (err) {
    failed++
    console.error(`FAILED ${kind.padEnd(12)} ${show(file)} — ${err.message}`)
  }
}
console.log(`check:utf8 --fix: ${problems.length - failed} fixed, ${failed} failed`)
process.exit(failed ? 1 : 0)
