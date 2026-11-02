import assert from 'node:assert/strict'
import { resolveMathOcrDevice } from '../src/utils/mathOcrPipeline.js'

assert.equal(resolveMathOcrDevice('wasm'), 'wasm')
assert.equal(resolveMathOcrDevice('webgpu'), 'webgpu')
assert.equal(resolveMathOcrDevice('auto'), 'wasm', 'Node has no navigator.gpu')

console.log('test-math-ocr-device: ok')
