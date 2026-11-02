export default function StudentGuideReader({ guide }) {
  if (!guide?.html) return null
  return (
    <article className="qr-jee-doc" id={`jee-guide-${guide.id}`}>
      <header className="qr-sheet-head">
        <p className="qr-sheet-kicker">Read only · {guide.tabLabel}</p>
        <h2>{guide.title}</h2>
        <p className="form-hint">Scroll to read the full guide on this page.</p>
      </header>
      <div className="qr-jee-doc-body is-scroll" dangerouslySetInnerHTML={{ __html: guide.html }} />
    </article>
  )
}
