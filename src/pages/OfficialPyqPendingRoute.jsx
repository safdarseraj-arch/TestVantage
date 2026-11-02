/**
 * /official-pyq — same page for tabs and review (no Bootstrap remount).
 */

import ErrorBoundary from '../components/ErrorBoundary.jsx'
import OfficialPyqPending from './OfficialPyqPending.jsx'

export default function OfficialPyqPendingRoute() {
  return (
    <ErrorBoundary title="Approve official papers crashed">
      <OfficialPyqPending />
    </ErrorBoundary>
  )
}
