import assert from 'node:assert/strict'
import {
  countImageQueueByStatus,
  findNextPendingImage,
  isQueueableQuestionImage,
  makeImageQueueItem,
  pickQueueableImages,
  resolveImageQueueOcrStatus,
} from '../src/utils/imageUploadQueue.js'

const png = new File(['x'], 'q1.png', { type: 'image/png' })
const jpg = new File(['x'], 'q2.jpg', { type: 'image/jpeg' })
const pdf = new File(['x'], 'paper.pdf', { type: 'application/pdf' })

assert.equal(isQueueableQuestionImage(png), true)
assert.equal(isQueueableQuestionImage(pdf), false)
assert.equal(pickQueueableImages([png, pdf, jpg]).length, 2)

const a = makeImageQueueItem(png)
const b = makeImageQueueItem(jpg)
assert.equal(a.status, 'pending')
assert.ok(a.id && a.id !== b.id)

const queue = [
  { ...a, status: 'saved' },
  { ...b, status: 'pending' },
]
assert.equal(findNextPendingImage(queue)?.id, b.id)
assert.equal(countImageQueueByStatus(queue).saved, 1)
assert.equal(countImageQueueByStatus(queue).pending, 1)

assert.equal(resolveImageQueueOcrStatus({ hasContent: true }).status, 'ready')
assert.equal(
  resolveImageQueueOcrStatus({
    hasContent: true,
    lowConfidence: true,
  }).status,
  'needs_review',
)
assert.equal(
  resolveImageQueueOcrStatus({
    hasContent: true,
    cloudNote: 'AI rate limit hit — showing Local OCR backup.',
  }).status,
  'needs_review',
)
assert.equal(
  resolveImageQueueOcrStatus({ hasContent: false, errorMessage: 'No text' }).status,
  'error',
)

console.log('test-image-upload-queue: ok')
