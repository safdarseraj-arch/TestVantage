import { useState } from 'react'

import {
  applyFullScienceOcrPreset,
  getOcrModeLabel,
  loadOcrSettings,
  applyStandardOcrPreset,
  saveOcrSettings,
  shouldUseFullScienceOnnx,
  shouldUseLocalOcrQualityBoost,
} from '../utils/ocrSettings'

import { getActiveOcrEngineLabel } from '../utils/extractDocument'

import { isWebGpuAvailable } from '../utils/mathOcrPipeline'
import {
  getLocalAiLearningStats,
  loadLocalAiLearningSettings,
  saveLocalAiLearningSettings,
} from '../utils/localAiLearningStore.js'

const SCIENCE_TOPICS = [
  'Equations & algebra',
  'Integrals & limits',
  'Determinants & matrices',
  'Chemical formulas (\\ce{})',
  'Graphs & diagrams (text + image crop)',
  'Vectors, trigonometry, logs',
]

export default function OcrSettingsPanel() {
  const initial = loadOcrSettings()

  const [mode, setMode] = useState(initial.mode)
  const [fullScienceOcr, setFullScienceOcr] = useState(initial.fullScienceOcr === true)
  const [useLocalMathOcr, setUseLocalMathOcr] = useState(initial.useLocalMathOcr !== false)
  const [mathOcrDevice, setMathOcrDevice] = useState(initial.mathOcrDevice ?? 'auto')
  const [localOcrQualityBoost, setLocalOcrQualityBoost] = useState(initial.localOcrQualityBoost !== false)
  const [msg, setMsg] = useState('')

  const webGpuOk = isWebGpuAvailable()
  const scienceActive = shouldUseFullScienceOnnx({ mode, fullScienceOcr, useLocalMathOcr })

  const applyPreset = () => {
    const preset = applyFullScienceOcrPreset()
    setMode(preset.mode)
    setFullScienceOcr(true)
    setUseLocalMathOcr(true)
    setMathOcrDevice('auto')
    setMsg('Full science preset saved. Mathpix still reads the page; Local/Gemini do not OCR.')
  }

  const handleSave = () => {
    saveOcrSettings({
      mode,
      fullScienceOcr,
      useLocalMathOcr,
      mathOcrDevice,
      localOcrQualityBoost,
      useMathpixApi: true,
      mathpixFallback: false,
    })
    setMsg('OCR settings saved. Uploads will use: ' + getActiveOcrEngineLabel())
  }

  return (
    <section className="card ocr-settings-panel">
      <h2>PDF / image OCR</h2>
      <p className="lead">
        <strong>Mathpix</strong> always reads PDF, image, and handwriting. <strong>Local AI</strong> then
        splits questions. <strong>Gemini</strong> fills tags, answers, and solutions — it does not OCR the
        page. Keys live on the API server (<code>onlinetest/.env</code>). Keep the bottom panel open, then
        press F5.
      </p>

      <div className="ocr-science-preset card-inner">
        <div className="ocr-science-preset-head">
          <div>
            <h3>Recommended: JEE / NEET full science</h3>
            <p className="form-hint">
              Best for equations, integrals, limits, determinants, chemical symbols, and graph questions.
            </p>
          </div>
          <span
            className={`go-live-verdict ${scienceActive ? 'go-live-verdict--ok' : 'go-live-verdict--warn'}`}
          >
            {scienceActive ? 'Active' : 'Not active'}
          </span>
        </div>
        <ul className="ocr-science-topic-list">
          {SCIENCE_TOPICS.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary btn-sm" onClick={applyPreset}>
          Apply full science preset
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const preset = applyStandardOcrPreset()
            setMode(preset.mode)
            setFullScienceOcr(false)
            setUseLocalMathOcr(true)
            setMathOcrDevice('auto')
            setMsg('Standard settings restored. Mathpix still reads PDF/image/handwriting.')
          }}
        >
          Reset to Standard (fix extraction)
        </button>
      </div>

      <label className="ocr-local-math-toggle">
        <input
          type="checkbox"
          checked={useLocalMathOcr}
          onChange={(e) => setUseLocalMathOcr(e.target.checked)}
        />
        Local LaTeX layer in Hybrid OCR + LaTeX (required for equations — keep ON)
      </label>

      <label className="ocr-local-math-toggle">
        <input
          type="checkbox"
          checked={fullScienceOcr}
          onChange={(e) => {
            setFullScienceOcr(e.target.checked)
            if (e.target.checked) setMode('advanced')
          }}
        />
        Full science — Hybrid OCR + LaTeX runs extra equation passes on hard math/chemistry
      </label>

      <div className="ocr-mathpix-keys card-inner">
        <h3>Mathpix OCR keys (required for PDF / image / handwriting)</h3>
        <p className="form-hint">
          Mathpix keys stay in <code>onlinetest/.env</code> (already set). Keep the bottom panel
          open (Ctrl+J then Ctrl+`), then press <strong>F5</strong> so port 3001 reloads them.
          Gemini still uses <code>GEMINI_API_KEY</code> to fill answers, tags, and solutions after OCR.
        </p>
      </div>

      <div className="ocr-mathpix-keys card-inner">
        <h3>Local quality boost (no cloud - server-safe)</h3>
        <p className="form-hint">
          When the first pass scores low, TestVantages runs a <strong>second Hybrid OCR + LaTeX pass</strong>:
          extra LaTeX ONNX crops on stem + options, then picks the best result. Same stack on laptop
          and on your live server — no Mathpix or paid API required.
        </p>
        <label className="ocr-local-math-toggle">
          <input
            type="checkbox"
            checked={localOcrQualityBoost}
            onChange={(e) => setLocalOcrQualityBoost(e.target.checked)}
            disabled={!useLocalMathOcr}
          />
          Auto quality boost on hard scans (recommended)
        </label>
        <span
          className={`go-live-verdict ${shouldUseLocalOcrQualityBoost({ localOcrQualityBoost, useLocalMathOcr }) ? 'go-live-verdict--ok' : 'go-live-verdict--warn'}`}
        >
          {localOcrQualityBoost && useLocalMathOcr ? 'Local boost ON' : 'Boost off'}
        </span>
      </div>

      <p className="form-hint">
        Active engine: <strong>{getActiveOcrEngineLabel()}</strong> · Mode:{' '}
        <strong>{getOcrModeLabel({ mode, fullScienceOcr, useLocalMathOcr })}</strong>
      </p>

      <label>
        OCR mode
        <select
          value={mode}
          onChange={(e) => {
            const next = /** @type {import('../utils/ocrSettings').OcrMode} */ (e.target.value)
            setMode(next)
            if (next === 'advanced') setFullScienceOcr(true)
            if (next === 'standard' || next === 'auto') setFullScienceOcr(false)
          }}
        >
          <option value="standard">Standard — Hybrid OCR + LaTeX (default)</option>
          <option value="auto">Auto — same as Standard</option>
          <option value="advanced">Advanced — extra LaTeX passes on hard math/chemistry</option>
        </select>
      </label>

      <label style={{ marginTop: '0.75rem' }}>
        LaTeX ONNX device
        <select
          value={mathOcrDevice}
          onChange={(e) =>
            setMathOcrDevice(
              /** @type {import('../utils/ocrSettings').OcrSettings['mathOcrDevice']} */ (
                e.target.value
              ),
            )
          }
        >
          <option value="auto">Auto — WebGPU when available, else WASM</option>
          <option value="webgpu" disabled={!webGpuOk}>
            WebGPU — faster on supported GPUs{!webGpuOk ? ' (not available)' : ''}
          </option>
          <option value="wasm">WASM — CPU fallback</option>
        </select>
      </label>

      <p className="form-hint" style={{ marginTop: '0.75rem' }}>
        Drop an image or PDF on <strong>Question Bank → Single</strong>. For <strong>graph</strong>{' '}
        questions, the equation text is OCR&apos;d and the figure is saved as a <strong>diagram crop</strong>{' '}
        automatically. Use <strong>Parse question &amp; options</strong> only if something looks wrong.
      </p>

      <LocalAiLearningSettingsBlock />

      <CloudVisionSettingsBlock
        onSaved={() => setMsg('OCR + Cloud AI settings saved. Uploads will use: ' + getActiveOcrEngineLabel())}
      />

      <div className="extract-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save OCR settings
        </button>
      </div>
      {msg && <p className="form-hint" style={{ marginTop: '0.75rem' }}>{msg}</p>}
    </section>
  )
}

function CloudVisionSettingsBlock({ onSaved }) {
  const initial = loadOcrSettings()
  const [useCloudVision, setUseCloudVision] = useState(
    initial.useCloudVision === false ? false : initial.useCloudVision === true ? true : 'auto',
  )
  const [preferCloudVision, setPreferCloudVision] = useState(initial.preferCloudVision === true)

  return (
    <div className="card-inner" style={{ marginTop: '1rem' }}>
      <h3>Cloud AI (Gemini)</h3>
      <p className="form-hint">
        Gemini never reads PDF, image, or handwriting. After Mathpix OCR and local split, Gemini
        (flash-lite) fills metatags, answers, and solutions. If the key is missing, local AI still
        splits questions.
      </p>
      <label>
        Cloud AI mode
        <select
          value={String(useCloudVision)}
          onChange={(e) => {
            const v = e.target.value
            setUseCloudVision(v === 'false' ? false : v === 'true' ? true : 'auto')
          }}
        >
          <option value="auto">Auto — Gemini fills tags/answers after Mathpix</option>
          <option value="true">Prefer Gemini for tags, answers, solutions</option>
          <option value="false">Local only — skip Gemini tags/answers</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <input
          type="checkbox"
          checked={preferCloudVision}
          onChange={(e) => setPreferCloudVision(e.target.checked)}
        />
        Prefer Gemini first for tags and answers (still not OCR)
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginTop: '0.5rem' }}
        onClick={() => {
          saveOcrSettings({
            useCloudVision,
            preferCloudVision,
          })
          onSaved?.()
        }}
      >
        Save Cloud AI settings
      </button>
    </div>
  )
}

function LocalAiLearningSettingsBlock() {
  const [enabled, setEnabled] = useState(() => loadLocalAiLearningSettings().enabled)
  const [stats, setStats] = useState(() => getLocalAiLearningStats())

  return (
    <div className="card-inner" style={{ marginTop: '1rem' }}>
      <h3>Local AI learning from Gemini</h3>
      <p className="form-hint">
        When Gemini succeeds and you Save (or accept an explanation), this computer stores a private
        example so Local AI can reuse common fixes later. Nothing is sent back to Google. Local will
        not match Gemini overnight — it improves with use (pattern library, not a fine-tune).
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const on = e.target.checked
            setEnabled(on)
            saveLocalAiLearningSettings({ enabled: on })
            setStats(getLocalAiLearningStats())
          }}
        />
        Use learned local improvements (default on)
      </label>
      <p className="form-hint" style={{ marginTop: '0.35rem' }}>
        Local AI learning from Gemini — {stats.exampleCount} example
        {stats.exampleCount === 1 ? '' : 's'}, {stats.correctionCount} correction
        {stats.correctionCount === 1 ? '' : 's'}.
      </p>
    </div>
  )
}
