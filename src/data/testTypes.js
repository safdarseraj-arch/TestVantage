/** @typedef {'chapter' | 'part' | 'full' | 'speed' | 'cdf' | 'calibrated' | 'practice'} TestTypeId */

/**
 * Four test-paper categories (IDs unchanged for saved tests & bank settings).
 * @typedef {Object} TestType
 * @property {TestTypeId} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} description
 * @property {number} durationFactor - fraction of full-exam time (comprehensive = 1)
 * @property {number} minutesPerQuestion - used when not a full mock
 * @property {string} icon
 */

/** @type {TestType[]} */
export const TEST_TYPES = [
  {
    id: 'full',
    name: 'Comprehensive Mock Test',
    shortName: 'Comprehensive Mock',
    description:
      'Full-syllabus mock with exam-like duration and marking. Time = real exam minutes scaled to question count.',
    durationFactor: 1,
    minutesPerQuestion: 2.4,
    icon: '📕',
  },
  {
    id: 'part',
    name: 'Subject Proficiency Test',
    shortName: 'Subject Proficiency',
    description:
      'One subject or multi-chapter block — time scales with question count (real exam pace). Students: Home → Start mock test.',
    durationFactor: 0.4,
    minutesPerQuestion: 2,
    icon: '📗',
  },
  {
    id: 'chapter',
    name: 'Chapter Proficiency Test',
    shortName: 'Chapter Proficiency',
    description:
      'Focused practice on a single chapter or topic — time scales with question count. Students: Home → Start mock test.',
    durationFactor: 0.12,
    minutesPerQuestion: 2,
    icon: '📘',
  },
  {
    id: 'speed',
    name: 'Precision Speed Test',
    shortName: 'Precision Speed',
    description:
      'Choose exam duration (15–60 min). AI tunes level 1–3 questions from your syllabus and sets question count + marking automatically.',
    durationFactor: 0.55,
    minutesPerQuestion: 1.25,
    icon: '⚡',
  },
  {
    id: 'cdf',
    name: 'Concept Definition and Formula Test',
    shortName: 'CDF Test',
    description:
      'CDF (Concept Definition and Formula) — 15 or 30 min slot. AI picks toughness level 1 SCQ and T/F only. Per-question timer: Math 30s, Physics 25s, Chemistry/Biology 20s.',
    durationFactor: 0.35,
    minutesPerQuestion: 0.45,
    icon: '⏱️',
  },
  {
    id: 'calibrated',
    name: 'Real-Time Calibrated Paper',
    shortName: 'Calibrated',
    description:
      'AI adaptive test (GRE-style): next question chosen after each answer. Time: 60 min per subject (1→60, 2→120, 3→180). Question pattern matches the real exam.',
    durationFactor: 0.65,
    minutesPerQuestion: 2.2,
    icon: '🎯',
  },
  {
    id: 'practice',
    name: 'Syllabus Practice',
    shortName: 'Practice',
    description:
      'Student self-serve only — start from Home → Syllabus Practice. AI picks ready questions from your syllabus; self-paced with full analysis.',
    durationFactor: 0.15,
    minutesPerQuestion: 2.5,
    icon: '📖',
  },
]

/** Paper types teachers build in Create Test (student self-serve types excluded). */
export const TEACHER_CREATABLE_TEST_TYPES = TEST_TYPES.filter(
  (t) => t.id !== 'speed' && t.id !== 'cdf' && t.id !== 'practice',
)

/** @param {string} id */
export function getTestType(id) {
  return TEST_TYPES.find((t) => t.id === id) ?? TEST_TYPES[2]
}
