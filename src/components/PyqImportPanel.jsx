import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllPyqQuestions } from '../data/pyqCatalog'
import { OptionBody, QuestionStem } from '../components/QuestionMedia'
import MathText from '../components/MathText'
import {
  extractPyqFileWithGemini,
  questionsFromOfficialPyqExtract,
  repairGeminiPyqBankItem,
} from '../utils/pyqGeminiExtract.js'
import { isSupportedUpload } from '../utils/extractDocument'
import OcrOutputFormatPicker from './OcrOutputFormatPicker.jsx'
import {
  PYQ_JSON_TEMPLATE,
  parsePyqCsv,
  parsePyqJson,
  parsedBulkToPyqItems,
} from '../utils/pyqImport'
import {
  addImportedPyqs,
  clearImportedPyqs,
  getImportedPyqCount,
  saveImportedPyqs,
} from '../utils/pyqStore'
import { downloadPyqCsvTemplate, downloadPyqJsonTemplate } from '../utils/pyqTemplates'
import { flattenPaperQuestionMap, parsePyqPaperContent, preparePyqExtractText } from '../utils/pyqPaperParse'
import PyqLatexReview from './PyqLatexReview'
import PyqOneByOneUpload from './PyqOneByOneUpload'
import PyqPaperSetup, { validatePyqPaperSetup } from './PyqPaperSetup'
import PdfQuestionCropPanel from './PdfQuestionCropPanel'
import { getQuestionType } from '../data/questionTypes'
import { friendlyUploadError } from '../utils/uploadFriendlyErrors.js'
import { pdfCropBundleToPyqQuestion } from '../utils/pyqPdfCropSave.js'
import { jeeMainPaperSlotOptions } from '../utils/pyqPaperDefaults.js'

function countOptions(options) {
  return (options ?? []).filter((o) => String(o ?? '').trim().length > 0).length
}

function previewWarnings(item) {
  const warnings = []
  const optCount = countOptions(item.options)
  if (optCount === 0) warnings.push('No options detected')
  else if (optCount < 4) warnings.push(`Only ${optCount}/4 options`)
  if (String(item.text ?? '').trim().length < 25) warnings.push('Very short question text')
  if (item.correctIndex == null && !(item.correctIndices?.length)) {
    warnings.push('No answer key')
  }
  return warnings
}

