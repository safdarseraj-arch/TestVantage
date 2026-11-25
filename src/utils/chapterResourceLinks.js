/**
 * NCERT / Improvement-book style links for weak chapters.
 * Where a known open textbook URL exists → external NCERT link.
 * Otherwise → deep-link into chapter Practice (prefill).
 */

/** Subject → chapter keyword → NCERT open textbook PDF (public). */
const NCERT_CHAPTER_URLS = {
  physics: {
    kinematics: 'https://ncert.nic.in/textbook.php?keph1=2-8',
    'laws of motion': 'https://ncert.nic.in/textbook.php?keph1=4-8',
    'work energy': 'https://ncert.nic.in/textbook.php?keph1=5-8',
    'work, energy': 'https://ncert.nic.in/textbook.php?keph1=5-8',
    gravitation: 'https://ncert.nic.in/textbook.php?keph1=7-8',
    thermodynamics: 'https://ncert.nic.in/textbook.php?keph2=5-9',
    'kinetic theory': 'https://ncert.nic.in/textbook.php?keph2=6-9',
    oscillations: 'https://ncert.nic.in/textbook.php?keph2=7-9',
    waves: 'https://ncert.nic.in/textbook.php?keph2=8-9',
    'electrostatic': 'https://ncert.nic.in/textbook.php?leph1=1-8',
    'current electricity': 'https://ncert.nic.in/textbook.php?leph1=3-8',
    'magnetic effects': 'https://ncert.nic.in/textbook.php?leph1=4-8',
    'electromagnetic induction': 'https://ncert.nic.in/textbook.php?leph1=6-8',
    'optics': 'https://ncert.nic.in/textbook.php?leph2=9-14',
    'dual nature': 'https://ncert.nic.in/textbook.php?leph2=11-14',
    'atoms': 'https://ncert.nic.in/textbook.php?leph2=12-14',
    'nuclei': 'https://ncert.nic.in/textbook.php?leph2=13-14',
  },
  chemistry: {
    'atomic structure': 'https://ncert.nic.in/textbook.php?kech1=2-7',
    'structure of atom': 'https://ncert.nic.in/textbook.php?kech1=2-7',
    'periodic': 'https://ncert.nic.in/textbook.php?kech1=3-7',
    'chemical bonding': 'https://ncert.nic.in/textbook.php?kech1=4-7',
    thermodynamics: 'https://ncert.nic.in/textbook.php?kech1=6-7',
    equilibrium: 'https://ncert.nic.in/textbook.php?kech1=7-7',
    'organic chemistry': 'https://ncert.nic.in/textbook.php?kech2=12-14',
    'hydrocarbons': 'https://ncert.nic.in/textbook.php?kech2=13-14',
    'solutions': 'https://ncert.nic.in/textbook.php?lech1=2-9',
    'electrochemistry': 'https://ncert.nic.in/textbook.php?lech1=3-9',
    'chemical kinetics': 'https://ncert.nic.in/textbook.php?lech1=4-9',
    'p-block': 'https://ncert.nic.in/textbook.php?lech2=7-9',
    'd-block': 'https://ncert.nic.in/textbook.php?lech2=8-9',
    'coordination': 'https://ncert.nic.in/textbook.php?lech2=9-9',
    'haloalkanes': 'https://ncert.nic.in/textbook.php?lech2=10-9',
    alcohols: 'https://ncert.nic.in/textbook.php?lech2=11-9',
    aldehydes: 'https://ncert.nic.in/textbook.php?lech2=12-9',
    amines: 'https://ncert.nic.in/textbook.php?lech2=13-9',
    biomolecules: 'https://ncert.nic.in/textbook.php?lech2=14-9',
  },
  mathematics: {
    sets: 'https://ncert.nic.in/textbook.php?kemh1=1-16',
    relations: 'https://ncert.nic.in/textbook.php?kemh1=2-16',
    'trigonometric': 'https://ncert.nic.in/textbook.php?kemh1=3-16',
    'complex numbers': 'https://ncert.nic.in/textbook.php?kemh1=5-16',
    'linear inequalities': 'https://ncert.nic.in/textbook.php?kemh1=6-16',
    permutations: 'https://ncert.nic.in/textbook.php?kemh1=7-16',
    'binomial': 'https://ncert.nic.in/textbook.php?kemh1=8-16',
    sequences: 'https://ncert.nic.in/textbook.php?kemh1=9-16',
    'straight lines': 'https://ncert.nic.in/textbook.php?kemh1=10-16',
    'conic sections': 'https://ncert.nic.in/textbook.php?kemh1=11-16',
    limits: 'https://ncert.nic.in/textbook.php?kemh2=13-16',
    derivatives: 'https://ncert.nic.in/textbook.php?kemh2=13-16',
    integrals: 'https://ncert.nic.in/textbook.php?lemh2=7-13',
    'differential equations': 'https://ncert.nic.in/textbook.php?lemh2=9-13',
    'vector': 'https://ncert.nic.in/textbook.php?lemh2=10-13',
    'three dimensional': 'https://ncert.nic.in/textbook.php?lemh2=11-13',
    probability: 'https://ncert.nic.in/textbook.php?lemh2=13-13',
    matrices: 'https://ncert.nic.in/textbook.php?lemh1=3-13',
    determinants: 'https://ncert.nic.in/textbook.php?lemh1=4-13',
    continuity: 'https://ncert.nic.in/textbook.php?lemh1=5-13',
  },
  biology: {
    'the living world': 'https://ncert.nic.in/textbook.php?kebo1=1-22',
    'biological classification': 'https://ncert.nic.in/textbook.php?kebo1=2-22',
    'plant kingdom': 'https://ncert.nic.in/textbook.php?kebo1=3-22',
    'animal kingdom': 'https://ncert.nic.in/textbook.php?kebo1=4-22',
    'cell': 'https://ncert.nic.in/textbook.php?kebo1=8-22',
    'biomolecules': 'https://ncert.nic.in/textbook.php?kebo1=9-22',
    'cell cycle': 'https://ncert.nic.in/textbook.php?kebo1=10-22',
    photosynthesis: 'https://ncert.nic.in/textbook.php?kebo1=13-22',
    respiration: 'https://ncert.nic.in/textbook.php?kebo1=14-22',
    'human physiology': 'https://ncert.nic.in/textbook.php?kebo1=14-22',
    reproduction: 'https://ncert.nic.in/textbook.php?lebo1=1-16',
    genetics: 'https://ncert.nic.in/textbook.php?lebo1=5-16',
    evolution: 'https://ncert.nic.in/textbook.php?lebo1=7-16',
    'human health': 'https://ncert.nic.in/textbook.php?lebo1=8-16',
    biotechnology: 'https://ncert.nic.in/textbook.php?lebo1=11-16',
    ecology: 'https://ncert.nic.in/textbook.php?lebo1=13-16',
  },
  botany: {
    'plant kingdom': 'https://ncert.nic.in/textbook.php?kebo1=3-22',
    photosynthesis: 'https://ncert.nic.in/textbook.php?kebo1=13-22',
    'plant growth': 'https://ncert.nic.in/textbook.php?kebo1=15-22',
  },
  zoology: {
    'animal kingdom': 'https://ncert.nic.in/textbook.php?kebo1=4-22',
    'human physiology': 'https://ncert.nic.in/textbook.php?kebo1=16-22',
    reproduction: 'https://ncert.nic.in/textbook.php?lebo1=3-16',
  },
}

