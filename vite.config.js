import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scqTrialDevPlugin } from './server/scqTrialDevPlugin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nodeOnlyStub = join(__dirname, 'src/utils/nodeOnlyStub.js')

/** OneDrive paths break native file watchers — use polling for stable dev server. */
const onOneDrive = /OneDrive/i.test(process.cwd())

const HYBRID_AI_URL = 'http://127.0.0.1:8000'
const HYBRID_AI_DOWN_BODY = JSON.stringify({
  ok: false,
  detail:
    'TestVantages Hybrid AI (FastAPI on port 8000) is not running. Press F5 to restart dev, then retry. If it still fails: pip install -r requirements-hybrid.txt',
  error:
    'TestVantages Hybrid AI (FastAPI on port 8000) is not running. Press F5 and keep the bottom terminal open.',
})

/** Proxy to Hybrid AI — return JSON 503 when uvicorn is down (not an empty 500). */
function hybridFastApiProxy() {
  return {
    target: HYBRID_AI_URL,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('error', (_err, _req, res) => {
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(HYBRID_AI_DOWN_BODY)
        }
      })
    },
  }
}

/** Keep Vite cache off OneDrive — avoids multi-minute hangs on "transforming…". */
const cacheDir =
  process.env.VITE_CACHE_DIR ||
  (onOneDrive ? join(tmpdir(), 'testvantage-vite-cache') : undefined)

const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm'

/** Rollup hangs bundling @huggingface/transformers — load from CDN in production. */
function transformersImportMapPlugin() {
  return {
    name: 'transformers-importmap',
    apply: 'build',
    transformIndexHtml(html) {
      const map = `<script type="importmap">${JSON.stringify({
        imports: { '@huggingface/transformers': TRANSFORMERS_CDN },
      })}</script>`
      return html.replace('</head>', `    ${map}\n  </head>`)
    },
  }
}

export default defineConfig({
  cacheDir,
  plugins: [react(), transformersImportMapPlugin(), scqTrialDevPlugin()],
  resolve: {
    alias: {
      'onnxruntime-node': nodeOnlyStub,
      sharp: nodeOnlyStub,
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'tesseract.js'],
    exclude: ['@huggingface/transformers'],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      external: ['@huggingface/transformers'],
    },
  },
  build: {
    /** Never watch during production build (can hang the process on Windows). */
    watch: null,
    /** Skip gzip size pass — saves minutes on OneDrive Windows builds. */
    reportCompressedSize: false,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      external: (id) =>
        id === '@huggingface/transformers' ||
        id.startsWith('@huggingface/transformers/') ||
        id === 'onnxruntime-web' ||
        id.startsWith('onnxruntime-web/'),
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('tesseract.js')) return 'tesseract'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('recharts')) return 'recharts'
        },
      },
    },
  },
  server: {
    /** Listen on localhost + 127.0.0.1 so merge/copy from localhost:5173 works */
    host: true,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/_arke_home.html',
        '**/Acadza-vs-TestVantage.md',
        '**/Arke-EdTech-vs-TestVantage.md',
        '**/HowWeCompare.jsx',
        '**/howWeCompare.js',
        '**/howWeCompareArke.js',
      ],
    },

    port: 5173,
    /** Never auto-switch to 5174 — one dev URL only. */
    strictPort: true,
    /** Browser opens from scripts/launch-dev.mjs after the server is ready */
    open: false,
    watch: {
      usePolling: process.env.VITE_ONEDRIVE_POLL === '1' || onOneDrive,
      interval: 800,
    },
    /**
     * Hybrid AI (FastAPI :8000) vs Node API (:3001): list specific /api/* paths BEFORE the
     * catch-all `/api` → 3001 so the browser only talks to http://127.0.0.1:5173.
     */
    proxy: {
      '/docs': hybridFastApiProxy(),
      '/redoc': hybridFastApiProxy(),
      '/openapi.json': hybridFastApiProxy(),
      '/static': hybridFastApiProxy(),
      '/api/generate': hybridFastApiProxy(),
      '/api/questions/clone-scaled': hybridFastApiProxy(),
      '/api/clones': hybridFastApiProxy(),
      '/api/ingest': hybridFastApiProxy(),
      '/api/health': hybridFastApiProxy(),
      '/api/official-pyq/fill-tags': hybridFastApiProxy(),
      '/api/official-pyq/replica-question': hybridFastApiProxy(),
      '/api/official-pyq/replica-set': hybridFastApiProxy(),
      '/api/official-pyq/original': hybridFastApiProxy(),
      '/api/official-pyq/compare': hybridFastApiProxy(),
      '/api/questions/pool': hybridFastApiProxy(),
      '/api/practice': hybridFastApiProxy(),
      '/api/test/pick-pool': hybridFastApiProxy(),
      '/api/test-results': hybridFastApiProxy(),
      '/api/analytics': hybridFastApiProxy(),
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' })
              res.end(
                JSON.stringify({
                  ok: false,
                  error: 'API not running. Press F5 and keep the bottom panel open.',
                }),
              )
            }
          })
        },
      },
    },
  },
})
