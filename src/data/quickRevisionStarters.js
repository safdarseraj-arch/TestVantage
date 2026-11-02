/**
 * Built-in Quick Revision starters. Keys: subject::chapter (curriculum.js names).
 */

export const RICH_REVISION_PACKS = {
  'physics::Kinematics': {
    d: [
      ['Displacement', 'Shortest directed change of position - a vector. Distance is the path length (scalar).'],
      ['Average velocity', 'Total displacement divided by total time.'],
      ['Projectile motion', 'Motion under constant g with no air resistance; horizontal velocity stays constant.'],
    ],
    f: [
      ['SUVAT (constant a)', 'v = u + at', 'Also s = ut + (1/2) at^2 and v^2 = u^2 + 2as.'],
      ['Range (level ground)', 'R = \\frac{u^2\\sin 2\\theta}{g}', 'Max range at 45 degrees for a given u.'],
      ['Time of flight', 'T = \\frac{2u\\sin\\theta}{g}', 'Symmetric about the top if launch and land at same height.'],
      ['Relative velocity', '\\vec v_{AB} = \\vec v_A - \\vec v_B', 'Rain-man and river-boat problems use this.'],
    ],
    p: [
      'Graphs: slope of x-t is v; slope of v-t is a; area under v-t is displacement.',
      'JEE Advanced: two-dimensional relative motion and projectiles from a height.',
      'NEET: standard projectile formulae and the distinction between speed and velocity.',
    ],
    e: [
      ['Complementary angles', 'R(\\theta) = R(90^\\circ - \\theta)', 'Same range for complementary launch angles (level ground).'],
      ['Range from a height', 'R = u\\cos\\theta\\,\\frac{u\\sin\\theta + \\sqrt{(u\\sin\\theta)^2 + 2gh}}{g}', 'Landing below the launch point.'],
      ['Relative rain', '\\vec v_{rain,man} = \\vec v_{rain} - \\vec v_{man}', 'Umbrella along the relative velocity.'],
    ],
  },
  'physics::Electrostatics': {
    d: [
      ['Coulomb law', 'Force between two point charges is along the line joining them and proportional to q1 q2 / r^2.'],
      ['Electric field', 'Force per unit positive test charge: E = F/q0.'],
      ['Potential', 'Work per unit charge to bring a charge from infinity, slowly, without KE change.'],
    ],
    f: [
      ['Coulomb force', 'F = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q_1 q_2}{r^2}', 'k is about 9e9 N m^2 C^{-2}.'],
      ['Point charge field', 'E = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r^2}', 'Radial; superposition for many charges.'],
      ['Capacitance', 'C = Q/V', 'Energy = (1/2) CV^2 = Q^2/2C.'],
      ['Gauss', '\\oint \\vec E\\cdot d\\vec A = Q_{encl}/\\varepsilon_0', 'Use symmetry: sphere, infinite sheet, line.'],
    ],
    p: [
      'E = -grad V. Equipotential surfaces are perpendicular to field lines.',
      'Dielectric: C becomes kappa C if the capacitor stays on a battery; Q stays if isolated.',
      'JEE Advanced: image charges and mixed capacitors; NEET: Gauss + capacitor combinations.',
    ],
  },
  'physics::Ray Optics': {
    d: [
      ['Reflection', 'i = r; plane-mirror image is virtual, erect, same size.'],
      ['Refraction', 'Light bends toward the normal when it enters a denser medium (Snell).'],
      ['Focal length', 'Distance from optical centre (lens) or pole (mirror) to the principal focus.'],
    ],
    f: [
      ['Snell', 'n_1\\sin i = n_2\\sin r', 'Critical angle: sin c = n2/n1 for TIR (n1 > n2).'],
      ['Mirror / lens formula', '\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}', 'Cartesian sign convention.'],
      ['Magnification', 'm = h_i/h_o = v/u', 'Negative m means inverted.'],
    ],
    p: [
      'Draw a ray diagram before plugging numbers; sign errors are the main trap.',
      'TIR needs i > c and light going from denser to rarer.',
      'NEET: microscope and telescope; JEE: lens combinations and silvered lenses.',
    ],
  },
  'chemistry::Atomic Structure': {
    d: [
      ['Quantum numbers', 'n, l, m_l, m_s uniquely label an electron in an atom.'],
      ['Orbital', 'Region with a high probability of finding an electron; holds two electrons of opposite spin.'],
      ['Photoelectric', 'Photons of energy h nu eject electrons if h nu is at least the work function.'],
    ],
    f: [
      ['Bohr energy', 'E_n = -13.6\\,\\mathrm{eV}\\,\\frac{Z^2}{n^2}', 'Hydrogen-like ions only.'],
      ['de Broglie', '\\lambda = h/p', 'For an electron accelerated by V: h / sqrt(2 m e V).'],
      ['Rydberg', '\\frac{1}{\\lambda} = R Z^2\\left(\\frac{1}{n_1^2}-\\frac{1}{n_2^2}\\right)', 'Lyman n1=1, Balmer n1=2.'],
    ],
    p: [
      'Aufbau, Hund, and Pauli decide ground-state configurations - watch Cr and Cu exceptions.',
      'Nodes: radial n-l-1, angular l.',
      'NEET quotes NCERT tables; JEE Advanced mixes spectra with quantum numbers.',
    ],
  },
  'chemistry::Equilibrium': {
    d: [
      ['Chemical equilibrium', 'Forward and reverse rates are equal; concentrations stay constant (dynamic).'],
      ['Le Chatelier', 'A system at equilibrium opposes an imposed change (concentration, P, T).'],
      ['K vs Q', 'Q uses current concentrations; K is Q at equilibrium. Q < K means forward.'],
    ],
    f: [
      ['K_c', 'K_c = \\frac{[C]^c[D]^d}{[A]^a[B]^b}', 'Solids and pure liquids omitted.'],
      ['K_p', 'K_p = K_c (RT)^{\\Delta n_g}', 'Delta n_g = gas products minus gas reactants.'],
    ],
    p: [
      'Catalyst does not change K - only how fast equilibrium is reached.',
      'Inert gas at constant volume does not shift Kc equilibria.',
      'Do not mix Kw (ionic) with Kc blindly.',
    ],
  },
  'mathematics::Quadratic Equations': {
    d: [
      ['Quadratic', 'ax^2 + bx + c = 0 with a not zero.'],
      ['Discriminant', 'D = b^2 - 4ac. Sign of D decides nature of roots (over reals).'],
      ['Formation', 'If roots are alpha, beta then x^2 - (sum)x + product = 0 (monic).'],
    ],
    f: [
      ['Roots', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'Sum = -b/a, product = c/a.'],
      ['Nature', 'D>0 real distinct; D=0 real equal; D<0 complex conjugate', 'For a,b,c real.'],
    ],
    p: [
      'If D is a perfect square and a,b,c rational, roots are rational.',
      'Both roots positive: sum > 0, product > 0, D >= 0, a and c same sign.',
      'JEE Advanced: location of roots and common-root conditions.',
    ],
    e: [
      ['Common root', 'a_1/a_2 = b_1/b_2 \\neq c_1/c_2 \\text{ is not enough; use } a_1\\alpha^2+b_1\\alpha+c_1=0', 'Condition for one common root of two quadratics.'],
      ['Both roots in (p,q)', 'D \\ge 0,\\ af(p)>0,\\ af(q)>0,\\ p < -b/(2a) < q', 'Sign of a and vertex location.'],
    ],
  },
  'mathematics::Sequences & Series': {
    d: [
      ['AP', 'Arithmetic progression: constant difference d.'],
      ['GP', 'Geometric progression: constant ratio r.'],
      ['HP', 'Harmonic: reciprocals form an AP.'],
    ],
    f: [
      ['AP nth term', 'a_n = a + (n-1)d', 'S_n = n/2 [2a + (n-1)d].'],
      ['GP nth term', 'a_n = a r^{n-1}', 'Infinite |r|<1: S = a/(1-r).'],
      ['Sum of first n naturals', '\\sum k = \\frac{n(n+1)}{2}', 'Sigma k^2 = n(n+1)(2n+1)/6.'],
    ],
    p: [
      'AM >= GM >= HM for positive numbers, equality iff all equal.',
      'Inserting n means between a and b in AP: d = (b-a)/(n+1).',
      'JEE chapter; not in NEET.',
    ],
  },
  'mathematics::Applications of Derivatives': {
    d: [
      ['Monotonicity', 'f\' >= 0 on an interval means increasing.'],
      ['Critical point', 'f\' = 0 or f\' undefined (in the domain).'],
      ['Tangent', 'Line through (x0, f(x0)) with slope f\'(x0).'],
    ],
    f: [
      ['Tangent', 'Y - y_0 = f\'(x_0)(X - x_0)', 'Normal slope is -1/f\'(x0) if f\' is not 0.'],
      ['MVT', 'f\'(c) = \\frac{f(b)-f(a)}{b-a}', 'Rolle is the special case f(a)=f(b).'],
    ],
    p: [
      'On a closed interval, check critical points and endpoints for absolute max/min.',
      'Related rates: dy/dt = (dy/dx)(dx/dt).',
      'JEE Main regular: Rolle and Lagrange MVT.',
    ],
  },
  'botany::Photosynthesis': {
    d: [
      ['Photosynthesis', 'Green plants convert CO2 and water to carbohydrate using light; O2 is released from water.'],
      ['Light reaction', 'Thylakoid: photolysis of water, ATP, NADPH.'],
      ['Calvin cycle', 'Stroma: CO2 fixation by RuBisCO; needs ATP and NADPH.'],
    ],
    f: [
      ['Overall', '6\\,\\mathrm{CO_2} + 6\\,\\mathrm{H_2O} \\xrightarrow{light} \\mathrm{C_6H_{12}O_6} + 6\\,\\mathrm{O_2}', 'Water is the source of evolved oxygen.'],
    ],
    p: [
      'C3 vs C4: C4 has Kranz anatomy and PEP carboxylase.',
      'NCERT graphs of action vs absorption spectrum are NEET favourites.',
      'Blackman law of limiting factors: light, CO2, temperature.',
    ],
  },
  'zoology::Circulation': {
    d: [
      ['Double circulation', 'Pulmonary and systemic circuits in a four-chambered heart.'],
      ['Cardiac cycle', 'Atrial systole, ventricular systole, joint diastole (about 0.8 s at 72/min).'],
      ['ECG', 'P wave atrial depolarisation; QRS ventricular depolarisation; T ventricular repolarisation.'],
    ],
    f: [
      ['Cardiac output', 'CO = \\text{stroke volume} \\times \\text{heart rate}', 'About 5 L/min at rest.'],
    ],
    p: [
      'SA node is the pacemaker; AV node delays so atria empty first.',
      'Typical BP 120/80 mm Hg; pulse pressure = systolic - diastolic.',
      'NEET: quote NCERT diagrams and vessel names.',
    ],
  },
  'biology::Mendelian Genetics': {
    d: [
      ['Allele', 'Alternative form of a gene. Genotype is the pair; phenotype is the trait.'],
      ['Segregation', 'The two alleles separate at gamete formation; each gamete gets one.'],
      ['Independent assortment', 'Unlinked genes assort independently.'],
    ],
    f: [
      ['Monohybrid F2', '3:1 \\text{ phenotype}', 'Genotype 1:2:1.'],
      ['Dihybrid F2', '9:3:3:1', 'Two genes, independent assortment.'],
    ],
    p: [
      'Test cross: unknown x recessive; 1:1 means heterozygous.',
      'Linkage reduces recombinants.',
      'NEET: pedigree charts and NCERT examples.',
    ],
  },
}

