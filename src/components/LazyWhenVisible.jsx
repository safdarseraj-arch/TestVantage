import { useEffect, useRef, useState } from 'react'

/**
 * Mount children only after the placeholder is near the screen.
 * Keeps Publish/Edit outside this wrapper so buttons stay clickable.
 */
export default function LazyWhenVisible({
  children,
  minHeight = 200,
  rootMargin = '280px',
  placeholder = null,
}) {
  const ref = useRef(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (show) return undefined
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin, show])

  return (
    <div ref={ref} className="lazy-when-visible" style={show ? undefined : { minHeight }}>
      {show ? children : placeholder}
    </div>
  )
}
