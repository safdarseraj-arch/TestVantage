import {
  JEE_COMPLETE_STRATEGY_HTML,
  JEE_COMPLETE_STRATEGY_TITLE,
} from '../content/jeeCompleteProblemSolvingHtml.js'

export default function JeeCompleteStrategyReader() {
  return (
    <article className="qr-jee-doc" id="jee-complete-strategy-doc">
      <header className="qr-sheet-head">
        <p className="qr-sheet-kicker">Read only - Complete JEE strategy</p>
        <h2>{JEE_COMPLETE_STRATEGY_TITLE}</h2>
        <p className="form-hint">Scroll to read on this page. This guide is not a download.</p>
      </header>
      <div className="qr-jee-doc-body" dangerouslySetInnerHTML={{ __html: JEE_COMPLETE_STRATEGY_HTML }} />
    </article>
  )
}
