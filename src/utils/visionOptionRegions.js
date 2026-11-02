/**
 * Parse cloud-vision bounding boxes for MCQ option graphs A–D (pure — unit-testable).
 */

/**
 * @param {unknown} box
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
function coerceBox(box) {
  if (!box) return null
  if (Array.isArray(box) && box.length >= 4) {
    const [x, y, w, h] = box.map(Number)
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
    return { x, y, width: w, height: h }
  }
  if (typeof box !== 'object') return null
  const o = /** @type {Record<string, unknown>} */ (box)
  const x = Number(o.x ?? o.left ?? o.x0)
  const y = Number(o.y ?? o.top ?? o.y0)
  const width = Number(o.width ?? o.w ?? (o.x1 != null ? Number(o.x1) - x : NaN))
  const height = Number(o.height ?? o.h ?? (o.y1 != null ? Number(o.y1) - y : NaN))
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/**
 * Convert normalized (0–1) or pixel boxes to natural-pixel rects.
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @param {number} natW
 * @param {number} natH
 */
function toNaturalPixels(box, natW, natH) {
  const normalized =
    box.x <= 1.5 &&
    box.y <= 1.5 &&
    box.width <= 1.5 &&
    box.height <= 1.5 &&
    box.width > 0 &&
    box.height > 0
  if (normalized) {
    return {
      x: Math.round(box.x * natW),
      y: Math.round(box.y * natH),
      width: Math.round(box.width * natW),
      height: Math.round(box.height * natH),
    }
  }
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

/**
 * Clamp rect inside image bounds.
 * @param {{ x: number, y: number, width: number, height: number }} r
 * @param {number} natW
 * @param {number} natH
 */
function clampRect(r, natW, natH) {
  const x = Math.max(0, Math.min(natW - 8, r.x))
  const y = Math.max(0, Math.min(natH - 8, r.y))
  const width = Math.max(8, Math.min(natW - x, r.width))
  const height = Math.max(8, Math.min(natH - y, r.height))
  return { x, y, width, height }
}

/**
 * Reject Gemini boxes that are label-only strips or span multiple side-by-side graphs.
 * Pure heuristic (no DOM) — mirrors optionGraphPanelRectsLookValid intent.
 * Accepts 2–4 solid panels (mixed options may have fewer than 4 graphs).
 * @param {({ x: number, y: number, width: number, height: number } | null)[]} rects
 * @param {number} natW
 * @param {number} natH
 * @param {string} [layout]
 */
export function visionOptionBoxesLookLikeGraphPanels(rects, natW, natH, layout = '') {
  if (!rects?.length || !natW || !natH) return false
  const solid = /** @type {{ x: number, y: number, width: number, height: number }[]} */ (
    rects.filter(Boolean)
  )
  if (solid.length < 2) return false

  const widths = solid.map((r) => r.width).sort((a, b) => a - b)
  const heights = solid.map((r) => r.height).sort((a, b) => a - b)
  const midW = widths[Math.floor(widths.length / 2)]
  const midH = heights[Math.floor(heights.length / 2)]
  const maxH = heights[heights.length - 1]
  const minH = heights[0]

  // Tiny height ≈ label strip "(A)" only (even when all are equally short).
  if (minH < Math.max(32, natH * 0.06)) return false
  if (minH < maxH * 0.4 && minH < natH * 0.1) return false
  if (solid.some((r) => r.height < natH * 0.055 && r.width > r.height * 4)) return false

  // Box spans >1.5 typical graph widths.
  if (solid.some((r) => r.width > midW * 1.5 + 12)) return false

  // Later panels C/D must match A/B size when 4 boxes present (label scraps).
  if (solid.length >= 4) {
    const [ra, rb, rc, rd] = solid
    const abH = Math.min(ra.height, rb.height)
    const cdH = Math.min(rc.height, rd.height)
    const abW = Math.min(ra.width, rb.width)
    const cdW = Math.min(rc.width, rd.width)
    if (cdH < abH * 0.45 || cdW < abW * 0.45) return false
  }

  const lay = String(layout || '').toLowerCase()
  if (lay === 'cols4' || lay === 'row' || lay === 'horizontal') {
    if (solid.some((r) => r.width > natW * 0.4)) return false
    // Horizontal graph row panels must be tall enough to include axes+curve.
    if (minH < Math.max(48, natH * 0.12)) return false
    if (minH < midH * 0.5) return false
  }

  // Messy 2×2 on a 1×4 row: short bottom "label" pair (needs 4 panels).
  if (solid.length >= 4) {
    const byY = [...solid].sort((a, b) => a.y - b.y || a.x - b.x)
    const topH = Math.min(byY[0].height, byY[1].height)
    const botH = Math.max(byY[2].height, byY[3].height)
    const topY = Math.min(byY[0].y, byY[1].y)
    const botY = Math.min(byY[2].y, byY[3].y)
    if (botY > topY + topH * 0.35 && botH < topH * 0.45 && botH < natH * 0.1) return false
  }

  return true
}

/**
 * Extract adaptive layout hints from Gemini/OpenAI JSON (kinds + case).
 * @param {unknown} parsed
 */
export function parseVisionLayoutHints(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      hasStemFigure: false,
      optionGraphCount: 0,
      optionTextCount: 0,
      layout: '',
      case: '',
    }
  }
  const root = /** @type {Record<string, unknown>} */ (parsed)
  const layout = String(root.layout ?? '')
  const caseKind = String(root.case ?? '')
  let hasStemFigure = false
  let optionGraphCount = 0
  let optionTextCount = 0

  const regions = Array.isArray(root.regions) ? root.regions : []
  for (const r of regions) {
    if (!r || typeof r !== 'object') continue
    const kind = String(/** @type {Record<string, unknown>} */ (r).kind ?? '').toLowerCase()
    if (kind === 'stemfigure' || kind === 'stem_figure') hasStemFigure = true
    if (kind === 'optiongraph' || kind === 'option_graph') optionGraphCount += 1
    if (kind === 'optiontext' || kind === 'option_text') optionTextCount += 1
  }

  const options = Array.isArray(root.options) ? root.options : []
  for (const o of options) {
    if (!o || typeof o !== 'object') continue
    const kind = String(/** @type {Record<string, unknown>} */ (o).kind ?? '').toLowerCase()
    const box = coerceBox(
      /** @type {Record<string, unknown>} */ (o).box ??
        /** @type {Record<string, unknown>} */ (o).bbox ??
        o,
    )
    if (kind === 'optiongraph' || kind === 'option_graph' || kind === 'graph') {
      if (box && box.width > 0.02 && box.height > 0.02) optionGraphCount += 1
    } else if (kind === 'optiontext' || kind === 'option_text' || kind === 'text') {
      optionTextCount += 1
    } else if (box && box.width > 0.05 && box.height > 0.08) {
      optionGraphCount += 1
    }
  }

  if (/figure_graphs|figure_text/i.test(caseKind)) hasStemFigure = true
  if (/text_graphs|figure_graphs/i.test(caseKind) && optionGraphCount < 2) {
    optionGraphCount = Math.max(optionGraphCount, 2)
  }

  return {
    hasStemFigure,
    optionGraphCount,
    optionTextCount,
    layout,
    case: caseKind,
  }
}

