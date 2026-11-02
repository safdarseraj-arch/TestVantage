import { keepStructuredQuestionLines } from './repairMatrixStem.js'

function collapseDedupeSpace(text) {
  const t = String(text ?? '')
  if (keepStructuredQuestionLines(t)) {
    return t.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  }
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * Remove OCR/paste duplicates — same question stem or $...$ block repeated twice.
 * @param {string} text
 * @returns {string}
 */
export function dedupeRepeatedStemPhrase(text) {
  const original = collapseDedupeSpace(text)
  let out = original
  out = out.replace(/^Preview:\s*/i, '')
  if (!out || out.length < 40) return out

  // Same $…$ twice with the same trailing phrase — not two different numbers (e.g. $10$ yellow … $10$ balls)
  out = out.replace(
    /(\$[^$]+\$)(\s*[^$\n]{0,200}?)\s*\1\s*\2/gi,
    '$1$2',
  )
  out = out.replace(/(\$[^$\n]{18,}\$)\s*\1+/gi, '$1')

  const intMatch = out.match(/((?:\\int\b|\bint\s)[\s\S]{12,280}?d\s*x)/i)
  if (intMatch) {
    const needle = intMatch[1].trim()
    const pos2 = out.indexOf(needle, needle.length - 2)
    if (pos2 > 8) {
      const head = out.slice(0, pos2).trim()
      const rest = out.slice(pos2 + needle.length).trim()
      const headPrefix = head.slice(0, Math.min(48, head.length))
      if (rest.startsWith(headPrefix.slice(0, Math.min(32, headPrefix.length)))) {
        out = head
      } else {
        out = `${head} ${rest}`.trim()
      }
    }
  }

  out = out.replace(/(\\int[\s\S]{12,280}?d\s*x)\s*\1/gi, '$1')
  out = out.replace(/(\bint[\s\S]{12,280}?d\s*x)\s*\1/gi, '$1')

  const maxProbe = Math.min(100, Math.floor(out.length * 0.5))
  for (let probeLen = maxProbe; probeLen >= 40; probeLen -= 4) {
    const head = out.slice(0, probeLen).trim()
    const anchor = head.slice(0, Math.min(36, head.length))
    const pos2 = out.indexOf(anchor, Math.max(anchor.length, 12))
    if (pos2 > 20 && pos2 < out.length - 25) {
      const rest = out.slice(pos2).trim()
      if (rest.startsWith(anchor.slice(0, Math.min(28, anchor.length)))) {
        out = out.slice(0, pos2).trim()
        break
      }
    }
  }

  out = out.replace(
    /(\bis\s+equal\s+to\b[^.]{0,180}?)(\s+\1)+/gi,
    '$1',
  )

  const result = collapseDedupeSpace(out)
  if (
    result.length < original.length * 0.55 &&
    /^(?:\)|\.{2,}|defined\b|forall\b)/i.test(result)
  ) {
    return original
  }
  if (/\bis\s+equal\s+to\b/i.test(original) && !/\bis\s+equal\s+to\b/i.test(result)) {
    return original
  }
  return result
}
