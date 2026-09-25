import { useState } from 'react'

/** Bouton « Exporter » avec menu déroulant (rapport HTML, impression, CSV). */
export default function ExportButton({ items, label = '⬇ Exporter le rapport' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="menu">
      <button
        className="btn btn--secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        {label} ▾
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
              <span aria-hidden="true">{it.icon}</span> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
