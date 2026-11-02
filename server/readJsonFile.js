import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Decode a buffer that may be UTF-8 or UTF-16 LE (OneDrive/editor hazard).
 * @param {Buffer} buffer
 */
export function decodeUtf8OrUtf16(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return b.toString('utf16le')
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    const swapped = Buffer.alloc(b.length - (b.length % 2))
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      swapped[i] = b[i + 1]
      swapped[i + 1] = b[i]
    }
    return swapped.toString('utf16le')
  }
  if (b.length >= 2 && b[1] === 0) {
    return b.toString('utf16le')
  }
  let text = b.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

/**
 * Read JSON, accepting UTF-16 files. Returns null if missing or invalid.
 * @param {string} filePath
 */
export function readJsonFileUtf8OrUtf16(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(decodeUtf8OrUtf16(readFileSync(filePath)))
  } catch {
    return null
  }
}

/**
 * Write UTF-8, then re-save as UTF-8 if OneDrive/the OS stored it as UTF-16 LE.
 * @param {string} filePath
 * @param {string} text
 */
export function writeUtf8RepairUtf16(filePath, text) {
  writeFileSync(filePath, text, 'utf8')
  const b = readFileSync(filePath)
  if (b.length >= 2 && b[1] === 0) {
    writeFileSync(filePath, b.toString('utf16le'), 'utf8')
  }
}
