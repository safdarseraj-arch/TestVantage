import { createWorker } from 'tesseract.js'
import { readFileSync } from 'fs'
import { resolveMatchColumnUpload, countFilledMatrixRows } from '../src/utils/parseMatchColumnUpload.js'
import { normalizeMatrixItemText } from '../src/utils/normalizeMathText.js'

const imgPath =
  process.argv[2] ||
  'C:/Users/seraj/.cursor/projects/c-Users-seraj-OneDrive-Desktop-TestVantages/assets/c__Users_seraj_AppData_Roaming_Cursor_User_workspaceStorage_701339c909e6d6b27ee455b3f5f5fbf8_images_Screenshot_2026-05-27_020434-cb25fc45-2184-4c4f-9026-c285a94df942.png'

async function ocrImage(path) {
  const worker = await createWorker('eng')
  try {
    const buf = readFileSync(path)
    const { data } = await worker.recognize(buf)
    return data.text
  } finally {
    await worker.terminate()
  }
}

const text = process.argv[3] || (await ocrImage(imgPath))
console.log('=== RAW OCR (first 2500 chars) ===')
console.log(text.slice(0, 2500))
console.log('\n=== (C) markers in raw ===')
for (const m of text.matchAll(/\(\s*[Cc]\s*\)[^\n]{0,120}/g)) {
  console.log(JSON.stringify(m[0].slice(0, 100)))
}

const parsed = resolveMatchColumnUpload(text)
console.log('\n=== PARSE ===')
console.log('filled rows', parsed ? countFilledMatrixRows(parsed) : 0)
if (parsed) {
  parsed.matrixRows.forEach((r, i) => {
    const L = String.fromCharCode(65 + i)
    console.log(L, r ? r.slice(0, 90) : '(empty)')
    const norm = normalizeMatrixItemText(r)
    console.log('  norm', norm ? norm.slice(0, 90) : '(EMPTY AFTER NORM)')
  })
}
