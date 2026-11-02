import assert from 'node:assert/strict'
import {
  ommlFragmentToLatex,
  rewriteOmmlInDocumentXml,
  wordExtractLooksBroken,
  unicodeMathToLatex,
} from '../src/utils/wordOmmlExtract.js'

assert.equal(unicodeMathToLatex('α × β'), '\\alpha \\times \\beta')

const frac = `
<m:f>
  <m:num><m:r><m:t>1</m:t></m:r></m:num>
  <m:den><m:r><m:t>2</m:t></m:r></m:den>
</m:f>`
assert.equal(ommlFragmentToLatex(frac), '\\frac{1}{2}')

const power = `
<m:sSup>
  <m:e><m:r><m:t>z</m:t></m:r></m:e>
  <m:sup><m:r><m:t>15</m:t></m:r></m:sup>
</m:sSup>`
assert.equal(ommlFragmentToLatex(power), '{z}^{15}')

const doc = `
<w:document>
  <w:body>
    <w:p>
      <w:r><w:t>The number of roots of </w:t></w:r>
      <m:oMath>
        <m:sSup>
          <m:e><m:r><m:t>z</m:t></m:r></m:e>
          <m:sup><m:r><m:t>15</m:t></m:r></m:sup>
        </m:sSup>
        <m:r><m:t>=1</m:t></m:r>
      </m:oMath>
      <w:r><w:t> is</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`

const rewritten = rewriteOmmlInDocumentXml(doc)
assert.match(rewritten, /\$\{z\}\^\{15\}=1\$/)
assert.ok(!/<(?:[\w-]+:)?oMath\b/i.test(rewritten))

assert.equal(wordExtractLooksBroken('hello world'), false)
assert.equal(wordExtractLooksBroken('a\uFFFDb\uFFFDc\uFFFDd\uFFFDe\uFFFDf\uFFFDg\uFFFDh\uFFFDi'), true)

console.log('test-word-omml-extract: ok')
