import { Link } from 'react-router-dom'

/**
 * Question Bank entry for PDF upload. Papers and books are uploaded on /upload
 * (one review screen and Local AI for Official PYQ, any paper and book / question bank PDFs).
 */
export default function BankMathpixUploadPanel() {
  return (
    <section className="card bank-panel bank-mathpix-upload-panel" aria-labelledby="bank-mathpix-upload-title">
      <h3 id="bank-mathpix-upload-title">Upload a PDF</h3>
      <p className="form-hint">
        A whole paper or a book goes through <strong>Upload PDF</strong>: pick the document type, the questions
        are split and checked, you review the cards, then <strong>Approve &amp; Publish</strong>. The tabs
        below are for typing or pasting single questions.
      </p>
      <p>
        <Link to="/upload?type=paper" className="btn btn-primary" data-testid="any-paper-open">
          Any test paper
        </Link>
        {' '}
        <Link to="/upload?type=book" className="btn btn-primary" data-testid="book-pdf-open">
          Book / question bank PDF
        </Link>
        {' '}
        <Link to="/upload?type=official" className="btn btn-ghost">
          Official PYQ
        </Link>
      </p>
    </section>
  )
}
