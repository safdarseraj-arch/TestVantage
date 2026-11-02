import { Link } from 'react-router-dom'
import { examPath } from '../utils/examNavigation.js'
import {
  getNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../utils/studentNotifications.js'

/**
 * @param {{ userId?: string, compact?: boolean }} props
 */
export default function StudentNotificationsBanner({ userId, compact = false }) {
  if (!userId) return null

  const all = getNotificationsForUser(userId)
  const unread = all.filter((n) => !n.read)
  if (!unread.length) return null

  const items = compact ? unread.slice(0, 3) : unread.slice(0, 8)

  return (
    <div className="student-notif-banner card" role="status">
      <div className="student-notif-head">
        <strong>
          {unread.length} new test assignment{unread.length === 1 ? '' : 's'}
        </strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => markAllNotificationsRead(userId)}>
          Mark all read
        </button>
      </div>
      <ul className="student-notif-list">
        {items.map((n) => (
          <li key={n.id}>
            <div>
              <strong>{n.testTitle}</strong>
              <span className="form-hint"> — {n.className}</span>
              {n.dueAt && (
                <span className="form-hint"> · Due {new Date(n.dueAt).toLocaleDateString()}</span>
              )}
            </div>
            <Link
              to={`/exam/${n.testId}`}
              className="btn btn-primary btn-sm"
              onClick={() => markNotificationRead(n.id)}
            >
              Start test
            </Link>
          </li>
        ))}
      </ul>
      <p className="form-hint student-notif-hint">
        Exam link: <a href={examPath(items[0]?.testId)}>{examPath(items[0]?.testId)}</a>
      </p>
    </div>
  )
}
