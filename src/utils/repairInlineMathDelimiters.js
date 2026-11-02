/**
 * Repair OCR/polish glitches: early $ close before \in, \& in math, plain "in R+".
 * @param {string} text
 */
export function repairInlineMathDelimiters(text) {
  if (!text?.trim()) return text
  let out = text

  // Plain English "in R+" → proper membership (before wrap passes)
  out = out.replace(/\bIf\s+([xX],\s*[yY],\s*[zZ])\s+in\s+R\s*\+/gi, (_, vars) => {
    return `If $${vars} \\in \\mathbb{R}^{+}$`
  })
  out = out.replace(/\b([xX],\s*[yY],\s*[zZ])\s+in\s+R\s*\+/gi, (_, vars) => {
    return `$${vars} \\in \\mathbb{R}^{+}$`
  })

  // $x, y, z $ \in \mathbb{R}^{+}$  or  $x, y, z $\in \mathbb{R}^{+}$
  out = out.replace(
    /\$([xX],\s*[yY],\s*[zZ]\s*)\$\s*(\\in\s*(?:\\mathbb\{R\}(?:\^{?\+?}?|\^\+)|R\^\+)[^$]*?)\$/gi,
    (_, vars, membership) => `$${vars} ${membership}$`,
  )

  // Stray $ inside membership block: $x, y, z $ \in
  out = out.replace(/\$([xX],\s*[yY],\s*[zZ])\s*\$\s*\\in/gi, (_, vars) => {
    return `$${vars} \\in`
  })

  // $y$ \& $z$  or  $y \& z$
  out = out.replace(/\$([yY])\$\s*\\&\s*\$([zZ])\$/gi, (_, y, z) => {
    return `$${y} \\text{ and } ${z}$`
  })
  out = out.replace(/\$([^$]*?)\\&([^$]*?)\$/g, (_, a, b) => {
    const left = a.trim()
    const right = b.trim()
    return `$${left} \\text{ and } ${right}$`
  })

  // then $x,$ $y$ $z$ → $x, y, z$ when adjacent
  out = out.replace(/\$([xX]),\$\s*\$([yY]),\$\s*\$([zZ])\$/g, (_, x, y, z) => {
    return `$${x}, ${y}, ${z}$`
  })

  // \\in → \in (double backslash before "in", not "\\int")
  out = out.replace(/\\{2,}(?=in\b)/g, '\\')

  // \\mathbb → \mathbb when over-escaped
  out = out.replace(/\\{2,}mathbb/g, '\\mathbb')

  return out
}
