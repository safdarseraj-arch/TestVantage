import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Prompt when guest tries to post; children render for logged-in users */
export default function RegisteredGate({ children, action = 'post' }) {
  const { isLoggedIn } = useAuth()

  if (isLoggedIn) return children

  return (
    <div className="card registered-gate">
      <p>
        <strong>Sign in required</strong> — only registered users can {action}.
      </p>
      <Link to="/login" state={{ from: '/doubts' }} className="btn btn-primary btn-sm">
        Login / Register
      </Link>
    </div>
  )
}
