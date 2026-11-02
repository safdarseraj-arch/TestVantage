/**
 * Normalize package.json on every dev start (UTF-8, no BOM, valid JSON).
 * Prevents VS Code/Cursor "npm task detection: failed to parse" from corrupted saves.
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'package.json')

/** @returns {boolean} true if file was rewritten */
export function ensurePackageJson() {
  let raw = readFileSync(path)
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    raw = raw.subarray(3)
  }
  let text = raw.toString('utf8').trim()
  if (!text) {
    throw new Error('package.json is empty — OneDrive may not have synced. Right-click folder → Always keep on this device.')
  }
  const data = JSON.parse(text)
  const normalized = `${JSON.stringify(data, null, 2)}\n`
  if (normalized !== text + (text.endsWith('\n') ? '' : '\n')) {
    writeFileSync(path, normalized, 'utf8')
    return true
  }
  return false
}

if (process.argv[1]?.endsWith('ensure-package-json.mjs')) {
  try {
    const fixed = ensurePackageJson()
    console.log(fixed ? 'package.json normalized' : 'package.json ok')
  } catch (e) {
    console.error(e.message || e)
    process.exit(1)
  }
}
