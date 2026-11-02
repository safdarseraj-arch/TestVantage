import './utils/mapPolyfill.js'
import { redirectLocalhostTo127 } from './utils/bankOriginRedirect.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './styles/advanced.css'
import './styles/testvantage-theme.css'
import './styles/class-one-template.css'
import './styles/portal-pages.css'
import './styles/student-insights.css'
import './styles/student-portal.css'
import './styles/prepare-hub.css'
import './styles/quick-revision.css'
import './styles/student-insights-portal.css'
import './styles/student-experience-pro.css'
import './styles/result-question-wise.css'
import './styles/bank-review.css'
import './styles/site-map.css'
import './styles/school-portal.css'
import './styles/go-live-guide.css'
import './styles/compete-habit.css'
import './styles/form-forecast.css'
import './styles/landing-pages.css'
import './styles/onboarding-profile.css'

const rootEl = document.getElementById('root')

function showBootError(message, detail = '') {
  if (!rootEl) return
  rootEl.innerHTML = `
    <div class="page boot-error-page" style="max-width:640px;margin:2rem auto;padding:2rem">
      <h1 style="color:#0f172a">TestVantages could not start</h1>
      <p style="color:#64748b">Press <strong>Ctrl+Shift+R</strong> to refresh. Keep the bottom terminal open (F5 or Ctrl+Shift+B to start).</p>
      <pre class="boot-error-pre" style="background:#fef2f2;color:#991b1b;padding:1rem;border-radius:8px;overflow:auto">${message}${detail ? `\n\n${detail}` : ''}</pre>
    </div>
  `
}

async function boot() {
  if (!rootEl) {
    console.error('Missing #root element')
    return
  }

  if (redirectLocalhostTo127()) return

  try {
    const { default: App } = await import('./App.jsx')
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>,
    )
    import('./utils/careerCompassBrain.js')
      .then((m) => m.scheduleCareerCompassBackgroundRefresh())
      .catch(() => {})
    import('./utils/examPulseBrain.js')
      .then((m) => m.scheduleExamPulseBackgroundRefresh())
      .catch(() => {})
  } catch (err) {
    console.error('TestVantages boot failed', err)
    showBootError(
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err.stack : '',
    )
  }
}

boot()
