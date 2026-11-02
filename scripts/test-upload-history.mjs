import {
  formatUploadDuration,
  formatUploadHistoryWhen,
  labelUploadHistoryMode,
  uploadHistoryTone,
} from '../src/utils/uploadHistory.js'

const sample = {
  at: new Date().toISOString(),
  mode: 'single',
  fileName: 'sample-mcq.png',
  found: 4,
  confidence: 82,
  readyToSave: true,
  needsReview: false,
  needsAgentRepair: false,
  durationMs: 4200,
}

if (labelUploadHistoryMode(sample) !== 'Single MCQ') throw new Error('mode label')
if (uploadHistoryTone(sample) !== 'ok') throw new Error('tone ok')
if (!formatUploadHistoryWhen(sample.at).includes('now')) throw new Error('when format')
if (formatUploadDuration(4200) !== '4.2 s') throw new Error('duration format')
if (uploadHistoryTone({ ...sample, needsReview: true }) !== 'warn') throw new Error('warn tone')
if (uploadHistoryTone({ ...sample, needsAgentRepair: true }) !== 'bad') throw new Error('bad tone')

console.log('test-upload-history: ok')
