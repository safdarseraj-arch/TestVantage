import { Navigate } from 'react-router-dom'

/** @deprecated Bookmark alias — canonical hub is /prepare */
export default function PrepHub() {
  return <Navigate to="/prepare" replace />
}
