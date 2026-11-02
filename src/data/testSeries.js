/** Scheduled test series */
export const TEST_SERIES = [
  {
    id: 'series-jee-main-2026',
    name: 'JEE Main 2026 — Pro Series',
    examPatternId: 'jee-main',
    color: '#6366f1',
    description:
      'Sample calendar of NTA-style papers until your teacher publishes a live series.',
    tests: [
      { testId: 'jee-main-full-demo', week: 1, date: '2026-08-31', label: 'Comprehensive Mock #1', type: 'full' },
      { testId: 'jee-main-part-pcm', week: 2, date: '2026-09-07', label: 'Subject Proficiency — PCM', type: 'part' },
      {
        testId: 'jee-main-chapter-kinematics',
        week: 3,
        date: '2026-09-14',
        label: 'Chapter Proficiency — Kinematics',
        type: 'chapter',
      },
      { testId: 'jee-advanced-all-types', week: 4, date: '2026-09-21', label: 'Comprehensive Mock — Advanced', type: 'full' },
    ],
  },
  {
    id: 'series-neet-2026',
    name: 'NEET 2026 — Biology Focus',
    examPatternId: 'neet',
    color: '#059669',
    description: 'Sample PCB papers for practice until your teacher publishes a live series',
    tests: [
      { testId: 'neet-part-demo', week: 1, date: '2026-08-31', label: 'Subject Proficiency — PCB', type: 'part' },
      { testId: 'neet-chapter-demo', week: 2, date: '2026-09-07', label: 'Chapter Proficiency — PCB', type: 'chapter' },
    ],
  },
]

export function getTestSeries() {
  return TEST_SERIES
}
