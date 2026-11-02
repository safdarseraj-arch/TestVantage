import { getChapterPyqLimit } from '../utils/patternResolver.js'
import { loadImportedPyqs } from '../utils/pyqStore.js'
import { removeOlderDuplicateOfficialPyqPublishes } from '../utils/officialPyqPublishOnce.js'
import { allowAutoDemoSeed } from '../utils/prodSafety.js'
import {
  SAMPLE_PRACTICE_BANK_SOURCE,
  isOfficialPyq,
  isSimilarToPyq,
  isReplicaPaperQuestion,
} from '../utils/pyqDetect.js'
import { questionMatchesSubBankType } from '../utils/subBankType.js'
import { filterMasterPoolBySubBank, getMasterQuestionPool } from '../utils/masterPool.js'
import { questionMatchesExamFilter } from '../utils/bankListFilters.js'

/**
 * PYQ (Previous Year Questions) catalog — year, chapter & paper wise.
 * @typedef {import('./tests').Question & {
 *   pyqYear: number
 *   examPatternId: string
 *   paperId: string
 *   paperLabel: string
 *   pyqDate?: string
 *   pyqShift?: number
 *   pyqSession?: string
 *   pyqSlot?: number
 * }} PyqQuestion
 */

const YEARS = [2024, 2023, 2022, 2021, 2020, 2019]

/** NTA-style January & April exam dates (day of month) — 2 shifts each. */
const JEE_MAIN_JAN_DAYS = [24, 27, 29, 31]
const JEE_MAIN_APR_DAYS = [4, 6, 8, 9]

/**
 * @param {number} year
 * @returns {{ paperId: string, paperLabel: string, pyqDate: string, dateLabel: string, pyqShift: number, pyqSession: string }[]}
 */
export function getJeeMainPaperSlots(year) {
  /** @type {{ paperId: string, paperLabel: string, pyqDate: string, dateLabel: string, pyqShift: number, pyqSession: string }[]} */
  const slots = []

  for (const day of JEE_MAIN_JAN_DAYS) {
    if (day === 31 && year % 2 === 0) continue
    for (const shift of [1, 2]) {
      const pyqDate = `${year}-01-${String(day).padStart(2, '0')}`
      const dateLabel = `${day} Jan ${year}`
      slots.push({
        paperId: `${year}-jan-${day}-s${shift}`,
        paperLabel: `${dateLabel} · Shift ${shift}`,
        pyqDate,
        dateLabel,
        pyqShift: shift,
        pyqSession: 'January Session',
      })
    }
  }

  for (const day of JEE_MAIN_APR_DAYS) {
    for (const shift of [1, 2]) {
      const pyqDate = `${year}-04-${String(day).padStart(2, '0')}`
      const dateLabel = `${day} Apr ${year}`
      slots.push({
        paperId: `${year}-apr-${day}-s${shift}`,
        paperLabel: `${dateLabel} · Shift ${shift}`,
        pyqDate,
        dateLabel,
        pyqShift: shift,
        pyqSession: 'April Session',
      })
    }
  }

  return slots
}

