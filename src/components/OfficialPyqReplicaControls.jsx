/**
 * Create a similar Official PYQ paper. It stays Pending until an admin approves it.
 */
import { useState } from 'react'
import { isAdminLoggedIn } from '../utils/auth.js'
import {
  formatQuestionSourceText,
  requestOfficialPyqReplicaQuestion,
  requestOfficialPyqReplicaSet,
} from '../utils/hybridAiClient.js'
import { mapExamSlugToHybridLabel, mapSubjectSlugToHybridLabel } from '../utils/hybridMetadata.js'
import { loadQuestionBank } from '../utils/questionBank.js'
import {
  answerFieldsFromHybrid,
  REPLICA_DIFFICULTY_ORDER,
  replicaAlreadyStored,
  replicaPaperName,
  replicaParentQuestionId,
  replicaQuestionIsDuplicate,
} from '../utils/officialPyqReplica.js'
import {
  addOfficialPyqReplicaPendingPaper,
  getOfficialPyqPendingPaper,
  loadOfficialPyqPendingPapers,
  nextOfficialPyqReplicaNumber,
} from '../utils/officialPyqPendingStore.js'

const CHOICES = [
  { value: '0', label: 'Same' },
  { value: '-1', label: '-1' },
  { value: '1', label: '+1' },
  { value: '2', label: '+2' },
]

function modelForOffset(offset) {
  return Number(offset) >= 1 ? 'gemini-3-pro' : 'gemini-3.7-flash'
}

const FOUR_PAPERS = [
  { offset: -1, label: '−1' },
  { offset: 0, label: 'Same' },
  { offset: 1, label: '+1' },
  { offset: 2, label: '+2' },
]

function difficultyLabel(offset) {
  const hit = FOUR_PAPERS.find((row) => row.offset === Number(offset))
  return hit ? hit.label : String(offset)
}

function keyIsMissing(err) {
  const msg = String(err && err.message ? err.message : err || '')
  return /GEMINI_API_KEY|API key|api key is missing/i.test(msg)
}

