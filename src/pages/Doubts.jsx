import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MathText from '../components/MathText'
import RegisteredGate from '../components/RegisteredGate'
import SystemSuggestedSolutions from '../components/SystemSuggestedSolutions'
import TextWithFileUpload from '../components/TextWithFileUpload'
import VoicePlayer from '../components/VoicePlayer'
import { useAuth } from '../context/AuthContext'
import { ALL_SUBJECTS } from '../data/subjects'
import { addDoubt, addSolution, loadDoubtsBySubject, seedDemoDoubts } from '../utils/doubts'

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function sourceBadge(source) {
  if (!source?.sourceType || source.sourceType === 'text') return null
  const labels = { word: 'Word', pdf: 'PDF', image: 'Image', voice: 'Voice' }
  return (
    <span className="source-badge">
      📎 {labels[source.sourceType] ?? source.sourceType}
      {source.fileName ? ` · ${source.fileName}` : ''}
    </span>
  )
}

function titleFromBody(body) {
  const line = body.split('\n').find((l) => l.trim())?.trim() ?? ''
  return line.slice(0, 120) + (line.length > 120 ? '…' : '')
}

function subjectToId(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (ALL_SUBJECTS.some((x) => x.id === s)) return s
  if (s.includes('math')) return 'mathematics'
  if (s.includes('phys')) return 'physics'
  if (s.includes('chem')) return 'chemistry'
  if (s.includes('botan')) return 'botany'
  if (s.includes('zool')) return 'zoology'
  if (s.includes('bio')) return 'botany'
  return 'physics'
}

