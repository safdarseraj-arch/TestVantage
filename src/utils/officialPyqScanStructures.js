/**
 * Chemical structures the scan turned into structure codes (SMILES). The drawing made from a code
 * is not the printed one: stereo drawings (sawhorse, Newman, wedges) lose their stereo and some
 * become made-up rings (2012 P2 Q40), and condensed formulas come back as skeletons (2012 P2 Q28).
 * Auto-fix cuts the printed drawings out of the original page instead.
 */

const SMILES_RE = /<smiles\b[^>]*>[\s\S]*?<\/smiles>/i
const LIST_ONE_RE = /(?:List|Column)[ \t]*[-–]?[ \t]*(?:I|1)\b(?![I\d])/i
const LIST_TWO_RE = /(?:List|Column)[ \t]*[-–]?[ \t]*(?:II|2)\b/i

export const OFFICIAL_PYQ_SCAN_STRUCTURE_REASON =
  "A chemical structure is drawn from the scan's structure code (SMILES), not copied from the paper, and these codes often draw the wrong structure. Box every printed structure drawing of that part on the original page so the printed drawing is used"

/**
 * Where the card draws a structure from a scan code: 'options', 'text', 'passage' (first found).
 * Match-the-list cards keep their codes: one picture in place of a list would break the two lists.
 * @param {any} q
 * @returns {'' | 'options' | 'text' | 'passage'}
 */
export function officialPyqScanStructurePlace(q) {
  if (!q || typeof q !== 'object') return ''
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o ?? '')) : []
  if (options.some((o) => SMILES_RE.test(o))) return 'options'
  const text = String(q.text ?? '')
  const passage = String(q.passageText ?? '')
  const lists = (t) => LIST_ONE_RE.test(t) && LIST_TWO_RE.test(t)
  if (lists(text) || lists(passage)) return ''
  if (SMILES_RE.test(text)) return 'text'
  if (SMILES_RE.test(passage)) return 'passage'
  return ''
}

/**
 * Quality-check reason for a card that still draws a structure from a scan code ('' when none).
 * A card the admin approved as shown is left alone.
 * @param {any} q
 */
export function officialPyqScanStructureReason(q) {
  if (!q || q.adminApproved === true) return ''
  return officialPyqScanStructurePlace(q) ? OFFICIAL_PYQ_SCAN_STRUCTURE_REASON : ''
}
