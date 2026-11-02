/**
 * Fully client-side, keyword-based auto-classification of a question's metadata
 * (subject → section → chapter → topic, plus a rough toughness estimate) from
 * the stem + option text. No ML / no network.
 *
 * It maps onto the existing CURRICULUM_TREE so the suggestions are always valid
 * dropdown values. Results are SUGGESTIONS — the caller only fills fields the
 * user left empty, and the user can still override before saving.
 */

import { CURRICULUM_TREE } from '../data/curriculum.js'

/** Words too generic to help disambiguate a chapter. */
const STOPWORDS = new Set([
  'the', 'of', 'and', 'in', 'on', 'to', 'a', 'an', 'is', 'are', 'for', 'with',
  'by', 'at', 'from', 'as', 'be', 'or', 'if', 'this', 'that', 'value', 'find',
  'given', 'following', 'which', 'what', 'between', 'using', 'system', 'shown',
  'basics', 'applications', 'properties', 'general', 'special', 'types', 'law',
])

/**
 * Distinctive subject vocabulary. Hits here pick the subject before we look at
 * chapters. Terms are matched as whole words (case-insensitive).
 */
const SUBJECT_KEYWORDS = {
  physics: [
    'velocity', 'acceleration', 'momentum', 'force', 'newton', 'friction',
    'projectile', 'torque', 'inertia', 'gravitation', 'kinetic', 'potential energy',
    'capacitor', 'capacitance', 'resistor', 'resistance', 'ohm', 'voltage', 'current',
    'emf', 'circuit', 'magnetic', 'electric field', 'charge', 'coulomb', 'inductance',
    'wavelength', 'frequency', 'amplitude', 'refraction', 'reflection', 'lens', 'mirror',
    'photoelectric', 'photon', 'nucleus', 'radioactive', 'thermodynamic', 'entropy',
    'temperature', 'pressure', 'newtons', 'joule', 'watt', 'tesla', 'weber', 'flux',
    'oscillation', 'pendulum', 'amplitude', 'doppler', 'diffraction', 'interference',
  ],
  chemistry: [
    'mole', 'molar', 'atom', 'molecule', 'ion', 'ionic', 'covalent', 'bond', 'orbital',
    'electron configuration', 'enthalpy', 'entropy', 'gibbs', 'equilibrium', 'ph',
    'acid', 'base', 'buffer', 'oxidation', 'reduction', 'redox', 'electrode', 'nernst',
    'reaction', 'reagent', 'catalyst', 'isomer', 'hydrocarbon', 'alkane', 'alkene',
    'alkyne', 'benzene', 'aldehyde', 'ketone', 'alcohol', 'amine', 'ester', 'carboxylic',
    'periodic table', 'valence', 'electronegativity', 'hybridisation', 'hybridization', 'vsepr',
    'coordination', 'ligand', 'transition metal', 'polymer', 'colloid', 'adsorption',
    'compound', 'solution', 'concentration', 'titration', 'salt',
  ],
  mathematics: [
    'matrix', 'matrices', 'determinant', 'integral', 'integrate', 'derivative',
    'differentiate', 'limit', 'function', 'polynomial', 'quadratic', 'equation',
    'roots', 'complex number', 'modulus', 'argument', 'probability', 'permutation',
    'combination', 'binomial', 'sequence', 'series', 'arithmetic progression',
    'geometric progression', 'trigonometric', 'sine', 'cosine', 'tangent', 'vector',
    'parabola', 'ellipse', 'hyperbola', 'circle', 'locus', 'coordinate', 'slope',
    'continuity', 'differentiable', 'maxima', 'minima', 'set', 'relation', 'theorem',
    'injective', 'surjective', 'bijective', 'aperiodic', 'real valued function',
  ],
  biology: [
    'cell', 'tissue', 'organ', 'enzyme', 'protein', 'dna', 'rna', 'chromosome', 'gene',
    'mitosis', 'meiosis', 'photosynthesis', 'respiration', 'glycolysis', 'krebs',
    'hormone', 'neuron', 'nephron', 'digestion', 'circulation', 'heart', 'blood',
    'reproduction', 'gamete', 'pollination', 'fertilisation', 'genetics', 'inheritance',
    'evolution', 'ecosystem', 'biodiversity', 'species', 'taxonomy', 'pcr',
    'recombinant', 'plant', 'animal', 'organism',
  ],
}

/**
 * Curated synonyms that strongly point at a specific chapter (in addition to the
 * chapter/topic names auto-derived from the tree). Keys are "subject::chapter".
 */
