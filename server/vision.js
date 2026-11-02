/**
 * Optional cloud vision (OpenAI GPT-4o / Gemini) for hard handwritten / dense page uploads.
 * Keys stay on the server ? never expose them to the browser.
 */
import './loadEnv.js'
import {
  SCQ_TRIAL_SYSTEM,
  SCQ_TRIAL_COUNT,
  clampTrialCount,
  planTrialQuestionTypes,
  normalizeTrialTypeMix,
  buildScqTrialPrompt,
  parseAndValidateScqTrialResponse,
  trialSubjectAllowed,
  listTrialChapters,
  normalizeTrialExamId,
  trialExamLabel,
  clampSimilarFromPyqCount,
  resolveTrialJobFromSeed,
  SCQ_TRIAL_GAP_MS,
  sleepMs,
} from '../src/utils/geminiScqTrial.js'
import {
  buildReplicaPaperMeta,
  buildReplicaPyqQuestion,
  clampReplicaPaperCount,
  nextReplicaIndices,
} from '../src/utils/pyqReplicaPaper.js'
import {
  appendReplicaLog,
  createReplicaJob,
  finishReplicaJob,
  updateReplicaProgress,
} from './pyqReplicaLive.js'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_CACHE_BASE = 'https://generativelanguage.googleapis.com/v1beta/cachedContents'

/** In-memory Gemini prompt-cache handles (per model + system prompt). */
const geminiPromptCache = new Map()

export function getVisionEnv() {
  const openaiKey = String(process.env.OPENAI_API_KEY ?? '').trim()
  const geminiKey = String(
    process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.GOOGLE_API_KEY ??
      '',
  ).trim()
  const providerPref = String(process.env.TESTVANTAGE_VISION_PROVIDER ?? 'auto')
    .trim()
    .toLowerCase()
  const openaiModel = String(process.env.OPENAI_VISION_MODEL ?? 'gpt-4o').trim() || 'gpt-4o'
  const geminiModel =
    String(process.env.GEMINI_VISION_MODEL ?? 'gemini-3.5-flash').trim() || 'gemini-3.5-flash'
  const geminiTextModel =
    String(process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.5-flash-lite').trim() ||
    'gemini-3.5-flash-lite'
  return { openaiKey, geminiKey, providerPref, openaiModel, geminiModel, geminiTextModel }
}

/** Fallback order when GEMINI_VISION_MODEL is retired for new Google AI Studio keys. */
const GEMINI_MODEL_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-2.0-flash',
]

/** Cheapest Flash-Lite first for text-only JSON (structure OCR, SCQ trial, assist). */
const GEMINI_TEXT_MODEL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash-lite',
  'gemini-3.5-flash',
  ...GEMINI_MODEL_FALLBACKS,
]

/** Cheapest Flash / Flash-Lite first for the SCQ chapter trial. */
const GEMINI_SCQ_TRIAL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  ...GEMINI_MODEL_FALLBACKS,
]

/**
 * @param {string} preferred
 * @returns {string[]}
 */
export function geminiModelCandidates(preferred) {
  const primary = String(preferred || '').trim()
  const list = primary ? [primary, ...GEMINI_MODEL_FALLBACKS] : [...GEMINI_MODEL_FALLBACKS]
  return [...new Set(list.filter(Boolean))]
}

/** Image tasks: Flash-Lite first when GEMINI_VISION_PREFER_LITE=1 (default), then Flash. */
export function geminiVisionModelCandidates() {
  const { geminiModel, geminiTextModel } = getVisionEnv()
  const preferLite = String(process.env.GEMINI_VISION_PREFER_LITE ?? '1').trim() !== '0'
  const litePreferred = String(
    process.env.GEMINI_VISION_LITE_MODEL ?? geminiTextModel ?? 'gemini-3.5-flash-lite',
  ).trim()
  if (!preferLite) return geminiModelCandidates(geminiModel)
  return [
    ...new Set(
      [litePreferred, ...GEMINI_TEXT_MODEL_FALLBACKS, geminiModel, ...GEMINI_MODEL_FALLBACKS].filter(
        Boolean,
      ),
    ),
  ]
}
/** Text-only workloads: Flash-Lite by default (~6× cheaper output vs Flash). */
export function geminiTextModelCandidates() {
  const { geminiTextModel } = getVisionEnv()
  const preferred = String(process.env.GEMINI_TEXT_MODEL ?? geminiTextModel ?? '').trim()
  return [...new Set([preferred, ...GEMINI_TEXT_MODEL_FALLBACKS].filter(Boolean))]
}

/** Flash-Lite first for the 10-SCQ-per-chapter trial. */
export function geminiScqTrialModelCandidates() {
  const { geminiTextModel } = getVisionEnv()
  const preferred = String(process.env.GEMINI_SCQ_TRIAL_MODEL ?? '').trim()
  return [...new Set([preferred, geminiTextModel, ...GEMINI_SCQ_TRIAL_FALLBACKS].filter(Boolean))]
}

