import { useEffect, useRef, useState } from 'react'
import {
  CRITICALITY_BY_ID,
  GAP_STATUS_BY_ID,
  REMEDIATION_STATUS_BY_ID,
  REMEDIATION_TYPE_BY_ID,
} from '../data/constants.js'
import { useCompliance } from '../store/ComplianceContext.jsx'

export function CriticalityBadge({ value }) {
  const c = CRITICALITY_BY_ID[value]
  if (!c) return null
  return <span className={`badge badge--${c.tone}`}>{c.label}</span>
}

export function CriticalityDot({ value }) {
  const c = CRITICALITY_BY_ID[value]
  return <span className={`dot dot--${c?.tone}`} aria-hidden="true" />
}

export function StatusBadge({ value }) {
  const s = GAP_STATUS_BY_ID[value]
  if (!s) return null
  return (
    <span className={`badge badge--${s.tone}`}>
      {value === 'validee' && '✓ '}
      {s.label}
    </span>
  )
}

export function RemStatusBadge({ value }) {
  const s = REMEDIATION_STATUS_BY_ID[value]
  return s ? <span className={`badge badge--${s.tone}`}>{s.label}</span> : null
}

export function RemTypeBadge({ value }) {
  const t = REMEDIATION_TYPE_BY_ID[value]
  return t ? (
    <span className="badge badge--outline">
      <span aria-hidden="true">{t.icon}</span> {t.label}
    </span>
  ) : null
}

export function LateBadge({ label = 'En retard' }) {
  return <span className="badge badge--error">⚠ {label}</span>
}

export function Progress({ value, label = true, success }) {
  const done = success ?? value >= 100
  return (
    <div className="progress-inline" title={`${value} %`}>
      <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={`progress__bar ${done ? 'progress__bar--success' : ''}`} style={{ width: `${value}%` }} />
      </div>
      {label && <span className="small num nowrap">{value} %</span>}
    </div>
  )
}

export function Avatar({ user, size }) {
  if (!user) return null
  return (
    <span className={`avatar ${size === 'sm' ? 'avatar--sm' : ''}`} title={`${user.name} — ${user.title}`}>
      {user.initials}
    </span>
  )
}

export function UserName({ id, withAvatar }) {
  const { state } = useCompliance()
  const u = state.users.find((x) => x.id === id)
  if (!u) return <span className="muted">—</span>
  if (!withAvatar) return <span>{u.name}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Avatar user={u} size="sm" /> {u.name}
    </span>
  )
}

export function Modal({ title, onClose, children, size }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector('input, select, textarea, button:not(.modal__close)')
    first?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'sm' ? 'modal--sm' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmer', tone = 'primary', withComment, commentLabel, onConfirm, onClose }) {
  const [comment, setComment] = useState('')
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="small" style={{ marginBottom: 16 }}>
        {message}
      </div>
      {withComment && (
        <div className="field">
          <label htmlFor="confirm-comment">{commentLabel ?? 'Commentaire'}</label>
          <textarea id="confirm-comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn--secondary" onClick={onClose}>
          Annuler
        </button>
        <button className={`btn btn--${tone}`} onClick={() => onConfirm(comment)}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Menu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className="btn btn--ghost btn--icon" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              title={it.title}
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

export function EmptyState({ icon = '📭', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

export function Toasts() {
  const { toasts, dismissToast } = useCompliance()
  const icon = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{icon[t.tone]}</span>
          <span>{t.message}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Fermer la notification">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Anneau de progression unique (une seule valeur : pas de légende nécessaire). */
export function Donut({ value, size = 180, stroke = 18, label = 'conformité' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = value >= 80 ? 'var(--success)' : value >= 50 ? 'var(--primary-700)' : 'var(--accent)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score global : ${value} %`}>
      <title>{`Score global pondéré : ${value} %`}</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--neutral-100)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${(c * value) / 100} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="50%" y="48%" textAnchor="middle" fontSize={size / 5} fontWeight="700" fill="var(--primary-800)">
        {value} %
      </text>
      <text x="50%" y="63%" textAnchor="middle" fontSize={12} fill="var(--neutral-500)">
        {label}
      </text>
    </svg>
  )
}

export function ReadOnlyHint() {
  return <span className="small muted">Lecture seule</span>
}