function PyqSplitPreview({
  fileName,
  instructionText,
  items,
  slotMap,
  onReparse,
  onBackToLatex,
  onRemove,
  onConfirm,
  onDiscard,
}) {
  const stats = useMemo(() => {
    const withOptions = items.filter((q) => countOptions(q.options) >= 4).length
    const partial = items.filter((q) => {
      const n = countOptions(q.options)
      return n > 0 && n < 4
    }).length
    const noOptions = items.filter((q) => countOptions(q.options) === 0).length
    const flagged = items.filter((q) => previewWarnings(q).length > 0).length
    return { withOptions, partial, noOptions, flagged }
  }, [items])

  return (
    <div className="card bulk-preview-panel pyq-split-preview">
      <div className="pyq-step-header">
        <span className="pyq-step-badge muted">Step 1 — LaTeX review</span>
        <h3>Split preview — {items.length} question{items.length === 1 ? '' : 's'}</h3>
        <span className="pyq-step-badge active">Step 2</span>
      </div>
      <p className="form-hint">
        From <strong>{fileName}</strong>. Check each block below — remove bad splits before importing.
      </p>

      <div className="pyq-preview-stats">
        <span className="pyq-preview-stat ok">{stats.withOptions} with 4 options</span>
        {instructionText?.trim() && (
          <span className="pyq-preview-stat ok">Instructions detected</span>
        )}
        {stats.partial > 0 && (
          <span className="pyq-preview-stat warn">{stats.partial} partial options</span>
        )}
        {stats.noOptions > 0 && (
          <span className="pyq-preview-stat warn">{stats.noOptions} no options</span>
        )}
        {stats.flagged > 0 && (
          <span className="pyq-preview-stat warn">{stats.flagged} need review</span>
        )}
      </div>

      {instructionText?.trim() && (
        <details className="pyq-instructions-preview">
          <summary>Paper instructions (not imported as questions)</summary>
          <div className="pyq-instructions-body">{instructionText}</div>
        </details>
      )}

      {items.length === 0 ? (
        <p className="upload-error">
          No questions found.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBackToLatex}>
            Back to LaTeX review
          </button>{' '}
          to fix the text, then split again.
        </p>
      ) : (
        <ul className="bulk-preview-list">
          {items.map((q, i) => {
            const warnings = previewWarnings(q)
            const qNum = q.pyqSlot ?? q.questionNumber ?? i + 1
            const slot = slotMap?.find((s) => s.questionNumber === qNum)
            const typeName = slot
              ? getQuestionType(slot.questionTypeId)?.shortName
              : q.questionType
            return (
              <li key={q.id ?? i} className={warnings.length ? 'pyq-preview-item-warn' : ''}>
                <span className="bulk-q-num">Q{qNum}</span>
                <div className="bulk-q-body">
                  {slot && (
                    <p className="form-hint pyq-preview-slot">
                      {slot.section} · {typeName} · {slot.markingLabel}
                    </p>
                  )}
                  {warnings.length > 0 && (
                    <p className="pyq-preview-warn-tags">
                      {warnings.map((w) => (
                        <span key={w} className="pyq-preview-warn-tag">
                          {w}
                        </span>
                      ))}
                    </p>
                  )}
                  <div className="bulk-q-stem">
                    <QuestionStem text={q.text} options={q.options} className="bulk-q-stem-text" />
                  </div>
                  {countOptions(q.options) > 0 && (
                    <ul className="bulk-q-options">
                      {(q.options ?? []).slice(0, 4).map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi)
                        const body = String(opt ?? '').trim()
                        if (!body) return null
                        const correctSet = new Set(
                          q.correctIndices?.length ? q.correctIndices : [q.correctIndex ?? -1],
                        )
                        const isCorrect = correctSet.has(oi)
                        return (
                          <li
                            key={oi}
                            className={`bulk-q-option${isCorrect ? ' bulk-q-option-correct' : ''}`}
                          >
                            <span className="bulk-q-opt-label">{letter}</span>
                            <div className="bulk-q-opt-body">
                              <OptionBody
                                text={opt}
                                questionText={q.text}
                                allOptions={q.options}
                                optionLetter={letter}
                              />
                              {isCorrect && <span className="bulk-q-opt-key">Correct</span>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {q.solution?.trim() && (
                    <div className="bulk-q-solution">
                      <span className="bulk-q-solution-label">Solution</span>
                      <MathText text={q.solution} questionContext={q.text} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRemove(i)}
                  >
                    Remove this block
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="extract-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={items.length === 0}
          onClick={onConfirm}
        >
          Import {items.length} question{items.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReparse}>
          Re-split
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBackToLatex}>
          ← Back to LaTeX
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>
          Discard preview
        </button>
      </div>
    </div>
  )
}

export default function PyqImportPanel({ onImported }) {
  const initialSlot = jeeMainPaperSlotOptions(2024)[0]
  const [tab, setTab] = useState('pdf-crop')
  const [jsonPaste, setJsonPaste] = useState(PYQ_JSON_TEMPLATE)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [paper, setPaper] = useState(() => ({
    pyqYear: 2024,
    examPatternId: 'jee-main',
    paperId: initialSlot?.paperId ?? '',
    paperLabel: initialSlot?.paperLabel ?? '',
    pyqDate: initialSlot?.pyqDate ?? '',
    pyqShift: initialSlot?.pyqShift,
    pyqSession: initialSlot?.pyqSession ?? '',
    subject: '',
    chapter: '',
  }))
  const [filePreview, setFilePreview] = useState(null)
  const [extractedText, setExtractedText] = useState('')
  const [instructionText, setInstructionText] = useState('')
  const [previewItems, setPreviewItems] = useState([])
  const [oneByOneDraft, setOneByOneDraft] = useState({})
  /** @type {'latex' | 'split' | null} */
  const [fileStep, setFileStep] = useState(null)

  const importedCount = getImportedPyqCount()
  const totalCount = getAllPyqQuestions().length
  const paperCheck = validatePyqPaperSetup(paper)
  const paperReady = paperCheck.ok
  const defaults = paperCheck.ok ? paperCheck.value : paper

  const savePdfCropBundleToPyq = async (bundle) => {
    if (!paperReady) {
      setMsg({ type: 'error', text: paperCheck.error ?? 'Complete exam and paper details first.' })
      return false
    }
    try {
      const q = pdfCropBundleToPyqQuestion(bundle, paperCheck.value)
      if (!q) throw new Error('Could not build PYQ from crop.')
      addImportedPyqs([q])
      setMsg({
        type: 'success',
        text: `Saved Q${q.pyqSlot} to PYQ bank (${paperCheck.value.paperLabel}).`,
      })
      onImported?.()
      return true
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Save failed' })
      return false
    }
  }

  const clearFilePreview = () => {
    setFilePreview(null)
    setExtractedText('')
    setInstructionText('')
    setPreviewItems([])
    setFileStep(null)
  }

  const slotMap = useMemo(
    () => flattenPaperQuestionMap(defaults.examPatternId),
    [defaults.examPatternId],
  )

  const splitFromLatex = (text = extractedText) => {
    const paper = parsePyqPaperContent(text, 'cloud-vision', { alreadyPrepared: true })
    const items = parsedBulkToPyqItems(paper.questions, defaults, 0, slotMap)
    setInstructionText(paper.instructionText)
    setPreviewItems(items)
    setExtractedText(paper.preparedText || text)
    return { paper, items }
  }

  const handleSplitFromLatex = () => {
    setMsg({ type: '', text: '' })
    try {
      if (!extractedText.trim()) {
        throw new Error('No LaTeX text to split.')
      }
      const { paper, items } = splitFromLatex(extractedText)
      if (paper.questions.length === 0 && items.length === 0) {
        throw new Error('No questions found. Fix the LaTeX text and try again.')
      }
      setFileStep('split')
      setMsg({
        type: 'success',
        text: `Split into ${items.length} question(s). Review each block, then Import.`,
      })
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Split failed' })
    }
  }

  const handleApplyPolish = () => {
    if (!extractedText.trim()) return
    setExtractedText(preparePyqExtractText(extractedText, 'cloud-vision'))
    setMsg({ type: 'success', text: 'OCR polish re-applied. Check the rendered preview.' })
  }

  const handleJson = (merge) => {
    try {
      const items = parsePyqJson(jsonPaste).map(repairGeminiPyqBankItem)
      if (merge) addImportedPyqs(items)
      else saveImportedPyqs(items, false)
      setMsg({ type: 'success', text: `Imported ${items.length} PYQ(s). Total in bank: ${getAllPyqQuestions().length}` })
      onImported?.()
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Import failed' })
    }
  }

  const handleCsvFile = (f) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const items = parsePyqCsv(String(reader.result)).map(repairGeminiPyqBankItem)
        addImportedPyqs(items)
        setMsg({ type: 'success', text: `Imported ${items.length} from CSV.` })
        onImported?.()
      } catch (e) {
        setMsg({ type: 'error', text: e instanceof Error ? e.message : 'CSV error' })
      }
    }
    reader.readAsText(f)
  }

  const handlePdfExtract = async (f) => {
    if (!f || !isSupportedUpload(f)) {
      setMsg({ type: 'error', text: 'Use .docx, .pdf, or image' })
      return
    }
    setLoading(true)
    setProgress(0)
    setMsg({ type: '', text: '' })
    clearFilePreview()
    try {
      const extracted = await extractPyqFileWithGemini(f, setProgress)
      const built = questionsFromOfficialPyqExtract(extracted, defaults)
      const text = String(built.preparedText || extracted.text || '').trim()
      if (!text && !built.questions.length) {
        throw new Error('No text extracted. Try a clearer PDF or image.')
      }
      setExtractedText(text)
      setFilePreview(f.name)
      setInstructionText(built.instructionText || '')
      setPreviewItems(built.questions)

      if (built.questions.length) {
        setFileStep('split')
        setMsg({
          type: 'success',
          text:
            built.source === 'gemini-structured'
              ? `Gemini kept ${built.questions.length} question(s) with paper tags. Review, then Import. Rejected: ${built.rejected.length}.`
              : `Split into ${built.questions.length} question(s). Review below, then Import.`,
        })
        return
      }

      setFileStep('latex')
      setMsg({
        type: 'success',
        text: 'OCR done. Review LaTeX on the left and the rendered preview on the right, then click Split into questions.',
      })
    } catch (e) {
      setMsg({ type: 'error', text: friendlyUploadError(e) ?? 'Extract failed' })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleReparse = () => {
    setMsg({ type: '', text: '' })
    try {
      const { items } = splitFromLatex(extractedText)
      setMsg({
        type: items.length ? 'success' : 'error',
        text: items.length
          ? `Re-split into ${items.length} question block(s).`
          : 'No questions found after re-split.',
      })
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Re-split failed' })
    }
  }

  const handleConfirmImport = () => {
    if (!previewItems.length) return
    addImportedPyqs(previewItems)
    setMsg({
      type: 'success',
      text: `Imported ${previewItems.length} PYQ(s). Total in bank: ${getAllPyqQuestions().length}`,
    })
    clearFilePreview()
    onImported?.()
  }

  const handleOneByOneImport = (items) => {
    addImportedPyqs(items)
    setOneByOneDraft({})
    setMsg({
      type: 'success',
      text: `Imported ${items.length} PYQ(s) from one-by-one upload. Total: ${getAllPyqQuestions().length}`,
    })
    onImported?.()
  }

  const handleRemovePreviewItem = (index) => {
    setPreviewItems((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <section className="card pyq-import-panel">
      <h2>Import your own PYQs (legal sources only)</h2>
      <div className="pyq-legal-notice">
        <p>
          <strong>Cannot import from third-party sites</strong> — external questions are copyrighted and
          watermarked. Do not scrape third-party sites.
        </p>
        <p>
          You <em>can</em> import content you own or may use:{' '}
          <strong>NTA / IIT official papers</strong>, your coaching sheets, or JSON/CSV you created.
          Downloads from TestVantages are always watermarked for your protection.
        </p>
        <p>
          <strong>JEE Advanced (IIT):</strong> download Paper 1 &amp; Paper 2 PDFs from the official
          archive{' '}
          <a href="https://jeeadv.ac.in/archive.html" target="_blank" rel="noopener noreferrer">
            jeeadv.ac.in/archive.html
          </a>
          , then upload here (Word/PDF tab). There is no automatic pull from the IIT website — use
          your downloaded PDF or type into JSON/CSV for best accuracy.
        </p>
        <p>
          <strong>Official papers with approval:</strong> for NTA / Advanced / NEET that must stay{' '}
          <em>pending</em> until a teacher approves, use{' '}
          <Link to="/official-pyq">Approve official papers</Link> instead — approve, fill, then Publish sends
          them to student PYQ and Question Bank.
        </p>
      </div>

      <p className="form-hint">
        Imported: <strong>{importedCount}</strong> · Student PYQ bank:{' '}
        <strong>{totalCount}</strong> (sample catalog is off unless staff enable demo seed)
      </p>

      <div className="extract-actions" style={{ marginBottom: '1rem' }}>
        <button type="button" className="btn btn-primary" onClick={downloadPyqJsonTemplate}>
          Download PYQ template (JSON)
        </button>
        <button type="button" className="btn btn-ghost" onClick={downloadPyqCsvTemplate}>
          Download CSV template
        </button>
      </div>

      {msg.text && (
        <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
      )}

      <PyqPaperSetup value={paper} onChange={setPaper} />

      <div className="bank-tabs" style={{ marginBottom: '1rem' }}>
        {[
          { id: 'pdf-crop', label: 'PDF crop' },
          { id: 'file', label: 'Full PDF' },
          { id: 'single', label: 'One by one' },
          { id: 'json', label: 'JSON' },
          { id: 'csv', label: 'CSV' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bank-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!paperReady && (tab === 'pdf-crop' || tab === 'file' || tab === 'single') && (
        <p className="form-error">{paperCheck.error ?? 'Complete exam, year, and shift first.'}</p>
      )}

      {tab === 'pdf-crop' && paperReady && (
        <PdfQuestionCropPanel
          defaultQuestionType="single_correct"
          onSaveBundle={savePdfCropBundleToPyq}
          onMessage={(type, text) => setMsg({ type: type || '', text: text || '' })}
        />
      )}

      {tab === 'json' && (
        <>
          <textarea className="bulk-paste-area" rows={10} value={jsonPaste} onChange={(e) => setJsonPaste(e.target.value)} />
          <div className="extract-actions">
            <button type="button" className="btn btn-primary" onClick={() => handleJson(false)}>
              Replace imported PYQs
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => handleJson(true)}>
              Merge (add more)
            </button>
            <button type="button" className="btn btn-ghost" onClick={downloadPyqJsonTemplate}>
              Download template
            </button>
          </div>
        </>
      )}

      {tab === 'csv' && (
        <div className="extract-actions">
          <p className="form-hint">
            Columns: pyqYear, examPatternId, paperId, paperLabel, pyqDate, pyqShift,
            pyqSession, subject, chapter, text, optionA–D, correctIndex, solution
          </p>
          <label className="btn btn-primary file-btn">
            Upload CSV
            <input type="file" accept=".csv" hidden onChange={(e) => handleCsvFile(e.target.files?.[0])} />
          </label>
        </div>
      )}

      {tab === 'file' && paperReady && (
        <>
          <p className="form-hint ocr-engine-hint">
            OCR: <strong>Mathpix</strong> then Gemini split. Add MATHPIX_APP_ID / MATHPIX_APP_KEY
            and GEMINI_API_KEY in onlinetest/.env, then press F5.
          </p>
          <OcrOutputFormatPicker id="pyq-import-ocr-format" />
          <p className="form-hint">
            Step 1: OCR → review LaTeX. Step 2: split into questions → import.
          </p>
          <div
            className="upload-dropzone upload-dropzone-sm"
            onClick={() => !loading && document.getElementById('pyq-file-in')?.click()}
          >
            <input
              id="pyq-file-in"
              type="file"
              hidden
              accept=".docx,.pdf,.png,.jpg,.jpeg"
              disabled={loading}
              onChange={(e) => handlePdfExtract(e.target.files?.[0])}
            />
            <p>
              {loading
                ? `Extracting… ${progress > 0 ? `${progress}%` : ''}`
                : 'Upload PDF/image — OCR → review LaTeX → split questions'}
            </p>
            {filePreview && !loading && (
              <p className="dropzone-file">Last file: {filePreview}</p>
            )}
          </div>

          {filePreview && fileStep === 'latex' && (
            <PyqLatexReview
              fileName={filePreview}
              latexText={extractedText}
              onLatexChange={setExtractedText}
              onApplyPolish={handleApplyPolish}
              onSplit={handleSplitFromLatex}
              onDiscard={() => {
                clearFilePreview()
                setMsg({ type: '', text: '' })
              }}
            />
          )}

          {filePreview && fileStep === 'split' && (
            <PyqSplitPreview
              fileName={filePreview}
              instructionText={instructionText}
              items={previewItems}
              slotMap={slotMap}
              onReparse={handleReparse}
              onBackToLatex={() => {
                setFileStep('latex')
                setMsg({ type: '', text: '' })
              }}
              onRemove={handleRemovePreviewItem}
              onConfirm={handleConfirmImport}
              onDiscard={() => {
                clearFilePreview()
                setMsg({ type: '', text: '' })
              }}
            />
          )}
        </>
      )}

      {tab === 'single' && paperReady && (
        <PyqOneByOneUpload
          defaults={defaults}
          draftByNumber={oneByOneDraft}
          onDraftChange={setOneByOneDraft}
          onImportAll={handleOneByOneImport}
          setMsg={setMsg}
        />
      )}

      {importedCount > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: '1rem' }}
          onClick={() => {
            if (confirm('Remove all imported PYQs from this browser? The question bank is not wiped.')) {
              clearImportedPyqs()
              setMsg({ type: 'success', text: 'Imported PYQs cleared.' })
              onImported?.()
            }
          }}
        >
          Clear imported PYQs
        </button>
      )}
    </section>
  )
}
