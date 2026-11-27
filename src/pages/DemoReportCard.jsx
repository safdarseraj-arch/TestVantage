import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PortalPage from '../components/PortalPage.jsx'
import {
  DEMO_REPORT_CARD_FIELDS,
  DEMO_DIAGNOSTIC_REPORT_FIELDS,
  DEMO_REPORT_STUDENT,
  DEMO_REPORT_TEST,
  getDemoReportAttemptData,
  getDemoReportCardModel,
} from '../data/demoStudentReportCard.js'
import { getDemoTestAnalysisBundle } from '../data/demoStudentTestAnalysis.js'
import {
  buildReportCardHtml,
  downloadReportCardHtml,
  openReportMailto,
} from '../utils/resultReportCard.js'
import {
  buildDiagnosticReportModel,
  buildDiagnosticReportHtml,
  downloadDiagnosticReportHtml,
  openDiagnosticReportPrint,
} from '../utils/diagnosticReportPdf.js'
import ResultShareReport from '../components/ResultShareReport.jsx'

/**
 * Fixed demo student report — one-page card + full multi-page diagnostic.
 * Path: /demo/report-card
 */
export default function DemoReportCard() {
  const model = useMemo(() => getDemoReportCardModel(), [])
  const attemptData = useMemo(() => getDemoReportAttemptData(), [])
  const html = useMemo(() => buildReportCardHtml(model), [model])
  const analysisBundle = useMemo(() => getDemoTestAnalysisBundle(), [])

  const diagnosticOpts = useMemo(() => {
    if (analysisBundle?.data && analysisBundle?.test) {
      return {
        data: {
          ...analysisBundle.data,
          batchLabel: DEMO_REPORT_STUDENT.classLabel,
        },
        test: analysisBundle.test,
        studentName: DEMO_REPORT_STUDENT.name,
        attempts: [],
        attemptId: analysisBundle.attemptId,
      }
    }
    return {
      data: { ...attemptData, batchLabel: DEMO_REPORT_STUDENT.classLabel },
      test: DEMO_REPORT_TEST,
      studentName: DEMO_REPORT_STUDENT.name,
      attempts: [],
    }
  }, [analysisBundle, attemptData])

  const diagnosticModel = useMemo(
    () => buildDiagnosticReportModel(diagnosticOpts),
    [diagnosticOpts],
  )
  const diagnosticHtml = useMemo(
    () => buildDiagnosticReportHtml(diagnosticModel),
    [diagnosticModel],
  )
  const [status, setStatus] = useState('')
  const [previewMode, setPreviewMode] = useState(/** @type {'full' | 'card'} */ ('full'))

  const previewHtml = previewMode === 'full' ? diagnosticHtml : html

  const onPrintFull = () => {
    const res = openDiagnosticReportPrint(diagnosticModel)
    if (!res.ok) {
      setStatus('Pop-up blocked — use Download full diagnostic instead.')
      return
    }
    setStatus('Full diagnostic print window opened — choose Save as PDF.')
  }

  const onDownloadFull = () => {
    downloadDiagnosticReportHtml(
      diagnosticHtml,
      'testvantages-demo-aarav-sharma-full-diagnostic.html',
    )
    setStatus('Downloaded full 6-page diagnostic. Open → Print → Save as PDF (enable background graphics).')
  }

  const onPrint = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
    if (!w) {
      setStatus('Pop-up blocked — use Download instead.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      try {
        w.focus()
        w.print()
      } catch {
        /* ignore */
      }
    }, 250)
    setStatus('One-page print window opened — choose Save as PDF if you want a file.')
  }

  const onDownload = () => {
    downloadReportCardHtml(html, 'testvantages-demo-aarav-sharma-report.html')
    setStatus('Downloaded one-page card. Open the file → Print → Save as PDF.')
  }

  const onMailto = () => {
    openReportMailto(model, DEMO_REPORT_STUDENT.parentEmail)
    setStatus('Opened your email app with a short text summary.')
  }

  return (
    <PortalPage
      role="student"
      eyebrow="Demo only"
      title="Sample diagnostic report"
      subtitle={`${DEMO_REPORT_STUDENT.name} · ${DEMO_REPORT_STUDENT.classLabel} · Full multi-page pack`}
      actions={
        <>
          <Link to="/demo/test-analysis" className="btn btn-ghost btn-sm">
            Sample analysis
          </Link>
          <Link to="/my-results" className="btn btn-ghost btn-sm">
            My Results
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadFull}>
            Download full diagnostic
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onPrintFull}>
            Print full / Save PDF
          </button>
        </>
      }
      className="demo-report-card-page student-portal-page"
    >
      <p className="form-hint" style={{ marginTop: 0 }}>
        This demo shows the <strong>full multi-page diagnostic</strong> (same depth as the founder
        Flagship / JEE Advanced / NEET sample PDFs), built from the sample analysis attempt — not only
        the thin one-page parent card.
      </p>

      {status ? (
        <p className="form-hint" role="status">
          {status}
        </p>
      ) : null}

      <div className="demo-report-layout">
        <section className="card demo-report-legend" aria-label="What is on the report">
          <h2>What is on the full diagnostic</h2>
          <p className="form-hint">Six printable pages · Print → Save as PDF.</p>
          {DEMO_DIAGNOSTIC_REPORT_FIELDS.map((block) => (
            <div key={block.group} className="demo-report-legend-block">
              <h3>{block.group}</h3>
              <ul>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          <details className="demo-report-legend-block">
            <summary>Also available: one-page parent card</summary>
            {DEMO_REPORT_CARD_FIELDS.map((block) => (
              <div key={block.group}>
                <h3>{block.group}</h3>
                <ul>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>

          <div className="demo-report-kpi-summary" aria-label="Demo numbers">
            <h3>This demo’s numbers (full pack)</h3>
            <ul>
              <li>
                Marks: <strong>{diagnosticModel.score}/{diagnosticModel.maxScore}</strong> (
                {diagnosticModel.pct}%)
              </li>
              <li>
                Accuracy: <strong>{diagnosticModel.accuracy}%</strong>
              </li>
              <li>
                Est. percentile: <strong>~{diagnosticModel.percentile}</strong>
              </li>
              <li>
                Est. AIR:{' '}
                <strong>~{Number(diagnosticModel.estimatedAIR).toLocaleString('en-IN')}</strong>
              </li>
              <li>
                Highlights rows: <strong>{diagnosticModel.highlights?.length ?? 0}</strong>
              </li>
              <li>
                Pages: <strong>6</strong>
              </li>
            </ul>
          </div>
          <div className="demo-report-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={onPrintFull}>
              Print full / Save PDF
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadFull}>
              Download full diagnostic
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint}>
              Print one-page card
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDownload}>
              Download one-page card
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onMailto}>
              Open email app
            </button>
          </div>
        </section>

        <section className="card demo-report-preview" aria-label="Report preview">
          <div className="demo-report-preview-head">
            <h2>Live preview</h2>
            <div className="demo-report-actions" style={{ marginTop: '0.35rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${previewMode === 'full' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPreviewMode('full')}
              >
                Full diagnostic
              </button>
              <button
                type="button"
                className={`btn btn-sm ${previewMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPreviewMode('card')}
              >
                One-page card
              </button>
            </div>
            <p className="form-hint">
              {previewMode === 'full'
                ? 'Exact multi-page HTML parents / mentors print.'
                : 'Short parent forward card.'}
            </p>
          </div>
          <iframe
            title={previewMode === 'full' ? 'Full diagnostic preview' : 'One-page report preview'}
            className="demo-report-iframe"
            srcDoc={previewHtml}
            sandbox=""
          />
        </section>
      </div>

      <ResultShareReport
        data={diagnosticOpts.data}
        test={diagnosticOpts.test}
        studentName={DEMO_REPORT_STUDENT.name}
      />

      <p className="form-hint">
        After a real paper: open the Result page → <strong>Download full diagnostic report</strong>.
        Interactive charts stay on Result / Sample analysis.
      </p>
    </PortalPage>
  )
}
