/**
 * Realistic full-size Official PYQ pending paper (JEE Advanced shape, 51 cards).
 *
 * Used by scripts/test-approve-publish-performance.mjs. The stored cards are
 * deliberately "as extracted": the four match-the-column physics cards (Q31-Q34)
 * keep only List-II, so the approve path has to heal List-I back out of the OCR
 * — the same work the real Approve & Publish click does.
 *
 * Nothing here is used as real question content; it is a shape/size fixture.
 */

const PHYSICS_MATCH_LISTS = [
  {
    intro: 'A thin uniform rod of mass $M$ and length $L$ is pivoted at one end and released from the horizontal position.',
    listI: [
      '(P) The angular acceleration just after release is',
      '(Q) The angular speed when the rod is vertical is',
      '(R) The force on the pivot just after release is',
      '(S) The kinetic energy when the rod is vertical is',
    ],
    listII: [
      '(1) $\\frac{3 g}{2 L}$',
      '(2) $\\sqrt{\\frac{3 g}{L}}$',
      '(3) $\\frac{M g}{4}$',
      '(4) $\\frac{M g L}{2}$',
      '(5) $\\frac{2 M g L}{3}$',
    ],
  },
  {
    intro: 'One mole of an ideal monatomic gas is taken through the cycle $A \\rightarrow B \\rightarrow C \\rightarrow A$ shown in the figure.',
    listI: [
      '(P) The work done by the gas in $A \\rightarrow B$ is',
      '(Q) The heat absorbed in $B \\rightarrow C$ is',
      '(R) The change in internal energy in $C \\rightarrow A$ is',
      '(S) The net work done in one cycle is',
    ],
    listII: [
      '(1) $R T_{0} \\ln 2$',
      '(2) $3 R T_{0}$',
      '(3) $\\frac{R T_{0}}{2}$',
      '(4) $2 R T_{0}$',
      '(5) $0$',
    ],
  },
  {
    intro: 'The circuit shown in the figure contains three capacitors of capacitance $C_{0}$ each and an ideal battery of emf $V_{0}$.',
    listI: [
      '(P) The equivalent capacitance across the battery is',
      '(Q) The charge on the capacitor nearest the battery is',
      '(R) The energy stored in the middle capacitor is',
      '(S) The potential difference across the last capacitor is',
    ],
    listII: [
      '(1) $3 C_{0}$',
      '(2) $\\frac{C_{0}}{2}$',
      '(3) $\\frac{C_{0}}{3}$',
      '(4) $\\frac{2 C_{0}}{3}$',
      '(5) $2 C_{0}$',
    ],
  },
  {
    intro: 'A monochromatic light ray is incident on a prism of refracting angle $A=60^{\\circ}$ whose second face carries a reflecting coating.',
    listI: [
      '(P) The number of totally internally reflected rays is',
      '(Q) The number of rays emerging from the second face is',
      '(R) The number of rays absorbed by the coating is',
      '(S) The number of rays retracing the incident path is',
    ],
    listII: ['(1) $0$', '(2) $2$', '(3) $4$', '(4) $20$', '(5) $200$'],
  },
]

/** Each match question carries its own mapping options, as in a real paper. */
const MATCH_OPTION_SETS = [
  [
    [2, 4, 1, 5],
    [2, 4, 3, 5],
    [1, 5, 3, 4],
    [3, 2, 4, 1],
  ],
  [
    [4, 1, 2, 3],
    [4, 1, 3, 2],
    [3, 5, 1, 2],
    [1, 3, 5, 4],
  ],
  [
    [3, 2, 5, 1],
    [3, 5, 2, 1],
    [5, 2, 1, 4],
    [2, 1, 4, 3],
  ],
  [
    [1, 3, 4, 2],
    [1, 4, 3, 2],
    [4, 3, 2, 5],
    [5, 1, 2, 3],
  ],
  [
    [5, 1, 3, 4],
    [5, 3, 1, 4],
    [2, 4, 5, 1],
    [4, 5, 1, 2],
  ],
]

function matchOptions(setIndex) {
  const rows = MATCH_OPTION_SETS[setIndex % MATCH_OPTION_SETS.length]
  return rows.map(
    (m, i) =>
      `(${'ABCD'[i]}) $\\mathrm{P} \\rightarrow ${m[0]}, \\mathrm{Q} \\rightarrow ${m[1]}, \\mathrm{R} \\rightarrow ${m[2]}, \\mathrm{~S} \\rightarrow ${m[3]}$`,
  )
}

