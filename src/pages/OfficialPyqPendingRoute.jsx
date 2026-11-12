/**
 * /official-pyq and /any-paper — same page for tabs and review (no Bootstrap remount).
 */

import ErrorBoundary from '../components/ErrorBoundary.jsx'
import OfficialPyqPending from './OfficialPyqPending.jsx'

/** @param {{ kind?: 'official' | 'other' }} props */
export default function OfficialPyqPendingRoute({ kind = 'official' } = {}) {
  return (
    <ErrorBoundary title={kind === 'other' ? 'Upload any paper crashed' : 'Approve official papers crashed'}>
      <OfficialPyqPending key={kind} kind={kind} />
    </ErrorBoundary>
  )
}
