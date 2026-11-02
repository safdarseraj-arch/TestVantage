import { Link } from 'react-router-dom'

/** Compact link from a result question to Ask Your Doubt, without copying stem text. */
export default function AskDoubtButton({ questionId, subject, chapter, compact = true }) {
  const params = new URLSearchParams()
  params.set('ask', '1')
  if (questionId) params.set('questionId', String(questionId))
  if (subject) params.set('subject', String(subject))
  if (chapter) params.set('chapter', String(chapter))
  return (
    <Link
      to={`/doubts?${params.toString()}`}
      className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'}
      title="Ask a doubt on this question"
    >
      Ask doubt
    </Link>
  )
}
