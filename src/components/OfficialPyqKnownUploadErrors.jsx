/**
 * Lists known Official PYQ upload / solution problems and how we stop them.
 * Shown on the Pending page so reviewers see the checklist once per session.
 */
import { OFFICIAL_PYQ_KNOWN_UPLOAD_ERROR_GROUPS } from '../data/officialPyqKnownUploadErrors.js'

export default function OfficialPyqKnownUploadErrors() {
  return (
    <details className="card official-pyq-known-errors" data-testid="official-pyq-known-upload-errors">
      <summary>
        <strong>Upload &amp; solution errors we catch</strong>
        <span className="form-hint" style={{ display: 'block', marginTop: '0.25rem' }}>
          Open this list when a paper fails quality check. Auto-fix items run on Quality check; the rest need Crop
          or Edit (including Solution figures).
        </span>
      </summary>
      <div style={{ marginTop: '0.75rem' }}>
        {OFFICIAL_PYQ_KNOWN_UPLOAD_ERROR_GROUPS.map((group) => (
          <div key={group.id} style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>{group.title}</h3>
            <ul style={{ margin: 0, paddingLeft: '1.15rem' }}>
              {group.errors.map((err) => (
                <li key={err.id} style={{ marginBottom: '0.55rem' }}>
                  <strong>{err.title}</strong>
                  {err.auto ? (
                    <span className="form-hint"> · auto-fixed on Quality check</span>
                  ) : (
                    <span className="form-hint"> · needs you</span>
                  )}
                  <div className="form-hint" style={{ marginTop: '0.15rem' }}>
                    {err.what}
                  </div>
                  <div style={{ marginTop: '0.1rem' }}>
                    Fix: {err.fix}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
