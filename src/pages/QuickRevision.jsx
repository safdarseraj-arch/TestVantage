import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MathText from '../components/MathText'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import { downloadTextFile } from '../utils/csvQuestions'
import { fetchCloudVisionStatus } from '../utils/cloudVisionClient'
import { assistWithCloudVisionClient, runAiAssistWithFallback } from '../utils/aiProviderAssist'
import { RevisionFormulaCard } from './FormulaPocket'
import JeeCompleteStrategyReader from '../components/JeeCompleteStrategyReader'
import StudentGuideReader from '../components/StudentGuideReader'
import { JEE_STUDENT_GUIDES } from '../content/jeeStudentGuides.js'
import {
  buildStarterRevisionSheet,
  buildWatermarkedRevisionHtml,
  canImproveRevisionSheet,
  getDisplayedRevisionSheet,
  listRevisionChapters,
  listRevisionExams,
  listRevisionSubjects,
  loadSavedRevisionSheet,
  mergeImprovedSheet,
  parseAiRevisionSheet,
  revisionPrintFileName,
  saveRevisionSheet,
  QUICK_REVISION_AI_INSTRUCTION,
  QUICK_REVISION_IMPROVE_INSTRUCTION,
} from '../utils/quickRevision'
import {
  STRATEGY_AI_INSTRUCTION,
  STRATEGY_IMPROVE_INSTRUCTION,
  buildWatermarkedStrategyHtml,
  compactPyqsForAssist,
  getDisplayedStrategyPack,
  groupStrategyItems,
  listChapterStrategyPyqs,
  loadSavedStrategyPack,
  mergeImprovedStrategyPack,
  parseAiStrategyPack,
  saveStrategyPack,
  strategyPrintFileName,
} from '../utils/quickRevisionStrategy'
export default function QuickRevision() {
  const { session, isAdmin, isTeacher } = useAuth()
  const staff = isAdmin || isTeacher || canImproveRevisionSheet(session)
  const ownerKey = getOwnerKey(session?.userId)
  const [examId, setExamId] = useState('')
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [sheet, setSheet] = useState(null)
  const [strategyPack, setStrategyPack] = useState(null)
  const [viewTab, setViewTab] = useState('sheet')
  const [strategyPane, setStrategyPane] = useState('problem')
  const [aiReady, setAiReady] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [strategyBusy, setStrategyBusy] = useState(false)
  const [strategyAction, setStrategyAction] = useState('')
  const [strategyNote, setStrategyNote] = useState('')
  const [pinTick, setPinTick] = useState(0)
  const autoTriedKey = useRef('')
  const exams = useMemo(() => listRevisionExams(), [])
  const subjects = useMemo(() => listRevisionSubjects(examId), [examId])
  const chapters = useMemo(
    () => (subject ? listRevisionChapters(examId, subject) : []),
    [examId, subject],
  )
  const chapterGroups = useMemo(() => {
    const map = []
    const seen = new Map()
    for (const row of chapters) {
      if (!seen.has(row.section)) {
        seen.set(row.section, [])
        map.push([row.section, seen.get(row.section)])
      }
      seen.get(row.section).push(row)
    }
    return map
  }, [chapters])
  const chapterSelectValue = useMemo(() => {
    const row = chapters.find((r) => r.chapter === chapter)
    return row ? `${row.section}::${row.chapter}` : ''
  }, [chapters, chapter])
  useEffect(() => {
    let cancelled = false
    fetchCloudVisionStatus()
      .then((st) => {
        if (!cancelled) setAiReady(Boolean(st?.configured || st?.ready))
      })
      .catch(() => {
        if (!cancelled) setAiReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const generateWithAi = useCallback(
    async ({ force = false } = {}) => {
      if (!subject || !chapter) return
      const starter =
        buildStarterRevisionSheet({ examId, subject, chapter }) ||
        getDisplayedRevisionSheet(examId, subject, chapter)
      if (!starter) return
      const saved = loadSavedRevisionSheet(examId, subject, chapter)
      if (!force && saved?.source === 'ai') {
        setSheet(saved)
        setAiNote('Using the saved AI sheet for this chapter.')
        return
      }
      setAiBusy(true)
      setAiNote('Asking AI to complete this sheet...')
      try {
        const result = await runAiAssistWithFallback({
          task: 'quick-revision-sheet',
          context: {
            examId: starter.examId,
            examLabel: starter.examLabel,
            subject: starter.subject,
            subjectLabel: starter.subjectLabel,
            section: starter.section,
            chapter: starter.chapter,
            topics: starter.topics,
            starter: {
              definitions: starter.definitions,
              formulas: starter.formulas,
              extraFormulas: starter.extraFormulas ?? [],
              points: starter.points,
            },
            instruction: QUICK_REVISION_AI_INSTRUCTION,
          },
          localText: JSON.stringify({
            definitions: starter.definitions,
            formulas: starter.formulas,
            extraFormulas: starter.extraFormulas ?? [],
            points: starter.points,
          }),
          localDisclaimer: 'Built-in starter sheet. Add GEMINI_API_KEY and press F5 for a fuller AI sheet.',
          learningStem: `quick-revision:${examId}:${subject}:${chapter}`,
        })
        const next = parseAiRevisionSheet(result.text, starter)
        if (!next) {
          setSheet(starter)
          setAiNote('AI did not return a usable sheet. Showing the built-in starter.')
          return
        }
        if (result.provider === 'local') {
          saveRevisionSheet({ ...starter, source: 'starter' })
          setSheet(starter)
          setAiNote(
            aiReady
              ? 'Cloud AI did not complete this sheet, so the built-in starter is shown.'
              : 'No Gemini key yet. Showing the built-in starter. Add GEMINI_API_KEY, keep the bottom panel open, press F5, then try Generate with AI.',
          )
          return
        }
        const savedAi = saveRevisionSheet(next)
        setSheet(savedAi || next)
        setAiNote('AI sheet saved for this chapter. It will not regenerate on every visit.')
      } catch (err) {
        setSheet(starter)
        setAiNote(err instanceof Error ? err.message : 'Could not generate with AI.')
      } finally {
        setAiBusy(false)
      }
    },
    [aiReady, chapter, examId, subject],
  )
  const improveWithAi = useCallback(async () => {
    if (!staff || !subject || !chapter) return
    const current =
      sheet ||
      loadSavedRevisionSheet(examId, subject, chapter) ||
      getDisplayedRevisionSheet(examId, subject, chapter)
    if (!current) return
    if (!aiReady) {
      setAiNote(
        'Gemini is off. Add GEMINI_API_KEY, keep the bottom panel open, press F5, then click Improve this sheet again.',
      )
      return
    }
    setAiBusy(true)
    setAiNote('Asking Gemini to add missing definitions, formulas, and points...')
    try {
      const cloud = await assistWithCloudVisionClient({
        task: 'quick-revision-sheet',
        context: {
          examId: current.examId,
          examLabel: current.examLabel,
          subject: current.subject,
          subjectLabel: current.subjectLabel,
          section: current.section,
          chapter: current.chapter,
          topics: current.topics,
          mode: 'improve',
          currentSheet: {
            definitions: current.definitions,
            formulas: current.formulas,
            extraFormulas: current.extraFormulas ?? [],
            points: current.points,
          },
          instruction: QUICK_REVISION_IMPROVE_INSTRUCTION,
        },
      })
      const parsed = parseAiRevisionSheet(cloud.text, current)
      if (!parsed) {
        setAiNote('Gemini did not return a usable sheet. The current sheet is unchanged.')
        return
      }
      const merged = mergeImprovedSheet(current, parsed)
      const savedAi = saveRevisionSheet(merged, { keepPrevious: current })
      setSheet(savedAi || merged)
      setAiNote('Improved sheet saved. The previous version is kept as a backup.')
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : ''
      if (code === 'VISION_NOT_CONFIGURED') {
        setAiNote(
          'Gemini is off. Add GEMINI_API_KEY, keep the bottom panel open, press F5, then click Improve this sheet again.',
        )
      } else {
        setAiNote(
          err instanceof Error
            ? err.message
            : 'Could not reach Gemini. Keep the API running (port 3001), then try again.',
        )
      }
    } finally {
      setAiBusy(false)
    }
  }, [aiReady, chapter, examId, sheet, staff, subject])
  const generateStrategy = useCallback(
    async ({ improve = false } = {}) => {
      if (!staff || !subject || !chapter) return
      const current =
        strategyPack ||
        loadSavedStrategyPack(examId, subject, chapter) ||
        getDisplayedStrategyPack(examId, subject, chapter)
      if (!current) return
      if (!aiReady) {
        setStrategyNote(
          'Gemini is off. Add GEMINI_API_KEY, keep the bottom panel open, press F5, then try again.',
        )
        return
      }
      setStrategyBusy(true)
      setStrategyAction(improve ? 'improve' : 'generate')
      const pyqs = listChapterStrategyPyqs(examId, subject, chapter)
      const pyqCompact = compactPyqsForAssist(pyqs)
      setStrategyNote(
        improve
          ? pyqs.length
            ? 'Asking Gemini to group unused PYQ and fill only missing variations...'
            : 'No PYQ in the bank for this chapter. Asking Gemini for extras labelled not PYQ...'
          : pyqs.length
            ? `Grouping ${pyqs.length} PYQ by how you solve them...`
            : 'No PYQ in the bank for this chapter. Asking Gemini for extras labelled not PYQ...',
      )
      try {
        const cloud = await assistWithCloudVisionClient({
          task: 'quick-revision-strategy',
          context: {
            examId: current.examId,
            examLabel: current.examLabel,
            subject: current.subject,
            subjectLabel: current.subjectLabel,
            section: current.section,
            chapter: current.chapter,
            topics: current.topics,
            mode: improve ? 'improve' : 'generate',
            pyqCount: pyqs.length,
            pyqQuestions: pyqCompact,
            currentPack: { items: current.items },
            instruction: improve ? STRATEGY_IMPROVE_INSTRUCTION : STRATEGY_AI_INSTRUCTION,
          },
        })
        const parsed = parseAiStrategyPack(cloud.text, current, pyqs)
        if (!parsed) {
          setStrategyNote('Gemini did not return a usable strategy pack. The current pack is unchanged.')
          return
        }
        const next = improve ? mergeImprovedStrategyPack(current, parsed) : parsed
        const saved = saveStrategyPack(next, improve ? { keepPrevious: current } : {})
        const pack = saved || next
        const pyqUsed = pack.items.filter((it) => it.source === 'pyq').length
        const extraUsed = pack.items.filter((it) => it.source === 'extra').length
        setStrategyPack(pack)
        setStrategyNote(
          improve
            ? `Improved pack saved (${pyqUsed} PYQ, ${extraUsed} extra). The previous pack is kept as a backup.`
            : `Saved ${pack.items.length} questions (${pyqUsed} PYQ, ${extraUsed} extra).`,
        )
      } catch (err) {
        const code = err && typeof err === 'object' ? err.code : ''
        if (code === 'VISION_NOT_CONFIGURED') {
          setStrategyNote(
            'Gemini is off. Add GEMINI_API_KEY, keep the bottom panel open, press F5, then try again.',
          )
        } else {
          setStrategyNote(
            err instanceof Error
              ? err.message
              : 'Could not reach Gemini. Keep the API running (port 3001), then try again.',
          )
        }
      } finally {
        setStrategyBusy(false)
        setStrategyAction('')
      }
    },
    [aiReady, chapter, examId, staff, strategyPack, subject],
  )
  useEffect(() => {
    if (!subject || !chapter) {
      setSheet(null)
      setStrategyPack(null)
      setAiNote('')
      setStrategyNote('')
      return
    }
    setSheet(getDisplayedRevisionSheet(examId, subject, chapter))
    setStrategyPack(getDisplayedStrategyPack(examId, subject, chapter))
    setAiNote('')
    setStrategyNote('')
  }, [examId, subject, chapter])
  useEffect(() => {
    if (!aiReady || !subject || !chapter) return
    const key = `${examId}::${subject}::${chapter}`
    if (autoTriedKey.current === key) return
    const saved = loadSavedRevisionSheet(examId, subject, chapter)
    if (saved?.source === 'ai') {
      autoTriedKey.current = key
      return
    }
    autoTriedKey.current = key
    generateWithAi({ force: false })
  }, [aiReady, examId, subject, chapter, generateWithAi])
  const onExamChange = (id) => {
    if (id === examId) return
    setExamId(id)
    setSubject('')
    setChapter('')
    setSheet(null)
    setStrategyPack(null)
    setAiNote('')
    setStrategyNote('')
    autoTriedKey.current = ''
  }
  const onSubjectChange = (id) => {
    if (id === subject) return
    setSubject(id)
    setChapter('')
    setSheet(null)
    setStrategyPack(null)
    setAiNote('')
    setStrategyNote('')
    autoTriedKey.current = ''
  }
  const onChapterPick = (value) => {
    if (!value) {
      setChapter('')
      setSheet(null)
      setStrategyPack(null)
      setAiNote('')
      setStrategyNote('')
      setViewTab('sheet')
      autoTriedKey.current = ''
      return
    }
    const sep = value.indexOf('::')
    const next = sep >= 0 ? value.slice(sep + 2) : value
    if (next === chapter) return
    setChapter(next)
  }
  const onDownload = () => {
    if (viewTab === 'success') return
    if (viewTab === 'questions') {
      if (!strategyPack) return
      const html = buildWatermarkedStrategyHtml(strategyPack)
      if (!html) return
      downloadTextFile(strategyPrintFileName(strategyPack), html, 'text/html', { skipWatermark: true })
      window.setTimeout(() => window.print(), 120)
      return
    }
    if (!sheet) return
    const html = buildWatermarkedRevisionHtml(sheet)
    if (!html) return
    downloadTextFile(revisionPrintFileName(sheet), html, 'text/html', { skipWatermark: true })
    window.setTimeout(() => window.print(), 120)
  }
  const sourceLabel = sheet?.improvedAt
    ? 'AI sheet (improved)'
    : sheet?.source === 'ai'
      ? 'AI sheet (saved)'
      : sheet
        ? 'Built-in starter'
        : ''
  const activeGuide = JEE_STUDENT_GUIDES.find((g) => g.id === strategyPane) ?? null
  const examLabel = exams.find((p) => p.id === examId)?.label ?? examId
  const subjectLabel = subjects.find((s) => s.id === subject)?.label ?? subject
  void pinTick
  return (
    <div className="page prepare-mode-page qr-page">
      <PreparePageHero
        modeId="quick-revision"
        lead="Open Problem solving strategy to read the complete JEE guide, Learning to Success, Stress management, or Exam temperament on screen. Or pick exam, subject, and chapter for the cheat sheet and PYQ-first questions."
        actions={
          <Link to="/formula-sheet" className="btn btn-ghost btn-sm">
            My Formula Sheet
          </Link>
        }
      />
      <section className="qr-filters" aria-label="Choose exam, then subject, then chapter">
        <p className="form-hint">Same order as question metatags: exam, then subject, then chapter.</p>
        <div className="qr-filter-stack">
          <label className="qr-filter-label">
            1. Exam
            <select
              value={examId}
              onChange={(e) => onExamChange(e.target.value)}
              aria-label="Exam"
            >
              <option value="">- Select exam -</option>
              {exams.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`qr-filter-label${!examId ? ' is-locked' : ''}`}>
            2. Subject
            <select
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              disabled={!examId}
              aria-label="Subject"
            >
              <option value="">{examId ? '- Select subject -' : 'Pick an exam first'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`qr-filter-label${!subject ? ' is-locked' : ''}`}>
            3. Chapter
            <select
              value={chapterSelectValue}
              onChange={(e) => onChapterPick(e.target.value)}
              disabled={!subject}
              aria-label="Chapter"
            >
              <option value="">{subject ? '- Select chapter -' : 'Pick a subject first'}</option>
              {chapterGroups.map(([section, rows]) => (
                <optgroup key={section} label={section}>
                  {rows.map((row) => (
                    <option key={`${row.section}::${row.chapter}`} value={`${row.section}::${row.chapter}`}>
                      {row.chapter}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </section>
      <>
          <div className="qr-tabs no-print" role="tablist" aria-label="Quick Revision views">
            <button
              type="button"
              role="tab"
              className={`qr-tab${viewTab === 'sheet' ? ' is-active' : ''}`}
              aria-selected={viewTab === 'sheet'}
              onClick={() => setViewTab('sheet')}
            >
              Cheat Sheet
            </button>
            <button
              type="button"
              role="tab"
              className={`qr-tab${viewTab === 'questions' ? ' is-active' : ''}`}
              aria-selected={viewTab === 'questions'}
              onClick={() => setViewTab('questions')}
            >
              Master Questions of this Chapter
              <span className="qr-tab-sub">PYQ first</span>
            </button>
            <button
              type="button"
              role="tab"
              className={`qr-tab${viewTab === 'success' ? ' is-active' : ''}`}
              aria-selected={viewTab === 'success'}
              onClick={() => setViewTab('success')}
            >
              Complete Strategy for Success
            </button>
          </div>
          {viewTab === 'success' ? (
            <div className="qr-tabs qr-subtabs no-print" role="tablist" aria-label="Complete strategy guides">
              <button
                type="button"
                role="tab"
                className={`qr-tab${strategyPane === 'problem' ? ' is-active' : ''}`}
                aria-selected={strategyPane === 'problem'}
                onClick={() => setStrategyPane('problem')}
              >
                Problem Solving Strategy
              </button>
              {JEE_STUDENT_GUIDES.map((guide) => (
                <button
                  key={guide.id}
                  type="button"
                  role="tab"
                  className={`qr-tab${strategyPane === guide.id ? ' is-active' : ''}`}
                  aria-selected={strategyPane === guide.id}
                  onClick={() => setStrategyPane(guide.id)}
                >
                  {guide.tabLabel}
                </button>
              ))}
            </div>
          ) : null}
          {viewTab === 'success' && strategyPane === 'problem' ? <JeeCompleteStrategyReader /> : null}
          {viewTab === 'success' && activeGuide ? <StudentGuideReader guide={activeGuide} /> : null}
          {viewTab === 'sheet' || viewTab === 'questions' ? (
          <div className="qr-toolbar no-print">
            <p className="qr-source">
              {viewTab === 'questions'
                ? strategyPack?.improvedAt
                  ? 'AI questions (improved)'
                  : strategyPack?.source === 'ai'
                    ? 'AI questions (saved)'
                    : 'Built-in starter questions'
                : sourceLabel}
              {sheet?.section ? ` · ${sheet.section}` : ''}
            </p>
            <div className="qr-toolbar-actions">
              {(viewTab === 'sheet' && sheet) || (viewTab === 'questions' && strategyPack) ? (
              <button type="button" className="btn btn-primary" onClick={onDownload}>
                Download PDF
              </button>
              ) : null}
              {staff && viewTab === 'sheet' ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={aiBusy}
                  onClick={improveWithAi}
                >
                  {aiBusy ? 'Improving...' : 'Improve this sheet'}
                </button>
              ) : null}
              {staff && viewTab === 'questions' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={strategyBusy}
                    onClick={() => generateStrategy({ improve: false })}
                  >
                    {strategyAction === 'generate' ? 'Generating...' : 'Generate questions'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={strategyBusy}
                    onClick={() => generateStrategy({ improve: true })}
                  >
                    {strategyAction === 'improve' ? 'Improving...' : 'Improve questions'}
                  </button>
                </>
              ) : null}
            </div>
            {viewTab === 'sheet' && aiNote ? <p className="form-hint qr-ai-note">{aiNote}</p> : null}
            {viewTab === 'questions' && strategyNote ? (
              <p className="form-hint qr-ai-note">{strategyNote}</p>
            ) : null}
            {staff && viewTab === 'sheet' ? (
              <p className="form-hint">
                Teachers and admin can click <strong>Improve this sheet</strong> to ask Gemini for
                missing definitions, formulas, and points. Students only see the sheet and Download.
              </p>
            ) : null}
            {staff && viewTab === 'questions' ? (
              <p className="form-hint">
                Questions grouped by how you solve them. PYQ first. Teachers and admin can generate
                or improve in one click. Extra questions appear only when a variation has no PYQ,
                and they are labelled not PYQ. Students only read and download.
              </p>
            ) : null}
            {(viewTab === 'sheet' && sheet) || (viewTab === 'questions' && strategyPack) ? (
            <p className="form-hint">
              Download opens Print. Choose <strong>Save as PDF</strong>. The TestVantages name is
              printed lightly so the maths stays readable.
            </p>
            ) : null}
          </div>
          ) : null}
          {viewTab === 'questions' && strategyPack ? (
            <article className="qr-sheet" id="quick-revision-strategy">
              <div className="qr-sheet-watermark" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <span key={i}>TestVantages</span>
                ))}
              </div>
              <header className="qr-sheet-head">
                <p className="qr-sheet-kicker">TestVantages · Concept to Solve Problems</p>
                <h2>{strategyPack.chapter}</h2>
                <p className="qr-sheet-meta">
                  {strategyPack.examLabel} · {strategyPack.subjectLabel}
                  {strategyPack.section ? ` · ${strategyPack.section}` : ''}
                  {` · ${strategyPack.items.length} questions`}
                </p>
                <p className="form-hint">Questions grouped by how you solve them. PYQ first.</p>
              </header>
              <h3 className="qr-strategy-section">Questions</h3>
              {strategyPack.items.length === 0 ? (
                <p className="form-hint qr-empty">
                  No PYQ in the bank for this chapter yet. Teachers can click Generate questions.
                  Those extras will be labelled extra (no PYQ yet).
                </p>
              ) : (
                groupStrategyItems(strategyPack.items).map((group) => (
                  <section key={group.name} className="qr-strategy-family">
                    <h4 className="qr-strategy-family-title">{group.name}</h4>
                    <ol className="qr-strategy-list">
                      {group.items.map((item, idx) => (
                        <li key={`${item.typeName}-${idx}`} className="qr-strategy-card">
                          <p className="qr-strategy-badges">
                            <span className={`qr-badge ${item.source === 'pyq' ? 'is-pyq' : 'is-extra'}`}>
                              {item.source === 'pyq' ? 'PYQ' : 'extra (no PYQ yet)'}
                            </span>
                            {item.pyqYear || item.paperLabel ? (
                              <span className="qr-strategy-year">
                                {[item.pyqYear, item.paperLabel].filter(Boolean).join(' · ')}
                              </span>
                            ) : null}
                          </p>
                          <h3>
                            {idx + 1}. {item.typeName}
                          </h3>
                          <p className="qr-strategy-problem">
                            <strong>Question. </strong>
                            <MathText text={item.problem} />
                          </p>
                          {item.options?.length ? (
                            <ol className="qr-strategy-options">
                              {item.options.map((opt, oi) => (
                                <li key={`${opt}-${oi}`}>
                                  <MathText text={`(${String.fromCharCode(65 + oi)}) ${opt}`} />
                                </li>
                              ))}
                            </ol>
                          ) : null}
                          <p className="qr-strategy-label">How to solve this question</p>
                          <ol className="qr-strategy-steps">
                            {item.steps.map((step) => (
                              <li key={step}>
                                <MathText text={step} />
                              </li>
                            ))}
                          </ol>
                          <p className="qr-strategy-outline">
                            <strong>Working. </strong>
                            <MathText text={item.outline} />
                          </p>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))
              )}
            </article>
          ) : null}
          {viewTab === 'sheet' && sheet ? (
          <article className="qr-sheet" id="quick-revision-sheet">
            <div className="qr-sheet-watermark" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i}>TestVantages</span>
              ))}
            </div>
            <header className="qr-sheet-head">
              <p className="qr-sheet-kicker">TestVantages · Quick Revision</p>
              <h2>{sheet.chapter}</h2>
              <p className="qr-sheet-meta">
                {sheet.examLabel} · {sheet.subjectLabel}
                {sheet.section ? ` · ${sheet.section}` : ''}
              </p>
            </header>
            <section className="qr-block">
              <h3>Definitions</h3>
              <dl className="qr-defs">
                {sheet.definitions.map((d) => (
                  <div key={d.term} className="qr-def">
                    <dt>{d.term}</dt>
                    <dd>
                      <MathText text={d.meaning} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="qr-block">
              <h3>Standard formulas</h3>
              <ul className="qr-formulas">
                {sheet.formulas.map((f) => (
                  <RevisionFormulaCard
                    key={`${f.name}-${f.latex}`}
                    formula={f}
                    examId={examId}
                    examLabel={examLabel}
                    subject={subject}
                    subjectLabel={subjectLabel}
                    chapter={sheet.chapter}
                    ownerKey={ownerKey}
                    onChange={() => setPinTick((t) => t + 1)}
                  />
                ))}
              </ul>
            </section>
            <section className="qr-block">
              <h3>Extra / non-standard formulas</h3>
              <p className="form-hint">Tricks, special cases, and JEE/NEET extras — not the usual textbook list.</p>
              {(sheet.extraFormulas ?? []).length ? (
                <ul className="qr-formulas">
                  {sheet.extraFormulas.map((f) => (
                    <RevisionFormulaCard
                      key={`extra-${f.name}-${f.latex}`}
                      formula={f}
                      examId={examId}
                      examLabel={examLabel}
                      subject={subject}
                      subjectLabel={subjectLabel}
                      chapter={sheet.chapter}
                      extra
                      ownerKey={ownerKey}
                      onChange={() => setPinTick((t) => t + 1)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="form-hint">Generate with AI to fill tricks and special-case formulas for this chapter.</p>
              )}
            </section>
            <section className="qr-block">
              <h3>Important points</h3>
              <ul className="qr-points">
                {sheet.points.map((p) => (
                  <li key={p}>
                    <MathText text={p} />
                  </li>
                ))}
              </ul>
            </section>
          </article>
          ) : null}
          {viewTab === 'sheet' && !sheet ? (
            <p className="form-hint qr-empty">
              {!examId
                ? 'Pick an exam first (JEE Main, JEE Advanced, or NEET).'
                : !subject
                  ? 'Pick a subject for this exam. Then chapters will appear.'
                  : 'Pick a chapter to open its cheat sheet.'}
            </p>
          ) : null}
          {viewTab === 'questions' && !strategyPack ? (
            <p className="form-hint qr-empty">
              Pick exam, subject, and chapter to see PYQ-first questions for that chapter.
            </p>
          ) : null}
      </>
    </div>
  )
}
