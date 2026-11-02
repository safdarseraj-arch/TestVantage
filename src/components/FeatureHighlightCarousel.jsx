import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HOME_FEATURE_HIGHLIGHTS } from '../data/homeFeatureHighlights'

const AUTO_MS = 5500

/**
 * Marketing feature carousel.
 * Direction: advancing moves the track LEFT (translateX negative) so the next
 * slide enters from the RIGHT — standard left-to-right story order.
 * Pauses on hover/focus; arrow keys + prev/next; swipe supported.
 * @param {{ compact?: boolean, className?: string }} [props]
 */
export default function FeatureHighlightCarousel({ compact = false, className = '' }) {
  const slides = HOME_FEATURE_HIGHLIGHTS
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const regionId = useId()
  const touchX = useRef(null)

  const go = useCallback(
    (dir) => {
      setIndex((i) => (i + dir + slides.length) % slides.length)
    },
    [slides.length],
  )

  const goTo = useCallback((i) => setIndex(i), [])

  useEffect(() => {
    if (paused || slides.length < 2) return undefined
    const t = setInterval(() => go(1), AUTO_MS)
    return () => clearInterval(t)
  }, [paused, go, slides.length])

  const slide = slides[index]

  return (
    <section
      className={`tv-feature-carousel tv-feature-carousel--ltr${compact ? ' tv-feature-carousel--compact' : ''} ${className}`.trim()}
      aria-roledescription="carousel"
      aria-labelledby={regionId}
      data-slide-direction="left-to-right"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          go(1)
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          go(-1)
        }
      }}
      onTouchStart={(e) => {
        touchX.current = e.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchX.current
        const end = e.changedTouches[0]?.clientX
        touchX.current = null
        if (start == null || end == null) return
        const dx = end - start
        if (Math.abs(dx) < 40) return
        // Swipe left → next (LTR advance); swipe right → previous
        if (dx < 0) go(1)
        else go(-1)
      }}
      tabIndex={0}
    >
      <div className="tv-feature-carousel-top">
        <p id={regionId} className="tv-feature-carousel-kicker">
          Platform highlights
          {paused ? <span className="tv-feature-carousel-paused"> · Paused</span> : null}
        </p>
        <div className="tv-feature-carousel-controls">
          <button
            type="button"
            className="tv-feature-carousel-nav"
            aria-label="Previous highlight"
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="tv-feature-carousel-nav"
            aria-label="Next highlight"
            onClick={() => go(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="tv-feature-carousel-viewport">
        <div
          className="tv-feature-carousel-track"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live="polite"
        >
          {slides.map((s, i) => (
            <article
              key={s.id}
              className="tv-feature-slide"
              style={{ '--slide-accent': s.accent }}
              aria-hidden={i !== index}
            >
              <div className="tv-feature-slide-accent" aria-hidden />
              <div className="tv-feature-slide-glow" aria-hidden />
              <span className="tv-feature-slide-mark" aria-hidden>
                {s.mark}
              </span>
              <div className="tv-feature-slide-copy">
                <p className="tv-feature-slide-eyebrow">{s.eyebrow}</p>
                <h2 className="tv-feature-slide-title">{s.title}</h2>
                <p className="tv-feature-slide-support">{s.support}</p>
                <Link to={s.to} className="tv-feature-slide-cta">
                  {s.cta}
                  <span aria-hidden="true"> →</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="tv-feature-carousel-footer">
        <div className="tv-feature-carousel-dots" role="tablist" aria-label="Feature highlights">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${s.eyebrow}: ${s.title}`}
              className={`tv-feature-dot${i === index ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <p className="tv-feature-carousel-count" aria-hidden="true">
          {index + 1} / {slides.length}
        </p>
      </div>

      <p className="sr-only">
        Slide {index + 1} of {slides.length}: {slide?.title}
      </p>
    </section>
  )
}
