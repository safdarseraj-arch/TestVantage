/**
 * Exam Pulse server feed — curated baseline + optional public RSS + Gemini polish.
 * Never scrapes paywalled content; RSS titles/summaries only.
 * API: GET http://127.0.0.1:3001/api/exam-pulse (proxied via Vite as /api/exam-pulse).
 */

import {
  EXAM_PULSE_CURATED,
  EXAM_PULSE_OFFICIAL_PORTALS,
  EXAM_PULSE_RSS_FEEDS,
} from '../src/data/examPulseCurated.js'
import {
  dedupeExamPulseItems,
  ensureWhyItMatters,
  guessExamPulseCategory,
  isStudentRelevant,
  normalizeExamPulseBadge,
} from '../src/utils/examPulseNormalize.js'
import { assistWithCloudVision, getVisionStatus } from './vision.js'

const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours server-side
const RSS_TIMEOUT_MS = 6000
const MAX_RSS_PER_FEED = 6
const MAX_ITEMS = 28

/** @type {{ bundle: ReturnType<typeof buildLocalBundle>, builtAt: number } | null} */
let memoryCache = null

/**
 * @param {string} xml
 * @param {{ id: string, label: string, defaultCategory: string, url?: string }} feed
 * @returns {import('../src/data/examPulseCurated.js').ExamPulseItem[]}
 */
function parseRssItems(xml, feed) {
  const items = []
  const chunks = xml.split(/<item[\s>]/i).slice(1)
  for (const chunk of chunks) {
    if (items.length >= MAX_RSS_PER_FEED) break
    const title = decodeXml(pickXmlTag(chunk, 'title')).trim()
    const link =
      decodeXml(pickXmlTag(chunk, 'link')).trim() ||
      (chunk.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
      ''
    const desc = decodeXml(pickXmlTag(chunk, 'description'))
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280)
    const pub =
      (chunk.match(/<pubDate[^>]*>([^<]*)<\/pubDate>/i) || [])[1]?.trim() ||
      (chunk.match(/<dc:date[^>]*>([^<]*)<\/dc:date>/i) || [])[1]?.trim() ||
      ''
    if (!title || title.length < 8) continue
    if (!isStudentRelevant(title, desc)) continue
    const publishedAt = toIsoDate(pub) || new Date().toISOString().slice(0, 10)
    const category = guessExamPulseCategory(title, desc, feed.defaultCategory)
    const summary = desc || `${feed.label}: education desk update for students.`
    items.push({
      id: `rss-${feed.id}-${hashId(title + link)}`,
      category,
      badge: 'news',
      title: title.slice(0, 160),
      summary,
      whyItMatters: ensureWhyItMatters('', summary, category),
      source: feed.label,
      sourceUrl: link || feed.url || 'https://nta.ac.in/',
      publishedAt,
    })
  }
  return items
}

