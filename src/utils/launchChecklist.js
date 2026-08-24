/**
 * Printable launch checklist — phases and actionable steps.
 */

/** @typedef {{ id: string, task: string, detail?: string }} LaunchTask */

/** @typedef {{ id: string, title: string, subtitle: string, tasks: LaunchTask[] }} LaunchPhase */

/** @returns {LaunchPhase[]} */
export function getLaunchPhases() {
  return [
    {
      id: 'pilot',
      title: 'Phase 1 — Pilot (Cursor browser)',
      subtitle: 'Safe to do now at http://127.0.0.1:5173',
      tasks: [
        {
          id: 'pilot-upload',
          task: 'Upload & tag questions',
          detail: 'OCR, math symbols, passage sets, toughness, exam tags.',
        },
        {
          id: 'pilot-mock',
          task: 'Run a full mock test end-to-end',
          detail: 'Timer, palette, submit, result analysis.',
        },
        {
          id: 'pilot-school',
          task: 'Create a school, class, and assign a test',
          detail: 'Enroll a student account and confirm “Assigned to me”.',
        },
        {
          id: 'pilot-teacher',
          task: 'Teacher login & student results',
          detail: 'Verify results appear after a student submits.',
        },
        {
          id: 'pilot-backup',
          task: 'Export question bank backup',
          detail: 'Admin → Export CSV/JSON or full backup.',
        },
        {
          id: 'pilot-compress',
          task: 'Compress large question images',
          detail: 'Question bank → storage table → Compress images.',
        },
      ],
    },
    {
      id: 'prelaunch',
      title: 'Phase 2 — Before public go-live',
      subtitle: 'Required before opening to real students online',
      tasks: [
        {
          id: 'pre-https',
          task: 'HTTPS & custom domain',
          detail: 'SSL certificate and production URL (not 127.0.0.1).',
        },
        {
          id: 'pre-auth',
          task: 'Server-side login',
          detail: 'Move accounts off browser localStorage to API + database.',
        },
        {
          id: 'pre-api',
          task: 'Run API in production',
          detail: 'npm run stack:up or cloud deploy with PostgreSQL + Redis.',
        },
        {
          id: 'pre-sync',
          task: 'Online question bank sync',
          detail: 'Bank save mode → Online; verify sync panel shows live.',
        },
        {
          id: 'pre-backup-auto',
          task: 'Automated daily backups',
          detail: 'Database snapshots + question bank export schedule.',
        },
        {
          id: 'pre-monitoring',
          task: 'Health checks & error alerts',
          detail: '/api/health and /api/ready monitored in production.',
        },
      ],
    },
    {
      id: 'scale',
      title: 'Phase 3 — National scale (10 lakh+ students)',
      subtitle: 'When you are ready for very large concurrent load',
      tasks: [
        {
          id: 'scale-cdn',
          task: 'CDN for static assets',
          detail: 'Vite build on CDN; API behind load balancer.',
        },
        {
          id: 'scale-autoscale',
          task: 'Auto-scaling API servers',
          detail: 'Docker/Kubernetes or cloud auto-scale groups.',
        },
        {
          id: 'scale-redis',
          task: 'Redis exam sessions at scale',
          detail: 'Confirm REDIS_URL in production; session TTL tuned.',
        },
        {
          id: 'scale-pg',
          task: 'PostgreSQL connection pooling',
          detail: 'PgBouncer or managed DB with read replicas if needed.',
        },
        {
          id: 'scale-rate',
          task: 'Rate limiting & DDoS protection',
          detail: 'API rate limits + WAF on public endpoints.',
        },
      ],
    },
  ]
}

const STORAGE_KEY = 'testvantage_launch_checklist_v1'

/** @returns {Record<string, boolean>} */
export function loadLaunchChecks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, boolean>} checks */
export function saveLaunchChecks(checks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checks))
  } catch {
    /* quota */
  }
}
