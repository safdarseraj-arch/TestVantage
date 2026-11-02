import { getBankOriginLabel, getBrowserStorageLabel } from '../utils/bankBrowserLabel.js'
import { navigateCopyBankFromLocalhost } from '../utils/bankOriginRedirect.js'

/**
 * @param {{ count: number, hostname?: string, onRefresh?: () => void }} props
 */
export default function BankStorageNotice({ count, hostname = '', onRefresh }) {
  if (typeof window === 'undefined') return null

  const browser = getBrowserStorageLabel()
  const origin = getBankOriginLabel()
  const onLocalhost = hostname === 'localhost' || hostname === '[::1]'
  const inCursor = /Cursor/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')

  return (
    <div className="bank-storage-notice" role="status">
      <p>
        <strong>
          {count} question{count === 1 ? '' : 's'} saved in {browser}
        </strong>{' '}
        at <code>{origin}</code>.
        {inCursor && (
          <>
            {' '}
            <span className="bank-storage-notice-ok">— Cursor browser (staff).</span>
          </>
        )}
      </p>
      <p className="form-hint">
        {inCursor ? (
          <>
            Staff note: this Question Bank is saved in Cursor’s browser at 127.0.0.1. Edge or Chrome
            is a <em>different</em> store. After you host the live site, teachers use that HTTPS
            address instead.
          </>
        ) : (
          <>
            Questions stay inside that browser only until the live server is in use. Opening the same
            link in Edge, Chrome, or Cursor shows a <em>different</em> bank unless you copy or import.
          </>
        )}
        {onLocalhost ? (
          <>
            {' '}
            Prefer{' '}
            <a href={`http://127.0.0.1:${window.location.port || '5173'}/question-bank`}>
              127.0.0.1
            </a>{' '}
            for daily use.
          </>
        ) : (
          <>
            {' '}
            <button
              type="button"
              className="btn-link"
              onClick={() => navigateCopyBankFromLocalhost('/question-bank?hub=view&view=all')}
            >
              Copy from localhost
            </button>{' '}
            if saves look missing.
          </>
        )}
        {onRefresh && (
          <>
            {' '}
            <button type="button" className="btn-link" onClick={onRefresh}>
              Reload bank
            </button>
          </>
        )}
      </p>
    </div>
  )
}
