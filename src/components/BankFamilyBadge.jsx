import { questionFamilyBadge } from '../utils/questionFamily.js'

/**
 * Parent / similar C1 / replica chip for bank lists.
 * @param {{ question: import('../data/tests').Question }} props
 */
export default function BankFamilyBadge({ question }) {
  const badge = questionFamilyBadge(question)
  if (!badge) return null
  return (
    <span
      className={`bank-family-badge bank-family-badge-${badge.kind}`}
      title={
        badge.kind === 'original'
          ? 'Parent question — similar drafts use this ID plus C1, C2… (PYQ parents keep A/J/N + year, then C1)'
          : badge.kind === 'replica'
            ? 'AI replica paper question (draft until published). Not Official PYQ.'
            : 'Similar child of a parent question. Never pair with its original in the same paper.'
      }
    >
      {badge.label}
    </span>
  )
}
