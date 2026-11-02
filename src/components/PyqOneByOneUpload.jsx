import { useMemo, useState } from 'react'
import { OptionBody, QuestionStem } from './QuestionMedia'
import PyqLatexReview from './PyqLatexReview'
import { getQuestionType } from '../data/questionTypes'
import { listPaperPatterns } from '../utils/paperPatternStore'
import { extractTextFromFile, extractLatexFromImage, isImageFile, isSupportedUpload } from '../utils/extractDocument'
import OcrOutputFormatPicker from './OcrOutputFormatPicker'
import { parseSingleQuestionUpload } from '../utils/parseSingleQuestionUpload'
import { parsedBulkToPyqItems } from '../utils/pyqImport'
import {
  extractLeadingInstructions,
  flattenPaperQuestionMap,
  getPaperSlotForQuestion,
  isInstructionBlock,
  preparePyqExtractText,
} from '../utils/pyqPaperParse'
import { friendlyUploadError } from '../utils/uploadFriendlyErrors.js'

function countOptions(options) {
  return (options ?? []).filter((o) => String(o ?? '').trim().length > 0).length
}

/** @param {Array<{ questionNumber: number, section: string }>} slotMap */
function groupSlotsBySection(slotMap) {
  /** @type {Array<{ section: string, slots: typeof slotMap }>} */
  const groups = []
  for (const slot of slotMap) {
    const last = groups[groups.length - 1]
    if (!last || last.section !== slot.section) {
      groups.push({ section: slot.section, slots: [slot] })
    } else {
      last.slots.push(slot)
    }
  }
  return groups
}