function geminiMaxOutputTokens(envVar, fallback) {
  const n = Number(process.env[envVar])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function geminiPromptCacheEnabled() {
  return String(process.env.GEMINI_PROMPT_CACHE ?? '1').trim() !== '0'
}

/** @param {string} text */
function stablePromptHash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/**
 * Cache repeated system prompts (structure OCR, SCQ trial) to cut input-token spend.
 * @param {string} model
 * @param {string} systemPrompt
 * @param {string} geminiKey
 */
async function resolveGeminiCachedContent(model, systemPrompt, geminiKey) {
  if (!geminiPromptCacheEnabled() || !systemPrompt?.trim() || !geminiKey) return null
  const cacheKey = `${model}\0${stablePromptHash(systemPrompt)}`
  const hit = geminiPromptCache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.name

  const ttlSec = Math.max(300, Number(process.env.GEMINI_CACHE_TTL_SEC) || 3600)
  try {
    const res = await fetch(`${GEMINI_CACHE_BASE}?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        model: `models/${model}`,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Apply the system instructions when structuring exam OCR.' }],
          },
        ],
        ttl: `${ttlSec}s`,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.name) return null
    geminiPromptCache.set(cacheKey, {
      name: data.name,
      expiresAt: Date.now() + ttlSec * 1000 - 60_000,
    })
    return data.name
  } catch {
    return null
  }
}

function isGeminiModelUnavailable(status, apiMsg) {
  return (
    status === 404 ||
    /no longer available|not found|is not found|NOT_FOUND/i.test(String(apiMsg || ''))
  )
}

/** @returns {{ configured: boolean, ready: boolean, enabled: boolean, providers: string[], preferred: string | null, model: string | null, message: string }} */
export function getVisionStatus() {
  const { openaiKey, geminiKey, providerPref, openaiModel, geminiModel } = getVisionEnv()
  const providers = []
  if (openaiKey) providers.push('openai')
  if (geminiKey) providers.push('gemini')
  let preferred = null
  if (providerPref === 'openai' && openaiKey) preferred = 'openai'
  else if (providerPref === 'gemini' && geminiKey) preferred = 'gemini'
  else if (openaiKey) preferred = 'openai'
  else if (geminiKey) preferred = 'gemini'

  const model =
    preferred === 'openai' ? openaiModel : preferred === 'gemini' ? geminiModel : null

  if (!providers.length) {
    return {
      configured: false,
      ready: false,
      enabled: false,
      providers: [],
      preferred: null,
      model: null,
      message:
        'Cloud vision is off. Add OPENAI_API_KEY or GEMINI_API_KEY to the API server .env, then restart (F5 / Start TestVantages). Local OCR still works.',
    }
  }
  return {
    configured: true,
    ready: true,
    enabled: true,
    providers,
    preferred,
    model,
    textModel: getVisionEnv().geminiTextModel,
    visionPreferLite: String(process.env.GEMINI_VISION_PREFER_LITE ?? '1').trim() !== '0',
    message: `Cloud vision ready (${preferred}). Text JSON uses Flash-Lite; photos try Flash-Lite first then Flash. Mathpix PDFs use Flash-Lite only (LaTeX text).`,
  }
}

/**
 * @param {'openai'|'gemini'|'auto'} [want]
 */
function resolveProvider(want = 'auto') {
  const { openaiKey, geminiKey, providerPref } = getVisionEnv()
  const pref = want === 'auto' ? providerPref : want
  if (pref === 'openai' && openaiKey) return 'openai'
  if (pref === 'gemini' && geminiKey) return 'gemini'
  if (openaiKey) return 'openai'
  if (geminiKey) return 'gemini'
  return null
}

function extractJsonObject(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    /* fall through */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      /* fall through */
    }
  }
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          break
        }
      }
    }
  }
  const end = text.lastIndexOf('}')
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

const EXTRACT_SYSTEM = `You are an expert JEE Main/Advanced + NEET (Classes 11–12) exam paper OCR + LaTeX transcription system for Physics, Chemistry, Mathematics, and Biology (PCMB).
Read the image carefully (typed print, handwritten, or messy scan) — with or without stem figures, circuit diagrams, graphs, tables, or reaction schemes.
Return ONLY valid JSON (no markdown fences) with this shape:
{
  "text": "full page text with clear Q1./Q2. markers and (A)(B)(C)(D) options; keep math as LaTeX $...$",
  "questions": [
    {
      "number": 1,
      "text": "question stem only (LaTeX math in $...$)",
      "options": ["optA","optB","optC","optD"],
      "regionTypes": ["stemText","optionText"],
      "answerKeyVisible": false,
      "correctIndex": null,
      "correctIndices": null,
      "correctInteger": null,
      "correctNumerical": null,
      "solution": null,
      "subject": null,
      "section": null,
      "chapter": null,
      "topic": null,
      "examIds": null,
      "toughnessLevel": null
    }
  ],
  "pageKind": "typed|handwriting|dense_page|messy_scan|unknown"
}
Rules:
- Split every distinct question on the page into questions[].
- ALWAYS return exactly 4 strings in options[0..3] for A?D. Never leave C/D blank or half-finished when printed. Never truncate phrases like "does not exist".
- regionTypes: include "optionText" when choices are printed math/text; include "optionGraph" when choices are figure/graphs (then set each option to "" ? client crops images). Include "stemFigure" if the stem has a diagram. Include "answerKey" only when a printed Ans:/Correct: key is visible.
- answerKeyVisible: true ONLY when a printed answer key is visible on the page; otherwise false. If false, correctIndex/correctIndices MUST be null ? never guess A/B/C/D.
- If a printed answer key / Ans: / Correct: appears, set answerKeyVisible true and fill correctIndex (0-3) or correctIndices or integer/numerical.
- Never invent option text. Empty options must be "" not placeholders like "optA".
- questions[].text must be STEM TEXT ONLY. Stop BEFORE the first (A) / (B) / (C) / (D) option marker (also after "is :", "equal to :", "then :", "?", or the last stem sentence). Do NOT append option lines, option-panel OCR, graph axis ticks, curve labels, (A)(B)(C)(D) markers, or symbol soup from plots. Example: stem is "Let $f(x)=\\\\dfrac{|x+\\\\pi|}{\\\\sin x}$, then :" ? options go only in options[0..3].
- When options are printed text/equations (fractions, limits, $f(-\\\\pi^+)=-1$, "does not exist"), put the FULL math line in options[0..3], set regionTypes to include "optionText", and NEVER invent graph panels or verbal "[Graph A: ?]" descriptions.
- When options are graphs/figures/plots (not printed text or numbers), set each option to "" and regionTypes to include "optionGraph" ? never invent descriptions such as "[Graph A: Curve with local maximum]" or "Decreasing concave-down curve". Never concatenate option-region OCR into the stem. The client crops option images separately.
- If a printed Solution: block appears, put it in solution.
- Prefer LaTeX for equations (\\\\frac, \\\\sqrt, ^{}, _{}). Cover all PCMB Class 11–12 topics (mechanics, E&M, optics, thermo, organic/inorganic/physical chem, calculus, algebra, coordinate geometry, botany, zoology, genetics, ecology, etc.).
- Physics: vectors, units, \\\\vec{F}, \\\\mathrm{m/s}, \\\\Omega, \\\\mu_0, \\\\epsilon_0, \\\\lambda, \\\\omega, \\\\theta, \\\\phi; keep subscripts (v_0, I_{rms}); circuit symbols as text/LaTeX, not invented drawings. Keep stem figures via regionTypes "stemFigure".
- Chemistry: formulas/reactions as \\\\ce{H2O}, \\\\ce{H2SO4}, \\\\ce{Fe^{2+}}, \\\\ce{SO4^{2-}}; arrows \\\\rightarrow / \\\\rightleftharpoons; \\\\Delta H, K_c, pH, \\\\mathrm{mol\\,L^{-1}}. Never invent structures as "[Graph]".
- Biology: species/binomial names, allele notation (I^A I^B), DNA/RNA base letters, \\\\rightarrow in pathways, Greek \\\\alpha \\\\beta \\\\gamma when printed. Keep diagrams as stemFigure; do not invent option images.
- Piecewise / cases (CRITICAL): In the JSON string value, write real LaTeX as:
  f(x)=\\begin{cases} x^{2}e^{2(x-1)}, & 0\\le x\\le 1 \\\\ a\\operatorname{sgn}(x+1)\\cos(2x-2)+bx^{2}, & 1<x\\le 2 \\end{cases}
  Rules: (1) ALWAYS put \\\\ (two backslashes in the parsed LaTeX = one KaTeX row break) BETWEEN case rows ? never glue rows. (2) ALWAYS write \\operatorname{sgn} ? never bare "sgn" or "a sgn" or "asgn". (3) Keep intervals 0\\le x\\le 1 and 1<x\\le 2 exactly. (4) Keep e^{2(x-1)} exactly. Differentiability stems must keep the full cases block + "differentiable at $x=1$". Never invent "asgn" / "Usxst" garbage.
- Greek pi constant: always output \\\\pi (never the English word "pi" or "Pi"). One-sided limits: $-\\\\pi^{+}$, $-\\\\pi^{-}$ (or \\\\pi^+ / \\\\pi^-). Examples: $|x+\\\\pi|$, $-\\\\pi$, \\\\sin\\\\pi x, \\\\frac{\\\\pi}{4}, \\\\lim_{x\\\\to -\\\\pi}.
- PRIMES ON FUNCTIONS: carefully count prime marks on f, g, y, etc. Output LaTeX $f'(x)$, $f''(x)$ (ASCII apostrophe primes). Never drop a prime (f'(x) must NOT become f(x)). Never invent an extra prime or swap orders. If the print shows f'(x) > 0 and f''(x) < 0, copy exactly those ? never write f''(x)>0 and f(x)<0.
- Determinants: use $\\\\begin{vmatrix}a & b \\\\\\\\ c & d\\\\end{vmatrix}$ (vmatrix). Matrices: bmatrix. Preserve EVERY cell ? do not drop rows/columns.
- Copy matrix / determinant entries EXACTLY as printed, including variable terms like 1+x, 1+y, 1+2y, 1+z, 1+3z. Never drop variables or replace cells with bare constants.
- Never write x \\\\neq^0 ? always write $x \\\\neq 0$ (space before 0; 0 is NOT a superscript). Same for y, z and \\\\leq / \\\\geq.
- Inverses / superscripts: write $x^{-1}$, $y^{-1}$, $z^{-1}$ (never "x#O", "y?", "1-", or "x-1" garbage).
- Inequalities: $\\\\neq$, $\\\\leq$, $\\\\geq$, $\\\\lt$, $\\\\gt$. Absolute values: $|\\ldots|$ or \\\\lvert \\\\rvert.
- Conditions like "If $x \\\\neq 0$, $y \\\\neq 0$, $z \\\\neq 0$" must keep \\\\neq clearly with a normal (non-superscript) 0.
- Options that are numbers or short expressions must still be exact LaTeX/text copies of the print.
- When inferable, also fill optional metatags on each question (suggestions only):
  "subject": "mathematics|physics|chemistry|biology",
  "section": "unit name if clear",
  "chapter": "e.g. Matrices & Determinants",
  "topic": "e.g. Determinants",
  "examIds": ["jee-main"] or ["jee-advanced"] or ["neet"] when obvious,
  "toughnessLevel": 1-10 integer guess.
  Leave metatag fields null when unsure ? never invent unrelated chapters.
- If the image is unreadable, still return best-effort stem/options JSON (empty strings allowed) rather than refusing — the client falls back to Local OCR.`

const SOLVE_SYSTEM = `You are an expert JEE Main/Advanced + NEET (PCMB Class 11–12) tutor.
Given one question (stem + options + optional known answer), produce a **short, clear** step-by-step solution a student can follow quickly.
Return ONLY valid JSON:
{
  "correctIndex": 0,
  "correctIndices": null,
  "correctInteger": null,
  "correctNumerical": null,
  "solution": "markdown with LaTeX $...$; numbered steps; end with **Correct:** (X)",
  "steps": ["Step 1 …", "Step 2 …"],
  "whyCorrect": "one short sentence",
  "whyOthersWrong": [{"option":"A","reason":"one short line"}]
}
Style (IMPORTANT):
- **Concise math working only** — NOT an essay, NOT teaching meta-instructions.
- Never write filler like "What is asked?", "Read the stem once", "Work it out", or "Substitute and simplify in 1–2 lines".
- Typical MCQ = **3–5 steps**, each **1–2 lines of real math/reasoning**. Total usually **under 220 words**.
- Use numbered steps like **Step 1**, **Step 2** … then **Correct:** (A) at the end.
- For wrong options: at most **one short line each** (skip empty / graph placeholders).
- Use math-safe LaTeX. Do not invent facts not implied by the stem.
- If the stem looks garbled/unreadable, return a short note: "Stem OCR incomplete — fix question text before generating solution." and leave correctIndex as provided.
- If correctIndex/answer is already provided, keep it unless clearly inconsistent; explain it briefly.
- Carefully respect derivative primes: $f'(x)>0$ = increasing; $f''(x)<0$ = concave down. Never swap $f$ and $f'$.
- Graph MCQs: match increasing/concave properties from the stem before picking an option.`

const OPTION_REGIONS_SYSTEM = `You locate regions in a JEE/NEET PCMB exam MCQ screenshot (stem text, stem figure, option text, option graphs — physics circuits, chem apparatus, bio diagrams, math plots).
Return ONLY valid JSON (no markdown fences):
{
  "layout": "grid2x2" | "rows4" | "cols4" | "unknown",
  "case": "text_text" | "text_graphs" | "figure_text" | "figure_graphs" | "mixed_options" | "no_figure",
  "regions": [
    { "kind": "stemText" | "stemFigure" | "optionText" | "optionGraph", "label": "A"|"B"|"C"|"D"|null, "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }
  ],
  "options": [
    { "label": "A", "kind": "optionGraph" | "optionText" | "empty", "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } },
    { "label": "B", "kind": "optionGraph" | "optionText" | "empty", "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } },
    { "label": "C", "kind": "optionGraph" | "optionText" | "empty", "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } },
    { "label": "D", "kind": "optionGraph" | "optionText" | "empty", "box": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 } }
  ]
}
Rules:
- box coordinates are NORMALIZED fractions of the FULL image (0?1): x,y = top-left; w,h = size.
- Adaptive: do NOT assume every question has option graphs or a stem figure. Classify the real case.
- text_text / no_figure: options are fractions/numbers/LaTeX text ? set layout "unknown", option kind "optionText", empty graph boxes (w/h = 0). Never invent graph panels.
- text_graphs: stem is text only; A?D are graphs (1?4 row or 2?2). Return four optionGraph boxes. Do NOT include option panels in a stemFigure box.
- figure_text: stem has a circuit/diagram/plot; options are text ? return stemFigure box; option boxes empty or optionText.
- figure_graphs: stem has its own figure AND options are graphs ? return stemFigure (stem only, exclude option band) PLUS four optionGraph boxes.
- mixed_options: some options are graphs, some are text ? only return boxes for graph options; set kind optionText with empty box for text options.
- For optionGraph boxes: include FULL graph/plot (axes, ticks, curve). Exclude stem text above. Never return label-only strips such as only "(A)" text. Never span two side-by-side graphs in one box.
- Common JEE: four graphs in ONE HORIZONTAL ROW with (A)(B)(C)(D) under them ? layout "cols4", equal-width vertical panels (~0.2?0.25), same y/h.
- grid2x2: A=TL B=TR C=BL D=BR. rows4: stacked. cols4: left?right.
- Always return exactly four options A?D entries (use kind empty / w=h=0 when that option is not a graph).
- Do not describe curves in words as a substitute for boxes.`

/**
 * @param {{ imageBase64: string, mimeType?: string, hint?: string }} input
 */
async function callOpenAIVision(input, system, userText) {
  const { openaiKey, openaiModel } = getVisionEnv()
  const mime = input.mimeType || 'image/jpeg'
  const body = {
    model: openaiModel,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${input.imageBase64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI vision HTTP ${res.status}`
    throw new Error(msg)
  }
  const content = data?.choices?.[0]?.message?.content ?? ''
  return { raw: content, parsed: extractJsonObject(content), provider: 'openai', model: openaiModel }
}

/**
 * @param {{ imageBase64?: string, mimeType?: string }} input
 */
async function callGemini(input, system, userText, withImage, opts = {}) {
  const { geminiKey, geminiModel } = getVisionEnv()
  const mime = input.mimeType || 'image/jpeg'
  const useCache = !withImage && opts.promptCache !== false && Boolean(system?.trim())

  const models = Array.isArray(opts.models) && opts.models.length
    ? opts.models
    : withImage
      ? opts.visionQuality === 'flash-only'
        ? geminiModelCandidates(geminiModel)
        : geminiVisionModelCandidates()
      : geminiTextModelCandidates()
  const temperature = Number.isFinite(Number(opts.temperature)) ? Number(opts.temperature) : 0.1
  const maxOutputTokens = Number(opts.maxOutputTokens)
  const maxAttempts = Number(opts.maxAttempts) > 0 ? Number(opts.maxAttempts) : 3
  const timeoutMs = Number(opts.timeoutMs)

  let lastErr = /** @type {Error | null} */ (null)
  for (const model of models) {
    const cachedContent = useCache
      ? await resolveGeminiCachedContent(model, system, geminiKey)
      : null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const useJsonMime = attempt < 2
      /** @type {object[]} */
      const parts = cachedContent
        ? [{ text: userText }]
        : [{ text: `${system}\n\n${userText}` }]
      if (withImage && input.imageBase64) {
        parts.push({ inline_data: { mime_type: mime, data: input.imageBase64 } })
      }
      const body = JSON.stringify({
        ...(cachedContent ? { cachedContent } : {}),
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature,
          ...(Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
            ? { maxOutputTokens }
            : {}),
          ...(useJsonMime ? { responseMimeType: 'application/json' } : {}),
        },
      })
      const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`
      let res
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body,
          ...(Number.isFinite(timeoutMs) && timeoutMs > 0
            ? { signal: AbortSignal.timeout(timeoutMs) }
            : {}),
        })
      } catch (fetchErr) {
        const timed =
          fetchErr?.name === 'AbortError' || /aborted|timeout/i.test(String(fetchErr?.message ?? ''))
        const err = new Error(
          timed
            ? `Gemini timed out after ${Math.round(timeoutMs / 1000)} seconds.`
            : fetchErr instanceof Error
              ? fetchErr.message
              : 'Gemini request failed',
        )
        err.code = timed ? 'VISION_TIMEOUT' : 'VISION_EXTRACT_FAILED'
        lastErr = err
        if (timed && attempt < maxAttempts - 1) continue
        throw err
      }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const block =
          data?.promptFeedback?.blockReason ||
          data?.candidates?.[0]?.finishReason === 'SAFETY'
        const content =
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ??
          ''
        if (!String(content).trim()) {
          const empty = new Error(
            block
              ? `Gemini vision empty/blocked (${block})`
              : 'Gemini vision empty response',
          )
          empty.status = res.status
          empty.code = 'VISION_EMPTY'
          lastErr = empty
          if (attempt < 2) {
            await sleepMs(1200 * (attempt + 1))
            continue
          }
          break
        }
        return { raw: content, parsed: extractJsonObject(content), provider: 'gemini', model }
      }
      const apiMsg = data?.error?.message || data?.error?.status || ''
      const auth =
        res.status === 401 ||
        res.status === 403 ||
        /API_KEY|UNAUTHENTICATED|PERMISSION_DENIED|ACCESS_TOKEN_TYPE|invalid/i.test(String(apiMsg))
      const modelGone = isGeminiModelUnavailable(res.status, apiMsg)
      const quota =
        res.status === 429 ||
        /RESOURCE_EXHAUSTED|quota|rate[- ]?limit|exceeded your current/i.test(String(apiMsg))
      const msg =
        (apiMsg ? `Gemini vision HTTP ${res.status}: ${apiMsg}` : `Gemini vision HTTP ${res.status}`) +
        (auth
          ? ' ? check GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) in .env, then restart with F5.'
          : '')
      const err = new Error(msg)
      err.status = res.status
      if (auth) err.code = 'VISION_AUTH_FAILED'
      else if (quota) err.code = 'VISION_QUOTA'
      else if (modelGone) err.code = 'VISION_MODEL_UNAVAILABLE'
      else err.code = 'VISION_EXTRACT_FAILED'
      lastErr = err
      // Auth/quota: stop immediately. Model-gone: try next candidate. Other errors: stop.
      if (auth || quota || !modelGone) throw err
      break
    }
  }
  const exhausted = lastErr || new Error('Gemini vision: no working model')
  if (exhausted.code === 'VISION_MODEL_UNAVAILABLE') {
    exhausted.message +=
      ' ? set GEMINI_VISION_MODEL=gemini-3.5-flash (or gemini-flash-latest) in .env, then press F5.'
  }
  throw exhausted
}

/**
 * @param {{ imageBase64: string, mimeType?: string, hint?: string, provider?: string }} body
 */
export async function extractWithCloudVision(body) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const provider = resolveProvider(body.provider || 'auto')
  if (!provider) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const hint = String(body.hint ?? '').trim()
  const userText = hint
    ? `Extract all exam questions from this image.\nExtra hint: ${hint}`
    : 'Extract all exam questions from this image. Split multi-question pages clearly.'

  const input = {
    imageBase64: String(body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, ''),
    mimeType: body.mimeType || 'image/jpeg',
  }
  if (!input.imageBase64 || input.imageBase64.length < 80) {
    throw new Error('imageBase64 is required')
  }

  const result =
    provider === 'openai'
      ? await callOpenAIVision(input, EXTRACT_SYSTEM, userText)
      : await callGemini(input, EXTRACT_SYSTEM, userText, true, {
          maxOutputTokens: geminiMaxOutputTokens('GEMINI_VISION_EXTRACT_MAX_OUTPUT', 4096),
        })

  return {
    ok: true,
    engine: 'cloud-vision',
    provider: result.provider,
    model: result.model,
    parsed: result.parsed,
    raw: result.raw,
  }
}

async function callOpenAIText(system, userText) {
  const { openaiKey, openaiModel } = getVisionEnv()
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`)
  }
  const content = data?.choices?.[0]?.message?.content ?? ''
  return {
    raw: content,
    parsed: extractJsonObject(content),
    provider: 'openai',
    model: openaiModel,
  }
}

/**
 * Locate option graph bounding boxes A?D (normalized 0?1 boxes).
 * @param {{ imageBase64: string, mimeType?: string, hint?: string, provider?: string }} body
 */
export async function locateOptionRegionsWithCloudVision(body) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const provider = resolveProvider(body.provider || 'auto')
  if (!provider) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const hint = String(body.hint ?? '').trim()
  const userText = hint
    ? `Locate the four option graph panels A?D in this image. Use cols4 when four graphs sit in one horizontal row; boxes must cover full axes+curve (not label-only strips).\nExtra hint: ${hint}`
    : 'Locate the four option graph panels A?D in this image. Prefer cols4 (1?4 horizontal row), then 2?2 grid, then vertical stack. Each box = full graph panel (axes+curve), never a thin "(A)" label strip, never a box spanning two graphs.'

  const input = {
    imageBase64: String(body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, ''),
    mimeType: body.mimeType || 'image/jpeg',
  }
  if (!input.imageBase64 || input.imageBase64.length < 80) {
    throw new Error('imageBase64 is required')
  }

  const result =
    provider === 'openai'
      ? await callOpenAIVision(input, OPTION_REGIONS_SYSTEM, userText)
      : await callGemini(input, OPTION_REGIONS_SYSTEM, userText, true, {
          maxOutputTokens: geminiMaxOutputTokens('GEMINI_VISION_REGIONS_MAX_OUTPUT', 1024),
        })

  return {
    ok: true,
    engine: 'cloud-vision',
    provider: result.provider,
    model: result.model,
    parsed: result.parsed,
    raw: result.raw,
  }
}

/**
 * Text-only solve (no image required).
 * @param {{
 *   text?: string
 *   options?: string[]
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   questionType?: string
 *   provider?: string
 * }} body
 */
export async function solveWithCloudVision(body) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const provider = resolveProvider(body.provider || 'auto')
  if (!provider) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }

  const payload = {
    text: String(body.text ?? '').trim(),
    options: Array.isArray(body.options) ? body.options.map((o) => String(o ?? '')) : [],
    correctIndex: body.correctIndex ?? null,
    correctIndices: body.correctIndices ?? null,
    correctInteger: body.correctInteger ?? null,
    correctNumerical: body.correctNumerical ?? null,
    questionType: body.questionType ?? 'mcq',
  }
  if (!payload.text) throw new Error('Question text is required')

  const userText = `Solve this JEE/NEET question. Keep the solution **short and easy to follow** (3–5 steps for MCQ). Return JSON only:\n${JSON.stringify(payload)}`

  const result =
    provider === 'openai'
      ? await callOpenAIText(SOLVE_SYSTEM, userText)
      : await callGemini({}, SOLVE_SYSTEM, userText, false, {
          maxOutputTokens: geminiMaxOutputTokens('GEMINI_SOLVE_MAX_OUTPUT', 2048),
        })

  return {
    ok: true,
    engine: 'cloud-vision',
    provider: result.provider,
    model: result.model,
    parsed: result.parsed,
    raw: result.raw,
  }
}

