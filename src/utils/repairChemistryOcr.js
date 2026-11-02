/**
 * Chemistry OCR repair — Mathpix-style \ce{} / \pu{} for JEE/NEET stems and MCQ options.
 * @param {string} text
 */

const COMMON_FORMULAS = [
  'H2O',
  'H2SO4',
  'H2S',
  'CH4',
  'C2H6',
  'C2H4',
  'C2H2',
  'NH3',
  'CO2',
  'CO',
  'NaCl',
  'CaCO3',
  'CaO',
  'HCl',
  'NaOH',
  'KOH',
  'HNO3',
  'H2CO3',
  'CuSO4',
  'FeSO4',
  'ZnSO4',
  'AgNO3',
  'BaSO4',
  'MgO',
  'Al2O3',
  'SO2',
  'SO3',
  'NO2',
  'N2O',
  'O3',
  'Cl2',
  'Br2',
  'I2',
]

/** @param {string} text */
export function looksLikeChemistryContent(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  if (/\\ce\{|\\pu\{/.test(t)) return true
  if (
    /\b(?:mol\s*L|g\s*mol|Nernst|pH|pKa|pKb|Kc|Kp|Kw|equilibrium|redox|oxidation|reduction|electrolysis|anode|cathode|ligand|coordination|enthalpy|entropy|Gibbs)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\b(?:H2O|H2SO4|CH4|NH3|CO2|NaCl|Fe\^?\{?2\+|SO4|MnO4|Cr2O7)\b/i.test(t)) return true
  if (/(?:->|<=>|⇌|\\rightleftharpoons|\\rightarrow)/i.test(t)) return true
  return false
}

/** @param {string} formula */
function ceWrap(formula) {
  return `$\\ce{${formula}}$`
}

/** @param {string} t */
function fixCommonOcrTypos(t) {
  let out = t
  out = out.replace(/\bH20\b/g, 'H2O')
  out = out.replace(/\bS04\b/gi, 'SO4')
  out = out.replace(/\bN03\b/gi, 'NO3')
  out = out.replace(/\bC02\b/g, 'CO2')
  out = out.replace(/\bNH4\+\b/g, 'NH4+')
  return out
}

/** @param {string} t */
function repairReactionArrows(t) {
  let out = t
  out = out.replace(/<=>|⇌/g, '\\rightleftharpoons')
  out = out.replace(/<->|↔/g, '\\leftrightarrow')
  out = out.replace(/->|→|⟶/g, '\\rightarrow')
  out = out.replace(/<-|←/g, '\\leftarrow')
  return out
}

/** @param {string} t */
function repairChemistryUnits(t) {
  let out = t
  out = out.replace(
    /\b(\d+(?:\.\d+)?)\s*(?:mol\s*L\^{-?1}|mol\/L)\b/gi,
    (_, n) => `$\\pu{${n} mol L^{-1}}$`,
  )
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*M\b(?!\w)/g, (_, n) => `$\\pu{${n} M}$`)
  out = out.replace(/\bg\s*mol\^{-?1}\b/gi, '$\\pu{g mol^{-1}}$')
  out = out.replace(/\bJ\s*mol\^{-?1}\s*K\^{-?1}\b/gi, '$\\pu{J mol^{-1} K^{-1}}$')
  out = out.replace(/\batm\b/gi, (m, offset, str) => {
    const head = str.slice(Math.max(0, offset - 6), offset)
    if (/\\pu\{|\$/.test(head)) return m
    return '$\\pu{atm}$'
  })
  return out
}

/** @param {string} t */
function repairIonCharges(t) {
  let out = t
  out = out.replace(
    /\b([A-Z][a-z]?)\s*\{\s*(\d+)\s*\+\s*\}/g,
    (_, el, n) => `\\ce{${el}^{${n}+}}`,
  )
  out = out.replace(/\b([A-Z][a-z]?)\s*(\d+)\s*\+(?!\w)/g, (_, el, n) => `\\ce{${el}^{${n}+}}`)
  out = out.replace(/\b([A-Z][a-z]?)\s*(\d+)\s*-(?!\w)/g, (_, el, n) => `\\ce{${el}^{${n}-}}`)
  out = out.replace(
    /\b([A-Z][a-z]?)\^(\d+)\+/g,
    (_, el, n) => `\\ce{${el}^{${n}+}}`,
  )
  out = out.replace(
    /\b([A-Z][A-Za-z0-9]+)\^(\d+)-/g,
    (_, ion, n) => `\\ce{${ion}^{${n}-}}`,
  )
  out = out.replace(/\b([A-Z][A-Za-z0-9]+)(\d+)-(?!\w)/g, (_, ion, n) => {
    if (/^(?:H2O|CO2|CH4)$/i.test(ion + n)) return `${ion}${n}-`
    return `\\ce{${ion}^{${n}-}}`
  })
  return out
}

/** @param {string} t */
function repairMcqChemistryOptions(t) {
  return t.replace(
    /\(([A-D])\)\s*(?!\$|\\ce|\\text)([A-Z][A-Za-z0-9]{1,10}(?:\^{?\d+[+-]?}?)?)/g,
    (match, label, formula) => {
      if (/^(If|The|Then|Let|For|And|Not|All|Any|One|Two|An)$/i.test(formula)) return match
      const hit = COMMON_FORMULAS.find((f) => f.toLowerCase() === formula.toLowerCase())
      if (hit) return `(${label}) ${ceWrap(hit)}`
      if (/^[A-Z][a-z]?\d{0,2}$/.test(formula) && formula.length <= 6) {
        return `(${label}) ${ceWrap(formula)}`
      }
      return match
    },
  )
}

/** @param {string} t */
function wrapBareCommonFormulas(t) {
  let out = t
  for (const f of COMMON_FORMULAS) {
    const re = new RegExp(
      `(?<!\\\\ce\\{|\\\\text\\{|\\\\mathrm\\{|\\\\$|\\w)${f}(?!\\w|\\})`,
      'gi',
    )
    out = out.replace(re, (m) => ceWrap(m))
  }
  return out
}

/** @param {string} t */
function repairCeInsideMath(t) {
  return t.replace(/\$([^$]*?)\\ce\{([^}]+)\}([^$]*?)\$/g, (_, pre, inner, post) => {
    const body = `${pre}\\ce{${inner}}${post}`.trim()
    return `$${body}$`
  })
}

/**
 * @param {string} text
 * @returns {string}
 */
export function repairChemistryOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const COORDS_TOKEN = '__MATH_COORDS__'
  t = t.replace(/\bco-ordinates\b/gi, COORDS_TOKEN)

  t = fixCommonOcrTypos(t)
  t = repairReactionArrows(t)
  t = repairChemistryUnits(t)
  t = repairIonCharges(t)
  t = repairMcqChemistryOptions(t)

  if (looksLikeChemistryContent(t) || /\([A-D]\)/i.test(t)) {
    t = wrapBareCommonFormulas(t)
  }

  t = repairCeInsideMath(t)
  t = t.replace(new RegExp(COORDS_TOKEN, 'g'), 'co-ordinates')
  t = t.replace(/\\ce\{co\}-?ordinates/gi, 'co-ordinates')
  return t
}
