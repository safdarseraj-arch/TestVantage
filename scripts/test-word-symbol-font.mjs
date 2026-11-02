import assert from 'node:assert/strict'
import {
  decodeSymbolFontPua,
  repairWordSymbolFontText,
  rewriteWordSymInDocumentXml,
  symbolCharHexToText,
  symbolByteToChar,
} from '../src/utils/wordSymbolFont.js'
import { fixOcrMathSymbols } from '../src/utils/fixOcrMathSymbols.js'
import {
  ommlFragmentToLatex,
  rewriteOmmlInDocumentXml,
  wordExtractLooksBroken,
  unicodeMathToLatex,
} from '../src/utils/wordOmmlExtract.js'

assert.equal(symbolByteToChar(0x2b), '+')
assert.equal(symbolByteToChar(0x3d), '=')
assert.equal(symbolByteToChar(0xce), '∈')
assert.equal(symbolByteToChar(0xb9), '≠')
assert.equal(symbolCharHexToText('F02B'), '+')
assert.equal(symbolCharHexToText('F0CE'), '∈')

const pua = `\uF050(\uF078)\uF03D\uF078\uF034\uF02B a\uF078\uF033`
// P(x)=x^4 + ax^3  — P=0x50, (=0x28, x=0x78, )=0x29, = =0x3d, 4=0x34, +=0x2b, 3=0x33
const decoded = decodeSymbolFontPua(
  `Let P\uF028x\uF029\uF03Dx\uF034\uF02Bax\uF033 and a,b,c\uF0CE R and a\uF0B9c`,
)
assert.match(decoded, /P\(x\)=x4\+ax3/)
assert.match(decoded, /∈ R/)
assert.match(decoded, /≠c/)

const repaired = repairWordSymbolFontText(decoded)
assert.match(repaired, /\\in/)
assert.match(repaired, /\\ne/)

const viaFix = fixOcrMathSymbols(
  `b\uF0B9\uF02D2\n(A) b\uF0B9\uF02D2\n(B) b\uF03D2\n(C) a\uF0B9c\uF03D0\n(D) none`,
)
assert.ok(!/[\uF020-\uF0FF]/.test(viaFix))
assert.match(viaFix, /\\ne|≠/)
assert.match(viaFix, /b\s*(?:=|\\ne)/)

const xml = `<w:r><w:sym w:font="Symbol" w:char="F03D"/></w:r>`
const rewrittenSym = rewriteWordSymInDocumentXml(xml)
assert.match(rewrittenSym, /<w:t[^>]*>\s*=\s*<\/w:t>/)
assert.ok(!/<w:sym/i.test(rewrittenSym))

assert.equal(unicodeMathToLatex('α × β'), '\\alpha \\times \\beta')
assert.equal(ommlFragmentToLatex(`<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>`), '\\frac{1}{2}')
assert.match(rewriteOmmlInDocumentXml(`<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>`), /\$x\$/)

assert.equal(wordExtractLooksBroken('hello'), false)
assert.equal(
  wordExtractLooksBroken('a\uF02Bb\uF02Bc\uF02Bd\uF02Be\uF02Bf\uF02Bg\uF02Bh\uF02B'),
  true,
)

console.log('test-word-symbol-font: ok')