const ASSIST_SYSTEM = `You are a careful JEE/NEET study assistant for TestVantages.
Return ONLY valid JSON (no markdown fences).

Default shape (Career Compass / Mock Builder / general):
{
  "text": "plain helpful explanation in everyday English (2-6 short paragraphs or bullets)",
  "disclaimer": "one line reminding what is Official vs AI-assisted",
  "tags": ["optional", "topic", "labels"]
}

For task exam-pulse-briefing ONLY, return this shape instead:
{
  "items": [
    {
      "id": "string",
      "category": "exams|admissions|placements|motivation",
      "badge": "official|ai|curated|news",
      "title": "short headline",
      "summary": "1-2 student-friendly sentences",
      "whyItMatters": "one short sentence for aspirants",
      "source": "source name",
      "sourceUrl": "https://...",
      "publishedAt": "YYYY-MM-DD"
    }
  ],
  "disclaimer": "one line: curated briefing, verify on official portals",
  "text": "optional one-line status"
}
For task quick-revision-sheet ONLY, return this shape instead:
{
  "definitions": [{"term": "short name", "meaning": "2-4 full sentences: what it is, symbols/units, conditions, one mix-up"}],
  "formulas": [{"name": "standard formula name", "latex": "KaTeX without dollar signs", "note": "when to use"}],
  "extraFormulas": [{"name": "non-standard / special-case formula", "latex": "KaTeX without dollar signs", "note": "trick, limit, or JEE/NEET extra"}],
  "points": ["important exam point or pitfall"],
  "text": "one-line summary of the chapter sheet",
  "disclaimer": "AI revision sheet - check NCERT / class notes"
}
MAXIMUM coverage for that one chapter: 14-20 long definitions, 12-20 standard formulas, 8-16 extra/non-standard formulas (REQUIRED, never empty, never merged into formulas), 8-14 points. extraFormulas must NOT duplicate formulas. Everyday English. Do not invent official ranks or cut-offs.
For task quick-revision-strategy ONLY, return this shape instead:
{
  "items": [{"familyName": "how you solve this group", "typeName": "short title", "problem": "full stem from the given PYQ when source is pyq", "options": ["A", "B", "C", "D"], "steps": ["how to solve THIS question and this family"], "outline": "working and answer", "source": "pyq or extra", "questionId": "id from pyqQuestions", "pyqYear": 2023, "paperLabel": "paper label"}],
  "text": "one-line summary",
  "disclaimer": "AI strategy grouping - PYQ first"
}
Cluster given pyqQuestions into distinct strategy families. Use those PYQ stems. Add source extra only when a variation has no PYQ. Do not invent PYQ years. Do not dump invented MCQs. Count is not fixed. Everyday English. No invented ranks.
Hard rules:
- NEVER invent official ranks, percentiles, cutoffs, exam dates, or college closing ranks.
- When the user payload includes numbers labeled official/computed, quote them exactly - do not change them.
- Career Compass: explain bands and match reasons only; label Official vs AI.
- Mock Builder: explain paper structure / chapter mix from the given report; do not invent questions.
- Exam Pulse: only rewrite/filter the given headlines; keep official portal items; do not invent new dates or results.
- Result coach: polish coaching tips from given strengths/focus only; never invent scores, percentiles, ranks, or cut-offs.
- Lecture planner: rewrite shortDescription / detailed teaching notes for teachers; keep the same question ids and teaching order; never invent new question ids or stems.
- Quick Revision: maximum definitions, standard formulas, extra/non-standard formulas, and pitfalls for the given chapter only; keep latex valid; no invented cut-offs.
- Quick Revision strategy: cluster given PYQ into strategy families; PYQ first; extra only if no PYQ for that variation; no invented ranks.
- Keep tone clear for students and parents. No API keys or secrets.`

