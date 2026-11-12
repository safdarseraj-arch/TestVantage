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

const SMILES_TOKEN_RE = /\[[^\]]*\]|Br|Cl|%\d{2}|[BCNOPSFIbcnops*]|[-=#$:/\\.]|[()]|\d/g
const AROMATIC_BRACKET_RE = /^\[(\d*)(se|as|[bcnops])(.*)\]$/

/**
 * Printed papers draw rings with alternating double bonds, not circles.
 * Rewrite aromatic SMILES (c1ccccc1) as Kekulé (C1=CC=CC=C1) for drawing.
 * Returns the input unchanged when the code cannot be read or has no valid pairing.
 * @param {string} smiles
 */
export function kekulizeSmiles(smiles) {
  const src = String(smiles ?? '').trim()
  if (!src) return src
  const tokens = src.match(SMILES_TOKEN_RE) ?? []
  if (tokens.join('') !== src) return src

  const atoms = []
  const bonds = []
  const ringOpen = new Map()
  const stack = []
  let prev = -1
  let bondTok = -1
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok === '(') { stack.push(prev); continue }
    if (tok === ')') { prev = stack.pop() ?? -1; continue }
    if (tok === '.') { prev = -1; bondTok = -1; continue }
    if (/^[-=#$:/\\]$/.test(tok)) { bondTok = i; continue }
    if (/^(?:\d|%\d{2})$/.test(tok)) {
      if (prev < 0) return src
      const open = ringOpen.get(tok)
      if (open) {
        ringOpen.delete(tok)
        const sym = open.bondTok >= 0 ? tokens[open.bondTok] : bondTok >= 0 ? tokens[bondTok] : ''
        bonds.push({ a: open.atom, b: prev, sym, symToks: [open.bondTok, bondTok].filter((t) => t >= 0), at: i })
      } else {
        ringOpen.set(tok, { atom: prev, bondTok })
      }
      bondTok = -1
      continue
    }
    const bracket = tok.startsWith('[') ? tok.match(AROMATIC_BRACKET_RE) : null
    const aromatic = bracket ? true : /^[bcnops]$/.test(tok)
    const element = bracket ? bracket[2] : tok.replace(/^\[\d*([A-Za-z][a-z]?).*$/, '$1')
    const rest = bracket ? bracket[3] : ''
    atoms.push({ tok: i, aromatic, element, hasH: /H/.test(rest), charge: /[+-]/.test(rest) ? (/\+/.test(rest) ? 1 : -1) : 0 })
    const idx = atoms.length - 1
    if (prev >= 0) {
      bonds.push({ a: prev, b: idx, sym: bondTok >= 0 ? tokens[bondTok] : '', symToks: bondTok >= 0 ? [bondTok] : [], at: i })
    }
    prev = idx
    bondTok = -1
  }
  if (ringOpen.size || !atoms.some((a) => a.aromatic)) return src

  const nbrs = atoms.map(() => [])
  bonds.forEach((bond, k) => {
    nbrs[bond.a].push(k)
    nbrs[bond.b].push(k)
  })
  const connectedWithout = (skip, from, to) => {
    const seen = new Set([from])
    const queue = [from]
    while (queue.length) {
      const at = queue.shift()
      if (at === to) return true
      for (const k of nbrs[at]) {
        if (k === skip) continue
        const next = bonds[k].a === at ? bonds[k].b : bonds[k].a
        if (!seen.has(next)) { seen.add(next); queue.push(next) }
      }
    }
    return false
  }
  const candidate = bonds.map((bond, k) =>
    atoms[bond.a].aromatic && atoms[bond.b].aromatic && (bond.sym === '' || bond.sym === ':') && connectedWithout(k, bond.a, bond.b),
  )
  const needsDouble = atoms.map((atom, i) => {
    if (!atom.aromatic) return false
    if (nbrs[i].some((k) => bonds[k].sym === '=')) return false
    const degree = nbrs[i].length
    if (atom.element === 'c') return atom.charge === 0
    if (atom.element === 'n' || atom.element === 'p') {
      if (atom.hasH) return false
      if (atom.charge > 0) return true
      return atom.charge === 0 && degree <= 2
    }
    if (atom.element === 'b') return true
    return false
  })

  const match = new Map()
  let steps = 0
  const solve = () => {
    if (++steps > 20000) return false
    const i = needsDouble.findIndex((need, j) => need && !match.has(j))
    if (i < 0) return true
    for (const k of nbrs[i]) {
      if (!candidate[k]) continue
      const j = bonds[k].a === i ? bonds[k].b : bonds[k].a
      if (!needsDouble[j] || match.has(j)) continue
      match.set(i, k)
      match.set(j, k)
      if (solve()) return true
      match.delete(i)
      match.delete(j)
    }
    return false
  }
  if (!solve()) return src

  const doubled = new Set(match.values())
  const out = tokens.slice()
  const before = tokens.map(() => '')
  bonds.forEach((bond, k) => {
    if (!candidate[k]) return
    for (const t of bond.symToks) if (tokens[t] === ':') out[t] = ''
    if (doubled.has(k)) before[bond.at] = '='
  })
  for (const atom of atoms) {
    if (!atom.aromatic) continue
    const tok = tokens[atom.tok]
    out[atom.tok] = tok.startsWith('[')
      ? tok.replace(AROMATIC_BRACKET_RE, (_, iso, el, rest) => `[${iso}${el[0].toUpperCase()}${el.slice(1)}${rest}]`)
      : tok.toUpperCase()
  }
  return out.map((tok, i) => before[i] + tok).join('')
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