const EXAM_POINTS = {
  'jee-main':
    'JEE Main: keep the standard formula, SI units, and one typical numerical pattern for this chapter.',
  'jee-advanced':
    'JEE Advanced: mix two ideas from this chapter (or a neighbour chapter) and watch multi-correct wording.',
  neet: 'NEET: prefer NCERT statements, diagrams, and exceptions; numbers are usually direct formula plugs.',
}

function labelSubject(subject) {
  const s = String(subject || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function starterMeaning(subject, chapter, topic) {
  if (subject === 'mathematics') {
    return `${topic} in ${chapter}: write the definition, the standard formula, and the condition when it applies.`
  }
  if (subject === 'physics') {
    return `${topic}: know the statement, SI unit, and the formula you would use in a JEE/NEET numerical.`
  }
  if (subject === 'chemistry') {
    return `${topic}: NCERT definition, conditions, and the reaction or equation you must not mix up.`
  }
  return `${topic} (${labelSubject(subject)} · ${chapter}): NCERT wording plus one diagram or table to recall.`
}

function escapeLatexText(s) {
  return String(s ?? '').replace(/\\/g, '').replace(/[{}]/g, '')
}

function starterFormulas(subject, chapter, topics) {
  const extra = (topics ?? []).slice(0, 3).map((t) => ({
    name: t,
    latex: `\\text{${escapeLatexText(t)} formula as taught in ${escapeLatexText(chapter)}}`,
    note: subject === 'mathematics' || subject === 'physics' ? 'Keep symbols defined.' : 'Name the conditions.',
  }))
  if (extra.length) return extra
  return [
    {
      name: `Key relation - ${chapter}`,
      latex: '\\text{write the standard equation from NCERT / class notes}',
      note: 'Generate with AI completes a full formula list.',
    },
  ]
}

/**
 * @param {string} subject
 * @param {string} chapter
 * @param {string[]} topics
 * @param {string} examId
 */
export function buildStarterPack(subject, chapter, topics, examId) {
  const key = `${subject}::${chapter}`
  const rich = RICH_REVISION_PACKS[key]
  const definitions = rich ? rich.d.map(([term, meaning]) => ({ term, meaning })) : []
  const seen = new Set(definitions.map((d) => d.term.toLowerCase()))
  for (const topic of topics ?? []) {
    if (!topic || seen.has(topic.toLowerCase())) continue
    seen.add(topic.toLowerCase())
    definitions.push({
      term: topic,
      meaning: starterMeaning(subject, chapter, topic),
    })
  }
  if (!definitions.length) {
    definitions.push({
      term: chapter,
      meaning: `Core ideas of ${chapter} for ${labelSubject(subject)}. Learn the definition, the standard formula, and one exam trap.`,
    })
  }
  const formulas = rich
    ? rich.f.map(([name, latex, note]) => ({ name, latex, note: note || '' }))
    : starterFormulas(subject, chapter, topics)
  const extraFormulas = rich?.e
    ? rich.e.map(([name, latex, note]) => ({ name, latex, note: note || '' }))
    : [
        {
          name: `Special case - ${chapter}`,
          latex: '\\text{less-common or trick formula for this chapter}',
          note: 'Generate with AI fills JEE/NEET extras, limits, and special cases.',
        },
      ]
  const points = [
    ...(rich?.p ?? [
      `Revise ${chapter} in this order: definitions, then standard formulas, then extra formulas, then pitfalls.`,
    ]),
    EXAM_POINTS[examId] ?? EXAM_POINTS['jee-main'],
  ]
  return { definitions, formulas, extraFormulas, points }
}
