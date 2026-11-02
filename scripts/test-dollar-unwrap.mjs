import { fixRunawayInlineMath, repairGluedEnglishProse } from '../src/utils/fixRunawayInlineMath.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { prepareTextForMathTextDisplay } from '../src/utils/prepareMathForRender.js'

const s = '$and the angle between$'
console.log('fixRunaway:', fixRunawayInlineMath(s))
console.log('normalize:', normalizeQuestionStemText(s))
console.log('prepare:', prepareTextForMathTextDisplay(normalizeQuestionStemText(s)))

const glued = 'andtheanglebetween'
console.log('repair glued:', repairGluedEnglishProse(glued))
console.log('glued norm:', normalizeQuestionStemText(glued))
