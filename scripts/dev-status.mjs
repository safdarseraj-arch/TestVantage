import http from 'http'

const PORT = 5173
const URL = `http://127.0.0.1:${PORT}/`

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(res.statusCode && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

const ok = await ping(URL)
if (ok) {
  console.log(`dev-status: running at ${URL}`)
  process.exit(0)
}
console.error('dev-status: NOT running')
console.error('  Double-click: OPEN TestVantages.bat  (starts background server + opens browser)')
console.error('  Or in terminal:  npm run dev:open')
console.error('  Or: npm run server:start  (background — survives closing terminals)')
console.error('  Cursor auto-starts on folder open when task.allowAutomaticTasks is on.')
process.exit(1)
