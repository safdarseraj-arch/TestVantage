import { useState } from 'react'
import { ocrEngineBadgeLabel } from '../utils/cloudVisionClient.js'
import { solutionBadgeLabel } from '../utils/answerProvenance.js'

/**
 * Shows AI Upload Assist steps and quality score after OCR.
 * @param {{
 *   report: {
 *     detectedType?: string
 *     confidence?: number
 *     readyToSave?: boolean
 *     needsReview?: boolean
 *     bannerTone?: 'ok'|'warn'|'bad'
 *     steps?: string[]
 *     issues?: { severity: string, message: string, id?: string }[]
 *     summary?: string
 *     needsAgentRepair?: boolean
 *     repairTicketText?: string
 *     escalationSummary?: string
 *     answerSource?: string
 *     solutionSource?: string
 *     ocrEngine?: string
 *     fieldConfidence?: { overall?: number, needsManualCheck?: boolean, lowConfidenceFields?: string[] }
 *     fixActions?: { label: string }[]
 *     needsReExtract?: boolean
 *   } | null
 *   onDismiss?: () => void
 * }} props
 */
export default function AiUploadAssistBanner({ report, onDismiss }) {
  const [copied, setCopied] = useState(false)

  if (!report) return null

  const tone =
    report.bannerTone ??
    (report.needsAgentRepair
      ? 'bad'
      : report.needsReview
        ? 'warn'
        : report.readyToSave
          ? 'ok'
          : report.confidence >= 55
            ? 'warn'
            : 'bad')
  const errors = (report.issues ?? []).filter((i) => i.severity === 'error')
  const warns = (report.issues ?? []).filter((i) => i.severity === 'warn')

  const copyRepairTicket = async () => {
    const text = report.repairTicketText?.trim()
    if (!text) return
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /* clipboard blocked */
    }
  }

  const answerBadge =
    report.answerSource === 'from_paper'
      ? 'From paper'
      : report.answerSource === 'ai_generated'
        ? 'AI-generated'
        : null

  const solutionBadge =
    report.solutionSource && report.solutionSource !== 'unknown'
      ? solutionBadgeLabel(report.solutionSource)
      : null

  return (
    <div className={`ai-upload-assist ai-upload-assist--${tone}`}>
      <div className="ai-upload-assist-head">
        <div>
          <strong>AI Upload Assist</strong>
          {report.needsReview && !report.readyToSave && (
            <span className="ai-upload-assist-flag">Review before Save</span>
          )}
          {report.ocrEngine && (
            <span
              className={`ai-upload-assist-flag ai-upload-assist-flag--${
                report.ocrEngine === 'cloud-vision' ? 'cloud' : 'local'
              }`}
            >
              {ocrEngineBadgeLabel(report.ocrEngine)}
            </span>
          )}
          {answerBadge && (
            <span className={`ai-upload-assist-flag ai-upload-assist-flag--${report.answerSource}`}>
              Answer: {answerBadge}
            </span>
          )}
          {solutionBadge && (
            <span className={`ai-upload-assist-flag ai-upload-assist-flag--${report.solutionSource}`}>
              Solution: {solutionBadge}
            </span>
          )}
          {report.fieldConfidence?.needsManualCheck && (
            <span className="ai-upload-assist-flag">Low-confidence fields</span>
          )}
          <span className="ai-upload-assist-score">{report.confidence ?? 0}/100</span>
        </div>
        {onDismiss && !report.needsReview && !report.needsAgentRepair && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      {report.summary && <p className="form-hint ai-upload-assist-summary">{report.summary}</p>}
      {report.needsReview && !report.needsAgentRepair && errors.length > 0 && (
        <p className="form-hint ai-upload-assist-review-msg">
          AI found {errors.length} problem(s) with this upload — fix or review before Save.
        </p>
      )}
      {report.needsAgentRepair && (
        <div className="ai-upload-assist-escalate">
          <p className="form-hint ai-upload-assist-escalate-msg">
            {report.escalationSummary ||
              'Auto-repair could not fully fix this upload. Copy the report and paste it in Cursor chat.'}
          </p>
          {report.repairTicketText && (
            <button type="button" className="btn btn-primary btn-sm" onClick={copyRepairTicket}>
              {copied ? 'Copied — paste in Cursor chat' : 'Copy for Cursor repair'}
            </button>
          )}
        </div>
      )}
      {report.fixActions?.length > 0 && (
        <p className="form-hint ai-upload-assist-actions">
          Suggested fixes: {report.fixActions.slice(0, 4).map((a) => a.label).join(' · ')}
        </p>
      )}
      {report.needsReExtract && (
        <p className="form-hint ai-upload-assist-reextract">
          Low OCR confidence — use **Re-extract OCR** for a second local pass (LaTeX boost).
        </p>
      )}
      {report.steps?.length > 0 && (
        <ul className="ai-upload-assist-steps">
          {report.steps.slice(0, 6).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="ai-upload-assist-issues">
          {errors.slice(0, 5).map((i) => (
            <li key={i.id ?? i.message}>{i.message}</li>
          ))}
        </ul>
      )}
      {warns.length > 0 && (
        <ul className="ai-upload-assist-warns">
          {warns.slice(0, 3).map((i) => (
            <li key={i.id ?? i.message}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
