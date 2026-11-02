/**
 * One canonical upload URL for every entry point (teacher hub, lecture, admin,
 * create-paper pick, shortcuts). Context query params are OK; the path/UI is identical.
 */

export const CANONICAL_UPLOAD_HUB = '/question-bank'
export const CANONICAL_UPLOAD_PATH = '/question-bank?hub=upload'

/** @typedef {'compose' | 'single' | 'hybrid' | 'pdf-crop' | 'file' | 'jee-test' | 'bulk' | 'json' | 'csv'} UploadTab */

export const COMPOSE_QUESTION_PATH = '/question-bank?hub=upload&tab=compose'

/**
 * Build the shared Question Bank upload URL.
 * @param {{
 *   tab?: UploadTab | string | null
 *   source?: string | null
 *   type?: string | null
 *   owner?: 'teacher' | string | null
 *   from?: string | null
 *   edit?: string | null
 * }} [opts]
 */
export function questionBankUploadUrl(opts = {}) {
  const params = new URLSearchParams()
  params.set('hub', 'upload')
  const tab = String(opts.tab ?? '').trim()
  if (tab) params.set('tab', tab)
  const source = String(opts.source ?? '').trim()
  if (source) params.set('source', source)
  const type = String(opts.type ?? '').trim()
  if (type) params.set('type', type)
  const owner = String(opts.owner ?? '').trim()
  if (owner) params.set('owner', owner)
  const from = String(opts.from ?? '').trim()
  if (from) params.set('from', from)
  const edit = String(opts.edit ?? '').trim()
  if (edit) params.set('edit', edit)
  return `${CANONICAL_UPLOAD_HUB}?${params.toString()}`
}

/** Teacher hub / lecture shortcuts — same convert pipeline, optional context. */
export function teacherUploadLinks({ source = '', from = 'teacher' } = {}) {
  const base = { owner: 'teacher', from, source: source || undefined }
  return {
    root: questionBankUploadUrl(base),
    compose: questionBankUploadUrl({ ...base, tab: 'compose' }),
    bulk: questionBankUploadUrl({ ...base, tab: 'bulk' }),
    image: questionBankUploadUrl({ ...base, tab: 'single' }),
    pdf: questionBankUploadUrl({ ...base, tab: 'file' }),
    pdfCrop: questionBankUploadUrl({ ...base, tab: 'pdf-crop' }),
    csv: questionBankUploadUrl({ ...base, tab: 'csv' }),
    json: questionBankUploadUrl({ ...base, tab: 'json' }),
  }
}
