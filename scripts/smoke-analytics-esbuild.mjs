import * as esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = join(root, 'src/components/AnalyticsDashboard.jsx')

try {
  const r = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    platform: 'browser',
    logLevel: 'error',
    absWorkingDir: root,
    external: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'recharts',
      '@huggingface/transformers',
      'onnxruntime-web',
    ],
  })
  const bytes = r.outputFiles?.[0]?.contents?.length ?? 0
  console.log(`analytics-esbuild-ok bytes=${bytes}`)
} catch (e) {
  console.error(e)
  process.exit(1)
}
