import assert from 'node:assert/strict'
import {
  DEFAULT_ABILITY,
  abilityForNextSubject,
  clampAbility,
  standingFromLiveAbility,
  updateAbilityAfterItem,
} from '../src/utils/aiAdaptiveEngine.js'
import { buildAdaptivePools, enrichPoolToughness } from '../src/utils/adaptiveTest.js'
import { pickNextAiItemByAbility } from '../src/utils/aiSessionPick.js'

const pool = enrichPoolToughness([
  { id: 'e1', subject: 'physics', text: 'Easy Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, toughnessLevel: 2 },
  { id: 'm1', subject: 'physics', text: 'Med Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, toughnessLevel: 5 },
  { id: 'h1', subject: 'physics', text: 'Hard Q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, toughnessLevel: 9 },
  { id: 'e2', subject: 'physics', text: 'Easy Q2', options: ['a', 'b', 'c', 'd'], correctIndex: 0, toughnessLevel: 3 },
])

const pools = buildAdaptivePools(pool, ['physics'])

const first = pickNextAiItemByAbility(pools, 'physics', 5, new Set(), new Map())
assert.ok(first, 'picks first item')

let ability = DEFAULT_ABILITY
ability = updateAbilityAfterItem(ability, { toughnessLevel: 5 }, 'correct')
assert.ok(ability > DEFAULT_ABILITY, 'ability rises after correct')

const beforeWrong = ability
ability = updateAbilityAfterItem(ability, { toughnessLevel: 8 }, 'wrong')
assert.ok(ability < beforeWrong, 'ability falls after wrong on hard item')

const harderPick = pickNextAiItemByAbility(pools, 'physics', ability, new Set([first.id]), new Map())
assert.ok(harderPick, 'picks second item')
assert.notEqual(harderPick.id, first.id, 'second item differs')

const standing = standingFromLiveAbility(6.2, [
  { questionId: 'x', subjectId: 'physics', grade: 'correct', abilityAfter: 6.2 },
])
assert.ok(standing.levelScore >= 50, 'live standing score')
assert.ok(standing.tier, 'live standing tier')

const nextAb = abilityForNextSubject(6.5, 0.8, 'hard')
assert.ok(nextAb > DEFAULT_ABILITY, 'next subject ability seeded from section')

assert.equal(clampAbility(12), 10)
assert.equal(clampAbility(0), 1)

console.log('test-ai-adaptive-item: ok')
