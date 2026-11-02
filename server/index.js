/**
 * TestVantages API — PostgreSQL + Redis production stack.
 */
import http from 'http'
import { SERVER } from './config.js'
import { initPlatformStores } from './bootstrap.js'
import { handleApiRequest } from './router.js'

globalThis.__TV_INSTANCE_ID = SERVER.instanceId

const server = http.createServer((req, res) => {
  handleApiRequest(req, res)
})

try {
  const storage = await initPlatformStores()
  server.listen(SERVER.port, SERVER.host, () => {
    console.log(`TestVantages API [${SERVER.instanceId}] http://${SERVER.host}:${SERVER.port}`)
    console.log(`  Scale target: ${(1_000_000).toLocaleString('en-IN')} concurrent students`)
    console.log(`  Storage: questions=${storage.questions} org=${storage.orgData} sessions=${storage.sessions} attempts=${storage.attempts}`)
    console.log('  GET  /api/health  /api/ready  /api/backup')
    console.log('  POST /api/auth/login')
    console.log('  GET  /api/org  PUT /api/org  GET /api/attempts')
    console.log('  PUT  /api/exam-sessions   POST /api/attempts')
    console.log('  GET/PUT /api/pulse/*  (Peer Pulse · Study Circle · Merit)')
    console.log('  GET  /api/questions       PUT  /api/questions/:id')
    console.log('  GET/POST /api/question-reports  PATCH /api/question-reports/:id')
  })
} catch (err) {
  console.error('Failed to start API:', err instanceof Error ? err.message : err)
  process.exit(1)
}

process.on('SIGTERM', () => {
  console.log(`[${SERVER.instanceId}] shutting down`)
  server.close(() => process.exit(0))
})
