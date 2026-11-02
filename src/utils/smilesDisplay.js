/** Split <smiles>…</smiles> so MathText can draw structures instead of raw tags. */

/**
 * The scan of phenylammonium chloride is stored as [Cl+3-][N-] on the ring.
 * That code does not draw. The paper shows the benzene ring with NH3+ and Cl-.
 * Only this exact scan token is rewritten.
 */
const PHENYLAMMONIUM_SCAN = '[Cl+3-][N-]c1ccccc1'
const PHENYLAMMONIUM_DRAW = 'c1ccccc1[NH3+].[Cl-]'

export function repairScanStructureCodes(text) {
  return String(text ?? '').split(PHENYLAMMONIUM_SCAN).join(PHENYLAMMONIUM_DRAW)
}

export function extractSmilesStrings(raw) {
  return [...String(raw ?? '').matchAll(/<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi)]
    .map((m) => String(m[1] ?? '').trim())
    .filter(Boolean)
}

export function splitSmilesDisplaySegments(text) {
  const t = String(text ?? '')
  const parts = []
  const re = /<smiles>\s*([\s\S]*?)\s*<\/smiles>/gi
  let last = 0
  let m
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) {
      const chunk = t.slice(last, m.index)
      if (chunk.trim()) parts.push({ kind: 'text', value: chunk })
    }
    const smi = String(m[1] ?? '').trim()
    if (smi) parts.push({ kind: 'smiles', value: smi })
    last = m.index + m[0].length
  }
  if (last < t.length) {
    const tail = t.slice(last)
    const unclosed = tail.match(/<smiles>\s*([\s\S]*)$/i)
    if (unclosed && unclosed.index != null) {
      const before = tail.slice(0, unclosed.index)
      if (before.trim()) parts.push({ kind: 'text', value: before })
      const smi = String(unclosed[1] ?? '').replace(/<\/smiles>/gi, '').trim()
      if (smi) parts.push({ kind: 'smiles', value: smi })
    } else if (tail.trim()) {
      parts.push({ kind: 'text', value: tail.replace(/<\/?smiles>/gi, '') })
    }
  }
  if (!parts.length) {
    return [{ kind: 'text', value: t.replace(/<\/?smiles>/gi, '') }]
  }
  return parts
}