/** Chemistry reaction-sequence match card sitting just before the physics block. */
const CHEM_SMILES_LISTS = {
  intro:
    'List-I contains various reaction sequences and List-II contains the possible products. Match each entry in List-I with the appropriate entry in List-II and choose the correct option.',
  listI: [
    '(P) Cyclopentanone, then $\\mathrm{NaBH}_{4}$, then $\\mathrm{H}_{3} \\mathrm{O}^{+}$',
    '(Q) Cyclopentanol, then $\\mathrm{PCC}, \\mathrm{CH}_{2} \\mathrm{Cl}_{2}$',
    '(R) 2-Methylcyclopentanone, then $\\mathrm{LiAlH}_{4}$',
    '(S) Cyclopentane carbaldehyde, then $\\mathrm{NaBH}_{4}$',
  ],
  listII: [
    '(1) <smiles>CC1C(O)CCC1CO</smiles>',
    '(2) <smiles>CC1C(O)CCC1C=O</smiles>',
    '(3) <smiles>O=C1CCCC1CO</smiles>',
    '(4) <smiles>CC1CCCC1CO</smiles>',
    '(5) <smiles>OC1CCCC1</smiles>',
  ],
}

const PHYSICS_STEMS = [
  (n) =>
    `A block of mass $m_{${n}}=${n} \\mathrm{~kg}$ rests on a rough inclined plane of inclination $\\theta=${20 + (n % 4) * 5}^{\\circ}$. The coefficient of static friction between the block and the incline is $\\mu_{s}=0.${3 + (n % 5)}$ and the coefficient of kinetic friction is $\\mu_{k}=0.${2 + (n % 4)}$. A horizontal force $F$ is applied on the block so that it is on the verge of sliding up the incline. Taking $g=10 \\mathrm{~m} \\mathrm{~s}^{-2}$, the magnitude of $F$ is closest to`,
  (n) =>
    `A particle of charge $q_{${n}}=${n} \\mu \\mathrm{C}$ and mass $m=${n} \\times 10^{-6} \\mathrm{~kg}$ enters a uniform magnetic field $\\vec{B}=B_{0} \\hat{k}$ with velocity $\\vec{v}=v_{0}(\\hat{i}+\\hat{j})$. The radius of the resulting helical path, in terms of $v_{0}$, $B_{0}$ and the given data, is proportional to $\\frac{m v_{0}}{q B_{0}}$. The pitch of the helix is`,
  (n) =>
    `Two coherent monochromatic sources $S_{1}$ and $S_{2}$ of wavelength $\\lambda_{${n}}=${400 + n * 5} \\mathrm{~nm}$ are separated by a distance $d=${n} \\lambda$. A screen is placed at a distance $D \\gg d$ from the sources. The total number of maxima observed on the screen is`,
  (n) =>
    `A thermally insulated container is divided into two equal halves by a partition. One half contains $n_{${n}}=${n}$ moles of an ideal diatomic gas at temperature $T_{0}$ and the other half is evacuated. The partition is removed and the gas expands freely. The change in entropy of the gas is`,
]

const CHEMISTRY_STEMS = [
  (n) =>
    `The molar conductivity of a $0.0${n} \\mathrm{~M}$ aqueous solution of a weak monobasic acid $\\mathrm{HA}_{${n}}$ is $\\Lambda_{m}=${n * 3} \\mathrm{~S} \\mathrm{~cm}^{2} \\mathrm{~mol}^{-1}$, while the limiting molar conductivity is $\\Lambda_{m}^{\\circ}=${n * 3 + 350} \\mathrm{~S} \\mathrm{~cm}^{2} \\mathrm{~mol}^{-1}$. The dissociation constant $K_{a}$ of the acid is closest to`,
  (n) =>
    `For the complex $\\left[\\mathrm{M}_{${n}}\\left(\\mathrm{NH}_{3}\\right)_{4} \\mathrm{Cl}_{2}\\right]^{+}$, where the metal ion has a $d^{${3 + (n % 5)}}$ configuration in an octahedral field, the number of unpaired electrons in the low-spin configuration and the number of geometrical isomers are respectively`,
  (n) =>
    `An organic compound weighing $${n} \\mathrm{~g}$ and containing carbon, hydrogen and oxygen on complete combustion gives $\\mathrm{CO}_{2}$ and $\\mathrm{H}_{2} \\mathrm{O}$ in the mass ratio $${n + 1}: ${n}$. The empirical formula of the compound is`,
  (n) =>
    `The equilibrium constant for the reaction $\\mathrm{A}_{${n}}(g)+\\mathrm{B}(g) \\rightleftharpoons 2 \\mathrm{C}(g)$ is $K_{p}=${n}.0$ at $T=${273 + n * 5} \\mathrm{~K}$. Starting from equimolar amounts of $\\mathrm{A}$ and $\\mathrm{B}$ at a total pressure of $1 \\mathrm{~bar}$, the partial pressure of $\\mathrm{C}$ at equilibrium is`,
]

