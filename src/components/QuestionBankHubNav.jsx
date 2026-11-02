import { Link } from 'react-router-dom'

/**
 * Top-level Question Bank tabs: Upload | Saved questions | Review & publish | Question reports | Manage meta.
 * On Saved / Review: Draft | Published sub-tabs.
 * @param {{
 *   hubMode?: 'upload' | 'view' | 'review' | 'manage',
 *   activeSection?: 'upload' | 'view' | 'review' | 'manage' | 'reports',
 *   onHubChange?: (mode: 'upload' | 'view' | 'review' | 'manage') => void,
 *   viewTab: 'draft' | 'published',
 *   onViewTabChange: (tab: 'draft' | 'published') => void,
 *   counts: { total: number, draft: number, published: number, reportsOpen?: number },
 *   showReviewLink?: boolean,
 *   showReportsLink?: boolean,
 * }} props
 */
export default function QuestionBankHubNav({
  hubMode,
  activeSection,
  onHubChange,
  viewTab,
  onViewTabChange,
  counts,
  showReviewLink = true,
  showReportsLink = true,
}) {
  const section = activeSection ?? hubMode ?? 'upload'
  const showStatusTabs = section === 'view' || section === 'review'

  return (
    <nav className="bank-hub-nav card-inner" aria-label="Question bank sections">
      <div className="bank-hub-primary bank-hub-top-tabs" role="tablist" aria-label="Main sections">
        {onHubChange ? (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'upload'}
            className={`bank-hub-top-tab ${section === 'upload' ? 'active' : ''}`}
            onClick={() => onHubChange('upload')}
          >
            Upload
          </button>
        ) : (
          <Link
            to="/question-bank?hub=upload"
            role="tab"
            aria-selected={section === 'upload'}
            className={`bank-hub-top-tab bank-hub-top-tab-link ${section === 'upload' ? 'active' : ''}`}
          >
            Upload
          </Link>
        )}
        {onHubChange ? (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'view'}
            className={`bank-hub-top-tab ${section === 'view' ? 'active' : ''}`}
            onClick={() => onHubChange('view')}
          >
            Saved questions
            <span className="bank-hub-top-tab-count">{counts.total}</span>
          </button>
        ) : (
          <Link
            to="/question-bank?hub=view&view=draft"
            role="tab"
            aria-selected={section === 'view'}
            className={`bank-hub-top-tab bank-hub-top-tab-link ${section === 'view' ? 'active' : ''}`}
          >
            Saved questions
            <span className="bank-hub-top-tab-count">{counts.total}</span>
          </Link>
        )}
        {showReviewLink && onHubChange ? (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'review'}
            className={`bank-hub-top-tab ${section === 'review' ? 'active' : ''}`}
            onClick={() => onHubChange('review')}
          >
            Review & publish
            {counts.draft > 0 && (
              <span className="bank-hub-top-tab-count bank-hub-top-tab-count-warn">{counts.draft}</span>
            )}
          </button>
        ) : showReviewLink ? (
          <Link
            to="/question-bank/review?view=draft&mode=drafts"
            role="tab"
            aria-selected={section === 'review'}
            className={`bank-hub-top-tab bank-hub-top-tab-link ${section === 'review' ? 'active' : ''}`}
          >
            Review & publish
            {counts.draft > 0 && (
              <span className="bank-hub-top-tab-count bank-hub-top-tab-count-warn">{counts.draft}</span>
            )}
          </Link>
        ) : null}
        {showReportsLink ? (
          <Link
            to="/question-bank/reports"
            role="tab"
            aria-selected={section === 'reports'}
            className={`bank-hub-top-tab bank-hub-top-tab-link ${section === 'reports' ? 'active' : ''}`}
          >
            Question reports
            {(counts.reportsOpen ?? 0) > 0 && (
              <span className="bank-hub-top-tab-count bank-hub-top-tab-count-warn">
                {counts.reportsOpen}
              </span>
            )}
          </Link>
        ) : null}
        {onHubChange ? (
          <button
            type="button"
            role="tab"
            aria-selected={section === 'manage'}
            className={`bank-hub-top-tab ${section === 'manage' ? 'active' : ''}`}
            onClick={() => onHubChange('manage')}
          >
            Manage meta
          </button>
        ) : (
          <Link
            to="/question-bank?hub=manage"
            role="tab"
            aria-selected={section === 'manage'}
            className={`bank-hub-top-tab bank-hub-top-tab-link ${section === 'manage' ? 'active' : ''}`}
          >
            Manage meta
          </Link>
        )}
      </div>

      {showStatusTabs && (
        <div
          className="bank-hub-secondary bank-status-tabs"
          role="tablist"
          aria-label="Draft or published"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'draft'}
            className={`bank-view-tab ${viewTab === 'draft' ? 'active' : ''}`}
            onClick={() => onViewTabChange('draft')}
          >
            Draft ({counts.draft})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewTab === 'published'}
            className={`bank-view-tab ${viewTab === 'published' ? 'active' : ''}`}
            onClick={() => onViewTabChange('published')}
          >
            Published ({counts.published})
          </button>
        </div>
      )}
    </nav>
  )
}
