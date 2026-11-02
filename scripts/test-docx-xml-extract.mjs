import assert from 'node:assert/strict'
import { extractBodyTextFromDocumentXml } from '../src/utils/docxXmlExtract.js'
import { parseBulkQuestions } from '../src/utils/parseBulkQuestions.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { extractDocxTextWithMath } from '../src/utils/wordOmmlExtract.js'
import JSZip from 'jszip'

/** JEE-style Q2 with Symbol-font sym tags + superscript runs (like broken bulk preview). */
const Q2_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>2. Let </w:t></w:r>
      <w:r><w:t>P</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F028"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F029"/></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>4</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> ax</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>3</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> bx</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> cx </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> 1 and </w:t></w:r>
      <w:r><w:t>Q</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F028"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F029"/></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>4</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> cx</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>3</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> bx</w:t></w:r>
      <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> ax </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02B"/></w:r>
      <w:r><w:t> 1 with </w:t></w:r>
      <w:r><w:t>a, b, c </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F0CE"/></w:r>
      <w:r><w:t> R and a </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F0B9"/></w:r>
      <w:r><w:t> c. If P</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F028"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F029"/></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>0 and Q</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F028"/></w:r>
      <w:r><w:t>x</w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F029"/></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>0 have two common roots then:</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>(A) b </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F0B9"/></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F02D"/></w:r>
      <w:r><w:t>2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>(B) b </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>2</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>(C) a </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F0B9"/></w:r>
      <w:r><w:t>c </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>0</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>(D) a </w:t></w:r>
      <w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>
      <w:r><w:t>c</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`

const text = extractBodyTextFromDocumentXml(Q2_DOC)
assert.match(text, /P\(x\)/)
assert.match(text, /x\^\{4\}|x\^4/)
assert.match(text, /\\in|∈/)
assert.match(text, /\\ne|≠/)
assert.ok(!/[\uF020-\uF0FF]/.test(text), 'PUA tofu must be gone')
assert.ok(!/\uFFFD/.test(text), 'replacement chars must be gone')

const polished = polishExtractedText(text, 'word')
const bulk = parseBulkQuestions(polished)
assert.ok(bulk.length >= 1, 'should parse at least one question')
const q = bulk.find((row) => /common roots/i.test(row.text)) ?? bulk[0]
assert.ok(q, 'Q2 stem found')
const opts = q.options.filter((o) => String(o ?? '').trim())
assert.equal(opts.length, 4, `expected 4 options, got ${opts.length}: ${JSON.stringify(opts)}`)
assert.match(String(opts[0]), /\\ne|≠|ne/)
assert.match(String(opts[1]), /=\s*2|=2/)

async function testZipRoundTrip() {
  const zip = new JSZip()
  zip.file('word/document.xml', Q2_DOC)
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>')
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  const out = await extractDocxTextWithMath(buf)
  assert.match(out, /P\(x\)/)
  assert.ok(!/[\uF020-\uF0FF]/.test(out))
}

await testZipRoundTrip()

console.log('test-docx-xml-extract: ok')
