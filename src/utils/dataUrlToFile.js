/**
 * Turn a stored bank image (data URL) into a File for the OCR pipeline.
 * @param {string} dataUrl
 * @param {string} [fileName]
 * @returns {Promise<File>}
 */
export async function dataUrlToFile(dataUrl, fileName = 'bank-image.png') {
  const url = String(dataUrl ?? '').trim()
  if (!url.startsWith('data:')) {
    throw new Error('Not a stored image — re-upload or crop again.')
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not read stored image.')
  const blob = await res.blob()
  const type = blob.type?.startsWith('image/') ? blob.type : 'image/png'
  return new File([blob], fileName, { type })
}
