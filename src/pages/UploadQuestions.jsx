import { Navigate } from 'react-router-dom'
import { questionBankUploadUrl } from '../utils/questionBankUploadRoutes.js'

/**
 * Legacy page — all uploads use the shared Question Bank convert hub.
 */
export default function UploadQuestions() {
  return <Navigate to={questionBankUploadUrl({ tab: 'single' })} replace />
}