/** @type {{ subject: string, chapter: string, text: string, options: string[], correctIndex: number, solution?: string }[]} */
const PYQ_TEMPLATES = [
  {
    subject: 'physics',
    chapter: 'Kinematics',
    text: 'A particle moves with $v = 4t - 2$. Displacement in first $2\\,\\text{s}$ from rest is:',
    options: ['$4\\,\\text{m}$', '$6\\,\\text{m}$', '$8\\,\\text{m}$', '$12\\,\\text{m}$'],
    correctIndex: 0,
    solution: 'Integrate $v$: $s = 2t^2 - 2t$. At $t=2$, $s = 4\\,\\text{m}$.',
  },
  {
    subject: 'physics',
    chapter: 'Laws of Motion',
    text: 'Block on smooth table pulled with $10\\,\\text{N}$. Mass $2\\,\\text{kg}$. Acceleration is:',
    options: ['$2\\,\\text{m/s}^2$', '$5\\,\\text{m/s}^2$', '$10\\,\\text{m/s}^2$', '$20\\,\\text{m/s}^2$'],
    correctIndex: 1,
    solution: '$a = F/m = 10/2 = 5\\,\\text{m/s}^2$.',
  },
  {
    subject: 'physics',
    chapter: 'Thermodynamics',
    text: 'Work done in isothermal expansion of ideal gas is:',
    options: ['$nRT\\ln(V_2/V_1)$', '$nC_v\\Delta T$', '$P\\Delta V$ only', 'Zero always'],
    correctIndex: 0,
    solution: 'Isothermal: $W = nRT\\ln(V_2/V_1)$.',
  },
  {
    subject: 'physics',
    chapter: 'Electrostatics',
    text: 'Electric field at centre of uniformly charged ring (radius $R$, total charge $Q$) is:',
    options: ['$kQ/R^2$', '$kQ/(2R^2)$', 'Zero', '$kQ/R$'],
    correctIndex: 2,
    solution: 'Field components cancel by symmetry at centre.',
  },
  {
    subject: 'physics',
    chapter: 'Current Electricity',
    text: 'Resistors $2\\,\\Omega$ and $3\\,\\Omega$ in parallel. Equivalent resistance:',
    options: ['$1.2\\,\\Omega$', '$5\\,\\Omega$', '$6\\,\\Omega$', '$1\\,\\Omega$'],
    correctIndex: 0,
    solution: '$1/R = 1/2 + 1/3 \\Rightarrow R = 1.2\\,\\Omega$.',
  },
  {
    subject: 'chemistry',
    chapter: 'Atomic Structure',
    text: 'Maximum number of electrons in $n=3$ shell is:',
    options: ['8', '18', '32', '2'],
    correctIndex: 1,
    solution: '$2n^2 = 18$ for $n=3$.',
  },
  {
    subject: 'chemistry',
    chapter: 'Chemical Bonding',
    text: 'Which has highest boiling point?',
    options: ['$\\text{CH}_4$', '$\\text{H}_2\\text{O}$', '$\\text{H}_2\\text{S}$', '$\\text{NH}_3$'],
    correctIndex: 1,
    solution: 'Water has strong H-bonding.',
  },
  {
    subject: 'chemistry',
    chapter: 'Equilibrium',
    text: 'For exothermic reaction, increase in temperature shifts equilibrium:',
    options: ['Forward', 'Backward', 'No change', 'Depends on catalyst'],
    correctIndex: 1,
    solution: "Le Chatelier: heat treated as product — shifts left.",
  },
  {
    subject: 'chemistry',
    chapter: 'Electrochemistry',
    text: 'Standard electrode potential of SHE is taken as:',
    options: ['$0\\,\\text{V}$', '$1\\,\\text{V}$', '$-1\\,\\text{V}$', '$0.5\\,\\text{V}$'],
    correctIndex: 0,
    solution: 'SHE reference is $0\\,\\text{V}$ by convention.',
  },
  {
    subject: 'mathematics',
    chapter: 'Quadratic Equations',
    text: 'If roots of $x^2 - px + q = 0$ are $2$ and $3$, then $p$ equals:',
    options: ['5', '6', '1', '-5'],
    correctIndex: 0,
    solution: 'Sum of roots $= p = 5$.',
  },
  {
    subject: 'mathematics',
    chapter: 'Sequences and Series',
    text: 'Sum of first $10$ terms of AP $3, 7, 11, \\ldots$ is:',
    options: ['210', '220', '230', '200'],
    correctIndex: 0,
    solution: '$S_{10} = \\frac{10}{2}(6 + 36) = 210$.',
  },
  {
    subject: 'mathematics',
    chapter: 'Calculus',
    text: '$\\int_0^1 x^2\\,dx$ equals:',
    options: ['$1/2$', '$1/3$', '$1/4$', '$2/3$'],
    correctIndex: 1,
    solution: '$\\left[\\frac{x^3}{3}\\right]_0^1 = 1/3$.',
  },
  {
    subject: 'mathematics',
    chapter: 'Probability',
    text: 'Two dice thrown. Probability of sum $7$ is:',
    options: ['$1/6$', '$1/12$', '$1/36$', '$5/36$'],
    correctIndex: 0,
    solution: '6 favourable outcomes out of 36: $6/36 = 1/6$.',
  },
  {
    subject: 'physics',
    chapter: 'Optics',
    text: 'Focal length of concave mirror is $15\\,\\text{cm}$. Power is:',
    options: ['$+6.67\\,\\text{D}$', '$-6.67\\,\\text{D}$', '$+15\\,\\text{D}$', '$-15\\,\\text{D}$'],
    correctIndex: 1,
    solution: '$P = -1/f = -1/0.15 \\approx -6.67\\,\\text{D}$ (sign convention).',
  },
  {
    subject: 'chemistry',
    chapter: 'Organic Chemistry — Basics',
    text: 'Hybridization of carbon in $\\text{CH}_4$ is:',
    options: ['$sp$', '$sp^2$', '$sp^3$', '$sp^3d$'],
    correctIndex: 2,
    solution: 'Methane: tetrahedral $sp^3$.',
  },
]