function splitRevisionExtraFormulas(formulas, extraFormulas) {
  const extra = (Array.isArray(extraFormulas) ? extraFormulas : []).filter(Boolean)
  const standard = (Array.isArray(formulas) ? formulas : []).filter(Boolean)
  if (extra.length) return { formulas: standard, extraFormulas: extra }
  const hint = /trick|special case|non-standard|less-common|advanced extra|rarely used|exceptional|not in ncert|jee advanced extra/i
  const tagged = []
  const rest = []
  for (const f of standard) {
    const blob = f && typeof f === 'object' ? `${f.name || ''} ${f.note || ''} ${f.kind || ''}` : String(f || '')
    if (hint.test(blob)) tagged.push(f)
    else rest.push(f)
  }
  if (tagged.length >= 3) return { formulas: rest, extraFormulas: tagged }
  if (standard.length > 14) return { formulas: standard.slice(0, 12), extraFormulas: standard.slice(12) }
  return { formulas: standard, extraFormulas: extra }
}

/**
 * Generic text assist (Career Compass explain, Mock Builder narrative, etc.).
 * @param {{ task?: string, context?: object, provider?: string }} body
 */
export async function assistWithCloudVision(body = {}) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const provider = resolveProvider(body.provider || 'auto')
  if (!provider) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }

  const task = String(body.task ?? 'general').trim() || 'general'
  const context = body.context && typeof body.context === 'object' ? body.context : {}
  const revision = task === 'quick-revision-sheet'
  const strategy = task === 'quick-revision-strategy'
  const longAssist = revision || strategy
  const contextCap = longAssist ? 20000 : 12000
  const extraRule = revision
    ? '\nCRITICAL: extraFormulas MUST be a separate non-empty JSON array (8-16 items) of non-standard / trick / special-case formulas. Do not put those only inside formulas. Each definition meaning must be 2-4 full sentences, not a stub.'
    : strategy
      ? '\nCRITICAL: Cluster pyqQuestions into strategy families. Use those PYQ as worked examples (source pyq, keep questionId). Add source extra only if a variation has no PYQ. Do not invent a dump of MCQs or fake PYQ years.'
      : ''
  const userText = `Task: ${task}\nContext JSON (treat numbers as fixed - do not invent new ranks/cutoffs):\n${JSON.stringify(context).slice(0, contextCap)}\nReturn JSON only.${extraRule}`

  const result =
    provider === 'openai'
      ? await callOpenAIText(ASSIST_SYSTEM, userText)
      : await callGemini({}, ASSIST_SYSTEM, userText, false, longAssist
          ? {
              maxOutputTokens: geminiMaxOutputTokens('GEMINI_ASSIST_MAX_OUTPUT', 6144),
              temperature: 0.35,
            }
          : { maxOutputTokens: geminiMaxOutputTokens('GEMINI_ASSIST_MAX_OUTPUT', 4096) })

  const parsed = result.parsed && typeof result.parsed === 'object' ? result.parsed : null
  if (revision && parsed && Array.isArray(parsed.definitions)) {
    const split = splitRevisionExtraFormulas(parsed.formulas ?? [], parsed.extraFormulas ?? parsed.nonStandardFormulas ?? [])
    parsed.formulas = split.formulas
    parsed.extraFormulas = split.extraFormulas
  }
  const structuredRevision =
    parsed && Array.isArray(parsed.definitions)
      ? JSON.stringify({
          definitions: parsed.definitions,
          formulas: parsed.formulas ?? [],
          extraFormulas: parsed.extraFormulas ?? parsed.nonStandardFormulas ?? [],
          points: parsed.points ?? parsed.importantPoints ?? [],
          text: parsed.text ?? '',
          disclaimer: parsed.disclaimer ?? '',
        })
      : ''
  const structuredStrategy =
    strategy && parsed && Array.isArray(parsed.items)
      ? JSON.stringify({
          items: parsed.items,
          text: parsed.text ?? '',
          disclaimer: parsed.disclaimer ?? '',
        })
      : ''
  const text =
    structuredRevision ||
    structuredStrategy ||
    (parsed && String(parsed.text ?? parsed.explanation ?? parsed.narrative ?? '').trim()) ||
    String(result.raw ?? '').trim()

  return {
    ok: true,
    engine: 'cloud-vision',
    provider: result.provider,
    model: result.model,
    text,
    disclaimer: parsed?.disclaimer ? String(parsed.disclaimer) : undefined,
    tags: Array.isArray(parsed?.tags) ? parsed.tags.map(String).slice(0, 12) : [],
    parsed,
    raw: result.raw,
  }
}

