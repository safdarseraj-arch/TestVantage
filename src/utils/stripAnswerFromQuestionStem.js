/**
 * Peel a printed answer key off a question stem.
 * Leaves a separate answer or solution field alone. Does not invent a key.
 */

const LABEL =
  '(?:(?:Official\\s+)?(?:Ans(?:wer)?s?\\.?|Key)|Correct\\s+(?:option|answer))'
const VALUE =
  '(?:\\(?[A-D](?:\\s*[,;&/]\\s*[A-D])*\\)?|\\[[^\\]\\n]{1,80}\\](?:\\s+OR\\s+\\[[^\\]\\n]{1,80}\\])?|-?\\d+(?:\\.\\d+)?(?:\\s+OR\\s+-?\\d+(?:\\.\\d+)?)?)'

const KEY_LINE = new RegExp(
  '^\\s*(?:\\\\section\\*\\{)?\\s*' +
    LABEL +
    '\\s*[:.\\-=]\\s*(?:is\\s+)?(?:option\\s+)?' +
    VALUE +
    '\\s*\\}?\\s*$',
  'i',
)

const KEY_TAIL = new RegExp(
  '(?:^|\\s)(?:\\\\section\\*\\{)?' +
    LABEL +
    '\\s*[:.\\-=]\\s*(?:is\\s+)?(?:option\\s+)?' +
    VALUE +
    '\\s*\\}?\\s*$',
  'i',
)

const RESTATE = new RegExp(
  '\\s+' +
    LABEL +
    '\\s*[:.\\-=]\\s*(?:is\\s+)?(?:option\\s+)?\\(?([A-D])\\)?\\s*[:\\-\\u2013]?\\s*(\\S[\\s\\S]{0,180})$',
  'i',
)

function normOption(value) {
  return String(value ?? '')
    .replace(/\$+/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * @param {unknown} text
 * @param {unknown[]} [options]
 */
export function stripAnswerFromQuestionStem(text, options) {
  const original = String(text ?? '')
  if (!original.trim()) return original
  let s = original.replace(/\r\n/g, '\n')
  const before = s
  s = s
    .split('\n')
    .filter((line) => !KEY_LINE.test(line))
    .join('\n')
  s = s.replace(KEY_TAIL, '')
  const restated = s.match(RESTATE)
  if (restated && restated.index != null) {
    const rest = String(restated[2] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[}\s]+$/, '')
    const restN = normOption(rest)
    const opts = (Array.isArray(options) ? options : [])
      .map((opt) => String(opt ?? '').trim())
      .filter(Boolean)
    const matchesOption =
      restN.length > 0 &&
      opts.some((opt) => {
        const n = normOption(opt)
        return n.length > 0 && (n === restN || restN.endsWith(n) || n.endsWith(restN))
      })
    if (matchesOption) s = s.slice(0, restated.index)
  }
  if (s === before) return original
  const next = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!next) return original
  return next
}

/**
 * True when a printed key is still sitting in the question text.
 * @param {unknown} text
 */
export function questionStemHasPrintedAnswer(text) {
  const s = String(text ?? '')
  if (!s.trim()) return false
  if (s.split('\n').some((line) => KEY_LINE.test(line))) return true
  if (KEY_TAIL.test(s)) return true
  const restated = s.match(RESTATE)
  return Boolean(restated)
}

/**
 * Peel keys from question text. Does not change answer or solution fields.
 * @param {unknown[]} questions
 */
export function stripAnswersFromQuestionCards(questions) {
  if (!Array.isArray(questions)) return []
  return questions.map((q) => {
    if (!q || typeof q !== 'object' || q.placeholder === true) return q
    const prev = String(q.text ?? '')
    const next = stripAnswerFromQuestionStem(prev, q.options)
    const prevPass = String(q.passageText ?? '')
    const nextPass = prevPass ? stripAnswerFromQuestionStem(prevPass, q.options) : prevPass
    if (next === prev && nextPass === prevPass) return q
    const out = { ...q, text: next }
    if (q.passageText != null) out.passageText = nextPass
    return out
  })
}