/**
 * @param {unknown} parsed
 * @param {number} natW
 * @param {number} natH
 * @returns {({ x: number, y: number, width: number, height: number } | null)[] | null}
 */
export function normalizeVisionOptionRegions(parsed, natW, natH) {
  if (!natW || !natH || !parsed || typeof parsed !== 'object') return null
  const root = /** @type {Record<string, unknown>} */ (parsed)
  const layout = String(root.layout ?? '')
  const list =
    (Array.isArray(root.options) && root.options) ||
    (Array.isArray(root.regions) &&
      root.regions.filter((r) => {
        if (!r || typeof r !== 'object') return false
        const kind = String(/** @type {Record<string, unknown>} */ (r).kind ?? '').toLowerCase()
        return !kind || kind.includes('option') || /^[a-d]$/i.test(String(/** @type {Record<string, unknown>} */ (r).label ?? ''))
      })) ||
    (Array.isArray(root.boxes) && root.boxes) ||
    (Array.isArray(root.optionRegions) && root.optionRegions) ||
    null
  if (!list || list.length < 1) return null

  /** @type {({ x: number, y: number, width: number, height: number } | null)[]} */
  const byLetter = [null, null, null, null]
  const letterIndex = { A: 0, B: 1, C: 2, D: 3 }

  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    let box = coerceBox(item)
    let idx = i < 4 ? i : -1
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = /** @type {Record<string, unknown>} */ (item)
      const kind = String(o.kind ?? '').toLowerCase()
      if (kind === 'stemtext' || kind === 'stem_text' || kind === 'stemfigure' || kind === 'stem_figure') {
        continue
      }
      if (kind === 'optiontext' || kind === 'option_text' || kind === 'text' || kind === 'empty') {
        continue
      }
      const label = String(o.label ?? o.letter ?? o.option ?? '').trim().toUpperCase()
      const m = label.match(/^([A-D])\b/)
      if (m) idx = letterIndex[/** @type {'A'|'B'|'C'|'D'} */ (m[1])]
      box = coerceBox(o.box ?? o.bbox ?? o.rect ?? o.region ?? item)
    }
    if (!box || box.width <= 0 || box.height <= 0 || idx < 0 || idx > 3) continue
    byLetter[idx] = clampRect(toNaturalPixels(box, natW, natH), natW, natH)
  }

  let result = byLetter
  const solidCount = byLetter.filter(Boolean).length
  if (solidCount < 2) {
    // Fall back to first entries in list order (legacy responses without kinds).
    const ordered = list.slice(0, 4).map((item) => {
      let box = coerceBox(item)
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const o = /** @type {Record<string, unknown>} */ (item)
        const kind = String(o.kind ?? '').toLowerCase()
        if (kind.includes('stem') || kind.includes('text') || kind === 'empty') return null
        box = coerceBox(o.box ?? o.bbox ?? o.rect ?? o.region ?? item)
      }
      if (!box || box.width <= 0 || box.height <= 0) return null
      return clampRect(toNaturalPixels(box, natW, natH), natW, natH)
    })
    if (ordered.filter(Boolean).length < 2) return null
    result = ordered
  }

  if (!visionOptionBoxesLookLikeGraphPanels(result, natW, natH, layout)) return null
  return result
}
