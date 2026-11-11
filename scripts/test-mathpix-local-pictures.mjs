/**
 * Expired Mathpix picture links fall back to local copies cut from the original PDF.
 * Run: node scripts/test-mathpix-local-pictures.mjs
 */
import assert from 'node:assert/strict'
import {
  keepOfficialPyqPicturesLocal,
  localPictureOnErrorAttr,
  mathpixLocalPictureUrl,
  mathpixPictureLinksOfPaper,
  showLocalPictureOnError,
} from '../src/utils/mathpixLocalPictures.js'
import { convertLatexTabularToArray } from '../src/utils/latexTabularDisplay.js'

const LINK =
  'https://cdn.mathpix.com/cropped/9deb824d-a4c6-4632-840e-f96d868d182d-21.jpg?height=120&width=270&top_left_y=870&top_left_x=462'
const LINK2 = LINK.replace('-21.jpg', '-22.jpg')

let failed = 0
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((err) => {
      failed += 1
      console.log(`FAIL - ${name}\n  ${err?.message ?? err}`)
    })
}

await test('Mathpix link maps to the helper route; other pictures do not', () => {
  assert.equal(mathpixLocalPictureUrl(LINK), `/api/official-pyq/original/mathpix-picture?u=${encodeURIComponent(LINK)}`)
  assert.equal(mathpixLocalPictureUrl(LINK.replace(/&/g, '\\&')), mathpixLocalPictureUrl(LINK))
  assert.equal(mathpixLocalPictureUrl('/api/official-pyq/original/crops/a.png'), '')
  assert.equal(mathpixLocalPictureUrl('https://example.com/x.jpg'), '')
  assert.equal(mathpixLocalPictureUrl(`${LINK}'onload='x`), '')
})

await test('failed <img> switches to the local copy once', () => {
  const img = { dataset: {}, src: LINK, getAttribute: () => LINK }
  showLocalPictureOnError({ currentTarget: img })
  assert.equal(img.src, mathpixLocalPictureUrl(LINK))
  img.src = 'still-broken'
  showLocalPictureOnError({ currentTarget: img })
  assert.equal(img.src, 'still-broken')
  const plain = { dataset: {}, src: 'a.png', getAttribute: () => 'a.png' }
  showLocalPictureOnError({ currentTarget: plain })
  assert.equal(plain.src, 'a.png')
})

await test('HTML pictures carry the same fallback', () => {
  assert.match(
    localPictureOnErrorAttr(LINK),
    /onerror="this\.onerror=null;this\.src='\/api\/official-pyq\/original\/mathpix-picture\?u=https%3A/,
  )
  assert.equal(localPictureOnErrorAttr('a.png'), '')
  const html = convertLatexTabularToArray(
    `\\begin{tabular}{|l|l|}\\hline List-I & List-II \\\\ \\hline (P) \\includegraphics[max width=\\textwidth]{${LINK}} & (1) x \\\\ \\hline\\end{tabular}`,
  )
  if (/<img/.test(html)) assert.match(html, /onerror=/)
})

await test('links are collected from every card field and the OCR, cleaned and unique', () => {
  const paper = {
    questions: [
      { text: `(P) \\includegraphics[max width=\\textwidth]{${LINK.replace(/&/g, '\\&')}}`, options: [`![](${LINK2})`] },
      { solution: `see ![](${LINK})`, originalCompare: { suggestedText: 'no pictures' } },
    ],
  }
  assert.deepEqual(mathpixPictureLinksOfPaper(paper, `ocr ${LINK2} end`).sort(), [LINK, LINK2].sort())
  assert.deepEqual(mathpixPictureLinksOfPaper({ questions: [{ text: 'none' }] }), [])
})

await test('sweep saves each paper once, notes papers without an original, stops when the helper is down', async () => {
  const calls = []
  let mode = 'ok'
  globalThis.fetch = async (url, init) => {
    calls.push(url)
    if (mode === 'down') throw new Error('refused')
    const { urls } = JSON.parse(init.body)
    if (url.includes('no-original')) {
      return { ok: false, status: 404, json: async () => ({ detail: { code: 'original_missing' } }) }
    }
    return { ok: true, json: async () => ({ crops: Object.fromEntries(urls.map((u) => [u, '/api/x.png'])), skipped: [] }) }
  }
  const metas = []
  const papers = [
    { id: 'p1', questions: [{ text: `![](${LINK})` }] },
    { id: 'no-original', questions: [{ text: `![](${LINK2})` }] },
    { id: 'p3', questions: [{ text: 'no pictures' }] },
    { id: 'p4', questions: [{ text: `![](${LINK})` }], localPictures: { links: 1, saved: 1 } },
  ]
  const deps = { papers, ocrTextOf: () => '', savePaperMeta: (m) => metas.push(m) }
  const out = await keepOfficialPyqPicturesLocal(deps)
  assert.deepEqual(out, { kept: 1, noOriginal: ['no-original'] })
  assert.equal(calls.length, 2)
  assert.equal(metas.length, 1)
  assert.equal(metas[0].p1.localPictures.saved, 1)
  assert.equal(metas[0]['no-original'].localPictures.noOriginal, true)

  calls.length = 0
  await keepOfficialPyqPicturesLocal({ ...deps, onlyPaperId: 'p4', force: true })
  assert.deepEqual(calls, ['/api/official-pyq/original/p4/mathpix-crops'])

  mode = 'down'
  calls.length = 0
  metas.length = 0
  const down = await keepOfficialPyqPicturesLocal(deps)
  assert.equal(calls.length, 1)
  assert.equal(metas.length, 0)
  assert.equal(down.kept, 0)
})

if (failed) {
  console.log(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\nAll Mathpix local picture tests passed')
