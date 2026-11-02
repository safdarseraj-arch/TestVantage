import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const samples = [
  'is $\\frac{1}{4} \\text{CE}^2$ . is $1 / 8 \\mathrm{CE}^{2}$',
  'is $\\frac{1}{4} \\text{CE}^2$ . is 1 / 8 \\backslash \\mathrm{CE}\\}^{2}',
  'energy stored is 1/8 CE^2',
  'is $\\frac{1}{4} \\text{CE}^2$ . is 1 / 8 \\mathrm{CE}^{2}$',
]

for (const s of samples) {
  const out = prepareTextForMathTextDisplay(s)
  const bad = /\\backslash|\\mathrm\{CE\}\\\}|(?<!\$)1\s*\/\s*8(?!\$)/.test(out) && !/\$\\frac\{1\}\{8\}/.test(out)
  console.log('IN:', s)
  console.log('OUT:', out)
  console.log('ok?', !bad && /\$\\frac\{1\}\{8\}/.test(out))
  console.log('---')
}
