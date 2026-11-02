import { getTestType } from '../data/testTypes'

export default function TestTypeCard({ typeId, selected, onSelect }) {
  const type = getTestType(typeId)
  return (
    <button
      type="button"
      className={`type-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(type.id)}
    >
      <span className="type-icon">{type.icon}</span>
      <span className="type-name">{type.name}</span>
      <span className="type-desc">{type.description}</span>
    </button>
  )
}
