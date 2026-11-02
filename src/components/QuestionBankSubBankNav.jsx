import { Link, useSearchParams } from 'react-router-dom'
import {
  QUESTION_BANK_SUB_BANK_TABS,
  parseQuestionBankSubBank,
} from '../utils/questionBankSubBank.js'

/**
 * Sub-bank slice tabs: All | Main | Official PYQ | Hybrid AI | Similar PYQ.
 * @param {{
 *   activeSubBank: string
 *   onSubBankChange?: (id: string) => void
 *   counts: Record<string, number>
 *   hybridDraftCount?: number
 *   hybridTray?: 'ready' | 'needs-action'
 *   onHybridTrayChange?: (tray: 'ready' | 'needs-action') => void
 *   readyDraftCount?: number
 *   needsActionCount?: number
 * }} props
 */
export default function QuestionBankSubBankNav({
  activeSubBank,
  onSubBankChange,
  counts,
  hybridDraftCount = 0,
  hybridTray = 'ready',
  onHybridTrayChange,
  readyDraftCount = 0,
  needsActionCount = 0,
}) {
  const [searchParams] = useSearchParams()
  const baseParams = new URLSearchParams(searchParams)

  const buildHref = (tabId) => {
    const next = new URLSearchParams(baseParams)
    if (!tabId) next.delete('subBank')
    else next.set('subBank', tabId)
    const qs = next.toString()
    return qs ? `/question-bank?${qs}` : '/question-bank'
  }

  const active = parseQuestionBankSubBank(activeSubBank)

  return (
    <nav className="bank-sub-bank-nav card-inner" aria-label="Sub-question banks">
      <p className="bank-sub-bank-label form-hint">
        Sub-bank{' '}
        {hybridDraftCount > 0 ? (
          <span className="bank-sub-bank-hybrid-badge" title="Hybrid AI drafts pending review">
            {hybridDraftCount} Hybrid draft{hybridDraftCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </p>
      <div className="bank-sub-bank-tabs" role="tablist">
        {QUESTION_BANK_SUB_BANK_TABS.map((tab) => {
          const isActive = active === tab.id
          const count = counts[tab.id] ?? 0
          const className = `bank-sub-bank-tab ${isActive ? 'active' : ''}`
          if (onSubBankChange) {
            return (
              <button
                key={tab.id || 'all'}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={tab.short}
                className={className}
                onClick={() => onSubBankChange(tab.id)}
              >
                {tab.label}
                <span className="bank-sub-bank-tab-count">{count}</span>
              </button>
            )
          }
          return (
            <Link
              key={tab.id || 'all'}
              to={buildHref(tab.id)}
              role="tab"
              aria-selected={isActive}
              title={tab.short}
              className={`${className} bank-sub-bank-tab-link`}
            >
              {tab.label}
              <span className="bank-sub-bank-tab-count">{count}</span>
            </Link>
          )
        })}
      </div>
      {active === 'ai' ? (
        <div className="bank-sub-bank-tabs bank-hybrid-tray-tabs" role="tablist" aria-label="Hybrid AI drafts">
          <button
            type="button"
            role="tab"
            aria-selected={hybridTray !== 'needs-action'}
            className={`bank-sub-bank-tab ${hybridTray !== 'needs-action' ? 'active' : ''}`}
            onClick={() => onHybridTrayChange?.('ready')}
          >
            Ready drafts
            <span className="bank-sub-bank-tab-count">{readyDraftCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={hybridTray === 'needs-action'}
            className={`bank-sub-bank-tab ${hybridTray === 'needs-action' ? 'active' : ''}`}
            onClick={() => onHybridTrayChange?.('needs-action')}
          >
            Needs action
            <span className="bank-sub-bank-tab-count">{needsActionCount}</span>
          </button>
        </div>
      ) : null}
    </nav>
  )
}
