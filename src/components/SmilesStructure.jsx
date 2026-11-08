import { useEffect, useId, useRef, useState } from 'react'
import SmilesDrawer from 'smiles-drawer'
import { kekulizeSmiles, repairScanStructureCodes } from '../utils/smilesDisplay.js'

/**
 * Draw a SMILES string as a structure (Official PYQ / bank / exam).
 * Draws only when the card is on screen so the bank does not freeze.
 * @param {{ smiles: string, height?: number, width?: number }} props
 */
export default function SmilesStructure({ smiles, height = 150, width = 240 }) {
  const svgRef = useRef(null)
  const hostRef = useRef(null)
  const canvasId = useId().replace(/:/g, '')
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(false)
  const clean = repairScanStructureCodes(String(smiles ?? '').trim())

  useEffect(() => {
    const el = hostRef.current
    if (!el || !clean) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '160px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [clean])

  useEffect(() => {
    if (!visible) return undefined
    setFailed(false)
    const host = svgRef.current
    if (!host || !clean) return undefined
    host.replaceChildren()
    const draw = (code, onError) => {
      const drawer = new SmilesDrawer.SvgDrawer({ width, height, compactDrawing: false, terminalCarbons: true })
      SmilesDrawer.parse(
        code,
        (tree) => {
          drawer.draw(tree, host, 'light', false)
          const box = drawer.svgWrapper
          const w = box ? box.maxX - box.minX : 0
          const h = box ? box.maxY - box.minY : 0
          if (w > 0 && h > 0) {
            // Fill the option box like the printed drawing; cap growth so tiny molecules stay readable.
            const s = Math.min(width / w, height / h, 1.6)
            host.setAttribute('viewBox', `${box.minX} ${box.minY} ${w} ${h}`)
            host.setAttribute('width', String(Math.round(w * s)))
            host.setAttribute('height', String(Math.round(h * s)))
          }
        },
        onError,
      )
    }
    try {
      const kekule = kekulizeSmiles(clean)
      draw(kekule, () => {
        if (kekule === clean) {
          setFailed(true)
          return
        }
        host.replaceChildren()
        draw(clean, () => setFailed(true))
      })
    } catch {
      setFailed(true)
    }
    return undefined
  }, [visible, clean, height, width, canvasId])

  if (!clean) return null
  if (failed) {
    return (
      <span className="smiles-structure smiles-structure-fallback" title={clean}>
        Chemical structure
      </span>
    )
  }
  return (
    <span ref={hostRef} className="smiles-structure-host">
      {visible ? (
        <svg
          ref={svgRef}
          className="smiles-structure"
          role="img"
          aria-label="Chemical structure"
          width={width}
          height={height}
        />
      ) : (
        <span className="smiles-structure smiles-structure-placeholder" aria-hidden>
          Chemical structure
        </span>
      )}
    </span>
  )
}