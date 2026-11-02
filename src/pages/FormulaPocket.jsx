import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MathText from '../components/MathText'
import PreparePageHero from '../components/PreparePageHero'
import { useAuth } from '../context/AuthContext'
import { downloadTextFile } from '../utils/csvQuestions'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  buildFormulaPocketHtml,
  isFormulaPinned,
  loadFormulaPins,
  removeFormulaPin,
  toggleFormulaPin,
} from '../utils/quickRevision'

function formulaDisplay(latex) {
  const t = String(latex || '').trim()
  if (!t) return ''
  if (t.includes('$')) return t
  return `$${t}$`
}

/** One formula on a Quick Revision sheet, with a Pin button. */
export function RevisionFormulaCard({
  formula,
  examId,
  examLabel,
  subject,
  subjectLabel,
  chapter,
  extra = false,
  ownerKey,
  onChange,
}) {
  const row = {
    examId,
    examLabel,
    subject,
    subjectLabel,
    chapter,
    name: formula?.name,
    latex: formula?.latex,
    note: formula?.note,
    extra,
  }
  const pinned = isFormulaPinned(ownerKey, row)
  return (
    <li className="qr-formula-card">
      <div className="qr-formula-card-top">
        <p className="qr-formula-name">{formula?.name}</p>
        <button
          type="button"
          className={`btn btn-ghost btn-sm qr-pin-btn${pinned ? ' is-pinned' : ''}`}
          onClick={() => {
            toggleFormulaPin(ownerKey, row)
            onChange?.()
          }}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
      <div className="qr-formula-math">
        <MathText text={formulaDisplay(formula?.latex)} />
      </div>
      {formula?.note ? <p className="qr-formula-note">{formula.note}</p> : null}
    </li>
  )
}

export default function FormulaPocket() {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const [tick, setTick] = useState(0)
  const pins = useMemo(() => loadFormulaPins(ownerKey), [ownerKey, tick])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const pin of pins) {
      const heading = `${pin.examLabel || pin.examId} · ${pin.chapter}`
      if (!map.has(heading)) map.set(heading, [])
      map.get(heading).push(pin)
    }
    return [...map.entries()]
  }, [pins])

  const onDownload = () => {
    const html = buildFormulaPocketHtml(pins)
    if (!html) return
    downloadTextFile('testvantage-formula-sheet.html', html, 'text/html', { skipWatermark: true })
    window.setTimeout(() => window.print(), 120)
  }

  return (
    <div className="page prepare-mode-page formula-pocket-page">
      <PreparePageHero
        modeId="formula-sheet"
        lead="Pin formulas from Quick Revision into one personal sheet. Download a PDF with the TestVantages name."
        actions={
          <Link to="/quick-revision" className="btn btn-ghost btn-sm">
            Quick Revision
          </Link>
        }
      />
      <div className="qr-toolbar no-print">
        <p className="qr-source">{pins.length} pinned formula{pins.length === 1 ? '' : 's'}</p>
        <div className="qr-toolbar-actions">
          <button type="button" className="btn btn-primary" onClick={onDownload} disabled={!pins.length}>
            Download PDF
          </button>
        </div>
        <p className="form-hint">
          Download opens Print. Choose <strong>Save as PDF</strong>. The TestVantages name is printed lightly.
        </p>
      </div>
      {pins.length === 0 ? (
        <p className="form-hint qr-empty">
          Open <Link to="/quick-revision">Quick Revision</Link>, then tap <strong>Pin</strong> on a formula you keep
          forgetting.
        </p>
      ) : (
        grouped.map(([heading, items]) => (
          <section key={heading} className="qr-block">
            <h3>{heading}</h3>
            <ul className="qr-formulas">
              {items.map((pin) => (
                <li key={pin.id} className="qr-formula-card">
                  <div className="qr-formula-card-top">
                    <p className="qr-formula-name">{pin.name}</p>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        removeFormulaPin(ownerKey, pin.id)
                        setTick((n) => n + 1)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="qr-formula-math">
                    <MathText text={formulaDisplay(pin.latex)} />
                  </div>
                  {pin.note ? <p className="qr-formula-note">{pin.note}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
