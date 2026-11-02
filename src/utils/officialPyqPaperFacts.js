/**
 * Local Official PYQ rules: facts from printed instructions, passages,
 * junk, subjects, and types. No network and no invented questions.
 */

const WORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

const JUNK_RE =
  /\b(?:END\s+OF\s+THE\s+QUESTION\s+PAPER|Full\s+Marks|Partial\s+Marks|Zero\s+Marks|Negative\s+Marks|Answer\s+to\s+each\s+question\s+will\s+be\s+evaluated|If\s+ONLY\s+the\s+correct)\b[\s\S]{0,180}/gi

function wordNumber(raw, digits) {
  const named = WORD[String(raw || '').toLowerCase()]
  if (named) return named
  const n = Number(digits || raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeSubject(name) {
  const s = String(name || '').toLowerCase()
  if (s.startsWith('phys')) return 'physics'
  if (s.startsWith('chem')) return 'chemistry'
  if (s.startsWith('math')) return 'mathematics'
  return ''
}

function sectionType(window) {
  const t = String(window || '')
  if (/matching\s+list|match\s+list|match\s+the\s+following/i.test(t)) return 'matrix_match'
  if (/one\s+or\s+more/i.test(t)) return 'multiple_correct'
  if (/only\s+one/i.test(t)) return 'single_correct'
  if (/numerical/i.test(t)) return 'numerical'
  if (/non[-\s]?negative\s+integer|\binteger\b/i.test(t)) return 'integer'
  return ''
}

/**
 * Read part headings and "This section contains …" lines.
 * expectedQuestionCount is the sum of those printed counts.
 * A section whose question count is not printed leaves the facts unknown.
 * @param {unknown} raw
 */
export function buildPaperFacts(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  const sections = []
  const notes = []
  const re =
    /This section contains\s+([A-Za-z]+|\d+)\s*\(\s*0*(\d+)\s*\)\s*(question stems?|paragraphs?|matching list(?:\s+sets)?|questions?)/gi
  let m
  let subject = ''
  let sawHeading = false
  let lastAt = 0
  let part = 0
  const headRe = /\\section\*?\{[^}\n]*\b(PHYSICS|CHEMISTRY|MATHEMATICS)\b|(?:^|\n)\s*(PHYSICS|CHEMISTRY|MATHEMATICS)\s*(?:\n|$)/gi
  while ((m = re.exec(text))) {
    const at = m.index
    const between = text.slice(lastAt, at)
    headRe.lastIndex = 0
    const heads = [...between.matchAll(headRe)]
    const last = heads.length ? heads[heads.length - 1] : null
    const named = normalizeSubject(last?.[1] || last?.[2] || '')
    const source = m[0].replace(/\s+/g, ' ')
    if (named) {
      if (subject !== named && sections.length) part += 1
      subject = named
      sawHeading = true
    } else if (sections.length && source === sections[0].source) {
      part += 1
      subject = ''
    }
    lastAt = at
    const kind = String(m[3] || '').toLowerCase()
    const n = wordNumber(m[1], m[2])
    const ahead = text.slice(at, at + 500)
    const stop = ahead.slice(20).search(/This section contains|\bSECTION\s*[-–]?\s*\d/i)
    const window = stop >= 0 ? ahead.slice(0, stop + 20) : ahead
    let count = 0
    let stems = 0
    if (/^questions?$/.test(kind) || kind.startsWith('matching')) count = n
    else {
      stems = n
      const each =
        window.match(
          /([A-Za-z]+|\d+)\s*\(\s*0*(\d+)\s*\)\s*questions?\s+(?:corresponding\s+to|based\s+on|on|for)\s+each\b/i,
        ) || window.match(/\beach\b[^.\n]{0,120}?([A-Za-z]+|\d+)\s*\(\s*0*(\d+)\s*\)\s*questions?/i)
      const k = each ? wordNumber(each[1], each[2]) : 0
      count = k ? n * k : 0
      if (!k) notes.push(`OCR does not say how many questions sit under “${m[0].replace(/\s+/g, ' ')}”.`)
    }
    const type = sectionType(window)
    if (!type) notes.push(`OCR does not name the question type for “${m[0].replace(/\s+/g, ' ')}”.`)
    sections.push({
      subject,
      part,
      headingMissing: !subject,
      count,
      stems,
      type,
      kind,
      source,
    })
  }
  if (!sections.length) {
    notes.push('OCR does not contain “This section contains …” instructions, so the facts card is unknown.')
  }
  const headings = new Set(
    [...text.matchAll(/\b(PHYSICS|CHEMISTRY|MATHEMATICS)\b/gi)].map((h) => normalizeSubject(h[1])),
  )
  if (sawHeading && headings.size < 3 && sections.length >= 6) {
    notes.push('OCR is missing a PHYSICS, CHEMISTRY, or MATHEMATICS part heading. Those questions are not tagged.')
  }
  const known = sections.length > 0 && sections.every((s) => s.count > 0 && s.type)
  const expectedQuestionCount = known ? sections.reduce((n, s) => n + s.count, 0) : null
  return {
    known,
    expectedQuestionCount,
    sections,
    notes,
  }
}

export function stripPyqJunkText(text) {
  let s = String(text ?? '')
  s = s.replace(JUNK_RE, ' ')
  s = s.replace(/(?:^|\n)\s*Q\s*\.?\s*\d{1,3}\s+(?=\S)/g, '\n')
  s = s.replace(/^\s*Q\s*\.?\s*\d{1,3}[\s.)-]*/g, '')
  return s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function filledOptions(options) {
  return (Array.isArray(options) ? options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
}

export function isPassageOnlyCard(q) {
  const t = String(q?.text ?? '').trim()
  if (!t) return false
  const opts = filledOptions(q?.options)
  if (opts.length >= 2) return false
  return /^(?:\\section\*?\{[^}]*\})?\s*(?:Paragraph|PARAGRAPH|Passage|Question\s+Stem)\b/i.test(t)
}

function isJunkOnlyCard(q) {
  const raw = String(q?.text ?? '')
  const cleaned = stripPyqJunkText(raw)
  if (cleaned.length >= 24) return false
  if (filledOptions(q?.options).length >= 2) return false
  JUNK_RE.lastIndex = 0
  return JUNK_RE.test(raw) || cleaned.length < 8
}

function passageBodyFromCard(text) {
  return stripPyqJunkText(
    String(text ?? '')
      .replace(/\\section\*?\{([^}]*)\}/gi, '$1')
      .replace(/^(?:Paragraph|PARAGRAPH|Passage|Question\s+Stem(?:\s+for\s+Question\s+Nos?\.?\s*\d{1,2}\s+and\s+\d{1,2})?)\b[:.\s-]*/i, ''),
  )
}

function namedStemNums(text) {
  const m = String(text ?? '').match(/Question\s+Nos?\.?\s*(\d{1,2})\s+and\s+(\d{1,2})/i)
  if (!m) return []
  return [Number(m[1]), Number(m[2])].filter((n) => n > 0)
}

/** Turn a stored reaction-align HTML block into reactant + \\xrightarrow. */
export function htmlReactionsToMath(text) {
  const src = String(text ?? '')
  if (!/<div\b/i.test(src)) return src
  let out = ''
  let i = 0
  const open = /<div class="reaction-align"/gi
  let m
  while ((m = open.exec(src))) {
    out += src.slice(i, m.index)
    let depth = 0
    let j = m.index
    for (; j < src.length; j += 1) {
      if (src.startsWith('<div', j)) depth += 1
      else if (src.startsWith('</div>', j)) {
        depth -= 1
        if (depth === 0) {
          j += 6
          break
        }
      }
    }
    const block = src.slice(m.index, j)
    const plain = block
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
    const lines = plain.split(/\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const reactant = lines[0] || ''
    const reagents = lines.slice(1)
    if (reactant && reagents.length) {
      const above = reagents.map((line) => `\\text{${line}}`).join(' \\\\ ')
      out += `${reactant} $\\xrightarrow{${above}}$`
    } else {
      out += plain.replace(/\s+/g, ' ').trim()
    }
    i = j
    open.lastIndex = j
  }
  out += src.slice(i)
  return out.replace(/<[^>]+>/g, '').replace(/[ \t]{2,}/g, ' ').trim()
}

function attachNamedStems(questions, ocr) {
  const src = String(ocr ?? '')
  const jobs = []
  const re = /Question\s+Stem\s+for\s+Question\s+Nos?\.?\s*(\d{1,2})\s+and\s+(\d{1,2})/gi
  let m
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length
    const rest = src.slice(start)
    const cut = rest.search(/\\item\s*\[\s*Q[^\]]*\]\s*\d|\\section\*?\{|Question\s+Stem\s+for\s+Question/i)
    let body = (cut > 40 ? rest.slice(0, cut) : rest.slice(0, 1800)).trim()
    body = stripPyqJunkText(body.replace(/^[\s:.-]+/, ''))
    if (body.length < 20) continue
    jobs.push({ nums: [Number(m[1]), Number(m[2])], body, at: m.index })
  }
  if (!jobs.length) return questions
  const heads = [...src.matchAll(/\\section\*?\{[^}\n]*\b(PHYSICS|CHEMISTRY|MATHEMATICS)\b|(?:^|\n)\s*(PHYSICS|CHEMISTRY|MATHEMATICS)\s*(?:\n|$)/gi)]
  function subjectAt(index) {
    let name = ''
    for (const h of heads) {
      if (h.index <= index) name = normalizeSubject(h[1] || h[2])
    }
    return name
  }
  return questions.map((q) => {
    const n = Number(q?.printedNumber || q?.questionNumber)
    const sub = String(q?.subject || '')
    const job = jobs.find((row) => {
      if (!row.nums.includes(n)) return false
      const jobSub = subjectAt(row.at)
      if (sub && jobSub && jobSub !== sub) return false
      if (!sub && jobSub && questions.some((other) => String(other?.subject || '') === jobSub && Number(other?.printedNumber) === n)) {
        return false
      }
      return true
    })
    if (!job) return q
    if (String(q.passageText || '').trim().length >= job.body.length) return q
    return {
      ...q,
      passageText: job.body,
      passageSource: 'ocr-header',
      passageRole: 'comprehension_child',
    }
  })
}

/**
 * Admin-confirmed facts: one slot per question in paper order. Stamps only when
 * the card count equals the slot count, so a wrong split is flagged, not forced.
 * Subject, type and printed number are paper metadata, so hand-edited cards get them too.
 */
function stampFromAdminFacts(questions, facts) {
  const slots = Array.isArray(facts?.slots) ? facts.slots : []
  if (!slots.length || slots.length !== questions.length) return questions
  return questions.map((q, i) => {
    const slot = slots[i]
    return {
      ...q,
      subject: slot.subject,
      questionType: slot.type,
      paperPart: slot.part,
      printedNumber: slot.printed,
      questionNumber: i + 1,
      pyqSlot: i + 1,
    }
  })
}

function stampFromFacts(questions, facts) {
  if (facts?.source === 'admin') return stampFromAdminFacts(questions, facts)
  if (!facts?.known || questions.length !== facts.expectedQuestionCount) {
    return questions.map((q, i) => ({ ...q, questionNumber: i + 1, pyqSlot: i + 1 }))
  }
  const list = questions.map((q) => ({ ...q }))
  const sections = Array.isArray(facts?.sections) ? facts.sections : []
  let cursor = 0
  for (const section of sections) {
    const count = Number(section.count) || 0
    if (!count) continue
    for (let i = 0; i < count && cursor < list.length; i += 1) {
      const q = list[cursor]
      if (!q.adminEdited) {
        q.paperPart = section.part
        if (section.subject) q.subject = section.subject
        else if (section.headingMissing) q.subject = ''
        if (section.type) q.questionType = section.type
        if (section.type === 'numerical' || section.type === 'integer') q.options = []
      }
      cursor += 1
    }
  }
  let groupStart = 0
  const partOf = (q) => Number(q?.paperPart)
  for (let i = 1; i <= list.length; i += 1) {
    const boundary = i === list.length || partOf(list[i]) !== partOf(list[groupStart])
    if (!boundary) continue
    list.slice(groupStart, i).forEach((q, n) => {
      if (q.adminEdited || Number(q.printedNumber) > 0) return
      q.printedNumber = n + 1
    })
    groupStart = i
  }
  return list.map((q, i) => ({
    ...q,
    questionNumber: i + 1,
    pyqSlot: i + 1,
  }))
}

/**
 * @param {unknown[]} questions
 * @param {unknown} raw
 * @param {{ facts?: ReturnType<typeof buildPaperFacts> & { source?: string, slots?: object[] } }} [opts]
 *   `facts` (admin-confirmed) replaces the facts read from the OCR instructions.
 */
export function shapeOfficialPyqDrafts(questions, raw, opts = {}) {
  const facts = opts?.facts && typeof opts.facts === 'object' ? opts.facts : buildPaperFacts(raw)
  const src = String(raw ?? '')
  const out = []
  let pending = null
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q || typeof q !== 'object') continue
    if (q.adminEdited === true || q.placeholder === true) {
      out.push(q)
      continue
    }
    if (isJunkOnlyCard(q)) continue
    if (isPassageOnlyCard(q)) {
      const nums = namedStemNums(q.text)
      const body = passageBodyFromCard(q.text)
      if (body) pending = { text: body, nums, left: nums.length || 2 }
      continue
    }
    let next = {
      ...q,
      text: stripPyqJunkText(htmlReactionsToMath(q.text)),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((opt) => stripPyqJunkText(htmlReactionsToMath(opt)))
        .filter((opt) => String(opt || '').trim()),
    }
    if (pending) {
      const n = Number(next.printedNumber || next.questionNumber)
      const take = pending.nums.length ? pending.nums.includes(n) : pending.left > 0
      if (take && pending.text) {
        next = {
          ...next,
          passageText: pending.text,
          passageSource: 'ocr-header',
          passageRole: 'comprehension_child',
        }
        pending.left -= 1
        if (pending.left <= 0) pending = null
      }
    }
    out.push(next)
  }
  const stamped = stampFromFacts(out, facts)
  return { questions: attachNamedStems(stamped, src), facts }
}