const STRUCTURE_OCR_SYSTEM = `You structure exam questions from Mathpix OCR text (LaTeX or Mathpix markdown). You do NOT OCR images.
Return ONLY valid JSON:
{
  "instructions": "paper/section instructions only - never a numbered question",
  "questions": [
    {
      "number": 1,
      "text": "complete stem only, LaTeX in $...$, stop before (A)",
      "options": ["A","B","C","D"],
      "questionType": "single_correct|multiple_correct|integer|numerical|matrix_match|true_false|passage",
      "correctIndex": 0,
      "correctIndices": null,
      "correctInteger": null,
      "correctNumerical": null,
      "solution": "step-by-step with LaTeX $...$",
      "subject": "physics|chemistry|mathematics|biology|botany|zoology",
      "section": "unit name",
      "chapter": "chapter name",
      "topic": "topic",
      "examIds": ["jee-main"],
      "pyqYear": 2024,
      "paperLabel": "",
      "toughnessLevel": 5,
      "marks": 4,
      "marking": { "correct": 4, "wrong": -1, "unattempted": 0 },
      "instructions": "section instructions that apply to THIS question only",
      "passageText": null,
      "answerKeyVisible": false
    }
  ]
}
Hard rules:
- Split every real numbered exam question. Do NOT turn SECTION headers, marking schemes, "This section contains", or instruction pages into questions. Put those in instructions (paper-level) or questions[].instructions (attached to the right items).
- Mathpix papers use \\item[Q.]1, \\item[Q . ]1, \\item[Q.] 10, Q.1, Q.10. EACH marker is a NEW question. Never glue Q.1 math to Q.10 chemistry.
- A full JEE Advanced paper is ~51 questions (17+17+17). Returning 1 question for a full paper is a failure. Never dump the whole OCR page into questions[0].text.
- Keep COMPLETE stems including displayed math after Then / is equal to. Stem stops before (A). Put LaTeX in $...$ so it can render.
- Exactly 4 option strings for SCQ/MSQ when printed. Integer/numerical may use empty options.
- Fill answer + solution from the OCR when possible. If a printed key is in the text, set answerKeyVisible true. Otherwise solve and fill, and still return a real solution.
- Fill subject, section (unit), chapter, topic, examIds, year/paper, toughness 1-10, marks/marking.
- Never invent extra questions that are only instructions.
- Keep JSON compact: omit null/empty optional fields. Solutions: brief key steps only (~300 chars each) unless a proof truly needs more.
- Double-escape backslashes in JSON.`

