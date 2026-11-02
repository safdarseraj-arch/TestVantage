/**
 * Wait for Vite on 5173, then open Question Bank (used by VS Code task 2).
 */
import { exec } from 'child_process'
import http from 'http'

const HOST = '127.0.0.1'
const PORT = 5173
const TARGET = `http://${HOST}:${PORT}/question-bank`

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`http://${HOST}:${PORT}/`, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(maxMs = 90000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await ping()) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(
    `Server not running on ${HOST}:${PORT}. Press F5 or run task "1. Start TestVantages" first.`,
  )
}

function openBrowser() {
  if (process.platform === 'win32') {
    exec(`start "" "${TARGET}"`, { shell: true })
  } else if (process.platform === 'darwin') {
    exec(`open "${TARGET}"`)
  } else {
    exec(`xdg-open "${TARGET}"`)
  }
}

await waitForServer()
console.log(`Server ready — opening ${TARGET}`)
openBrowser()