/**
 * @param {string} chapter
 * @param {string[]} [subjects]
 */
export function findNcertUrl(chapter, subjects = []) {
  const ch = String(chapter || '')
    .trim()
    .toLowerCase()
  if (!ch) return null
  const subjectIds =
    subjects.length > 0
      ? subjects.map((s) => String(s).toLowerCase())
      : Object.keys(NCERT_CHAPTER_URLS)

  for (const sub of subjectIds) {
    const table = NCERT_CHAPTER_URLS[sub]
    if (!table) continue
    for (const [key, url] of Object.entries(table)) {
      if (ch.includes(key) || key.includes(ch)) return url
    }
  }
  // Cross-subject fuzzy
  for (const table of Object.values(NCERT_CHAPTER_URLS)) {
    for (const [key, url] of Object.entries(table)) {
      if (ch.includes(key) || key.includes(ch)) return url
    }
  }
  return null
}

/**
 * @param {{
 *   chapter: string
 *   subjects?: string[]
 *   examPatternId?: string
 * }} opts
 */
export function buildChapterResourceLinks(opts = {}) {
  const chapter = String(opts.chapter || '').trim()
  const subjects = opts.subjects ?? []
  const ncertUrl = findNcertUrl(chapter, subjects)
  const practicePrefill = {
    examPatternId: opts.examPatternId,
    chapters: chapter ? [chapter] : [],
    subjects,
  }
  return {
    chapter,
    ncertUrl,
    ncertLabel: ncertUrl ? 'Open NCERT chapter' : null,
    practicePrefill,
    practiceLabel: 'Practice this chapter',
    improvementNote: ncertUrl
      ? 'Official NCERT textbook page for this topic (open in a new tab).'
      : 'No NCERT URL matched — use chapter practice, or open NCERT books from ncert.nic.in.',
  }
}
