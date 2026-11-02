import { Link } from 'react-router-dom'

/**
 * Question Bank entry for any-paper upload.
 * Full extract / pending / Approve & Publish lives on /any-paper
 * (same Local AI as Official PYQ, not the official archive).
 */
export default function BankMathpixUploadPanel() {
  return (
    <section className="card bank-panel bank-mathpix-upload-panel" aria-labelledby="bank-mathpix-upload-title">
      <h3 id="bank-mathpix-upload-title">Upload paper</h3>
      <p className="form-hint">
        Add <strong>any</strong> paper (class test, mock, school paper) — not Official PYQ.
        We ask the paper name, then extract and clean with the same Local AI as official
        papers. You review the cards, then <strong>Approve &amp; Publish</strong>.
      </p>
      <p>
        <Link to="/any-paper" className="btn btn-primary" data-testid="any-paper-open">
          Upload any paper
        </Link>
        {' '}
        <Link to="/official-pyq" className="btn btn-ghost">
          Official PYQ archive
        </Link>
      </p>
    </section>
  )
}