const MATHS_STEMS = [
  (n) =>
    `Let $f_{${n}}:\\mathbb{R} \\rightarrow \\mathbb{R}$ be defined by $f_{${n}}(x)=x^{3}-${n} x+\\sin \\left(${n} x\\right)$. If $g$ denotes the inverse of $f_{${n}}$ on the interval where $f_{${n}}$ is strictly increasing, then $g^{\\prime}(0)$ is equal to`,
  (n) =>
    `Consider the matrix $A_{${n}}=\\left[\\begin{array}{ccc}${n} & 1 & 0 \\\\ 0 & ${n} & 1 \\\\ 1 & 0 & ${n}\\end{array}\\right]$. If $\\operatorname{adj}\\left(A_{${n}}\\right)$ denotes the adjugate, then $\\operatorname{det}\\left(\\operatorname{adj}\\left(A_{${n}}\\right)\\right)$ equals`,
  (n) =>
    `The value of the definite integral $\\int_{0}^{\\pi / 2} \\frac{\\sin ^{${n}} x}{\\sin ^{${n}} x+\\cos ^{${n}} x} d x$ is equal to`,
  (n) =>
    `Let $z_{${n}}$ be a complex number satisfying $\\left|z_{${n}}-${n}\\right|=\\left|z_{${n}}+${n} i\\right|$ and $\\arg \\left(z_{${n}}\\right)=\\frac{\\pi}{${3 + (n % 3)}}$. Then $\\left|z_{${n}}\\right|^{2}$ is equal to`,
]

const NUMERIC_TAIL =
  '\n\nGive the numerical answer correct to two decimal places.'

/**
 * Long trailing prose, the way a real Mathpix stem carries the "Given:" block.
 * Keeps the fixture the size of a real paper without adding figure markup that
 * the heal chain would try to re-home between cards.
 */
const GIVEN_BLOCK = (n) =>
  `Given: $\\hbar=1.05 \\times 10^{-34} \\mathrm{~J} \\mathrm{~s}$, $e=1.6 \\times 10^{-19} \\mathrm{C}$, $m_{e}=9.1 \\times 10^{-31} \\mathrm{~kg}$, $\\varepsilon_{0}=8.85 \\times 10^{-12} \\mathrm{C}^{2} \\mathrm{~N}^{-1} \\mathrm{~m}^{-2}$ and $N_{A}=6.02 \\times 10^{23} \\mathrm{~mol}^{-1}$. Neglect all dissipative effects unless stated otherwise, and take the ambient temperature to be $${273 + n} \\mathrm{~K}$ throughout the calculation.`

function plainOptions(n) {
  return [
    `(A) $${n}$`,
    `(B) $${n + 1}$`,
    `(C) $\\frac{${n}}{2}$`,
    `(D) $${n} \\sqrt{2}$`,
  ]
}

/** Which 1-based slots are match-the-column cards. */
export const PHYSICS_MATCH_SLOTS = [31, 32, 33, 34]
export const CHEM_SMILES_MATCH_SLOT = 30
/** This one is stored with List-I already present; the other three must be healed. */
export const LIST_I_INTACT_MATCH_SLOT = 34

function subjectForSlot(n) {
  if (PHYSICS_MATCH_SLOTS.includes(n)) return 'physics'
  if (n <= 17) return 'physics'
  if (n <= 34) return 'chemistry'
  return 'mathematics'
}

function stemForSlot(n) {
  const subject = subjectForSlot(n)
  const pool =
    subject === 'physics' ? PHYSICS_STEMS : subject === 'chemistry' ? CHEMISTRY_STEMS : MATHS_STEMS
  const body = pool[n % pool.length](n)
  const withGiven = n % 3 === 0 ? `${body}\n\n${GIVEN_BLOCK(n)}` : body
  return n % 5 === 0 ? `${withGiven}${NUMERIC_TAIL}` : withGiven
}

function matchIntroFor(n) {
  const lists = PHYSICS_MATCH_LISTS[PHYSICS_MATCH_SLOTS.indexOf(n)]
  return `${lists.intro} Match each entry in List-I to the correct entry in List-II and choose the correct option.`
}

