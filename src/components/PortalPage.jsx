/**
 * Professional page shell for Teacher, School, Upload, and Admin pages.
 * @param {{
 *   role?: 'student' | 'teacher' | 'upload' | 'school' | 'admin' | 'platform',
 *   eyebrow?: string,
 *   title: string,
 *   subtitle?: string,
 *   actions?: import('react').ReactNode,
 *   children: import('react').ReactNode,
 *   className?: string,
 * }} props
 */
export default function PortalPage({
  role = 'platform',
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className = '',
}) {
  return (
    <div className={`portal-page portal-page--${role} ${className}`.trim()}>
      <header className="portal-page-hero">
        <div className="portal-page-hero-glow" aria-hidden="true" />
        <div className="portal-page-hero-main">
          {eyebrow && <span className="portal-eyebrow">{eyebrow}</span>}
          <span className={`portal-role-badge portal-role-${role}`}>{roleLabel(role)}</span>
          <h1>{title}</h1>
          {subtitle && <p className="portal-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="portal-page-actions">{actions}</div>}
      </header>
      <div className="portal-page-body">{children}</div>
    </div>
  )
}

/** @param {string} role */
function roleLabel(role) {
  const map = {
    student: 'Student',
    teacher: 'Teacher',
    upload: 'Upload',
    school: 'School',
    admin: 'Admin',
    platform: 'Platform',
  }
  return map[role] ?? 'TestVantages'
}
