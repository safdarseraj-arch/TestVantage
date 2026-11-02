/** Quick-insert JEE / board math & chemistry symbols — expandable tabs (not a messy chip wall). */

import { useEffect, useState } from 'react'

/** @typedef {{ label: string, insert: string, title?: string }} MathSymbol */

/** @type {{ id: string, label: string, symbols: MathSymbol[] }[]} */
export const MATH_SYMBOL_GROUPS = [
  {
    id: 'basic',
    label: 'Basic',
    symbols: [
      { label: '↵', insert: '\n', title: 'Line break (new line)' },
      { label: '+', insert: '+' },
      { label: '−', insert: '-' },
      { label: '±', insert: '\\pm' },
      { label: '∓', insert: '\\mp' },
      { label: '×', insert: '\\times' },
      { label: '÷', insert: '\\div' },
      { label: '·', insert: '\\cdot' },
      { label: '=', insert: '=' },
      { label: '≠', insert: '\\neq' },
      { label: '<', insert: '<' },
      { label: '>', insert: '>' },
      { label: '≤', insert: '\\leq' },
      { label: '≥', insert: '\\geq' },
      { label: '≈', insert: '\\approx' },
      { label: '≡', insert: '\\equiv' },
      { label: '°', insert: '^\\circ' },
      { label: '∞', insert: '\\infty' },
      { label: '…', insert: '\\ldots' },
      { label: '⋯', insert: '\\cdots' },
    ],
  },
  {
    id: 'powers',
    label: 'Powers & roots',
    symbols: [
      { label: 'x²', insert: 'x^2' },
      { label: 'xⁿ', insert: 'x^{n}' },
      { label: 'xₙ', insert: 'x_{n}' },
      { label: 'x⁻¹', insert: 'x^{-1}', title: 'Inverse / reciprocal' },
      { label: '½', insert: '\\frac{1}{2}' },
      { label: 'a/b', insert: '\\frac{a}{b}' },
      { label: '√', insert: '\\sqrt{}', title: 'Square root' },
      { label: 'ⁿ√', insert: '\\sqrt[n]{}', title: 'nth root' },
      { label: '⁄', insert: '\\frac{}{}', title: 'Fraction template' },
      { label: '( )ⁿ', insert: '\\left( \\right)^{n}', title: 'Bracket power' },
      { label: '|x|', insert: '\\left| x \\right|' },
      { label: '⌊x⌋', insert: '\\lfloor x \\rfloor', title: 'Floor' },
      { label: '⌈x⌉', insert: '\\lceil x \\rceil', title: 'Ceiling' },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    symbols: [
      { label: 'α', insert: '\\alpha' },
      { label: 'β', insert: '\\beta' },
      { label: 'γ', insert: '\\gamma' },
      { label: 'δ', insert: '\\delta' },
      { label: 'ε', insert: '\\epsilon' },
      { label: 'ζ', insert: '\\zeta' },
      { label: 'η', insert: '\\eta' },
      { label: 'θ', insert: '\\theta' },
      { label: 'λ', insert: '\\lambda' },
      { label: 'μ', insert: '\\mu' },
      { label: 'ν', insert: '\\nu' },
      { label: 'ξ', insert: '\\xi' },
      { label: 'π', insert: '\\pi' },
      { label: 'ρ', insert: '\\rho' },
      { label: 'σ', insert: '\\sigma' },
      { label: 'τ', insert: '\\tau' },
      { label: 'φ', insert: '\\phi' },
      { label: 'χ', insert: '\\chi' },
      { label: 'ψ', insert: '\\psi' },
      { label: 'ω', insert: '\\omega' },
      { label: 'Γ', insert: '\\Gamma' },
      { label: 'Δ', insert: '\\Delta' },
      { label: 'Θ', insert: '\\Theta' },
      { label: 'Λ', insert: '\\Lambda' },
      { label: 'Σ', insert: '\\Sigma' },
      { label: 'Φ', insert: '\\Phi' },
      { label: 'Ω', insert: '\\Omega' },
    ],
  },
  {
    id: 'trig',
    label: 'Trig & logs',
    symbols: [
      { label: 'sin', insert: '\\sin' },
      { label: 'cos', insert: '\\cos' },
      { label: 'tan', insert: '\\tan' },
      { label: 'cot', insert: '\\cot' },
      { label: 'sec', insert: '\\sec' },
      { label: 'csc', insert: '\\csc' },
      { label: 'sin⁻¹', insert: '\\sin^{-1}' },
      { label: 'cos⁻¹', insert: '\\cos^{-1}' },
      { label: 'tan⁻¹', insert: '\\tan^{-1}' },
      { label: 'log', insert: '\\log' },
      { label: 'ln', insert: '\\ln' },
      { label: 'lg', insert: '\\lg' },
      { label: 'exp', insert: '\\exp' },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    symbols: [
      { label: '∫', insert: '\\int ', title: 'Integral' },
      { label: '∫ₐᵇ', insert: '\\int_{a}^{b} ', title: 'Definite integral' },
      { label: '∬', insert: '\\iint ', title: 'Double integral' },
      { label: '∮', insert: '\\oint ', title: 'Contour integral' },
      { label: '∑', insert: '\\sum ', title: 'Summation' },
      { label: '∑ᵢⁿ', insert: '\\sum_{i=1}^{n} ', title: 'Summation with limits' },
      { label: '∏', insert: '\\prod ', title: 'Product' },
      { label: 'lim', insert: '\\lim_{x \\to a} ', title: 'Limit' },
      { label: 'lim₀', insert: '\\lim_{x \\to 0} ' },
      { label: 'lim∞', insert: '\\lim_{x \\to \\infty} ' },
      { label: 'd/dx', insert: '\\frac{d}{dx}', title: 'Derivative' },
      { label: '∂', insert: '\\partial', title: 'Partial derivative' },
      { label: '∇', insert: '\\nabla', title: 'Nabla / gradient' },
      { label: 'dx', insert: '\\, dx' },
    ],
  },
  {
    id: 'algebra',
    label: 'Algebra',
    symbols: [
      { label: 'ℓ', insert: '\\ell' },
      { label: 'mod', insert: '\\mod' },
      { label: 'gcd', insert: '\\gcd' },
      { label: 'lcm', insert: '\\operatorname{lcm}' },
      { label: 'nCr', insert: '\\binom{n}{r}' },
      { label: 'nPr', insert: '^{n}P_{r}' },
      { label: 'det', insert: '\\det' },
      { label: 'min', insert: '\\min' },
      { label: 'max', insert: '\\max' },
      { label: 'sup', insert: '\\sup' },
      { label: 'inf', insert: '\\inf' },
      { label: 'Re', insert: '\\Re' },
      { label: 'Im', insert: '\\Im' },
      { label: 'f(x)', insert: 'f(x)' },
      { label: "f'", insert: "f'(x)" },
      { label: 'f⁽ⁿ⁾', insert: 'f^{(n)}(x)' },
    ],
  },
  {
    id: 'sets',
    label: 'Sets & logic',
    symbols: [
      { label: '∈', insert: '\\in' },
      { label: '∉', insert: '\\notin' },
      { label: '⊂', insert: '\\subset' },
      { label: '⊆', insert: '\\subseteq' },
      { label: '∪', insert: '\\cup' },
      { label: '∩', insert: '\\cap' },
      { label: '∅', insert: '\\emptyset' },
      { label: 'ℝ', insert: '\\mathbb{R}' },
      { label: 'ℤ', insert: '\\mathbb{Z}' },
      { label: 'ℕ', insert: '\\mathbb{N}' },
      { label: 'ℚ', insert: '\\mathbb{Q}' },
      { label: 'ℂ', insert: '\\mathbb{C}' },
      { label: '∀', insert: '\\forall' },
      { label: '∃', insert: '\\exists' },
      { label: '¬', insert: '\\neg' },
      { label: '∧', insert: '\\land' },
      { label: '∨', insert: '\\lor' },
      { label: '⇒', insert: '\\Rightarrow' },
      { label: '⇔', insert: '\\Leftrightarrow' },
      { label: '∴', insert: '\\therefore' },
      { label: '∵', insert: '\\because' },
    ],
  },
  {
    id: 'geometry',
    label: 'Geometry & vectors',
    symbols: [
      { label: 'î', insert: '\\hat{i}' },
      { label: 'ĵ', insert: '\\hat{j}' },
      { label: 'k̂', insert: '\\hat{k}' },
      { label: 'a⃗', insert: '\\vec{a}' },
      { label: 'b⃗', insert: '\\vec{b}' },
      { label: 'c⃗', insert: '\\vec{c}' },
      { label: 'AB⃗', insert: '\\overrightarrow{AB}' },
      { label: '∠', insert: '\\angle' },
      { label: '⊥', insert: '\\perp' },
      { label: '∥', insert: '\\parallel' },
      { label: '△', insert: '\\triangle' },
      { label: '□', insert: '\\square' },
      { label: '○', insert: '\\circ' },
      { label: '≅', insert: '\\cong' },
      { label: '∼', insert: '\\sim' },
      { label: '∝', insert: '\\propto' },
    ],
  },
  {
    id: 'matrices',
    label: 'Matrices',
    symbols: [
      {
        label: '( )',
        insert: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
        title: '2×2 matrix',
      },
      {
        label: '| |',
        insert: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
        title: 'Determinant 2×2',
      },
      {
        label: '3×3 | |',
        insert:
          '\\begin{vmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{vmatrix}',
        title: 'Determinant 3×3',
      },
      {
        label: '[ ]',
        insert: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
        title: 'Bracket matrix',
      },
      {
        label: 'cases',
        insert: '\\begin{cases} x & \\text{if } x \\geq 0 \\\\ -x & \\text{if } x < 0 \\end{cases}',
        title: 'Piecewise function',
      },
      { label: 'Aᵀ', insert: 'A^{T}', title: 'Transpose' },
      { label: 'A⁻¹', insert: 'A^{-1}', title: 'Inverse' },
      { label: '‖v‖', insert: '\\| \\vec{v} \\|', title: 'Vector norm' },
      { label: 'a·b', insert: '\\vec{a} \\cdot \\vec{b}', title: 'Dot product' },
      { label: 'a×b', insert: '\\vec{a} \\times \\vec{b}', title: 'Cross product' },
    ],
  },
]

/** Flat list (all math buttons) — for tests or exports */
export const MATH_SYMBOLS = MATH_SYMBOL_GROUPS.flatMap((g) => g.symbols)

/** @type {{ id: string, label: string, symbols: MathSymbol[] }[]} */
export const CHEMISTRY_SYMBOL_GROUPS = [
  {
    id: 'reactions',
    label: 'Reactions',
    symbols: [
      { label: '→', insert: '\\ce{->}', title: 'Reaction arrow' },
      { label: '⇌', insert: '\\ce{<=>}', title: 'Equilibrium' },
      { label: '↑', insert: '\\ce{^}', title: 'Gas evolved' },
      { label: '↓', insert: '\\ce{v}', title: 'Precipitate' },
      { label: '+', insert: '+', title: 'Plus (reactants)' },
      { label: '−', insert: '-', title: 'Minus' },
      { label: 'Δ', insert: '\\Delta', title: 'Heat / delta' },
      { label: 'hν', insert: 'h\\nu', title: 'Light' },
    ],
  },
  {
    id: 'formulas',
    label: 'Common formulas',
    symbols: [
      { label: 'H₂O', insert: '\\ce{H2O}', title: 'Water' },
      { label: 'H₂SO₄', insert: '\\ce{H2SO4}', title: 'Sulphuric acid' },
      { label: 'HCl', insert: '\\ce{HCl}', title: 'Hydrochloric acid' },
      { label: 'NaOH', insert: '\\ce{NaOH}', title: 'Sodium hydroxide' },
      { label: 'CH₄', insert: '\\ce{CH4}', title: 'Methane' },
      { label: 'NH₃', insert: '\\ce{NH3}', title: 'Ammonia' },
      { label: 'CO₂', insert: '\\ce{CO2}', title: 'Carbon dioxide' },
      { label: 'O₂', insert: '\\ce{O2}', title: 'Oxygen' },
      { label: 'NaCl', insert: '\\ce{NaCl}', title: 'Sodium chloride' },
      { label: 'CaCO₃', insert: '\\ce{CaCO3}', title: 'Calcium carbonate' },
      { label: 'H₂', insert: '\\ce{H2}', title: 'Hydrogen gas' },
      { label: 'N₂', insert: '\\ce{N2}', title: 'Nitrogen' },
    ],
  },
  {
    id: 'ions',
    label: 'Ions',
    symbols: [
      { label: 'Fe²⁺', insert: '\\ce{Fe^{2+}}', title: 'Iron(II) ion' },
      { label: 'Fe³⁺', insert: '\\ce{Fe^{3+}}', title: 'Iron(III) ion' },
      { label: 'Cu²⁺', insert: '\\ce{Cu^{2+}}', title: 'Copper(II)' },
      { label: 'SO₄²⁻', insert: '\\ce{SO4^{2-}}', title: 'Sulphate ion' },
      { label: 'NO₃⁻', insert: '\\ce{NO3-}', title: 'Nitrate ion' },
      { label: 'OH⁻', insert: '\\ce{OH-}', title: 'Hydroxide' },
      { label: 'H⁺', insert: '\\ce{H+}', title: 'Proton' },
      { label: 'Cl⁻', insert: '\\ce{Cl-}', title: 'Chloride' },
      { label: 'NH₄⁺', insert: '\\ce{NH4+}', title: 'Ammonium' },
      { label: 'MnO₄⁻', insert: '\\ce{MnO4-}', title: 'Permanganate' },
    ],
  },
  {
    id: 'units',
    label: 'Units & thermo',
    symbols: [
      { label: 'mol/L', insert: '\\pu{mol L^{-1}}', title: 'Molarity unit' },
      { label: 'g/mol', insert: '\\pu{g mol^{-1}}', title: 'Molar mass unit' },
      { label: 'atm', insert: '\\pu{atm}', title: 'Pressure' },
      { label: 'pH', insert: '\\mathrm{pH}', title: 'pH' },
      { label: 'Kc', insert: 'K_c', title: 'Equilibrium constant' },
      { label: 'Kw', insert: 'K_w', title: 'Ion product of water' },
      { label: 'ΔH', insert: '\\Delta H', title: 'Enthalpy change' },
      { label: 'ΔG', insert: '\\Delta G', title: 'Gibbs energy' },
      { label: 'ΔS', insert: '\\Delta S', title: 'Entropy change' },
      { label: 'ce{}', insert: '\\ce{}', title: 'Empty mhchem wrapper' },
    ],
  },
]

/** Flat chemistry list — for tests / backwards compatibility */
export const CHEMISTRY_SYMBOLS = CHEMISTRY_SYMBOL_GROUPS.flatMap((g) => g.symbols)

/**
 * @param {string} value
 * @param {string} insert
 * @param {number} start
 * @param {number} end
 */
export function insertIntoField(value, insert, start, end) {
  const wrapped =
    insert === '\n' ? '\n' : insert.includes('\\') ? `$${insert}$` : insert
  const before = value.slice(0, start)
  const after = value.slice(end)
  const next = before + wrapped + after
  const cursor = before.length + wrapped.length
  return { value: next, cursor }
}

/** @param {{ symbols: MathSymbol[], onInsert: (s: string) => void, disabled?: boolean, groupId?: string }} props */
function SymbolRow({ symbols, onInsert, disabled, groupId = 'row' }) {
  return (
    <div className="math-symbol-buttons">
      {symbols.map((s, i) => (
        <button
          key={`${groupId}-${s.label}-${i}`}
          type="button"
          className="math-symbol-btn"
          disabled={disabled}
          title={s.title ?? `Insert ${s.insert}`}
          onClick={() => onInsert(s.insert)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Expandable math / chemistry insert panel.
 * @param {{ onInsert: (s: string) => void, disabled?: boolean, defaultOpen?: boolean, showCheatSheet?: boolean }} props
 */
export default function MathSymbolBar({ onInsert, disabled, defaultOpen = false, showCheatSheet = false }) {
  const [panelOpen, setPanelOpen] = useState(defaultOpen)
  const [mainTab, setMainTab] = useState(/** @type {'math' | 'chem'} */ ('math'))
  const [openGroup, setOpenGroup] = useState(/** @type {string | null} */ ('basic'))

  const groups = mainTab === 'math' ? MATH_SYMBOL_GROUPS : CHEMISTRY_SYMBOL_GROUPS

  useEffect(() => {
    if (disabled) return
    const onKeyDown = (e) => {
      // Ctrl+E opens/closes the panel for fast symbol insertion in question editor fields.
      // (We only intercept when Ctrl is held, to avoid breaking normal browser shortcuts.)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setPanelOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled])

  return (
    <div className={`math-symbol-panel${panelOpen ? ' is-open' : ''}`}>
      <div className="math-symbol-panel-head">
        <button
          type="button"
          className="math-symbol-panel-toggle"
          aria-expanded={panelOpen}
          disabled={disabled}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="math-symbol-panel-title">Symbols</span>
          <span className="math-symbol-panel-sub">
            Math &amp; chemistry — click a field first, then insert · shortcut Ctrl+E
          </span>
          <span className="math-symbol-panel-chevron" aria-hidden>
            {panelOpen ? '▾' : '▸'}
          </span>
        </button>
      </div>

      {panelOpen && (
        <div className="math-symbol-panel-body">
          {showCheatSheet ? (
            <div className="math-symbol-cheatsheet" aria-label="Typing shortcuts">
              <strong>Quick tips:</strong> click stem / option / solution first ·{' '}
              <kbd>Ctrl+E</kbd> toggle this panel · inserts wrap in <code>$…$</code> · use ↵ for a new
              line · fraction template <code>{'\\frac{a}{b}'}</code> · Greek / calc tabs below
            </div>
          ) : null}
          <div className="math-symbol-tabs" role="tablist" aria-label="Symbol categories">
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === 'math'}
              className={`math-symbol-tab${mainTab === 'math' ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => {
                setMainTab('math')
                setOpenGroup('basic')
              }}
            >
              Math
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainTab === 'chem'}
              className={`math-symbol-tab${mainTab === 'chem' ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => {
                setMainTab('chem')
                setOpenGroup('reactions')
              }}
            >
              Chemistry
            </button>
          </div>

          <div className="math-symbol-accordions">
            {groups.map((group) => {
              const open = openGroup === group.id
              return (
                <div
                  key={group.id}
                  className={`math-symbol-accordion${open ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="math-symbol-accordion-head"
                    aria-expanded={open}
                    disabled={disabled}
                    onClick={() => setOpenGroup(open ? null : group.id)}
                  >
                    <span>{group.label}</span>
                    <span aria-hidden>{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <div className="math-symbol-accordion-body">
                      <SymbolRow
                        symbols={group.symbols}
                        onInsert={onInsert}
                        disabled={disabled}
                        groupId={group.id}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="form-hint math-symbol-hint">
            Inserts wrap LaTeX in <code>$…$</code>. Line break = <strong>↵</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
