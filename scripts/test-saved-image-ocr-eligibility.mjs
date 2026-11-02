/** Mirror of canOfferSavedImageOcr — kept here so Node tests avoid loading the OCR stack. */
function canOfferSavedImageOcr(q) {
  if (!q || q.questionType === 'matrix_match') return false
  if (q.passageId && !q.questionImage?.trim()) return false
  return (
    !!q.questionImage?.trim() ||
    !!q.optionsImage?.trim() ||
    (Array.isArray(q.optionImages) && q.optionImages.some((img) => img?.trim()))
  )
}

const cases = [
  [{ questionImage: 'data:image/png;base64,abc', text: '(Image question)' }, true],
  [{ questionType: 'matrix_match', questionImage: 'data:image/png;base64,abc' }, false],
  [{ passageId: 'p1', text: 'sub' }, false],
  [{ optionsImage: 'data:image/png;base64,xyz' }, true],
  [{ text: 'x^2+1=0' }, false],
]

let failed = 0
for (const [q, expected] of cases) {
  const got = canOfferSavedImageOcr(q)
  if (got !== expected) {
    console.error('canOfferSavedImageOcr failed', q, 'expected', expected, 'got', got)
    failed += 1
  }
}

if (failed) {
  console.error(`${failed} test(s) failed`)
  process.exit(1)
}
console.log('saved-image-ocr eligibility OK')
