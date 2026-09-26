import { useState } from 'react'
import Icon, { type IconName } from './Icon'

export interface ExportItem {
  icon?: IconName
  label: string
  onClick: () => void
}

/** Bouton « Exporter » avec menu déroulant (rapport HTML, impression, CSV). */
export default function ExportButton({ items, label = 'Exporter le rapport' }: { items: ExportItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="menu">
      <button
        className="btn btn--secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <Icon name="download" /> {label}
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
            >
              {it.icon && <Icon name={it.icon} />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
