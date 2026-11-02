/**
 * Download JEE Advanced question images from web search (Bing image results)
 * for each chapter × question type. Saves to public/jee-upload-test/.
 *
 * Run: npm run fetch:jee-test-images
 *      npm run fetch:jee-test-images -- --sample
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildJeeUploadTestCases,
  buildJeeImageSearchQuery,
} from '../src/utils/jeeUploadTestManifest.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(dir, '..', 'public', 'jee-upload-test')
const sampleMode = process.argv.includes('--sample')

/** @param {string} query */
async function bingImageUrls(query, limit = 5) {
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1`
  const html = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestVantages/1.0' },
  }).then((r) => r.text())
  const re = /murl&quot;:&quot;(https?:[^&]+)/g
  /** @type {string[]} */
  const urls = []
  let m
  while ((m = re.exec(html)) && urls.length < limit) {
    urls.push(m[1].replace(/\\u0026/g, '&'))
  }
  return urls
}

/** @param {string} url */
async function downloadImage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 TestVantages/1.0' },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const type = resp.headers.get('content-type') ?? 'image/jpeg'
  if (!type.startsWith('image/')) throw new Error(`Not an image: ${type}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length < 4000) throw new Error('Image too small')
  return { buf, type }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true })
  const cases = buildJeeUploadTestCases({ mode: sampleMode ? 'sample' : 'full' })
  let ok = 0
  let skip = 0
  let fail = 0

  console.log(`fetch-jee-test-images: ${cases.length} targets (${sampleMode ? 'sample' : 'full'})`)

  for (const tc of cases) {
    const dest = path.join(outDir, `${tc.id}.jpg`)
    try {
      await fs.access(dest)
      skip += 1
      continue
    } catch {
      /* download */
    }

    const query = buildJeeImageSearchQuery(tc)
    try {
      const urls = await bingImageUrls(query, 8)
      let saved = false
      for (const imgUrl of urls) {
        try {
          const { buf } = await downloadImage(imgUrl)
          await fs.writeFile(dest, buf)
          ok += 1
          saved = true
          console.log(`  ok  ${tc.id}`)
          break
        } catch {
          /* try next url */
        }
      }
      if (!saved) {
        fail += 1
        console.log(`  miss ${tc.id} (${query})`)
      }
    } catch (e) {
      fail += 1
      console.log(`  fail ${tc.id}: ${e instanceof Error ? e.message : e}`)
    }

    await new Promise((r) => setTimeout(r, 350))
  }

  console.log(`Done — downloaded ${ok}, skipped ${skip}, failed ${fail}`)
  console.log(`Images in public/jee-upload-test/ — open Question Bank → JEE upload test tab.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
