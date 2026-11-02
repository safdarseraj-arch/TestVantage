import { useMemo, useState } from 'react'
import PyqLatexReview from './PyqLatexReview.jsx'
import ExtractionSummaryTable from './ExtractionSummaryTable.jsx'
import { QuestionStem, OptionBody } from './QuestionMediaLite.jsx'
import { buildExtractionSummaryReport } from '../utils/pyqGeminiExtract.js'
import { structureTextThenMaybeSave } from '../utils/mathpixGeminiPipeline.js'
import {
  buildBankUploadPaperMeta,
  saveVerifiedBankDrafts,
  BANK_DRAFTS_SAVED_EVENT,
} from '../utils/bankMathpixUpload.js'

function countOptions(options) {
  return (options ?? []).filter((o) => String(o ?? '').trim()).length
}

/**
 * Verify LaTeX + split side-by-side before saving to Draft (solutions come later).
 */
export default function BankUploadVerifyStep({
  fileName,
  ocrText: initialOcr,
  questions: initialQuestions,
  paperMeta,
  fileKind = 'pdf',
  onDiscard,
  onSaved,
}) {
  const [ocrText, setOcrText] = useState(initialOcr || '')
  const [questions, setQuestions] = useState(Array.isArray(initialQuestions) ? initialQuestions : [])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const report = useMemo(
    () =>
      buildExtractionSummaryReport({
        ocrText,
        questions,
        exam: paperMeta?.exam || paperMeta?.examPatternId,
        fileKind,
      }),
    [ocrText, questions, paperMeta, fileKind],
  )

  async function reSplit() {
    setBusy(true)
    setNote('Re-splitting from LaTeX…')
    try {
      const result = await structureTextThenMaybeSave(ocrText, {
        saveToBank: false,
        deferSolutions: true,
        officialPyq: false,
        paperMeta,
      })
      setQuestions(Array.isArray(result.questions) ? result.questions : [])
      setNote(result.cloudNote || `Split ${result.questions?.length ?? 0} question(s).`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Re-split failed.')
    } finally {
      setBusy(false)
    }
  }

  function approveToDraft() {
    if (!questions.length) {
      setNote('No questions to save. Re-split first.')
      return
    }
    const saved = saveVerifiedBankDrafts(questions, paperMeta)
    setNote(
      `Saved ${saved.length} question(s) to Draft (no solutions yet). Open Draft to review, then use Regenerate solution when ready.`,
    )
    try {
      window.dispatchEvent(new CustomEvent(BANK_DRAFTS_SAVED_EVENT, { detail: { count: saved.length } }))
    } catch {
      /* ignore */
    }
    onSaved?.(saved)
  }

  return (
    <div className="card bank-upload-verify-panel">
      <h3>Verify before Draft — {paperMeta?.paperName || fileName}</h3>
      <p className="form-hint">
        {paperMeta?.paperName ? (
          <>
            Paper name: <strong>{paperMeta.paperName}</strong>.{' '}
          </>
        ) : null}
        Step 1: check LaTeX and split together. Step 2: <strong>Approve to Draft</strong> (solutions are
        added later from Draft review, not mixed with your existing bank).
      </p>
      <ExtractionSummaryTable report={report} />
      <div className="bank-upload-verify-grid">
        <PyqLatexReview
          fileName={fileName}
          latexText={ocrText}
          onLatexChange={setOcrText}
          onApplyPolish={() => setNote('Edit LaTeX above, then click Re-split from LaTeX.')}
          onSplit={reSplit}
          onDiscard={onDiscard}
        />
        <div className="bank-upload-split-list">
          <h4>Split preview ({questions.length})</h4>
          <div className="bank-upload-split-scroll">
            {questions.slice(0, 12).map((q, i) => (
              <article key={q.id || i} className="bank-upload-split-card">
                <header>
                  Q{i + 1}
                  {q.questionType ? ` · ${String(q.questionType).replace(/_/g, ' ')}` : ''}
                  {countOptions(q.options) < 4 ? ` · ${countOptions(q.options)}/4 options` : ''}
                </header>
                <QuestionStem text={q.text} />
                {(q.options ?? []).slice(0, 4).map((opt, j) =>
                  String(opt ?? '').trim() ? (
                    <div key={j} className="bank-upload-split-opt">
                      ({String.fromCharCode(65 + j)}) <OptionBody text={opt} />
                    </div>
                  ) : null,
                )}
              </article>
            ))}
            {questions.length > 12 ? (
              <p className="form-hint">… and {questions.length - 12} more after approve.</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="bank-upload-verify-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !questions.length} onClick={approveToDraft}>
          Approve to Draft (no solutions yet)
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={reSplit}>
          {busy ? 'Re-splitting…' : 'Re-split from LaTeX'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
      </div>
      {note ? <p className="form-hint" role="status">{note}</p> : null}
    </div>
  )
}