const CHAPTER_HINTS = {
  'physics::Electrostatics': ['capacitor', 'capacitance', 'coulomb', 'electric field', 'electric potential', 'charge', 'dielectric'],
  'physics::Current Electricity': ['resistance', 'resistor', 'ohm', 'current', 'kirchhoff', 'wheatstone', 'emf', 'cell', 'circuit'],
  'physics::Electromagnetic Induction': ['faraday', 'lenz', 'induced', 'inductance', 'flux'],
  'physics::AC Circuits': ['alternating', 'phasor', 'lcr', 'reactance', 'impedance'],
  'physics::Magnetic Effects': ['biot', 'savart', 'magnetic field', 'solenoid', 'ampere'],
  'physics::Kinematics': ['velocity', 'acceleration', 'displacement', 'projectile', 'relative velocity'],
  'physics::Laws of Motion': ['newton', 'friction', 'tension', 'normal force', 'free body'],
  'physics::Work, Energy & Power': ['work done', 'kinetic energy', 'potential energy', 'power', 'collision'],
  'physics::Rotation': ['torque', 'angular momentum', 'moment of inertia', 'rolling'],
  'physics::Gravitation': ['gravitation', 'kepler', 'orbit', 'satellite', 'escape velocity'],
  'physics::Simple Harmonic Motion': ['shm', 'pendulum', 'oscillation', 'spring constant'],
  'physics::Ray Optics': ['lens', 'mirror', 'refraction', 'reflection', 'focal length', 'prism'],
  'physics::Wave Optics': ['interference', 'diffraction', 'polarisation', 'young', 'fringe'],
  'physics::Photoelectric Effect': ['photoelectric', 'photon', 'work function', 'stopping potential'],
  'physics::Atoms & Nuclei': ['bohr', 'nucleus', 'radioactive', 'half life', 'isotope', 'decay'],
  'physics::Kinetic Theory': ['ideal gas', 'rms speed', 'mean free path', 'degrees of freedom'],
  'physics::Laws of Thermodynamics': ['entropy', 'isothermal', 'adiabatic', 'carnot', 'heat engine'],

  'chemistry::Atomic Structure': ['quantum number', 'orbital', 'electronic configuration', 'bohr', 'de broglie'],
  'chemistry::Chemical Bonding': ['covalent', 'ionic bond', 'vsepr', 'hybridisation', 'hybridization', 'bond angle'],
  'chemistry::Equilibrium': ['equilibrium constant', 'le chatelier', 'kp', 'kc'],
  'chemistry::Ionic Equilibrium': ['ph', 'buffer', 'ka', 'kb', 'hydrolysis', 'solubility product'],
  'chemistry::Electrochemistry': ['nernst', 'electrode potential', 'galvanic', 'electrolysis', 'cell potential'],
  'chemistry::Chemical Kinetics': ['rate constant', 'order of reaction', 'activation energy', 'half life'],
  'chemistry::Thermodynamics': ['enthalpy', 'gibbs', 'entropy', 'spontaneous'],
  'chemistry::Periodic Table': ['periodic table', 'ionisation energy', 'electronegativity', 'atomic radius'],
  'mathematics::Sets & Relations': [
    'injective',
    'surjective',
    'bijective',
    'real valued function',
    'odd function',
    'even function',
    'aperiodic',
    'periodic function',
    'one-one',
    'onto',
  ],
  'chemistry::Coordination Compounds': ['ligand', 'coordination', 'crystal field', 'complex ion'],
  'chemistry::Hydrocarbons': ['alkane', 'alkene', 'alkyne', 'benzene', 'aromatic'],
  'chemistry::Aldehydes & Ketones': ['aldehyde', 'ketone', 'aldol', 'carbonyl'],
  'chemistry::Alcohols, Phenols & Ethers': ['alcohol', 'phenol', 'ether'],
  'chemistry::Amines': ['amine', 'diazonium', 'amino'],

  'mathematics::Matrices & Determinants': ['matrix', 'matrices', 'determinant', 'adjoint', 'cofactor'],
  'mathematics::Complex Numbers': ['complex number', 'iota', 'modulus', 'argument', 'de moivre'],
  'mathematics::Quadratic Equations': ['quadratic', 'discriminant', 'roots of the equation'],
  'mathematics::Sequences & Series': ['arithmetic progression', 'geometric progression', 'common difference', 'common ratio'],
  'mathematics::Binomial Theorem': ['binomial', 'coefficient', 'general term', 'middle term'],
  'mathematics::Permutations & Combinations': ['permutation', 'combination', 'arrangements', 'ways'],
  'mathematics::Limits': ['limit', "l'hopital", 'lim'],
  'mathematics::Differentiation': ['derivative', 'differentiate', 'differentiable'],
  'mathematics::Integration': ['integral', 'integrate', 'antiderivative'],
  'mathematics::Applications of Derivatives': ['maxima', 'minima', 'monotonic', 'increasing function'],
  'mathematics::Differential Equations': ['differential equation', 'order and degree'],
  'mathematics::Probability': ['probability', 'bayes', 'conditional probability'],
  'mathematics::Circles': ['circle', 'radius', 'tangent to the circle'],
  'mathematics::Parabola': ['parabola', 'focus', 'directrix', 'latus rectum'],
  'mathematics::Straight Lines': ['slope', 'straight line', 'collinear'],
}

/** @param {string} s */
function clean(s) {
  return String(s ?? '')
    // strip simple LaTeX commands/markup so words survive
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}$^_\\]/g, ' ')
    .toLowerCase()
}

/**
 * Count whole-word / phrase occurrences of `term` in `text`.
 * @param {string} text already lowercased
 * @param {string} term lowercased
 */