function mergeStructureChunks(parts) {
  const questions = []
  const instructions = []
  for (const part of parts) {
    const parsed = part?.parsed && typeof part.parsed === 'object' ? part.parsed : null
    if (parsed?.instructions) instructions.push(String(parsed.instructions))
    const list = Array.isArray(parsed?.questions) ? parsed.questions : []
    questions.push(...list)
  }
  return {
    instructions: instructions.filter(Boolean).join('\n\n'),
    questions,
  }
}

function chunkOcrText(text, maxChars = 24000) {
  const raw = String(text ?? '')
  if (raw.length <= maxChars) return [raw]
  const qParts = raw.split(
    /(?=\\item\s*\[\s*Q[^\]]{0,16}\]\s*\d{1,3})|(?=(?:^|\n)\s*Q\s*\.?\s*\d{1,3}\b)/i,
  )
    .map((p) => p.trim())
    .filter(Boolean)
  if (qParts.length >= 2) {
    const grouped = []
    let buf = ''
    for (const part of qParts) {
      if (buf && (buf + '\n\n' + part).length > maxChars) {
        grouped.push(buf)
        buf = part
      } else {
        buf = buf ? `${buf}\n\n${part}` : part
      }
    }
    if (buf.trim()) grouped.push(buf)
    if (grouped.length >= 1) return grouped
  }
  const chunks = []
  const pageSplit = raw.split(/\n\s*---+\s*page\s*---+\s*\n/i)
  if (pageSplit.length > 1) {
    let buf = ''
    for (const page of pageSplit) {
      if ((buf + page).length > maxChars && buf) {
        chunks.push(buf)
        buf = page
      } else {
        buf = buf ? `${buf}\n\n${page}` : page
      }
    }
    if (buf.trim()) chunks.push(buf)
    return chunks
  }
  for (let i = 0; i < raw.length; i += maxChars) chunks.push(raw.slice(i, i + maxChars))
  return chunks
}

/**
 * Text-only: split Mathpix OCR into bank fields. No image OCR.
 * @param {{
 *   text?: string
 *   format?: string
 *   officialPyq?: boolean
 *   paperMeta?: object
 *   provider?: string
 * }} body
 */
