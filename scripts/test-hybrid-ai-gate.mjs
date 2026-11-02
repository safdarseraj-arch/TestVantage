/**
 * Hybrid AI A-F on-disk gate: py_compile + grep contracts (no live Gemini/Postgres).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const PY_MODULES = [
  'main.py',
  'hybrid_metadata.py',
  'hybrid_latex_sanitize.py',
  'ai_generator.py',
  'cache_manager.py',
  'pdf_ingestion.py',
  'database.py',
  'models.py',
  'question_pool.py',
  'parent_child_exclusion.py',
  'deduplicator.py',
  'subject_tools.py',
  'env_loader.py',
]

for (const mod of PY_MODULES) {
  const r = spawnSync('python', ['-m', 'py_compile', mod], {
    cwd: root,
    encoding: 'utf-8',
  })
  assert.equal(r.status, 0, `py_compile failed: ${mod}\n${r.stderr || r.stdout}`)
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function mustInclude(rel, snippets) {
  const text = read(rel)
  for (const s of snippets) {
    assert(text.includes(s), `${rel} missing: ${s.slice(0, 60)}`)
  }
}

function mustExclude(rel, snippets) {
  const text = read(rel)
  for (const s of snippets) {
    assert(!text.includes(s), `${rel} must not contain: ${s}`)
  }
}

mustInclude('main.py', [
  '@app.post("/api/generate/batch"',
  '@app.post("/api/questions/clone-scaled"',
  '@app.post("/api/test-results/attempt"',
  '@app.get("/api/analytics/student-performance"',
  '@app.get("/api/questions/pool"',
  'approved_only',
  'init_db',
])
mustInclude('src/utils/hybridAiSync.js', [
  'syncHybridAiIntoQuestionBank',
  '/questions/pool',
])
mustInclude('database.py', ['CREATE EXTENSION IF NOT EXISTS vector', 'sub_bank_type'])

mustInclude('cache_manager.py', ['EphemeralContextCache', 'google.genai'])
mustInclude('pdf_ingestion.py', [
  'EphemeralContextCache',
  'process_cached_book',
  'max_output_tokens=_MAX_OUTPUT_TOKENS',
])

for (const jsx of [
  'src/components/GeneratorDashboard.jsx',
  'src/components/CloneModal.jsx',
  'src/pages/BookUpload.jsx',
  'src/utils/hybridAiClient.js',
]) {
  const raw = fs.readFileSync(path.join(root, jsx))
  assert(!raw.includes(0), `${jsx} has UTF-16 null bytes`)
  mustInclude(jsx, ['Hybrid AI'])
}
mustInclude('src/utils/hybridAiClient.js', [
  '/generate/batch',
  '/questions/clone-scaled',
  '/ingest/book-cached',
  "from '../config/platform.js'",
  'API_BASE',
])
mustInclude('src/utils/hybridAiSync.js', [
  'API_BASE',
  '/questions/pool',
  'approvedOnly === true',
  'limit ?? 2000',
])
mustInclude('src/components/GeminiScqTrialPanel.jsx', [
  'syncHybridAiAfterJob',
  'queued',
  'countHybridAiDrafts',
  'postgresHasNoHybridAiRows',
])
mustInclude('src/utils/hybridAiSync.js', ['postgresHasNoHybridAiRows', 'localHybridDraftCount'])
mustInclude('scripts/hybrid-api-background.mjs', ['isHybridApiHealthy', '/api/questions/pool'])
mustInclude('question_pool.py', ['order_by(AIQuestionBank.question_id.desc())'])
mustInclude('vite.config.js', [
  "'/api/generate'",
  'http://127.0.0.1:8000',
  'hybridFastApiProxy',
  'Hybrid AI (FastAPI on port 8000) is not running',
  "'/api':",
  'http://127.0.0.1:3001',
])
mustInclude('requirements-hybrid.txt', ['python-multipart'])
mustInclude('scripts/dev-background.mjs', ['hybrid-api-background.mjs'])
mustInclude('scripts/launch-dev.mjs', ['hybrid-api-background.mjs'])
for (const rel of [
  'src/utils/hybridAiClient.js',
  'src/utils/hybridAiSync.js',
  'src/utils/testResultsHybrid.js',
]) {
  mustExclude(rel, ['127.0.0.1:8000', 'localhost:8000'])
}

mustInclude('models.py', ['SUB_BANK_TYPE_SIMILAR_PYQ', 'normalize_bloom_level', 'Vector'])
mustInclude('hybrid_metadata.py', [
  'normalize_exam_label',
  'normalize_hybrid_subject_label',
  'SCQ',
  'sub_bank_type',
])
mustInclude('hybrid_metadata.py', [
  'validate_hybrid_question',
  'repair_hybrid_question',
  'prepare_clone_for_insert',
])
mustInclude('main.py', ['prepare_clone_for_insert', 'Skipping hybrid clone — validation failed'])
mustInclude('hybrid_latex_sanitize.py', ['normalize_matrix_environments', 'sanitize_hybrid_option'])
mustInclude('ai_generator.py', ['validate_hybrid_question', 'Hybrid draft validation failed'])
mustInclude('ai_generator.py', ['& between columns'])
mustInclude('src/utils/hybridLatexSanitize.js', ['normalizeMatrixEnvironments', 'sanitizeHybridOption'])
mustInclude('main.py', ['batch_params_from_request', 'clone_parent_metadata'])
mustInclude('subject_tools.py', ['ToolCodeExecution'])

mustInclude('question_pool.py', ['enforce_parent_child_exclusion', 'bloom_levels'])
mustInclude('src/utils/masterPool.js', ['enforce_parent_child_exclusion', 'filterQuestionsByBloom'])

for (const mod of PY_MODULES) {
  mustExclude(mod, ['google.generativeai', 'import generativeai'])
}
mustInclude('ai_generator.py', ['from google import genai', 'gemini-3.7-flash', 'gemini-3-pro'])
mustExclude('ai_generator.py', ['exec('])

const pyParentChild = spawnSync('python', ['python/tests/test_parent_child_exclusion.py'], {
  cwd: root,
  encoding: 'utf-8',
})
assert.equal(pyParentChild.status, 0, pyParentChild.stderr || pyParentChild.stdout)

const pyHybridMeta = spawnSync('python', ['python/tests/test_hybrid_metadata.py'], {
  cwd: root,
  encoding: 'utf-8',
})
assert.equal(pyHybridMeta.status, 0, pyHybridMeta.stderr || pyHybridMeta.stdout)

const taggingGate = spawnSync('node', ['scripts/test-hybrid-tagging-gate.mjs'], {
  cwd: root,
  encoding: 'utf-8',
})
assert.equal(taggingGate.status, 0, taggingGate.stderr || taggingGate.stdout)

console.log('test-hybrid-ai-gate: ok')