export default function PyqOneByOneUpload({ defaults, draftByNumber, onDraftChange, onImportAll, setMsg }) {
  const [questionNumber, setQuestionNumber] = useState(1)
  const [paperPatternId, setPaperPatternId] = useState('')
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState('')
  const [ocrSourceFile, setOcrSourceFile] = useState(null)
  const [latexText, setLatexText] = useState('')
  /** @type {'idle' | 'latex' | 'preview'} */
  const [uploadStep, setUploadStep] = useState('idle')
  const [preview, setPreview] = useState(null)

  const paperPatterns = useMemo(
    () => listPaperPatterns(defaults.examPatternId),
    [defaults.examPatternId],
  )

  const slotMap = useMemo(
    () => flattenPaperQuestionMap(defaults.examPatternId, paperPatternId || undefined),
    [defaults.examPatternId, paperPatternId],
  )

  const slotGroups = useMemo(() => groupSlotsBySection(slotMap), [slotMap])

  const currentSlot = useMemo(
    () => getPaperSlotForQuestion(questionNumber, defaults.examPatternId, paperPatternId || undefined),
    [questionNumber, defaults.examPatternId, paperPatternId],
  )

  const typeLabel = currentSlot ? getQuestionType(currentSlot.questionTypeId)?.name : '—'

  const filledCount = Object.keys(draftByNumber).length

  const clearUpload = () => {
    setUploadFileName('')
    setOcrSourceFile(null)
    setLatexText('')
    setUploadStep('idle')
    setPreview(null)
  }

  const extractPyqLatex = async (f) => {
    if (isImageFile(f)) {
      return extractLatexFromImage(f, setProgress)
    }
    const raw = await extractTextFromFile(f, setProgress)
    return preparePyqExtractText(raw)
  }

  const handleInstructionFile = async (f) => {
    if (!f || !isSupportedUpload(f)) {
      setMsg({ type: 'error', text: 'Use PDF, Word, or image for instructions.' })
      return
    }
    setLoading(true)
    try {
      const text = await extractTextFromFile(f, setProgress)
      const leading = extractLeadingInstructions(text)
      const body = leading || text.trim()
      if (!body) throw new Error('No instruction text found.')
      setInstructions(body)
      setMsg({ type: 'success', text: 'Instructions loaded. They apply to the whole paper.' })
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Instruction extract failed' })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleQuestionFile = async (f) => {
    if (!f || !isSupportedUpload(f)) {
      setMsg({ type: 'error', text: 'Use PDF, Word, or image.' })
      return
    }
    setLoading(true)
    clearUpload()
    try {
      const text = await extractPyqLatex(f)
      if (!text.trim()) throw new Error('No text extracted. Try a clearer image.')
      if (isInstructionBlock(text)) {
        setInstructions((prev) => (prev ? `${prev}\n\n---\n\n${text.trim()}` : text.trim()))
        setMsg({ type: 'success', text: 'Detected instructions — saved to instructions box (not a question).' })
        return
      }
      setOcrSourceFile(f)
      setUploadFileName(f.name)
      setLatexText(text)

      const parsed = parseSingleQuestionUpload(text)
      const optN = parsed.optionsFound ?? countOptions(parsed.options)
      const stemText = String(parsed.text ?? '').trim()
      if (!parsed.multi && stemText && (optN >= 2 || (optN >= 1 && stemText.length > 40))) {
        setPreview({
          text: parsed.text ?? '',
          options: parsed.options ?? ['', '', '', ''],
          correctIndex: parsed.correctIndex,
          correctIndices: parsed.correctIndices,
          solution: parsed.solution,
          questionType: parsed.suggestedQuestionType ?? currentSlot?.questionTypeId,
        })
        setUploadStep('preview')
        setMsg({
          type: 'success',
          text: `LaTeX extracted and parsed for Q${questionNumber}${optN ? ` (${optN} options)` : ''}. Review below, then Save.`,
        })
        return
      }

      setUploadStep('latex')
      setMsg({
        type: 'success',
        text: `LaTeX OCR done for Q${questionNumber}. Fix any symbols if needed, then click Parse question.`,
      })
    } catch (e) {
      setMsg({ type: 'error', text: friendlyUploadError(e) ?? 'Extract failed' })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleParseQuestion = () => {
    setMsg({ type: '', text: '' })
    try {
      if (!latexText.trim()) throw new Error('No LaTeX text to parse.')
      const parsed = parseSingleQuestionUpload(latexText)
      if (parsed.multi && parsed.items?.length) {
        setMsg({
          type: 'error',
          text: `Found ${parsed.items.length} questions in the text. Keep only one question in the LaTeX box.`,
        })
        return
      }
      if (!parsed.text?.trim()) {
        throw new Error('Could not parse question stem. Fix LaTeX and try again.')
      }
      setPreview({
        text: parsed.text ?? '',
        options: parsed.options ?? ['', '', '', ''],
        correctIndex: parsed.correctIndex,
        correctIndices: parsed.correctIndices,
        solution: parsed.solution,
        questionType: parsed.suggestedQuestionType ?? currentSlot?.questionTypeId,
      })
      setUploadStep('preview')
      const optN = countOptions(parsed.options)
      setMsg({
        type: 'success',
        text: `Parsed Q${questionNumber}${optN ? ` with ${optN} option(s)` : ''}. Review below, then Save.`,
      })
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'Parse failed' })
    }
  }

  const handleApplyPolish = () => {
    if (!latexText.trim()) return
    setLatexText(preparePyqExtractText(latexText))
    setMsg({ type: 'success', text: 'OCR polish re-applied.' })
  }

  const handleReRunOcr = async () => {
    if (!ocrSourceFile) {
      setMsg({ type: 'error', text: 'Re-upload the image to run LaTeX OCR again.' })
      return
    }
    setLoading(true)
    try {
      const text = await extractPyqLatex(ocrSourceFile)
      if (!text.trim()) throw new Error('No text extracted.')
      setLatexText(text)
      setMsg({ type: 'success', text: 'LaTeX OCR run again. Check the rendered preview.' })
    } catch (e) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : 'OCR failed' })
    } finally {
      setLoading(false)
      setProgress(0)
    }
  }

  const handleSaveQuestion = () => {
    if (!preview?.text?.trim()) {
      setMsg({ type: 'error', text: 'No question text to save.' })
      return
    }
    const items = parsedBulkToPyqItems(
      [
        {
          text: preview.text,
          options: preview.options,
          correctIndex: preview.correctIndex,
          correctIndices: preview.correctIndices,
          solution: preview.solution,
          questionType: preview.questionType ?? currentSlot?.questionTypeId,
          questionNumber,
        },
      ],
      defaults,
      questionNumber - 1,
      slotMap,
    )
    if (!items.length) {
      setMsg({ type: 'error', text: 'Could not build PYQ row. Check year/exam defaults.' })
      return
    }
    const item = { ...items[0], paperInstructions: instructions.trim() || undefined }
    onDraftChange({ ...draftByNumber, [questionNumber]: item })
    clearUpload()
    setMsg({ type: 'success', text: `Saved Q${questionNumber}. Continue with the next number.` })
    if (questionNumber < slotMap.length) setQuestionNumber((n) => n + 1)
  }

  const handleImportAll = () => {
    const items = Object.values(draftByNumber).sort(
      (a, b) => (a.pyqSlot ?? 0) - (b.pyqSlot ?? 0),
    )
    if (!items.length) {
      setMsg({ type: 'error', text: 'No questions saved yet.' })
      return
    }
    onImportAll(items)
  }

  const selectQuestion = (num) => {
    setQuestionNumber(num)
    clearUpload()
  }

  return (
    <div className="pyq-one-by-one">
      <h3>Upload one question at a time (by paper number)</h3>
      <p className="form-hint">
        Step 1: pick question number → upload image → review LaTeX. Step 2: parse → save. Grid
        numbers follow the exam pattern (Physics 1–25, Chemistry 26–50, etc. for JEE Main).
      </p>

      {paperPatterns.length > 0 && (
        <label>
          Paper pattern (optional)
          <select
            value={paperPatternId}
            onChange={(e) => {
              setPaperPatternId(e.target.value)
              clearUpload()
            }}
          >
            <option value="">Default exam pattern</option>
            {paperPatterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <section className="card pyq-instructions-box">
        <h4>Paper instructions</h4>
        <p className="form-hint">
          Upload the instruction page once, or type/paste general instructions here. Kept separate
          from questions.
        </p>
        <textarea
          className="extract-raw"
          rows={5}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="General instructions, marking scheme, time allowed…"
        />
        <label className="btn btn-ghost btn-sm file-btn">
          Upload instruction page
          <input
            type="file"
            hidden
            accept=".docx,.pdf,.png,.jpg,.jpeg"
            disabled={loading}
            onChange={(e) => handleInstructionFile(e.target.files?.[0])}
          />
        </label>
      </section>

      <div className="pyq-slot-picker">
        <label>
          Question number
          <select
            value={questionNumber}
            onChange={(e) => selectQuestion(Number(e.target.value))}
          >
            {slotMap.map((s) => (
              <option key={s.questionNumber} value={s.questionNumber}>
                Q{s.questionNumber} — {s.section}
                {draftByNumber[s.questionNumber] ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        {currentSlot && (
          <div className="pyq-slot-info">
            <span className="badge badge-type">{currentSlot.section}</span>
            <span className="badge badge-exam">{typeLabel}</span>
            <span className="form-hint">{currentSlot.markingLabel}</span>
          </div>
        )}
      </div>

      <div className="pyq-q-grid-wrap" aria-label="Question numbers by section">
        {slotGroups.map((group) => (
          <div key={group.section} className="pyq-q-grid-section">
            <span className="pyq-q-grid-label">{group.section}</span>
            <div className="pyq-q-grid">
              {group.slots.map((s) => {
                const saved = !!draftByNumber[s.questionNumber]
                const active = s.questionNumber === questionNumber
                return (
                  <button
                    key={s.questionNumber}
                    type="button"
                    className={`pyq-q-cell${saved ? ' saved' : ''}${active ? ' active' : ''}`}
                    onClick={() => selectQuestion(s.questionNumber)}
                    title={`Q${s.questionNumber} · ${getQuestionType(s.questionTypeId)?.shortName ?? s.questionTypeId}`}
                  >
                    {s.questionNumber}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {uploadStep === 'idle' && (
        <>
        <OcrOutputFormatPicker id="pyq-one-ocr-format" />
        <div
          className="upload-dropzone upload-dropzone-sm"
          onClick={() => !loading && document.getElementById('pyq-single-file')?.click()}
        >
          <input
            id="pyq-single-file"
            type="file"
            hidden
            accept=".docx,.pdf,.png,.jpg,.jpeg"
            disabled={loading}
            onChange={(e) => handleQuestionFile(e.target.files?.[0])}
          />
          <p>
            {loading
              ? `Reading Q${questionNumber}… ${progress > 0 ? `${progress}%` : ''}`
              : `Upload image/PDF for question ${questionNumber} only`}
          </p>
        </div>
        </>
      )}

      {uploadStep === 'latex' && (
        <PyqLatexReview
          mode="single"
          questionLabel={`Q${questionNumber}`}
          fileName={uploadFileName || `Q${questionNumber}`}
          latexText={latexText}
          onLatexChange={setLatexText}
          onApplyPolish={handleApplyPolish}
          onReRunOcr={ocrSourceFile ? handleReRunOcr : undefined}
          onSplit={handleParseQuestion}
          onDiscard={clearUpload}
        />
      )}

      {uploadStep === 'preview' && preview && (
        <div className="card bulk-preview-panel pyq-single-preview">
          <div className="pyq-step-header">
            <span className="pyq-step-badge muted">Step 1 — LaTeX</span>
            <h4>Preview — Q{questionNumber}</h4>
            <span className="pyq-step-badge active">Step 2</span>
          </div>
          <div className="bulk-q-stem">
            <QuestionStem text={preview.text} options={preview.options} className="bulk-q-stem-text" />
          </div>
          {countOptions(preview.options) > 0 ? (
            <ul className="bulk-q-options">
              {(preview.options ?? []).slice(0, 4).map((opt, oi) => {
                const letter = String.fromCharCode(65 + oi)
                if (!String(opt ?? '').trim()) return null
                return (
                  <li key={oi} className="bulk-q-option">
                    <span className="bulk-q-opt-label">{letter}</span>
                    <OptionBody
                      text={opt}
                      questionText={preview.text}
                      allOptions={preview.options}
                      optionLetter={letter}
                    />
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="form-hint pyq-preview-warn-tag">No options detected — check LaTeX (A)–(D) markers.</p>
          )}
          <div className="extract-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveQuestion}>
              Save Q{questionNumber}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUploadStep('latex')}>
              ← Back to LaTeX
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleParseQuestion}>
              Re-parse
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearUpload}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="extract-actions" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={filledCount === 0}
          onClick={handleImportAll}
        >
          Import {filledCount} saved question{filledCount === 1 ? '' : 's'}
        </button>
        <span className="form-hint">
          {filledCount} / {slotMap.length} questions saved
        </span>
      </div>
    </div>
  )
}