export async function structureOcrWithGemini(body = {}) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(
      'GEMINI_API_KEY is missing. Add it to onlinetest/.env, then press F5 so Gemini can fill questions after Mathpix OCR.',
    )
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const provider = resolveProvider(body.provider || 'auto')
  if (!provider) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const text = String(body.text ?? '').trim()
  if (!text) {
    const err = new Error('OCR text is required for Gemini to fill question-bank fields.')
    err.code = 'STRUCTURE_OCR_EMPTY'
    throw err
  }
  const paperMeta = body.paperMeta && typeof body.paperMeta === 'object' ? body.paperMeta : {}
  const official = body.officialPyq === true
  const deferSolutions = body.deferSolutions === true
  const format = body.format === 'word' ? 'word' : 'latex'
  const chunks = chunkOcrText(text)
  const parts = []
  const deadline = Date.now() + (official ? 50_000 : 90_000)
  let lastChunkErr = null
  for (let i = 0; i < chunks.length; i++) {
    if (Date.now() > deadline) break
    const extra = official
      ? 'Official PYQ paper: split EVERY \\item[Q.] / Q.n into its own question. Instructions stay instructions, not extra questions. Returning 1 blob for a multi-question paper is wrong. Keep paper identity from context.'
      : deferSolutions
        ? 'Question-bank verify step: split every question with stem + options + questionType. Do NOT write solutions — set solution to null on every row. User will approve split first, then ask for solutions later.'
        : 'Question-bank upload: fill every field you can.'
    const userText = `Format: ${format}\nPaper context JSON: ${JSON.stringify(paperMeta).slice(0, 4000)}\n${extra}\nChunk ${i + 1}/${chunks.length} of Mathpix OCR:\n${chunks[i]}`
    try {
      const result =
        provider === 'openai'
          ? await callOpenAIText(STRUCTURE_OCR_SYSTEM, userText)
          : await callGemini({}, STRUCTURE_OCR_SYSTEM, userText, false, {
              maxOutputTokens: geminiMaxOutputTokens(
                'GEMINI_STRUCTURE_MAX_OUTPUT',
                official ? 6144 : 8192,
              ),
              temperature: 0.1,
              timeoutMs: official ? 25_000 : 35_000,
              maxAttempts: 1,
              promptCache: true,
            })
      parts.push(result)
    } catch (chunkErr) {
      lastChunkErr = chunkErr
    }
  }
  if (!parts.length) {
    const err = lastChunkErr instanceof Error
      ? lastChunkErr
      : new Error('Gemini did not split this OCR text in time. Use Re-parse stored OCR.')
    err.code = err.code || 'VISION_TIMEOUT'
    throw err
  }
  const merged = mergeStructureChunks(parts)
  return {
    ok: true,
    engine: 'gemini-structure',
    provider: parts[0]?.provider,
    model: parts[0]?.model,
    parsed: merged,
    questions: merged.questions,
    instructions: merged.instructions,
    raw: parts.map((p) => p.raw).join('\n'),
  }
}

const ENRICH_LIGHT_SYSTEM = `You only fill metatags, answers, and a brief solution. Never rewrite stems. Never invent missing math or figures.
Return ONLY JSON: {"questions":[{"i":0,"subject":"mathematics|physics|chemistry|biology","section":null,"chapter":null,"topic":null,"toughnessLevel":5,"correctIndex":null,"correctInteger":null,"correctNumerical":null,"solution":null}]}
correctIndex 0-3 only when the answer is clear; else null. Leave chapter/topic null if unsure. Solutions: at most 2 short steps (~200 chars). If deferSolutions is true, set solution to null.`

/**
 * Light flash-lite pass after local split. Tags + answers only.
 */
export async function enrichOcrLightWithGemini(body = {}) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const items = Array.isArray(body.questions) ? body.questions.slice(0, 12) : []
  if (!items.length) {
    return { ok: true, questions: [], model: getVisionEnv().geminiTextModel, engine: 'gemini-enrich-light' }
  }
  const paperMeta = body.paperMeta && typeof body.paperMeta === 'object' ? body.paperMeta : {}
  const userText = `Paper: ${JSON.stringify(paperMeta).slice(0, 400)}\ndeferSolutions: ${body.deferSolutions === true}\nAlready-split questions (do not rewrite stems):\n${JSON.stringify(items).slice(0, 12000)}`
  const result = await callGemini({}, ENRICH_LIGHT_SYSTEM, userText, false, {
    models: (() => {
      const lite = geminiTextModelCandidates().filter((m) => /lite/i.test(m))
      return lite.length ? lite.slice(0, 4) : ['gemini-3.5-flash-lite']
    })(),
    maxOutputTokens: 2048,
    temperature: 0.1,
    timeoutMs: 8_000,
    maxAttempts: 1,
    promptCache: true,
  })
  const parsed = result?.parsed && typeof result.parsed === 'object' ? result.parsed : {}
  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  return {
    ok: true,
    engine: 'gemini-enrich-light',
    provider: result?.provider,
    model: result?.model || getVisionEnv().geminiTextModel,
    questions,
  }
}

/**
 * Generate 10 SCQ drafts for one built-in curriculum chapter (Gemini JSON).
 * Does not save or publish — caller persists as draft.
 */
export async function generateScqTrialChapter(body = {}) {
  const status = getVisionStatus()
  if (!status.configured) {
    const err = new Error(status.message)
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }
  const { geminiKey } = getVisionEnv()
  if (!geminiKey) {
    const err = new Error(
      'GEMINI_API_KEY is missing. Add it to onlinetest/.env, then press F5 / restart the API server.',
    )
    err.code = 'VISION_NOT_CONFIGURED'
    throw err
  }

  const examId = normalizeTrialExamId(body.examId)
  const subject = String(body.subject ?? '').trim()
  const section = String(body.section ?? '').trim()
  const chapter = String(body.chapter ?? '').trim()
  if (!trialSubjectAllowed(examId, subject)) {
    const err = new Error(`Subject ${subject} is not on the ${examId} trial list.`)
    err.code = 'SCQ_TRIAL_BAD_SUBJECT'
    throw err
  }
  if (!section || !chapter) {
    const err = new Error('section and chapter are required')
    err.code = 'SCQ_TRIAL_BAD_CHAPTER'
    throw err
  }

  const similarFromPyq = Boolean(body.similarFromPyq)
  const seedStem = String(body.seedStem ?? '').trim()
  if (similarFromPyq && !seedStem) {
    const err = new Error('Pick one PYQ as the seed first.')
    err.code = 'SCQ_TRIAL_BAD_CHAPTER'
    throw err
  }

  const job = {
    examId,
    examLabel: trialExamLabel(examId),
    subject,
    section,
    chapter,
    topics: Array.isArray(body.topics) ? body.topics.map(String) : [],
    count: similarFromPyq
      ? clampSimilarFromPyqCount(body.count)
      : clampTrialCount(body.count),
    typeMix: normalizeTrialTypeMix(body.typeMix ?? body.questionTypes),
    pyqYear: body.pyqYear,
    pyqStyle: Boolean(body.pyqStyle) && !similarFromPyq,
    pyqDate: body.pyqDate,
    pyqShift: body.pyqShift,
    pyqSession: body.pyqSession,
    similarFromPyq,
    seedStem: seedStem.slice(0, 4000),
    seedQuestionType: String(body.seedQuestionType ?? 'single_correct'),
    seedToughness: body.seedToughness,
    seedId: body.seedId,
  }
  if (!similarFromPyq && !job.pyqStyle) {
    job.typePlan = planTrialQuestionTypes(job.examId, job.count, job.typeMix)
  }
  if (!job.topics.length) {
    const found = listTrialChapters(examId, subject).find(
      (c) => c.section === section && c.chapter === chapter,
    )
    if (found) job.topics = found.topics
  }
  const prompt = buildScqTrialPrompt(job)
  let lastParse = null
  let result = null
  const temperature = similarFromPyq ? 0.55 : job.pyqStyle ? 0.4 : 0.75
  for (let tryN = 0; tryN < 2; tryN++) {
    result = await callGemini({}, SCQ_TRIAL_SYSTEM, prompt, false, {
      models: geminiScqTrialModelCandidates(),
      temperature,
      maxOutputTokens: geminiMaxOutputTokens('GEMINI_SCQ_TRIAL_MAX_OUTPUT', 4096),
      promptCache: true,
    })
    lastParse = parseAndValidateScqTrialResponse(result.raw, job)
    if (!lastParse.ok && result.parsed) {
      lastParse = parseAndValidateScqTrialResponse(result.parsed, job)
    }
    if (lastParse.ok) break
  }
  if (!lastParse?.ok) {
    const shortCount = similarFromPyq ? job.count : 5
    const shortJob = { ...job, count: shortCount }
    const shortPrompt = `${buildScqTrialPrompt(shortJob)}

CRITICAL: Reply with ONLY {"questions":[...]} — exactly ${shortCount} objects. Each solution max 3 sentences. No markdown fences.`
    result = await callGemini({}, SCQ_TRIAL_SYSTEM, shortPrompt, false, {
      models: geminiScqTrialModelCandidates(),
      temperature: similarFromPyq ? 0.4 : 0.3,
      maxOutputTokens: geminiMaxOutputTokens('GEMINI_SCQ_TRIAL_MAX_OUTPUT', 3072),
      promptCache: true,
    })
    lastParse = parseAndValidateScqTrialResponse(result.raw, shortJob)
    if (!lastParse.ok && result.parsed) {
      lastParse = parseAndValidateScqTrialResponse(result.parsed, shortJob)
    }
  }
  const parsed = lastParse
  if (!parsed.ok) {
    const err = new Error(parsed.errors[0] || 'Gemini returned no valid trial questions')
    err.code = 'SCQ_TRIAL_PARSE'
    throw err
  }
  return {
    ok: true,
    examId,
    subject,
    section,
    chapter,
    model: result.model,
    provider: result.provider,
    questions: parsed.questions,
    parseErrors: parsed.errors,
    rawCount: parsed.rawCount,
    raw: result.raw,
  }
}

