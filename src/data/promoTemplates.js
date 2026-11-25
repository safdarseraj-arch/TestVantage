/**
 * Seed promotional share templates for the Refer & Earn gallery.
 * Placeholders: {{code}} {{link}} {{name}} {{mentor}}
 */

export const PROMO_TEMPLATES = Object.freeze([
  {
    id: 'free-mock-2',
    title: '2 free diagnostic mocks',
    tone: 'Friendly',
    accent: '#0369a1',
    emoji: '🎯',
    headline: 'Try 2 free JEE / NEET mocks',
    body: 'I use TestVantages for NTA-style practice. Get 2 free diagnostic mocks with my link — code {{code}} for 10% off paid packs.\n{{link}}',
    cta: 'Open free mocks',
  },
  {
    id: 'exam-week',
    title: 'Exam-week boost',
    tone: 'Urgent',
    accent: '#b45309',
    emoji: '⏱️',
    headline: 'Exam week? Sharpen with real patterns',
    body: 'Quick tip: timed NTA-pattern mocks on TestVantages. Use my code {{code}} for 10% off.\n{{link}}',
    cta: 'Start a timed mock',
  },
  {
    id: 'peer-invite',
    title: 'Invite a classmate',
    tone: 'Peer',
    accent: '#0f766e',
    emoji: '🤝',
    headline: 'Study buddy invite',
    body: '{{name}} invited you to TestVantages — 2 free NTA diagnostic mocks + smarter practice. Code {{code}} for 10% off.\n{{link}}',
    cta: 'Join with my code',
  },
  {
    id: 'teacher-class',
    title: 'For class / coaching',
    tone: 'Faculty',
    accent: '#7c3aed',
    emoji: '📚',
    headline: 'Class practice on TestVantages',
    body: 'Sharing TestVantages with my students — NTA mocks, analysis, and 10% off with code {{code}}.\n{{link}}',
    cta: 'Open for class',
  },
  {
    id: 'short-reel-hook',
    title: 'Reel / Shorts caption',
    tone: 'Social',
    accent: '#db2777',
    emoji: '🎬',
    headline: 'Caption for your reel',
    body: 'NTA-style mocks that feel like the real exam 🔥 Code {{code}} · free diagnostic → {{link}}\n#JEE #NEET #TestVantages',
    cta: 'Copy caption',
  },
  {
    id: 'mentor-page',
    title: 'Mentor page',
    tone: 'Personal',
    accent: '#1d4ed8',
    emoji: '✨',
    headline: 'Meet me on my mentor page',
    body: 'Practice with me on TestVantages. My mentor page + code {{code}} for 10% off:\n{{mentor}}',
    cta: 'Open mentor page',
  },
])

export function fillPromoTemplate(template, { code, link, name, mentor }) {
  if (!template) return ''
  const map = {
    '{{code}}': code || '',
    '{{link}}': link || '',
    '{{name}}': name || 'A friend',
    '{{mentor}}': mentor || link || '',
  }
  let text = String(template.body || '')
  for (const [key, value] of Object.entries(map)) {
    text = text.split(key).join(value)
  }
  return text
}