/** @returns {PyqQuestion[]} */
function generatePyqQuestions() {
  /** @type {PyqQuestion[]} */
  const out = []
  let qIndex = 0

  for (const year of YEARS) {
    for (const slot of getJeeMainPaperSlots(year)) {
      PYQ_TEMPLATES.forEach((tpl, ti) => {
        if ((year + ti) % 3 === 0 && ti > 10) return
        qIndex++
        out.push({
          id: `pyq-${slot.paperId}-${tpl.subject}-${ti}`,
          subject: tpl.subject,
          chapter: tpl.chapter,
          questionType: 'single_correct',
          text: `[PYQ ${slot.dateLabel} S${slot.pyqShift}] ${tpl.text}`,
          options: [...tpl.options],
          correctIndex: tpl.correctIndex,
          solution: tpl.solution,
          pyqYear: year,
          examPatternId: 'jee-main',
          paperId: slot.paperId,
          paperLabel: slot.paperLabel,
          pyqDate: slot.pyqDate,
          pyqShift: slot.pyqShift,
          pyqSession: slot.pyqSession,
          pyqSlot: (qIndex % 5) + 1,
        })
      })
    }
  }

  // NEET biology samples
  const bioTpl = [
    {
      chapter: 'Cell Biology',
      text: 'Powerhouse of the cell is:',
      options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'],
      correctIndex: 1,
    },
    {
      chapter: 'Genetics',
      text: 'Mendel worked on:',
      options: ['Pea plant', 'Drosophila', 'Maize', 'Bacteria'],
      correctIndex: 0,
    },
  ]
  for (const year of [2024, 2023, 2022]) {
    bioTpl.forEach((b, i) => {
      const paperId = `${year}-neet-s1`
      out.push({
        id: `pyq-neet-${year}-${i}`,
        subject: 'biology',
        chapter: b.chapter,
        questionType: 'single_correct',
        text: `[NEET ${year}] ${b.text}`,
        options: b.options,
        correctIndex: b.correctIndex,
        examPatternId: 'neet',
        pyqYear: year,
        paperId,
        paperLabel: `${year} NEET Session 1`,
        pyqSlot: i + 1,
      })
    })
  }

  // JEE Advanced — year & chapter wise (paper-wise tab is JEE Main only in UI)
  const advTpl = [
    {
      subject: 'physics',
      chapter: 'Rotation',
      text: 'A disc of radius $R$ rolls without slipping. Speed of topmost point is $v$. Centre speed is:',
      options: ['$v/2$', '$v$', '$2v$', '$v/4$'],
      correctIndex: 0,
      solution: 'Top point speed $= 2v_{cm}$; given $v = 2v_{cm} \\Rightarrow v_{cm} = v/2$.',
    },
    {
      subject: 'physics',
      chapter: 'Modern Physics',
      text: 'Photoelectric effect supports particle nature of light because:',
      options: [
        'Energy depends on intensity only',
        'Threshold frequency exists',
        'Speed of light changes in medium',
        'Interference is observed',
      ],
      correctIndex: 1,
      solution: 'Below threshold frequency, no emission — quantum picture.',
    },
    {
      subject: 'chemistry',
      chapter: 'Coordination Compounds',
      text: 'Crystal field splitting $\\Delta_o$ is largest for:',
      options: ['$\\text{CN}^-$ weak field', '$\\text{CO}$ strong field', '$\\text{H}_2\\text{O}$', '$\\text{Cl}^-$'],
      correctIndex: 1,
      solution: 'CO is a strong field ligand → large $\\Delta_o$.',
    },
    {
      subject: 'chemistry',
      chapter: 'Biomolecules',
      text: 'Sucrose on hydrolysis gives:',
      options: ['Glucose only', 'Fructose only', 'Glucose + Fructose', 'Glucose + Galactose'],
      correctIndex: 2,
      solution: 'Sucrose → glucose + fructose.',
    },
    {
      subject: 'mathematics',
      chapter: 'Vectors',
      text: 'If $|\\vec{a}|=3$, $|\\vec{b}|=4$ and $\\vec{a}\\cdot\\vec{b}=0$, then $|\\vec{a}+\\vec{b}|$ is:',
      options: ['$5$', '$7$', '$1$', '$12$'],
      correctIndex: 0,
      solution: 'Perpendicular vectors: $|\\vec{a}+\\vec{b}| = 5$.',
    },
    {
      subject: 'mathematics',
      chapter: '3D Geometry',
      text: 'Distance of point $(1,2,3)$ from plane $x+y+z=0$ is:',
      options: ['$2\\sqrt{3}$', '$\\sqrt{3}$', '$6$', '$3$'],
      correctIndex: 0,
      solution: '$d = |1+2+3|/\\sqrt{3} = 2\\sqrt{3}$.',
    },
  ]

  const advPapers = [
    { id: 'paper-1', label: 'Paper 1' },
    { id: 'paper-2', label: 'Paper 2' },
  ]

  for (const year of YEARS) {
    for (const paper of advPapers) {
      const paperId = `${year}-adv-${paper.id}`
      const paperLabel = `${year} JEE Advanced ${paper.label}`
      advTpl.forEach((tpl, ti) => {
        if ((year + ti) % 2 === 1 && ti > 4) return
        qIndex++
        out.push({
          id: `pyq-adv-${year}-${paper.id}-${tpl.subject}-${ti}`,
          subject: tpl.subject,
          chapter: tpl.chapter,
          questionType: 'single_correct',
          text: `[JEE Adv ${year}] ${tpl.text}`,
          options: [...tpl.options],
          correctIndex: tpl.correctIndex,
          solution: tpl.solution,
          pyqYear: year,
          examPatternId: 'jee-advanced',
          paperId,
          paperLabel,
          pyqSlot: (qIndex % 5) + 1,
        })
      })
    }
  }

  return out.map((q) => ({
    ...q,
    isDemo: true,
    officialPyq: false,
    bankSource: SAMPLE_PRACTICE_BANK_SOURCE,
    source: 'Sample practice — not an official NTA paper',
  }))
}