/**
 * Generate full PYQ replica papers — one Gemini call per original question,
 * distributing variants across Similar1…SimilarN papers.
 * @param {object} body
 * @param {string} [jobId]
 */
export async function generatePyqReplicaPapers(body, jobId) {
  const parentPaper = body?.parentPaper ?? {}
  const seeds = Array.isArray(body?.questions) ? body.questions : []
  const replicaCount = clampReplicaPaperCount(body?.replicaCount)
  const existingIds = Array.isArray(body?.existingIds) ? body.existingIds.map(String) : []
  const pool = Array.isArray(body?.pool) ? body.pool : []

  if (!seeds.length) {
    const err = new Error('No questions in the source paper.')
    err.code = 'PYQ_REPLICA_EMPTY'
    throw err
  }

  const parentId = String(parentPaper.paperId ?? seeds[0]?.paperId ?? '').trim()
  if (!parentId) {
    const err = new Error('parentPaper.paperId is required.')
    err.code = 'PYQ_REPLICA_BAD_PAPER'
    throw err
  }

  const indices = nextReplicaIndices(parentId, pool, replicaCount)
  /** @type {{ replicaIndex: number, meta: ReturnType<typeof buildReplicaPaperMeta>, questions: object[] }[]} */
  const replicas = indices.map((replicaIndex) => ({
    replicaIndex,
    meta: buildReplicaPaperMeta(parentPaper, replicaIndex),
    questions: [],
  }))

  const job = jobId
    ? createReplicaJob(jobId, {
        parentPaperId: parentId,
        parentPaperLabel: parentPaper.paperLabel || '',
        replicaCount,
        questionTotal: seeds.length,
        replicaIndices: indices,
      })
    : null

  const log = (line) => {
    if (job) appendReplicaLog(job.id, line)
  }

  log(
    `Starting ${replicaCount} replica paper(s) from ${parentPaper.paperLabel || parentId} (${seeds.length} questions)…`,
  )

  const allIds = [...existingIds]
  let questionDone = 0
  const errors = []

  for (const seed of seeds) {
    const seedId = String(seed.id ?? '').trim()
    if (job) {
      updateReplicaProgress(job.id, { questionDone, currentQuestionId: seedId })
    }
    log(`Question ${questionDone + 1}/${seeds.length}: ${seedId || '(no id)'}…`)

    let jobSpec
    try {
      jobSpec = resolveTrialJobFromSeed(seed, parentPaper)
    } catch (e) {
      errors.push(`${seedId}: ${e instanceof Error ? e.message : 'bad seed'}`)
      questionDone += 1
      continue
    }
    jobSpec.count = replicaCount
    jobSpec.similarFromPyq = true
    jobSpec.replicaPaper = true

    let parsed = null
    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await generateScqTrialChapter({
          ...jobSpec,
          similarFromPyq: true,
          count: replicaCount,
          replicaPaper: true,
        })
        parsed = result
        break
      } catch (e) {
        lastErr = e
        if (attempt === 0) {
          log(`  Retry after error: ${e instanceof Error ? e.message : e}`)
          await sleepMs(SCQ_TRIAL_GAP_MS)
        }
      }
    }

    if (!parsed?.questions?.length) {
      errors.push(`${seedId}: ${lastErr instanceof Error ? lastErr.message : 'Gemini failed'}`)
      questionDone += 1
      continue
    }

    for (let r = 0; r < replicas.length; r++) {
      const item = parsed.questions[r]
      if (!item) continue
      const variantIndex = replicas[r].replicaIndex
      const draft = buildReplicaPyqQuestion(
        item,
        seed,
        replicas[r].meta,
        variantIndex,
        allIds,
        { slot: seed.pyqSlot ?? questionDone + 1 },
      )
      allIds.push(draft.id)
      replicas[r].questions.push(draft)
    }

    questionDone += 1
    if (job) updateReplicaProgress(job.id, { questionDone })
    if (questionDone < seeds.length) await sleepMs(SCQ_TRIAL_GAP_MS)
  }

  const ok = replicas.some((r) => r.questions.length > 0)
  const result = {
    ok,
    parentPaperId: parentId,
    replicaCount,
    replicas: replicas.map((r) => ({
      replicaIndex: r.replicaIndex,
      paperId: r.meta.paperId,
      paperLabel: r.meta.paperLabel,
      derivedFromPaperId: r.meta.derivedFromPaperId,
      questions: r.questions,
      count: r.questions.length,
    })),
    questionDone,
    questionTotal: seeds.length,
    errors,
  }

  if (job) {
    finishReplicaJob(job.id, { ...result, running: false })
    log(
      ok
        ? `Done — ${replicas.map((r) => `${r.meta.paperLabel} (${r.questions.length} Q)`).join(', ')}`
        : 'Failed — no questions generated.',
    )
  }

  if (!ok) {
    const err = new Error(errors[0] || 'No replica questions were generated.')
    err.code = 'PYQ_REPLICA_FAILED'
    err.details = result
    throw err
  }

  return result
}
