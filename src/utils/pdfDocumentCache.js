import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

/** @typedef {{ pdf: import('pdfjs-dist').PDFDocumentProxy, numPages: number }} OpenPdfResult */

/** @type {WeakMap<File, Promise<OpenPdfResult>>} */
const openCache = new WeakMap()

export const PDF_OPEN_TIMEOUT_MS = 12_000

/**
 * Parse a PDF once per File object (shared by page count + extract).
 * @param {File | Blob} file
 * @returns {Promise<OpenPdfResult>}
 */
export async function openPdfFromFile(file, signal) {
  const load = async () => {
    if (signal?.aborted) {
      const err = new Error('PDF open was cancelled.')
      err.name = 'AbortError'
      throw err
    }
    const buffer = await file.arrayBuffer()
    const task = pdfjs.getDocument({ data: buffer })
    const onAbort = () => {
      try {
        task.destroy()
      } catch {
        /* ignore */
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const pdf = await task.promise
      return { pdf, numPages: pdf.numPages }
    } finally {
      signal?.removeEventListener?.('abort', onAbort)
    }
  }

  if (!(file instanceof File)) {
    return load()
  }

  let pending = openCache.get(file)
  if (!pending) {
    pending = load().catch((e) => {
      openCache.delete(file)
      throw e
    })
    openCache.set(file, pending)
  }
  return pending
}

/**
 * Open a PDF or fail fast so Official PYQ never sits on 6% forever.
 * @param {File | Blob} file
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} [opts]
 */
export async function openPdfFromFileOrThrow(file, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : PDF_OPEN_TIMEOUT_MS
  const pending = openPdfFromFile(file, opts.signal)
  try {
    return await Promise.race([
      pending,
      new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error(
            'Could not open the PDF in time (it may be locked on OneDrive). Copy the file to the Desktop and try again. Nothing was saved.',
          )
          err.code = 'PYQ_PDF_OPEN_TIMEOUT'
          reject(err)
        }, timeoutMs)
      }),
    ])
  } catch (e) {
    if (e?.code === 'PYQ_PDF_OPEN_TIMEOUT' && file instanceof File) {
      openCache.delete(file)
    }
    throw e
  }
}

/** @param {File | Blob} file */
export async function getCachedPdfPageCount(file) {
  const { numPages } = await openPdfFromFile(file)
  return numPages
}
