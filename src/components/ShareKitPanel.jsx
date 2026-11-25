/**
 * Manual 1-tap WhatsApp / copy share kit for promoters.
 */

import { useEffect, useRef, useState } from 'react'

export default function ShareKitPanel({ share, partner }) {
  const [note, setNote] = useState('')
  const clearTimer = useRef(null)

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
    },
    [],
  )

  if (!share || !partner) return null

  const flash = (text) => {
    setNote(text)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setNote(''), 2800)
  }

  const copy = async (text, label) => {
    const value = String(text || '').trim()
    if (!value) {
      flash(`Nothing to copy for ${label}.`)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      flash(`${label} copied.`)
    } catch {
      flash('Could not copy — select the text manually.')
    }
  }

  const waHref = `https://wa.me/?text=${share.whatsappText}`

  return (
    <section className="card create-section" data-testid="share-kit-panel">
      <h2>Share kit</h2>
      <p className="form-hint">
        Friends get <strong>2 free NTA-pattern diagnostic mocks</strong> and{' '}
        <strong>10% off</strong> when they use your link or code.
      </p>
      <p>
        Your share code:{' '}
        <strong className="tv-code-display" style={{ fontSize: '1.1rem' }}>
          {share.vanityCode}
        </strong>
      </p>
      <p className="form-hint">Referral link: {share.referralLink}</p>
      <p className="form-hint">Mentor page: {share.micrositeLink}</p>
      {share.inviteLoginLink ? (
        <p className="form-hint">Register with code: {share.inviteLoginLink}</p>
      ) : null}
      <div className="tv-inline-form tv-share-actions" style={{ marginTop: '0.75rem' }}>
        <a className="btn btn-primary btn-sm" href={waHref} target="_blank" rel="noreferrer">
          WhatsApp share
        </a>
        <a className="btn btn-ghost btn-sm" href="#promo-gallery">
          Promo gallery
        </a>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => copy(share.referralLink, 'Link')}
        >
          Copy link
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => copy(share.vanityCode, 'Code')}
        >
          Copy code
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => copy(share.micrositeLink, 'Mentor page')}
        >
          Copy mentor page
        </button>
        {share.inviteLoginLink ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => copy(share.inviteLoginLink, 'Invite login link')}
          >
            Copy invite login
          </button>
        ) : null}
      </div>
      {note ? (
        <p className="tv-copy-toast" role="status">
          {note}
        </p>
      ) : null}
      <div className="tv-flyer-preview" aria-label="Printable flyer text">
        <p>
          <strong>TestVantages · Free JEE / NEET diagnostic</strong>
        </p>
        <p>
          Scan or visit: {share.micrositeLink}
          <br />
          Code: {share.vanityCode} · 10% off paid packs
        </p>
        <p className="form-hint">Print this block as an A4 flyer for libraries / coaching boards.</p>
      </div>
    </section>
  )
}
