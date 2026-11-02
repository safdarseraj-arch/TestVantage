import { downloadPyqCsvTemplate, downloadPyqJsonTemplate } from '../utils/pyqTemplates'

/**
 * @param {{ className?: string, variant?: 'json' | 'csv' | 'both', size?: 'sm' | '' }} props
 */
export default function PyqTemplateDownloadButton({
  className = 'btn btn-ghost',
  variant = 'json',
  size = '',
}) {
  const sizeClass = size === 'sm' ? ' btn-sm' : ''
  const base = `${className}${sizeClass}`.trim()

  if (variant === 'both') {
    return (
      <span className="pyq-template-btns">
        <button type="button" className={base} onClick={downloadPyqJsonTemplate} title="JSON template for PYQ import">
          Download PYQ template (JSON)
        </button>
        <button type="button" className={`${base} btn-ghost`} onClick={downloadPyqCsvTemplate} title="CSV template for PYQ import">
          CSV
        </button>
      </span>
    )
  }

  const onClick = variant === 'csv' ? downloadPyqCsvTemplate : downloadPyqJsonTemplate
  const label =
    variant === 'csv' ? 'Download PYQ template (CSV)' : 'Download PYQ template'

  return (
    <button
      type="button"
      className={base}
      onClick={onClick}
      title="Template includes TestVantages watermark metadata. Fill in your PYQs and import on the PYQ page (admin)."
    >
      {label}
    </button>
  )
}
