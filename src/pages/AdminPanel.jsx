import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { changeAdminCredentials, loadAdminAccount } from '../utils/auth'
import {
  downloadQuestionsCsv,
  downloadQuestionsJson,
  downloadTextFile,
} from '../utils/csvQuestions'
import { loadQuestionBank, loadUploadedQuestions } from '../utils/questionBank'
import { loadCustomTests } from '../utils/customTests'
import OcrSettingsPanel from '../components/OcrSettingsPanel'
import PlatformScaleBanner from '../components/PlatformScaleBanner.jsx'
import PlatformLivePanel from '../components/PlatformLivePanel.jsx'
import GoLiveReadiness from '../components/GoLiveReadiness.jsx'
import LaunchChecklist from '../components/LaunchChecklist.jsx'
import PortalPage from '../components/PortalPage.jsx'
import TeacherManager from '../components/TeacherManager'

export default function AdminPanel() {
  const { session, logout } = useAuth()
  const admin = loadAdminAccount()
  const questionCount = loadUploadedQuestions().length
  const customTests = loadCustomTests().length

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newEmail, setNewEmail] = useState(admin.email)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const handleCredentials = (e) => {
    e.preventDefault()
    const result = changeAdminCredentials(currentPassword, newPassword, newEmail)
    if (result.ok) {
      setMsg({ type: 'success', text: 'Credentials updated.' })
      setCurrentPassword('')
      setNewPassword('')
    } else {
      setMsg({ type: 'error', text: result.error })
    }
  }

  const exportAll = (format) => {
    const questions = loadUploadedQuestions()
    if (questions.length === 0) {
      setMsg({ type: 'error', text: 'No questions in bank to export.' })
      return
    }
    if (format === 'csv') downloadQuestionsCsv(questions)
    else downloadQuestionsJson(questions)
    setMsg({ type: 'success', text: `Exported ${questions.length} questions as ${format.toUpperCase()}.` })
  }

  const exportFullBank = () => {
    const bank = loadQuestionBank()
    const json = JSON.stringify(bank, null, 2)
    downloadTextFile(
      `testvantage-full-bank-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      'application/json',
      { label: 'Full question bank backup' },
    )
    setMsg({ type: 'success', text: 'Full bank backup downloaded (watermarked).' })
  }

  return (
    <PortalPage
      role="admin"
      className="page admin-panel-page"
      eyebrow="Platform admin"
      title="Admin settings"
      subtitle="Go-live readiness, OCR, exports, teachers, schools, and credentials — all in one place."
      actions={
        <>
          <Link to="/go-live-guide" className="btn btn-primary btn-sm">
            Go live guide (PDF)
          </Link>
          <a href="#launch-checklist" className="btn btn-ghost btn-sm">
            Launch checklist
          </a>
          <Link to="/question-bank" className="btn btn-ghost btn-sm">
            Question bank
          </Link>
        </>
      }
    >
      <div className="admin-stats-bar card">
        <div className="admin-stat">
          <strong>{questionCount}</strong>
          <span>Questions in bank</span>
        </div>
        <div className="admin-stat">
          <strong>{customTests}</strong>
          <span>Custom tests</span>
        </div>
        <div className="admin-stat">
          <strong>{session?.name ?? 'Admin'}</strong>
          <span>{session?.email}</span>
        </div>
      </div>

      <GoLiveReadiness />
      <PlatformLivePanel />
      <LaunchChecklist />
      <PlatformScaleBanner />

      <OcrSettingsPanel />

      <section className="card">
        <h2>Paper patterns (JEE Advanced &amp; more)</h2>
        <p className="form-hint">
          Define question-type counts and marking per paper — Paper 1 vs Paper 2, different years, etc.
        </p>
        <Link to="/admin/paper-patterns" className="btn btn-primary">
          Open Paper Pattern Designer
        </Link>
      </section>

      <section className="card">
        <h2>Export data</h2>
        <p className="form-hint">Download your question bank for backup or editing in Excel.</p>
        <div className="admin-action-row">
          <button type="button" className="btn btn-primary" onClick={() => exportAll('csv')}>
            Export CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => exportAll('json')}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={exportFullBank}>
            Full backup (settings + questions)
          </button>
        </div>
      </section>

      <TeacherManager />

      <section className="card">
        <h2>School Management</h2>
        <p className="form-hint">
          Classes, students, attendance, fees, timetable, exams, and reports — open the full school workspace.
        </p>
        <Link to="/admin/schools" className="btn btn-primary">
          Open School Management
        </Link>
      </section>

      <section className="card">
        <h2>Change admin password</h2>
        {msg.text && (
          <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
        )}
        <form onSubmit={handleCredentials}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New email (optional)
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </label>
          <label>
            New password (leave blank to keep)
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Update credentials
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Session</h2>
        <button type="button" className="btn btn-danger" onClick={logout}>
          Log out
        </button>
      </section>
    </PortalPage>
  )
}
