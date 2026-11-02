import {
  fixDoubleEscapedLatex,
  fixArrayBoxProduct,
  fixScalarTripleBoxProduct,
  fixUnmatchedMathDollars,
  wrapBareLatexSegments,
  fixUnclosedMathDelimiter,
  promoteDisplayMathBlocks,
  wrapBareLatexOutsideDollars,
} from '../src/utils/prepareMathForRender.js'

const stem =
  'If $\\vec{a}, \\vec{b}, \\vec{c}$ are such that $\\vec{a}+2 \\vec{b}+3 \\vec{c}=0$, then $$\\left[\\begin{matrix}\\vec{a}\\times\\vec{b} & \\vec{b}\\times\\vec{c} & \\vec{c}\\times\\vec{a}\\end{matrix}\\right]$$ is equal to'

const c = `${stem}\n(C) $$1$`

const steps = [
  ['fixDoubleEscapedLatex', fixDoubleEscapedLatex],
  ['fixArrayBoxProduct', fixArrayBoxProduct],
  ['fixScalarTripleBoxProduct', fixScalarTripleBoxProduct],
  ['fixUnmatchedMathDollars', fixUnmatchedMathDollars],
  ['wrapBareLatexSegments', wrapBareLatexSegments],
  ['fixUnclosedMathDelimiter', fixUnclosedMathDelimiter],
  ['promoteDisplayMathBlocks', promoteDisplayMathBlocks],
  ['wrapBareLatexOutsideDollars', wrapBareLatexOutsideDollars],
]

let out = c
for (const [name, fn] of steps) {
  process.stdout.write(`${name}... `)
  const next = fn(out)
  console.log('ok', next.length)
  out = next
}

console.log('final tail:', out.slice(-50))
