/**
 * Smart Compose soft-validation + local polish smoke tests.
 */
import assert from 'node:assert/strict'
import {
  getComposeSoftIssues,
  localImproveStem,
  localPolishOptions,
  findComposeSimilarStems,
  formatComposeSimilarWarning,
  COMPOSE_SHORTCUTS,
} from '../src/utils/composeSmartAssist.js'

assert.ok(COMPOSE_SHORTCUTS.some((s) => s.keys.includes('Ctrl+E')))
assert.ok(COMPOSE_SHORTCUTS.some((s) => s.keys.includes('Ctrl+S')))

{
  const empty = getComposeSoftIssues({ questionType: 'single_correct', stem: '' })
  assert.equal(empty.ready, false)
  assert.ok(empty.blockers.some((b) => /stem/i.test(b)))
}

{
  const scq = getComposeSoftIssues({
    questionType: 'single_correct',
    stem: 'If $f(x)=x^2$, then $f(2)$ equals',
    options: ['2', '4', '8', '16'],
    correctIndex: 1,
    subject: 'mathematics',
    examIds: ['jee_main'],
  })
  assert.equal(scq.ready, true)
  assert.equal(scq.blockers.length, 0)
}

{
  const missingAns = getComposeSoftIssues({
    questionType: 'single_correct',
    stem: 'A sufficiently long stem for a normal bank question about vectors.',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: null,
  })
  assert.ok(missingAns.blockers.some((b) => /correct/i.test(b)))
}

{
  const ivq = getComposeSoftIssues({
    questionType: 'integer',
    stem: 'The number of positive integers n such that … is',
    correctInteger: '12',
    subject: 'mathematics',
    examIds: ['jee_main'],
  })
  assert.equal(ivq.ready, true)
}

{
  const passage = getComposeSoftIssues({
    questionType: 'passage_scq',
    stem: 'ignored',
  })
  assert.ok(passage.blockers.some((b) => /passage set/i.test(b)))
}

{
  const improved = localImproveStem('  Find   $\\alpha$  \n\n\n next  ')
  assert.ok(improved.includes('\\alpha') || improved.includes('alpha'))
  assert.ok(!/\n{3,}/.test(improved))
}

{
  const opts = localPolishOptions(['  $2\\pi$  ', '', ' 1/2 '])
  assert.equal(opts.length, 3)
  assert.ok(String(opts[0]).includes('pi') || String(opts[0]).includes('π') || opts[0].length > 0)
  assert.equal(opts[1], '')
}

{
  const bank = [
    {
      id: 'q1',
      text: 'The acceleration due to gravity on the surface of the earth is approximately',
      subject: 'physics',
      questionType: 'single_correct',
    },
  ]
  const matches = findComposeSimilarStems(
    'The acceleration due to gravity on the surface of the earth is approximately g',
    bank,
  )
  assert.ok(matches.length >= 1)
  const warn = formatComposeSimilarWarning(matches)
  assert.ok(/similar|exact|duplicate|wording/i.test(warn))
}

console.log('compose-smart-assist: ok')