const SAMPLE_PYQ_QUESTIONS = generatePyqQuestions()

/** Staff/dev sample drills only — never shown as official NTA papers. */
export function getSamplePracticePyqQuestions() {
  return SAMPLE_PYQ_QUESTIONS
}

/**
 * Student PYQ bank: imported / approved papers only.
 * Sample dated catalog is off unless VITE_ALLOW_DEMO_SEED=1 (local staff opt-in).
 */
let officialPyqDuplicatesCollapsed = false

export function getAllPyqQuestions() {
  if (!officialPyqDuplicatesCollapsed) {
    officialPyqDuplicatesCollapsed = true
    try {
      removeOlderDuplicateOfficialPyqPublishes()
    } catch {
      /* still show whatever is stored */
    }
  }
  const imported = loadImportedPyqs()
  if (allowAutoDemoSeed()) {
    return [...imported, ...SAMPLE_PYQ_QUESTIONS]
  }
  return imported
}

/** @deprecated use getAllPyqQuestions or getSamplePracticePyqQuestions */
export const PYQ_QUESTIONS = SAMPLE_PYQ_QUESTIONS

export const PYQ_YEARS = YEARS

/** Top-level PYQ exam tabs (paper-wise only on JEE Main). */
export const PYQ_EXAMS = [
  { id: 'jee-main', name: 'JEE Main', label: 'JEE Mains', supportsPaperWise: true },
  { id: 'jee-advanced', name: 'JEE Advanced', label: 'JEE Advanced', supportsPaperWise: false },
  { id: 'neet', name: 'NEET', label: 'NEET', supportsPaperWise: false },
]

/** @param {string} examPatternId */
export function pyqExamSupportsPaperWise(examPatternId) {
  return PYQ_EXAMS.find((e) => e.id === examPatternId)?.supportsPaperWise ?? false
}

