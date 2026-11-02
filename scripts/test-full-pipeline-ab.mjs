import { normalizeMathText } from '../src/utils/normalizeMathText.js'
import { parseQuestionText, applyParsedToForm } from '../src/utils/parseQuestionText.js'
import { polishMcqOptionBody } from '../src/utils/polishMcqOptionBody.js'
import { buildMcqPreviewContext } from '../src/utils/repairMcqOption.js'

function polishParsedMcqOptions(questionText, options, extractedRaw = '') {
  const stem = String(questionText ?? '').trim()
  const ctx = buildMcqPreviewContext({
    extractedRaw,
    questionText: stem,
    options,
    forOptionRepair: true,
  })
  const list = [...(options ?? [])]
  while (list.length < 4) list.push('')
  return list.slice(0, 4).map((o, i) =>
    polishMcqOptionBody(String(o ?? '').trim(), String.fromCharCode(65 + i), ctx, stem),
  )
}
import { applyGraphOptionPlaceholders, sanitizeStoredOptions } from '../src/utils/graphOptionOcr.js'

const samples = {
  clean: `Which of the following is/are true?
(A) any four non-zero vectors in space will always be linearly independent.
(B) area of parallelogram with diagonals d1 = i - 2j + k and d2 = -i + 2j - 5k is equal to 2sqrt5 sq. units
(C) [a x b  b x c  a] = (a.b)[a b c]
(D) projection of i+j+k on -2i+2j+k is 113`,

  ocr48: `Which of the following is/are true?
(4) any four non-zero vectors in space will always be linearly independent.
(8) area of parallelogram with diagonals d1 = i - 2j + k and d2 = -i + 2j - 5k is equal to 2sqrt5 sq. units
(C) [a x b  b x c  a] = (a.b)[a b c]
(D) projection of i+j+k on -2i+2j+k is 113`,

  inline: `Which of the following is/are true? (A) any four non-zero vectors in space will always be linearly independent. (B) area of parallelogram with diagonals d1 = i - 2j + k is equal to 2sqrt5 sq. units (C) scalar triple (D) projection 113`,

  aDot: `Which of the following is/are true?
A) any four non-zero vectors in space will always be linearly independent.
B) area of parallelogram with diagonals d1 = i - 2j + k is equal to 2sqrt5 sq. units
C) [a x b  b x c  a] = (a.b)[a b c]
D) projection of i+j+k on -2i+2j+k is 113`,
}

function pipeline(raw, name) {
  const norm = normalizeMathText(raw)
  const directRaw = parseQuestionText(raw)
  const directNorm = parseQuestionText(norm)
  const applied =
    (directRaw.options ?? []).filter((o) => String(o).trim()).length >=
    (directNorm.options ?? []).filter((o) => String(o).trim()).length
      ? applyParsedToForm(directRaw, raw)
      : applyParsedToForm(directNorm, norm)
  const stem = applied.text || ''
  const polished = polishParsedMcqOptions(stem, applied.options, norm)
  const final = sanitizeStoredOptions(
    applyGraphOptionPlaceholders(stem, polished, []),
    [],
    stem,
  )
  console.log(`\n=== ${name} === parse found ${applied.optionsFound}`)
  final.forEach((o, i) => {
    console.log(
      i,
      String.fromCharCode(65 + i),
      o?.trim() ? o.slice(0, 60) : '(EMPTY)',
    )
  })
  const abOk = final[0]?.trim() && final[1]?.trim()
  console.log(abOk ? 'A+B OK' : 'A+B MISSING')
  return abOk
}

let all = true
for (const [name, raw] of Object.entries(samples)) {
  if (!pipeline(raw, name)) all = false
}
console.log(all ? '\nALL PASS' : '\nSOME FAILED')
process.exit(all ? 0 : 1)
