import { useMemo, useRef, useState } from 'react'
import {
  buildJeeUploadTestCases,
  flattenJeeAdvancedChapters,
  JEE_UPLOAD_QUESTION_TYPES,
} from '../utils/jeeUploadTestManifest.js'
import {
  jeeUploadTestResultToBankQuestion,
  runJeeUploadTestCase,
} from '../utils/jeeUploadTestPipeline.js'
import { addBulkUploadedQuestions } from '../utils/questionBank.js'
import { getQuestionType } from '../data/questionTypes.js'

/**
 * @param {{ onMessage?: (msg: { type: string, text: string }) => void }} props
 */
export default function JeeUploadTestPanel({ onMessage }) {
  const [mode, setMode] = useState(/** @type {'sample' | 'full'} */ ('sample'))
  const [preferWebImage, setPreferWebImage] = useState(true)
  const [savePassed, setSavePassed] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentLabel, setCurrentLabel] = useState('')
  const [results, setResults] = useState(/** @type {Array<Awaited<ReturnType<typeof runJeeUploadTestCase>> & { error?: string }>} */ ([]))
  const cancelRef = useRef(false)

  const chapterCount = flattenJeeAdvancedChapters().length
  const testCases = useMemo(
    () => buildJeeUploadTestCases({ mode, maxChapters: mode === 'sample' ? 10 : undefined }),
    [mode],
  )

  const passed = results.filter((r) => r.ok && !r.error).length
  const failed = results.filter((r) => !r.ok || r.error).length

  const runTests = async () => {
    cancelRef.current = false
    setRunning(true)
    setProgress(0)
    setResults([])
    /** @type {typeof results} */
    const batch = []
    /** @type {ReturnType<typeof jeeUploadTestResultToBankQuestion>[]} */
    const toSave = []

    onMessage?.({
      type: 'info',
      text: `Starting ${testCases.length} upload tests (${mode === 'sample' ? 'sample chapters' : 'all PCM chapters'} × ${JEE_UPLOAD_QUESTION_TYPES.length} types). Keep this tab open.`,
    })

    try {
      for (let i = 0; i < testCases.length; i += 1) {
        if (cancelRef.current) break
        const tc = testCases[i]
        const typeName = getQuestionType(tc.questionTypeId)?.shortName ?? tc.questionTypeId
        setCurrentLabel(`${tc.chapter} · ${typeName}`)
        setProgress(Math.round((i / testCases.length) * 100))

        try {
          const result = await runJeeUploadTestCase(tc, {
            preferWebImage,
            onProgress: (p) => setProgress(Math.round(((i + p / 100) / testCases.length) * 100)),
          })
          batch.push(result)
          if (result.ok && savePassed) {
            toSave.push(jeeUploadTestResultToBankQuestion(result))
          }
        } catch (err) {
          batch.push({
            testCase: tc,
            imageSource: 'error',
            ocrText: '',
            engine: 'none',
            detectedType: 'none',
            expectedTypeId: tc.questionTypeId,
            ok: false,
            polished: '',
            details: {},
            error: err instanceof Error ? err.message : 'OCR failed',
          })
        }
        setResults([...batch])
      }

      if (savePassed && toSave.length) {
        addBulkUploadedQuestions(toSave)
      }

      const batchPassed = batch.filter((r) => r.ok && !r.error).length
      const batchFailed = batch.filter((r) => !r.ok || r.error).length
      setProgress(100)
      onMessage?.({
        type: batchFailed === 0 && !cancelRef.current ? 'success' : 'info',
        text: cancelRef.current
          ? `Stopped — ${batchPassed} passed, ${batchFailed} failed of ${batch.length} run.`
          : `${batchPassed}/${batch.length} upload tests passed${savePassed && toSave.length ? ` · ${toSave.length} saved to bank` : ''}.`,
      })
    } finally {
      setRunning(false)
      setCurrentLabel('')
    }
  }

  return (
    <section className="card jee-upload-test-panel">
      <h2>JEE Advanced — auto upload test</h2>
      <p className="lead">
        Runs Hybrid OCR + LaTeX on every JEE Advanced question type across PCM chapters. Uses web images
        from <code>public/jee-upload-test/</code> when available (run{' '}
        <code>npm run fetch:jee-test-images</code> first), otherwise renders scan-style images
        automatically.
      </p>

      <p className="form-hint">
        <strong>{chapterCount}</strong> PCM chapters · <strong>{JEE_UPLOAD_QUESTION_TYPES.length}</strong>{' '}
        types (SCQ, MCQ, MTC, IVQ, NVQ, PIVQ, PSCQ) ·{' '}
        <strong>{mode === 'sample' ? testCases.length : chapterCount * JEE_UPLOAD_QUESTION_TYPES.length}</strong>{' '}
        tests in current mode.
      </p>

      <div className="jee-upload-test-options">
        <label>
          Test scope
          <select value={mode} onChange={(e) => setMode(/** @type {'sample' | 'full'} */ (e.target.value))} disabled={running}>
            <option value="sample">Sample — 10 chapters × all types ({10 * JEE_UPLOAD_QUESTION_TYPES.length} tests)</option>
            <option value="full">Full — all {chapterCount} chapters × all types ({chapterCount * JEE_UPLOAD_QUESTION_TYPES.length} tests)</option>
          </select>
        </label>

        <label className="ocr-local-math-toggle">
          <input
            type="checkbox"
            checked={preferWebImage}
            onChange={(e) => setPreferWebImage(e.target.checked)}
            disabled={running}
          />
          Prefer web images (Google/Bing download cache)
        </label>

        <label className="ocr-local-math-toggle">
          <input
            type="checkbox"
            checked={savePassed}
            onChange={(e) => setSavePassed(e.target.checked)}
            disabled={running}
          />
          Save passed tests to question bank
        </label>
      </div>

      <div className="extract-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={runTests} disabled={running}>
          {running ? `Running… ${progress}%` : 'Run auto upload tests'}
        </button>
        {running && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              cancelRef.current = true
            }}
          >
            Stop
          </button>
        )}
      </div>

      {running && currentLabel && (
        <p className="form-hint" style={{ marginTop: '0.75rem' }}>
          {currentLabel} — {progress}%
        </p>
      )}

      {results.length > 0 && (
        <div className="jee-upload-test-summary" style={{ marginTop: '1rem' }}>
          <p>
            <strong>{passed}</strong> passed · <strong>{failed}</strong> failed ·{' '}
            <strong>{results.length}</strong> total
          </p>
          <div className="jee-upload-test-table-wrap">
            <table className="jee-upload-test-table">
              <thead>
                <tr>
                  <th>Chapter</th>
                  <th>Type</th>
                  <th>Image</th>
                  <th>Detected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.testCase.id} className={r.ok && !r.error ? 'pass' : 'fail'}>
                    <td>{r.testCase.chapter}</td>
                    <td>{getQuestionType(r.testCase.questionTypeId)?.shortName}</td>
                    <td>{r.imageSource}</td>
                    <td>{r.detectedType ?? '—'}</td>
                    <td>{r.error ? r.error : r.ok ? 'OK' : 'Mismatch'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
