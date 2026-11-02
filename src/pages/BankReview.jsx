import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * Review lives on Question Bank tabs now so switching Upload / Saved / Review
 * does not remount the 1550-question page.
 */
export default function BankReview() {
  const [searchParams] = useSearchParams()
  const next = new URLSearchParams(searchParams)
  next.set('hub', 'review')
  if (!next.get('view')) next.set('view', 'draft')
  if (!next.get('mode')) next.set('mode', 'drafts')
  return <Navigate to={`/question-bank?${next.toString()}`} replace />
}