export default function OfficialPyqReplicaControls({ paper, onCreated }) {
  const [offset, setOffset] = useState('0')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  if (!isAdminLoggedIn()) return null

  const locked = busy

  async function writeReplicaQuestion(full, question, index, difficultyOffset, avoidTexts, compareWith) {
    const parentId = replicaParentQuestionId(full, question, index)
    const chapter = String(question.chapter || '').trim()
    const parentText = formatQuestionSourceText(question)
    const avoid = [parentText, ...avoidTexts].filter((item) => String(item || '').trim()).slice(0, 8)
    let lastText = ''
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestOfficialPyqReplicaQuestion({
        parent_question_id: parentId || 'slot-' + (index + 1),
        source_question_text: parentText,
        difficulty_offset: Number(difficultyOffset),
        subject: question.subject ? mapSubjectSlugToHybridLabel(question.subject, chapter || question.section) : '',
        exam: mapExamSlugToHybridLabel(full.exam),
        chapter,
        topic: question.topic ? String(question.topic) : '',
        unit: String(question.section || question.unit || ''),
        avoid_texts: attempt === 0 ? avoid : [...avoid, lastText].filter(Boolean).slice(0, 8),
      })
      const text = String(result?.question_text || '').trim()
      if (!text) continue
      lastText = text
      const peers = compareWith.concat([
        { text: parentText },
        { text: String(question.text || question.stem || '') },
      ])
      if (replicaQuestionIsDuplicate(text, peers)) continue
      const answer = answerFieldsFromHybrid(result.correct_answer)
      return {
        ok: true,
        text,
        question: {
          text,
          stem: text,
          options: Array.isArray(result.options) ? result.options.map((opt) => String(opt ?? '')) : [],
          solution: String(result.step_by_step_solution || '').trim(),
          solutionSource: 'ai_generated',
          answerSource: 'ai_generated',
          parentQuestionId: parentId,
          similarToId: parentId,
          replicaDifficultyOffset: Number(difficultyOffset),
          pyqSlot: question.pyqSlot != null ? Number(question.pyqSlot) : index + 1,
          subject: question.subject,
          section: question.section || question.unit,
          chapter: question.chapter,
          topic: question.topic,
          questionType: question.questionType,
          examIds: question.examIds,
          toughnessLevel: question.toughnessLevel,
          source: question.source,
          ...answer,
        },
      }
    }
    return { ok: false, text: lastText }
  }

  function versionToQuestion(full, question, index, offset, item) {
    const parentId = replicaParentQuestionId(full, question, index)
    const text = String(item?.question_text || '').trim()
    const answer = answerFieldsFromHybrid(item?.correct_answer)
    return {
      text,
      stem: text,
      options: Array.isArray(item?.options) ? item.options.map((opt) => String(opt ?? '')) : [],
      solution: String(item?.step_by_step_solution || '').trim(),
      solutionSource: 'ai_generated',
      answerSource: 'ai_generated',
      parentQuestionId: parentId,
      similarToId: parentId,
      replicaDifficultyOffset: Number(offset),
      pyqSlot: question.pyqSlot != null ? Number(question.pyqSlot) : index + 1,
      subject: question.subject,
      section: question.section || question.unit,
      chapter: question.chapter,
      topic: question.topic,
      questionType: question.questionType,
      examIds: question.examIds,
      toughnessLevel: question.toughnessLevel,
      source: question.source,
      ...answer,
    }
  }

  async function writeReplicaSet(full, question, index, avoidTexts, compareWith) {
    const parentId = replicaParentQuestionId(full, question, index)
    const chapter = String(question.chapter || '').trim()
    const parentText = formatQuestionSourceText(question)
    const parentStem = String(question.text || question.stem || '').trim()
    let avoid = [parentText, parentStem, ...avoidTexts].filter((item) => String(item || '').trim()).slice(0, 6)
    let lastGood = {}
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestOfficialPyqReplicaSet({
        parent_question_id: parentId || 'slot-' + (index + 1),
        source_question_text: parentText,
        subject: question.subject ? mapSubjectSlugToHybridLabel(question.subject, chapter || question.section) : '',
        exam: mapExamSlugToHybridLabel(full.exam),
        chapter,
        topic: question.topic ? String(question.topic) : '',
        unit: String(question.section || question.unit || ''),
        avoid_texts: avoid,
      })
      const versions = Array.isArray(result?.versions) ? result.versions : []
      const byOffset = {}
      for (const item of versions) {
        const offset = Number(item?.difficulty_offset)
        if (!byOffset[offset] && String(item?.question_text || '').trim()) byOffset[offset] = item
      }
      const good = {}
      const badTexts = []
      for (const offset of REPLICA_DIFFICULTY_ORDER) {
        const item = byOffset[offset]
        const text = String(item?.question_text || '').trim()
        if (!text) continue
        const siblingTexts = REPLICA_DIFFICULTY_ORDER.filter((other) => other !== offset)
          .map((other) => String(byOffset[other]?.question_text || '').trim())
          .filter(Boolean)
        const peers = compareWith.concat(
          [{ text: parentText }, { text: parentStem }],
          siblingTexts.map((row) => ({ text: row })),
        )
        if (replicaQuestionIsDuplicate(text, peers)) {
          badTexts.push(text)
          continue
        }
        good[offset] = item
      }
      lastGood = good
      const missing = REPLICA_DIFFICULTY_ORDER.filter((offset) => !good[offset])
      if (!missing.length) return { ok: true, good }
      avoid = [...avoid, ...badTexts, ...Object.values(good).map((item) => item.question_text)]
        .filter((item) => String(item || '').trim())
        .slice(0, 6)
    }
    return { ok: Object.keys(lastGood).length > 0, good: lastGood }
  }

  async function createSet() {
    if (locked) return
    const full = getOfficialPyqPendingPaper(paper?.id) || paper
    const questions = (Array.isArray(full?.questions) ? full.questions : []).filter((q) =>
      String(q?.text || q?.stem || '').trim(),
    )
    if (!questions.length) {
      setError('This paper has no questions to make a similar paper from.')
      return
    }
    const parentKey = String(full.paperId || full.id || '')
    let stored = []
    try {
      stored = loadOfficialPyqPendingPapers()
    } catch {
      stored = []
    }
    const already = REPLICA_DIFFICULTY_ORDER.map((offset) => replicaPaperName(full, offset)).filter(
      (name, index) => replicaAlreadyStored(stored, parentKey, REPLICA_DIFFICULTY_ORDER[index], name),
    )
    if (already.length) {
      setError('')
      setNote('This similar-paper set already exists: ' + already.filter(Boolean).join(', ') + '.')
      return
    }
    setBusy(true)
    setError('')
    setNote('')
    const bank = []
    try {
      const rows = loadQuestionBank()?.questions || []
      for (const row of rows) {
        if (String(row?.text || '').trim()) bank.push({ text: String(row.text) })
      }
    } catch {
      /* compare against this batch and the parent when the bank cannot be read */
    }
    const buckets = { '-1': [], 0: [], 1: [], 2: [] }
    const leftOut = { '-1': [], 0: [], 1: [], 2: [] }
    const seenTexts = []
    try {
      for (let i = 0; i < questions.length; i += 1) {
        setNote(
          'Question ' + (i + 1) + ' of ' + questions.length + ' — four versions in one go...',
        )
        const slot = questions[i].pyqSlot != null ? Number(questions[i].pyqSlot) : i + 1
        const compareWith = bank.concat(seenTexts.map((text) => ({ text })))
        let result
        try {
          result = await writeReplicaSet(full, questions[i], i, seenTexts, compareWith)
        } catch (err) {
          const msg = String(err && err.message ? err.message : err || '')
          if (keyIsMissing(err) || /503|404|Failed to fetch|NetworkError|request failed/i.test(msg)) {
            if (!seenTexts.length) throw err
            setError(msg)
            break
          }
          result = { ok: false, good: {} }
        }
        const good = result && result.good ? result.good : {}
        for (const offset of REPLICA_DIFFICULTY_ORDER) {
          const item = good[offset]
          if (!item) {
            leftOut[offset].push(slot)
            continue
          }
          const built = versionToQuestion(full, questions[i], i, offset, item)
          buckets[offset].push(built)
          if (built.text) seenTexts.push(built.text)
        }
      }
      const savedPapers = []
      let serial = nextOfficialPyqReplicaNumber(full.paperId)
      for (const offset of REPLICA_DIFFICULTY_ORDER) {
        const name = replicaPaperName(full, offset)
        const label = difficultyLabel(offset)
        const missed = leftOut[offset]
        const look = missed.length ? ' Needs a look: Q' + missed.join(', Q') + '.' : ''
        const saved = addOfficialPyqReplicaPendingPaper({
          exam: full.exam,
          year: full.year,
          session: full.session,
          pyqDate: full.pyqDate,
          pyqShift: full.pyqShift,
          paperId: name || String(full.paperId || full.id) + '-similar-' + serial,
          paperLabel: name || String(full.paperLabel || 'Paper') + ' Similar ' + label,
          replicaParentPaperId: full.paperId || full.id,
          replicaDifficultyOffset: Number(offset),
          sourceLabel: 'Hybrid AI replica',
          notes: 'Similar paper ' + (name || label) + '. Pending review. Not published.' + look,
          questions: buckets[offset],
        })
        serial += 1
        savedPapers.push(saved)
      }
      const made = savedPapers.map((row) => row.paperLabel).filter(Boolean).join(', ')
      setNote(made + ' are in Pending approval. Not published.')
      if (typeof onCreated === 'function' && savedPapers[0]) onCreated(savedPapers[0], savedPapers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hybrid AI could not create the similar papers.')
    } finally {
      setBusy(false)
    }
  }

  async function createPapers(offsets) {
    if (locked) return
    const full = getOfficialPyqPendingPaper(paper?.id) || paper
    const questions = (Array.isArray(full?.questions) ? full.questions : []).filter((q) =>
      String(q?.text || q?.stem || '').trim(),
    )
    if (!questions.length) {
      setError('This paper has no questions to make a similar paper from.')
      return
    }
    setBusy(true)
    setError('')
    setNote('')
    const bank = []
    try {
      const rows = loadQuestionBank()?.questions || []
      for (const row of rows) {
        if (String(row?.text || '').trim()) bank.push({ text: String(row.text) })
      }
    } catch {
      /* compare against this batch and the parent when the bank cannot be read */
    }
    const earlierBySlot = new Map()
    const savedPapers = []
    const skippedNames = []
    const parentKey = String(full.paperId || full.id || '')
    let stored = []
    try {
      stored = loadOfficialPyqPendingPapers()
    } catch {
      stored = []
    }
    let serial = nextOfficialPyqReplicaNumber(full.paperId)
    const pendingOffsets = []
    for (const difficultyOffset of offsets) {
      const name = replicaPaperName(full, difficultyOffset)
      if (replicaAlreadyStored(stored, parentKey, difficultyOffset, name)) {
        skippedNames.push(name || difficultyLabel(difficultyOffset))
        continue
      }
      pendingOffsets.push(difficultyOffset)
    }
    if (!pendingOffsets.length) {
      setNote(
        skippedNames.length
          ? 'These similar papers already exist: ' + skippedNames.join(', ') + '.'
          : 'These similar papers already exist.',
      )
      setBusy(false)
      return
    }
    try {
      for (const difficultyOffset of pendingOffsets) {
        const label = difficultyLabel(difficultyOffset)
        const name = replicaPaperName(full, difficultyOffset)
        const built = []
        const leftOut = []
        for (let i = 0; i < questions.length; i += 1) {
          setNote('Writing ' + label + ', question ' + (i + 1) + ' of ' + questions.length + '...')
          const slot = questions[i].pyqSlot != null ? Number(questions[i].pyqSlot) : i + 1
          const earlier = earlierBySlot.get(slot) || []
          const compareWith = bank.concat(earlier.map((text) => ({ text })))
          let result
          try {
            result = await writeReplicaQuestion(full, questions[i], i, difficultyOffset, earlier, compareWith)
          } catch (err) {
            const msg = String(err && err.message ? err.message : err || '')
            if (keyIsMissing(err) || /503|Failed to fetch|NetworkError/i.test(msg)) throw err
            result = { ok: false }
          }
          if (!result.ok) {
            leftOut.push(slot)
            if (result.text) earlierBySlot.set(slot, earlier.concat([result.text]))
            continue
          }
          built.push(result.question)
          const nextEarlier = earlier.concat([result.text])
          earlierBySlot.set(slot, nextEarlier)
        }
        const look = leftOut.length ? ' Needs a look: Q' + leftOut.join(', Q') + '.' : ''
        const saved = addOfficialPyqReplicaPendingPaper({
          exam: full.exam,
          year: full.year,
          session: full.session,
          pyqDate: full.pyqDate,
          pyqShift: full.pyqShift,
          paperId: name || String(full.paperId || full.id) + '-similar-' + serial,
          paperLabel: name || String(full.paperLabel || 'Paper') + ' Similar ' + label,
          replicaParentPaperId: full.paperId || full.id,
          replicaDifficultyOffset: Number(difficultyOffset),
          sourceLabel: 'Hybrid AI replica',
          notes:
            'Similar paper at ' +
            label +
            '. Pending review. Not published.' +
            look,
          questions: built,
        })
        serial += 1
        savedPapers.push(saved)
      }
      const made = savedPapers.map((row) => row.paperLabel).filter(Boolean).join(', ')
      const already = skippedNames.length ? ' Already there: ' + skippedNames.join(', ') + '.' : ''
      setNote(
        (made || 'Similar papers') +
          (savedPapers.length === 1 ? ' is in Pending approval.' : ' are in Pending approval.') +
          ' Not published.' +
          already,
      )
      if (typeof onCreated === 'function' && savedPapers[0]) onCreated(savedPapers[0], savedPapers)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hybrid AI could not create the similar papers.'
      if (savedPapers.length) {
        setError(msg + ' Papers already saved stay in Pending approval.')
        if (typeof onCreated === 'function' && savedPapers[0]) onCreated(savedPapers[0], savedPapers)
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  function onCreateFour() {
    return createSet()
  }

  function onCreateOne() {
    return createPapers([Number(offset)])
  }

  const plannedNames = REPLICA_DIFFICULTY_ORDER.map((item) => replicaPaperName(paper, item)).filter(Boolean)
  const plannedLabel = plannedNames.length ? plannedNames.join(', ') : '−1, Same, +1, +2'

  return (
    <div data-testid="official-pyq-replica-controls">
      <p className="form-hint">
        Create a similar paper makes four pending papers, one original question at a time. Nothing is
        published until you approve it and press Publish.
      </p>
      <div className="official-pyq-actions official-pyq-paper-actions" data-testid="official-pyq-paper-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid="official-pyq-create-replica"
          onClick={() => void onCreateFour()}
          disabled={locked}
        >
          {busy
            ? 'Creating four papers, one question at a time...'
            : 'Create four similar papers, one question at a time'}
        </button>
      </div>
      <p className="form-hint" data-testid="official-pyq-four-papers-note">
        The default creates four pending papers, one question at a time: −1, Same, +1, and +2. Each
        question is written four ways in one reply, then checked against the parent, the other three
        versions, and the question bank.
      </p>
      <p className="form-hint" data-testid="official-pyq-replica-names">
        Names: {plannedLabel}. They stay in Pending approval until you Approve and then Publish them, then they
        show on the Similar PYQ tab. The original paper stays on the PYQ tab.
      </p>
      <details>
        <summary>One difficulty only</summary>
        <div className="official-pyq-actions">
          <label className="metadata-field">
            <span className="metadata-label">Difficulty</span>
            <select
              data-testid="official-pyq-replica-difficulty"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              disabled={locked}
            >
              {CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="official-pyq-create-one-replica"
            onClick={() => void onCreateOne()}
            disabled={locked}
          >
            Create one similar paper
          </button>
        </div>
        <p className="form-hint">Model for this one paper: {modelForOffset(offset)}</p>
      </details>
      {error ? (
        <p className="upload-error" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="form-hint" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )
}