/** @param {string} examPatternId @param {string} [paperPatternId] */
export function getChapterPyqTestLimit(examPatternId, paperPatternId) {
  return getChapterPyqLimit(examPatternId, paperPatternId)
}

/** @param {string} examPatternId */
export function getPyqExamLabel(examPatternId) {
  return PYQ_EXAMS.find((e) => e.id === examPatternId)?.label ?? examPatternId
}

export function getPyqQuestionsFiltered(filters = {}, pool) {
  const subBankType = filters.subBankType ?? filters.sub_bank_type ?? null
  let rows = pool
  if (!rows) {
    if (subBankType) {
      rows = filterMasterPoolBySubBank(getMasterQuestionPool(), subBankType)
    } else {
      rows = getAllPyqQuestions()
    }
  } else if (subBankType) {
    rows = rows.filter((q) => questionMatchesSubBankType(q, subBankType))
  }
  const provenance = String(filters.pyqProvenance ?? filters.provenance ?? 'all').trim()
  return rows.filter((q) => {
    if (filters.examPatternId && !questionMatchesExamFilter(q, filters.examPatternId)) return false
    if (
      filters.year != null &&
      filters.year !== '' &&
      Number(q.pyqYear) !== Number(filters.year)
    ) {
      return false
    }
    if (filters.chapter && q.chapter !== filters.chapter) return false
    if (filters.subject && q.subject !== filters.subject) return false
    if (filters.paperId && q.paperId !== filters.paperId) return false
    if (provenance === 'official') {
      if (!isOfficialPyq(q)) return false
    } else if (provenance === 'similar' || provenance === 'replica') {
      if (!isSimilarToPyq(q) && !isReplicaPaperQuestion(q)) return false
    }
    return true
  })
}

export function getPyqYears(examPatternId) {
  const years = new Set(
    getAllPyqQuestions().filter((q) => q.examPatternId === examPatternId).map((q) => q.pyqYear),
  )
  return [...years].sort((a, b) => b - a)
}

/**
 * @param {import('./tests').Question & { pyqDate?: string, pyqShift?: number, pyqSession?: string }} q
 */
function paperMetaFromQuestion(q) {
  return {
    paperId: q.paperId,
    paperLabel: q.paperLabel,
    year: q.pyqYear,
    pyqDate: q.pyqDate ?? '',
    dateLabel: q.pyqDate
      ? new Date(q.pyqDate + 'T12:00:00').toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : q.paperLabel?.split('·')[0]?.trim() ?? '',
    pyqShift: q.pyqShift ?? 0,
    pyqSession: q.pyqSession ?? '',
    count: 0,
  }
}

export function getPyqPapers(examPatternId, year, pool) {
  const map = new Map()
  const rows = pool ?? getAllPyqQuestions()
  rows
    .filter((q) => q.examPatternId === examPatternId && (!year || q.pyqYear === year))
    .forEach((q) => {
      if (!map.has(q.paperId)) {
        map.set(q.paperId, paperMetaFromQuestion(q))
      }
      map.get(q.paperId).count++
    })

  return [...map.values()].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    if (a.pyqDate && b.pyqDate && a.pyqDate !== b.pyqDate) {
      return b.pyqDate.localeCompare(a.pyqDate)
    }
    return (a.pyqShift ?? 0) - (b.pyqShift ?? 0)
  })
}

/** @param {string} examPatternId */
export function getPyqPaperYears(examPatternId) {
  const years = new Set(
    getPyqPapers(examPatternId).map((p) => p.year),
  )
  return [...years].sort((a, b) => b - a)
}

export function getPyqChapters(examPatternId, subject) {
  const map = new Map()
  getAllPyqQuestions().filter(
    (q) => q.examPatternId === examPatternId && (!subject || q.subject === subject),
  ).forEach((q) => {
    const key = `${q.subject}::${q.chapter}`
    if (!map.has(key)) {
      map.set(key, { subject: q.subject, chapter: q.chapter, count: 0, years: new Set() })
    }
    const e = map.get(key)
    e.count++
    e.years.add(q.pyqYear)
  })
  return [...map.values()]
    .map((c) => ({ ...c, years: [...c.years].sort((a, b) => b - a) }))
    .sort((a, b) => b.count - a.count)
}