/** Full OCR text for one slot, exactly as Mathpix would emit it (both lists present). */
function ocrBlockForSlot(n) {
  if (PHYSICS_MATCH_SLOTS.includes(n)) {
    const lists = PHYSICS_MATCH_LISTS[PHYSICS_MATCH_SLOTS.indexOf(n)]
    return [
      `Q. ${n} ${matchIntroFor(n)}`,
      'List-I',
      ...lists.listI,
      'List-II',
      ...lists.listII,
      ...matchOptions(PHYSICS_MATCH_SLOTS.indexOf(n)),
    ].join('\n')
  }
  if (n === CHEM_SMILES_MATCH_SLOT) {
    return [
      `Q. ${n} ${CHEM_SMILES_LISTS.intro}`,
      'List-I',
      ...CHEM_SMILES_LISTS.listI,
      'List-II',
      ...CHEM_SMILES_LISTS.listII,
      ...matchOptions(4),
    ].join('\n')
  }
  return [`Q. ${n} ${stemForSlot(n)}`, ...plainOptions(n)].join('\n')
}

const FIGURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** Stored card for one slot — match cards keep List-II only, so heal must restore List-I. */
function cardForSlot(n) {
  const subject = subjectForSlot(n)
  const base = {
    subject,
    chapter: 'General',
    pyqSlot: n,
    questionNumber: n,
    printedNumber: n,
    answerSource: 'from_paper',
    correctIndex: n % 4,
  }
  if (PHYSICS_MATCH_SLOTS.includes(n)) {
    const at = PHYSICS_MATCH_SLOTS.indexOf(n)
    const lists = PHYSICS_MATCH_LISTS[at]
    // Q31-Q33 arrive List-II-only (the extractor drops the left column) so the
    // approve path must heal List-I back; Q34 arrives intact.
    const body =
      n === LIST_I_INTACT_MATCH_SLOT
        ? ['List-I', ...lists.listI, 'List-II', ...lists.listII]
        : ['List-II', ...lists.listII]
    return {
      ...base,
      questionType: 'matrix_match',
      text: [`${matchIntroFor(n)}`, ...body].join('\n'),
      options: matchOptions(at),
      ...(/shown in the figure/i.test(lists.intro) ? { questionImage: FIGURE_PNG } : {}),
    }
  }
  if (n === CHEM_SMILES_MATCH_SLOT) {
    return {
      ...base,
      questionType: 'matrix_match',
      text: [CHEM_SMILES_LISTS.intro, 'List-II', ...CHEM_SMILES_LISTS.listII].join('\n'),
      options: matchOptions(4),
    }
  }
  return { ...base, questionType: 'single', text: stemForSlot(n), options: plainOptions(n) }
}

/** Real pending rows carry a stored solution; it feeds officialPyqPaperSourceText too. */
function solutionForSlot(n) {
  return `Balancing the governing relation for part $${n}$ gives $\\frac{d}{d x}\\left(x^{${1 + (n % 4)}}\\right)=${1 + (n % 4)} x^{${n % 4}}$. Substituting the given data and simplifying, the required quantity evaluates to option (${'ABCD'[n % 4]}).`
}

const PAPER_HEADER = `JEE (Advanced) 2024 Paper 1
PART I - PHYSICS
SECTION 1 (Maximum Marks: 12)
This section contains FOUR (04) questions.
Each question has FOUR options. ONLY ONE of these four options is the correct answer.
For each question, choose the option corresponding to the correct answer.
Answer to each question will be evaluated according to the following marking scheme:
Full Marks: +3 If ONLY the correct option is chosen.
Zero Marks: 0 If none of the options is chosen (i.e. the question is unanswered).
Negative Marks: -1 In all other cases.
`

/**
 * @param {number} [count] number of questions (default 51 = full JEE Advanced paper)
 * @returns {{exam: string, year: number, session: string, paperLabel: string,
 *   sourceLabel: string, sourceUrl: string, preparedText: string, questions: object[]}}
 */
export function buildRealisticOfficialPyqPaper(count = 51) {
  const slots = Array.from({ length: count }, (_, i) => i + 1)
  const preparedText = [PAPER_HEADER, ...slots.map((n) => ocrBlockForSlot(n))].join('\n\n')
  return {
    exam: 'jee-advanced',
    year: 2024,
    session: 'Paper 1',
    paperLabel: `JEE Advanced 2024 Paper 1 (perf fixture, ${count} questions)`,
    sourceLabel: 'Official JEE Advanced (perf fixture)',
    sourceUrl: 'https://jeeadv.ac.in/',
    preparedText,
    // Real imports store the OCR in notes as well — officialPyqPaperSourceText reads both.
    notes: `Imported from JEEADV-2024-Paper1.pdf\n\n${preparedText}`,
    questions: slots.map((n) => ({
      ...cardForSlot(n),
      solution: solutionForSlot(n),
      solutionSource: 'from_paper',
    })),
  }
}