function hits(text, term) {
  if (!term) return 0
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundary = /[a-z0-9]$/.test(term) ? '\\b' : ''
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}${boundary}`, 'g')
  const m = text.match(re)
  return m ? m.length : 0
}

/** Tokenise a tree label into significant keywords. */
function labelTokens(label) {
  return clean(label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

/**
 * @param {{ text?: string, options?: string[], allowedSubjects?: string[] }} input
 * @returns {{ subject?: string, section?: string, chapter?: string, topic?: string,
 *   toughnessLevel?: number, confidence: number }}
 */
export function autoClassifyQuestion(input = {}) {
  const raw = [input.text ?? '', ...(input.options ?? [])].join('  ')
  const text = ` ${clean(raw)} `
  const empty = { confidence: 0 }
  if (text.trim().length < 4) return empty

  const allowed =
    input.allowedSubjects?.length
      ? input.allowedSubjects.filter((s) => CURRICULUM_TREE[s])
      : Object.keys(CURRICULUM_TREE)

  // ---- 1. Subject ----
  const subjectScores = {}
  for (const subj of allowed) {
    const kws = SUBJECT_KEYWORDS[subj] ?? []
    let score = 0
    for (const kw of kws) score += hits(text, kw) * (kw.includes(' ') ? 2 : 1)
    subjectScores[subj] = score
  }
  const subjRanked = Object.entries(subjectScores).sort((a, b) => b[1] - a[1])
  const [topSubj, topScore] = subjRanked[0] ?? []
  const secondScore = subjRanked[1]?.[1] ?? 0
  // Need a clear winner to commit to a subject.
  const subject = topScore >= 2 && topScore > secondScore ? topSubj : undefined

  // ---- 2. Chapter (within best subject, else scan allowed subjects) ----
  const subjectsToScan = subject ? [subject] : allowed
  let best = null // { subject, section, chapter, score }
  for (const subj of subjectsToScan) {
    const tree = CURRICULUM_TREE[subj]
    if (!tree) continue
    for (const section of Object.keys(tree)) {
      for (const chapter of Object.keys(tree[section])) {
        let score = 0
        // chapter name tokens
        for (const tok of labelTokens(chapter)) score += hits(text, tok) * 2
        // topic tokens (weaker)
        for (const topic of tree[section][chapter]) {
          for (const tok of labelTokens(topic)) score += hits(text, tok)
        }
        // curated hints (strongest)
        for (const hint of CHAPTER_HINTS[`${subj}::${chapter}`] ?? []) {
          score += hits(text, hint) * 3
        }
        if (score > 0 && (!best || score > best.score)) {
          best = { subject: subj, section, chapter, score }
        }
      }
    }
  }

  /** @type {{ subject?: string, section?: string, chapter?: string, topic?: string, toughnessLevel?: number, confidence: number }} */
  const result = { confidence: 0 }

  if (best && best.score >= 2) {
    result.subject = best.subject
    result.section = best.section
    result.chapter = best.chapter
    // best matching topic inside the chapter
    const topics = CURRICULUM_TREE[best.subject][best.section][best.chapter]
    let topicBest = null
    for (const topic of topics) {
      let s = 0
      for (const tok of labelTokens(topic)) s += hits(text, tok)
      if (s > 0 && (!topicBest || s > topicBest.s)) topicBest = { topic, s }
    }
    if (topicBest) result.topic = topicBest.topic
    result.confidence = Math.min(1, best.score / 8)
  } else if (subject) {
    result.subject = subject
    result.confidence = Math.min(0.5, topScore / 8)
  }

  result.toughnessLevel = estimateToughness(input)
  return result
}

/**
 * Rough difficulty guess (1 easiest – 10 hardest). Text alone can't be precise,
 * so this stays conservative around the medium band and only nudges on clear
 * signals (length, multi-step phrasing, math density, question type).
 * @param {{ text?: string, options?: string[], questionType?: string }} input
 */
export function estimateToughness(input = {}) {
  const stem = String(input.text ?? '')
  const lower = stem.toLowerCase()
  let score = 4

  const words = stem.split(/\s+/).filter(Boolean).length
  if (words > 45) score += 2
  else if (words > 28) score += 1
  else if (words < 12) score -= 1

  // math / symbol density
  const mathTokens = (stem.match(/[=+\-*/^∫∑√π]|\\frac|\\int|\\sum|\\sqrt/g) ?? []).length
  if (mathTokens >= 6) score += 2
  else if (mathTokens >= 3) score += 1

  // multi-step / reasoning cues
  if (/\b(hence|therefore|then find|prove that|show that|assertion|reason)\b/.test(lower)) score += 1
  if (/\b(both|all of the following|which of the following are)\b/.test(lower)) score += 1

  // question type
  if (input.questionType === 'multiple_correct') score += 1
  else if (input.questionType === 'matrix_match') score += 2
  else if (input.questionType === 'integer' || input.questionType === 'numerical') score += 1

  return Math.max(1, Math.min(9, Math.round(score)))
}