export default function Doubts() {
  const { session, isLoggedIn } = useAuth()
  const [searchParams] = useSearchParams()
  const [subjectFilter, setSubjectFilter] = useState('')
  const [doubts, setDoubts] = useState([])
  const [showAsk, setShowAsk] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [doubtSource, setDoubtSource] = useState(null)
  const [doubtVoice, setDoubtVoice] = useState(null)
  const [subject, setSubject] = useState('physics')
  const [linkedQuestionId, setLinkedQuestionId] = useState('')
  const [linkedChapter, setLinkedChapter] = useState('')
  const [solutionDrafts, setSolutionDrafts] = useState({})
  const [solutionSources, setSolutionSources] = useState({})
  const [solutionVoices, setSolutionVoices] = useState({})

  const authorId = session?.userId ?? session?.email ?? ''
  const authorName = session?.name ?? 'Student'

  const refresh = useCallback(() => {
    seedDemoDoubts()
    setDoubts(loadDoubtsBySubject(subjectFilter || undefined))
  }, [subjectFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const ask = searchParams.get('ask') === '1'
    const qid = searchParams.get('questionId') || ''
    const ch = searchParams.get('chapter') || ''
    const sub = searchParams.get('subject')
    if (sub) setSubject(subjectToId(sub))
    if (qid) setLinkedQuestionId(qid)
    if (ch) setLinkedChapter(ch)
    if (ask || qid) {
      setShowAsk(true)
      if (!title.trim() && ch) setTitle(`Doubt on ${ch}`)
    }
    // Prefill once from the result-page link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleAsk = (e) => {
    e.preventDefault()
    if (!isLoggedIn) return
    const bodyText = body.trim()
    const hasVoice = Boolean(doubtVoice?.audioId)
    if (!bodyText && !hasVoice) {
      setMessage({
        type: 'error',
        text: 'Add your doubt by typing, uploading Word/PDF/image, or recording voice.',
      })
      return
    }
    const finalTitle =
      title.trim() || (bodyText ? titleFromBody(bodyText) : hasVoice ? 'Voice doubt' : '')
    if (!finalTitle) {
      setMessage({ type: 'error', text: 'Add a title, text, or a voice recording.' })
      return
    }
    const source = hasVoice
      ? {
          sourceType: 'voice',
          audioId: doubtVoice.audioId,
          durationMs: doubtVoice.durationMs,
          ...(doubtSource?.sourceType && doubtSource.sourceType !== 'voice'
            ? { fileName: doubtSource.fileName, attachmentType: doubtSource.sourceType }
            : {}),
        }
      : (doubtSource ?? { sourceType: 'text' })

    addDoubt({
      title: finalTitle,
      body: bodyText || '🎤 Voice message',
      subject,
      authorId,
      authorName,
      source,
      audioId: doubtVoice?.audioId,
      voiceDurationMs: doubtVoice?.durationMs,
      questionId: linkedQuestionId || undefined,
      chapter: linkedChapter || undefined,
    })
    setTitle('')
    setBody('')
    setDoubtSource(null)
    setDoubtVoice(null)
    setLinkedQuestionId('')
    setLinkedChapter('')
    setShowAsk(false)
    setMessage({ type: 'success', text: 'Doubt posted! Others can reply with text, files, or voice.' })
    refresh()
  }

  const handleSolution = (doubtId, e) => {
    e.preventDefault()
    if (!isLoggedIn) return
    const text = solutionDrafts[doubtId]?.trim()
    const voice = solutionVoices[doubtId]
    const hasVoice = Boolean(voice?.audioId)
    if (!text && !hasVoice) {
      setMessage({
        type: 'error',
        text: 'Add a solution by typing, uploading Word/PDF/image, or recording voice.',
      })
      return
    }
    const fileSource = solutionSources[doubtId]
    const source = hasVoice
      ? {
          sourceType: 'voice',
          audioId: voice.audioId,
          durationMs: voice.durationMs,
          ...(fileSource?.sourceType && fileSource.sourceType !== 'voice'
            ? { fileName: fileSource.fileName, attachmentType: fileSource.sourceType }
            : {}),
        }
      : (fileSource ?? { sourceType: 'text' })

    const result = addSolution(doubtId, {
      body: text || '🎤 Voice solution',
      authorId,
      authorName,
      source,
      audioId: voice?.audioId,
      voiceDurationMs: voice?.durationMs,
    })
    if (result.ok) {
      setSolutionDrafts((prev) => ({ ...prev, [doubtId]: '' }))
      setSolutionSources((prev) => {
        const next = { ...prev }
        delete next[doubtId]
        return next
      })
      setSolutionVoices((prev) => {
        const next = { ...prev }
        delete next[doubtId]
        return next
      })
      setMessage({ type: 'success', text: 'Solution posted. Thank you for helping!' })
      refresh()
    }
  }

  return (
    <div className="page doubts-page">
      <div className="section-header">
        <div>
          <h1>Ask Your Doubt</h1>
          <p className="lead">
            Post doubts and solutions by <strong>typing</strong>, uploading{' '}
            <strong>Word / PDF / image</strong>, or <strong>voice</strong> (microphone).
            Registered users only.
          </p>
        </div>
        {isLoggedIn ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowAsk((s) => !s)}>
            {showAsk ? 'Cancel' : '+ Ask doubt'}
          </button>
        ) : (
          <Link to="/login" state={{ from: '/doubts' }} className="btn btn-primary">
            Sign in to ask
          </Link>
        )}
      </div>

      {message.text && (
        <p className={message.type === 'error' ? 'upload-error' : 'upload-success'}>
          {message.text}
        </p>
      )}

      {showAsk && (
        <RegisteredGate action="ask a doubt">
          <form className="card doubt-ask-form" onSubmit={handleAsk}>
            <h2>Post your doubt</h2>
            {linkedQuestionId || linkedChapter ? (
              <p className="form-hint">
                Linked from a result
                {linkedChapter ? ` · ${linkedChapter}` : ''} — write what is confusing. We do not
                paste the question text here.
              </p>
            ) : null}
            <label>
              Subject
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {ALL_SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title (optional if file has a clear first line)
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short title — auto-filled from upload if empty"
              />
            </label>
            <label>
              Doubt — type, upload file, or record voice
              <TextWithFileUpload
                label="doubt-body"
                value={body}
                onChange={setBody}
                rows={6}
                enableVoice
                voiceAudioId={doubtVoice?.audioId ?? null}
                voiceDurationMs={doubtVoice?.durationMs ?? 0}
                onVoiceChange={setDoubtVoice}
                placeholder="Type your doubt, or use Word/PDF/Image or Voice tabs…"
                onSourceChange={(meta) => {
                  if (meta?.sourceType === 'voice') return
                  setDoubtSource(meta)
                }}
              />
            </label>
            {(body.trim().length > 30 || title.trim().length > 10) && (
              <SystemSuggestedSolutions
                title={title || titleFromBody(body)}
                body={body}
                subject={subject}
                compact
              />
            )}
            <button type="submit" className="btn btn-primary">
              Post doubt
            </button>
          </form>
        </RegisteredGate>
      )}

      <div className="test-filters">
        <label>
          Filter subject
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="">All subjects</option>
            {ALL_SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {doubts.length === 0 ? (
        <div className="card glass-card">
          <p>No doubts yet. Be the first to ask!</p>
          {isLoggedIn && (
            <button type="button" className="btn btn-primary" onClick={() => setShowAsk(true)}>
              Ask doubt
            </button>
          )}
        </div>
      ) : (
        <ul className="doubts-list">
          {doubts.map((d) => {
            const sub = ALL_SUBJECTS.find((s) => s.id === d.subject)
            const expanded = expandedId === d.id
            return (
              <li key={d.id} className="card doubt-card">
                <button
                  type="button"
                  className="doubt-card-head"
                  onClick={() => setExpandedId(expanded ? null : d.id)}
                >
                  <div>
                    <span className="doubt-subject" style={{ color: sub?.color }}>
                      {sub?.label ?? d.subject}
                    </span>
                    <h3>{d.title}</h3>
                    <p className="doubt-meta">
                      by {d.authorName} · {formatDate(d.createdAt)} ·{' '}
                      <strong>{d.solutions.length}</strong> solution
                      {d.solutions.length !== 1 ? 's' : ''}
                      {d.chapter ? ` · ${d.chapter}` : ''}
                    </p>
                    {sourceBadge(d.source)}
                  </div>
                  <span className="expand-hint">{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <div className="doubt-expanded">
                    <div className="doubt-body">
                      {(d.audioId || d.source?.audioId) && (
                        <VoicePlayer
                          audioId={d.audioId || d.source.audioId}
                          durationMs={d.voiceDurationMs || d.source?.durationMs}
                        />
                      )}
                      {d.body && d.body !== '🎤 Voice message' && <MathText text={d.body} />}
                    </div>

                    <SystemSuggestedSolutions
                      title={d.title}
                      body={d.body}
                      subject={d.subject}
                    />

                    <section className="doubt-solutions">
                      <h4>Community solutions ({d.solutions.length})</h4>
                      {d.solutions.length === 0 ? (
                        <p className="form-hint">No solutions yet — be the first to help!</p>
                      ) : (
                        <ul className="solutions-list">
                          {d.solutions.map((sol, i) => (
                            <li key={sol.id} className="solution-item">
                              <span className="solution-num">#{i + 1}</span>
                              <div>
                                {sourceBadge(sol.source)}
                                {(sol.audioId || sol.source?.audioId) && (
                                  <VoicePlayer
                                    audioId={sol.audioId || sol.source.audioId}
                                    durationMs={sol.voiceDurationMs || sol.source?.durationMs}
                                    compact
                                  />
                                )}
                                {sol.body && sol.body !== '🎤 Voice solution' && (
                                  <MathText text={sol.body} />
                                )}
                                <p className="solution-meta">
                                  {sol.authorName} · {formatDate(sol.createdAt)}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      <RegisteredGate action="post a solution">
                        <form
                          className="solution-form"
                          onSubmit={(e) => handleSolution(d.id, e)}
                        >
                          <label>
                            Your solution — type, upload, or voice
                            <TextWithFileUpload
                              label={`solution-${d.id}`}
                              value={solutionDrafts[d.id] ?? ''}
                              onChange={(v) =>
                                setSolutionDrafts((prev) => ({ ...prev, [d.id]: v }))
                              }
                              rows={5}
                              enableVoice
                              voiceAudioId={solutionVoices[d.id]?.audioId ?? null}
                              voiceDurationMs={solutionVoices[d.id]?.durationMs ?? 0}
                              onVoiceChange={(meta) =>
                                setSolutionVoices((prev) => {
                                  const next = { ...prev }
                                  if (meta) next[d.id] = meta
                                  else delete next[d.id]
                                  return next
                                })
                              }
                              placeholder="Step-by-step solution, file upload, or voice reply…"
                              onSourceChange={(meta) => {
                                if (meta?.sourceType === 'voice') return
                                setSolutionSources((prev) => ({ ...prev, [d.id]: meta }))
                              }}
                            />
                          </label>
                          <button type="submit" className="btn btn-primary btn-sm">
                            Post solution
                          </button>
                        </form>
                      </RegisteredGate>
                    </section>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
