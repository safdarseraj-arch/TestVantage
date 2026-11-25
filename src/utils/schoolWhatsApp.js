/**
 * Local MVP WhatsApp helpers — wa.me deep links + copy text.
 * No Twilio / Meta Business API; staff opens WhatsApp and sends themselves.
 */

export const WHATSAPP_CONSENT_NOTE =
  'Only message families who agreed to school WhatsApp updates. This opens WhatsApp on your device — TestVantages does not send the message for you.'

/** @param {string} text */
export function buildWhatsAppHref(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`
}

/**
 * @param {{
 *   studentName?: string
 *   title?: string
 *   amount?: number
 *   dueDate?: string
 *   schoolName?: string
 * }} opts
 */
export function feeReminderMessage({
  studentName = 'your ward',
  title = 'school fee',
  amount = 0,
  dueDate = '',
  schoolName = 'our school',
} = {}) {
  const lines = [
    `Hello, this is a fee reminder from ${schoolName}.`,
    '',
    `Student: ${studentName}`,
    `Fee: ${title}`,
    `Amount: ₹${Number(amount || 0).toLocaleString('en-IN')}`,
  ]
  if (dueDate) lines.push(`Due date: ${dueDate}`)
  lines.push(
    '',
    'Please clear dues at the school office or the usual payment channel.',
    '',
    '— Sent via TestVantages (staff copy). Only share with families who consented.',
  )
  return lines.join('\n')
}

/**
 * @param {{
 *   studentName?: string
 *   className?: string
 *   date?: string
 *   schoolName?: string
 * }} opts
 */
export function absenceReminderMessage({
  studentName = 'your ward',
  className = 'class',
  date = '',
  schoolName = 'our school',
} = {}) {
  const lines = [
    `Hello, this is an attendance note from ${schoolName}.`,
    '',
    `Student: ${studentName}`,
    `Class: ${className}`,
  ]
  if (date) lines.push(`Date: ${date}`)
  lines.push(
    'Status: marked absent.',
    '',
    'Please confirm with the class teacher if this was unexpected.',
    '',
    '— Sent via TestVantages (staff copy). Only share with families who consented.',
  )
  return lines.join('\n')
}

/**
 * @param {string} text
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function copyWhatsAppText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return { ok: true }
    }
    return { ok: false, error: 'Clipboard not available — select and copy manually.' }
  } catch {
    return { ok: false, error: 'Could not copy — select and copy manually.' }
  }
}
