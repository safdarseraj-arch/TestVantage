import { Link } from 'react-router-dom'
import PaperPatternDesigner from '../components/PaperPatternDesigner'

export default function PaperPatterns() {
  return (
    <div className="page paper-patterns-page">
      <div className="section-header">
        <div>
          <h1>Paper pattern designer</h1>
        </div>
        <Link to="/admin" className="btn btn-ghost btn-sm">
          ← Admin
        </Link>
      </div>
      <PaperPatternDesigner />
    </div>
  )
}