/** @param {string} chunk @param {string} tag */
function pickXmlTag(chunk, tag) {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`,
    'i',
  )
  const m = chunk.match(re)
  return (m && (m[1] || m[2])) || ''
}

/** @param {string} s */
function decodeXml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

/** @param {string} raw */
function toIsoDate(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** @param {string} s */
function hashId(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * @param {{ id: string, label: string, url: string, defaultCategory: string }} feed
 */
async function fetchRssFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(RSS_TIMEOUT_MS),
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'TestVantages-ExamPulse/1.0 (+student briefing; education headlines only)',
      },
    })
    if (!res.ok) return []
    const xml = await res.text()
    if (!xml || xml.length < 40) return []
    return parseRssItems(xml, feed)
  } catch {
    return []
  }
}

function buildLocalBundle(rssItems = []) {
  const merged = dedupeExamPulseItems([...rssItems, ...EXAM_PULSE_CURATED]).slice(0, MAX_ITEMS)
  const byCategory = {
    exams: merged.filter((i) => i.category === 'exams').length,
    admissions: merged.filter((i) => i.category === 'admissions').length,
    placements: merged.filter((i) => i.category === 'placements').length,
    motivation: merged.filter((i) => i.category === 'motivation').length,
  }
  return {
    ok: true,
    items: merged,
    byCategory,
    refreshedAt: Date.now(),
    mode: rssItems.length ? 'curated+rss' : 'curated',
    aiUsed: false,
    note: rssItems.length
      ? 'Curated official portals plus public education RSS headlines (titles/summaries only).'
      : 'Curated Exam Pulse briefing — official portals and student-focused notes. Live RSS unavailable right now.',
    portals: EXAM_PULSE_OFFICIAL_PORTALS,
    disclaimer:
      'Not live TV news. Curated + optional AI summary of public education headlines. Always verify dates on official NTA / JoSAA / CSAB / MCC sites.',
  }
}

/**
 * Ask Gemini (or OpenAI via assist) to filter/categorize/summarize — no invented official dates.
 * @param {ReturnType<typeof buildLocalBundle>} local
 */
async function polishWithAi(local) {
  const status = getVisionStatus()
  if (!status.configured) return { ...local, aiUsed: false, mode: local.mode }

  try {
    const slim = local.items.slice(0, 20).map((i) => ({
      id: i.id,
      category: i.category,
      badge: i.badge,
      title: i.title,
      summary: i.summary,
      whyItMatters: i.whyItMatters,
      source: i.source,
      sourceUrl: i.sourceUrl,
      publishedAt: i.publishedAt,
    }))
    const result = await assistWithCloudVision({
      task: 'exam-pulse-briefing',
      context: {
        instruction:
          'You are Exam Pulse for JEE/NEET aspirants. From the given headlines, return JSON with key items: array of up to 16 objects {id, category, badge, title, summary, whyItMatters, source, sourceUrl, publishedAt}. Categories MUST be one of exams|admissions|placements|motivation. badge MUST be official|ai|curated|news — keep official for NTA/JoSAA/CSAB/MCC/JEE/NEET portal items; use ai for items you rewrote; curated for TestVantages notes; news for education-desk RSS. Keep official portal items. Shorten summaries to 1–2 student-friendly sentences. Add whyItMatters (one short sentence for aspirants). Do NOT invent new exam dates, cut-offs, or results. Do NOT add paywalled body text. Prefer reputable education coverage. You may lightly rewrite titles for clarity but keep facts.',
        headlines: slim,
        categories: ['exams', 'admissions', 'placements', 'motivation'],
      },
    })

    const parsed = result.parsed && typeof result.parsed === 'object' ? result.parsed : null
    let items = Array.isArray(parsed?.items)
      ? parsed.items
      : Array.isArray(parsed?.headlines)
        ? parsed.headlines
        : null

    if (!items && result.text) {
      try {
        const m = result.text.match(/\{[\s\S]*\}/)
        if (m) {
          const j = JSON.parse(m[0])
          items = Array.isArray(j.items) ? j.items : Array.isArray(j.headlines) ? j.headlines : null
        }
      } catch {
        items = null
      }
    }

    if (!Array.isArray(items) || items.length < 4) {
      return {
        ...local,
        aiUsed: false,
        mode: `${local.mode}+ai-pass`,
        note: `${local.note} AI checked the briefing but kept the local mix.`,
        aiProvider: result.provider,
      }
    }

    const cleaned = items
      .map((raw, idx) => normalizeAiItem(raw, idx, local.items))
      .filter(Boolean)
      .slice(0, MAX_ITEMS)

    if (cleaned.length < 4) {
      return {
        ...local,
        aiUsed: false,
        mode: `${local.mode}+ai-pass`,
        note: `${local.note} AI response was incomplete — showing curated mix.`,
        aiProvider: result.provider,
      }
    }

    const byCategory = {
      exams: cleaned.filter((i) => i.category === 'exams').length,
      admissions: cleaned.filter((i) => i.category === 'admissions').length,
      placements: cleaned.filter((i) => i.category === 'placements').length,
      motivation: cleaned.filter((i) => i.category === 'motivation').length,
    }

    return {
      ok: true,
      items: cleaned,
      byCategory,
      refreshedAt: Date.now(),
      mode: `${local.mode}+ai`,
      aiUsed: true,
      aiProvider: result.provider,
      note: 'AI-refreshed student briefing from curated official portals and public education headlines.',
      portals: EXAM_PULSE_OFFICIAL_PORTALS,
      disclaimer: local.disclaimer,
    }
  } catch {
    return {
      ...local,
      aiUsed: false,
      mode: local.mode,
      note: `${local.note} (AI polish skipped — key missing or assist unavailable.)`,
    }
  }
}

/**
 * @param {any} raw
 * @param {number} idx
 * @param {import('../src/data/examPulseCurated.js').ExamPulseItem[]} fallbacks
 */
function normalizeAiItem(raw, idx, fallbacks) {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title ?? '').trim()
  if (title.length < 8) return null
  const cat = String(raw.category ?? '').toLowerCase()
  const category =
    cat === 'exams' || cat === 'admissions' || cat === 'placements' || cat === 'motivation'
      ? cat
      : 'admissions'
  const fallback = fallbacks.find((f) => f.id === raw.id) || fallbacks[idx]
  const badge = normalizeExamPulseBadge(
    raw.badge,
    fallback?.badge === 'official' ? 'official' : 'ai',
  )
  // Never let AI demote an official portal item
  const finalBadge =
    fallback?.badge === 'official' && badge !== 'official' ? 'official' : badge === 'news' ? 'ai' : badge
  const sourceUrl = String(raw.sourceUrl ?? raw.url ?? '').trim()
  const summary = String(raw.summary ?? fallback?.summary ?? '')
    .trim()
    .slice(0, 320)
  return {
    id: String(raw.id ?? `ai-${idx}-${hashId(title)}`).slice(0, 64),
    category,
    badge: finalBadge,
    title: title.slice(0, 160),
    summary,
    whyItMatters: ensureWhyItMatters(
      String(raw.whyItMatters ?? fallback?.whyItMatters ?? ''),
      summary,
      category,
    ),
    source: String(raw.source ?? fallback?.source ?? 'Education desk').slice(0, 80),
    sourceUrl: /^https?:\/\//i.test(sourceUrl)
      ? sourceUrl
      : fallback?.sourceUrl || 'https://nta.ac.in/',
    publishedAt: String(raw.publishedAt ?? fallback?.publishedAt ?? new Date().toISOString().slice(0, 10)).slice(
      0,
      32,
    ),
  }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function getExamPulseBundle(opts = {}) {
  if (!opts.force && memoryCache && Date.now() - memoryCache.builtAt < CACHE_TTL_MS) {
    return memoryCache.bundle
  }

  const rssLists = await Promise.all(EXAM_PULSE_RSS_FEEDS.map((f) => fetchRssFeed(f)))
  const rssItems = rssLists.flat()
  const local = buildLocalBundle(rssItems)
  const polished = await polishWithAi(local)

  memoryCache = { bundle: polished, builtAt: Date.now() }
  return polished
}

/** Force rebuild (manual refresh). */
export async function refreshExamPulseBundle() {
  memoryCache = null
  return getExamPulseBundle({ force: true })
}
