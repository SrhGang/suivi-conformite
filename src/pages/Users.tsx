import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { usersApi, type ManagedUser } from '../api/http'
import { ConfirmDialog, EmptyState, Health, Modal } from '../components/ui'
import { ROLES } from '../data/constants'
import { useCompliance } from '../store/ComplianceContext'
import type { Role } from '../types'
import { formatDateTime } from '../utils/dates'

const ROLE_IDS: Role[] = ['responsable', 'contributeur', 'lecteur']

/** Gestion des comptes (version production, responsable validant uniquement). */
export default function Users() {
  const { can, currentUser, notify, mode } = useCompliance()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<ManagedUser | null>(null)
  const [secret, setSecret] = useState<{ name: string; password: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await usersApi.list()
      if (!res.ok) return setError(res.error)
      setUsers(res.users)
    } catch {
      setError('Session expirée : reconnectez-vous.')
    }
  }, [])

  useEffect(() => {
    if (mode === 'api' && can('admin')) void load()
  }, [load, mode, can])

  if (mode !== 'api' || !can('admin'))
    return (
      <div className="page">
        <div className="card">
          <EmptyState icon="user" title="Accès réservé">
            La gestion des comptes est réservée au responsable validant, dans la version connectée au serveur.
          </EmptyState>
        </div>
      </div>
    )

  const update = async (u: ManagedUser, changes: Partial<Pick<ManagedUser, 'role' | 'disabled'>>) => {
    const res = await usersApi.update(u.id, changes).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    if (!res.ok) return notify(res.error, 'error')
    notify(`Compte de ${u.name} mis à jour.`)
    void load()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Utilisateurs</h1>
          <p className="page-head__sub">
            Comptes, rôles et double authentification. Chaque modification est tracée dans le journal d’audit.
          </p>
        </div>
        <div className="page-head__actions">
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            + Nouveau compte
          </button>
        </div>
      </div>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!users ? (
          <p className="muted small" style={{ padding: 16 }}>
            Chargement…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>Sécurité</th>
                  <th>Dernière connexion</th>
                  <th>État</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === currentUser.id
                  return (
                    <tr key={u.id} className={u.disabled ? 'is-archived' : ''}>
                      <td>
                        <strong>{u.name}</strong>
                        <div className="tiny muted">{u.title}</div>
                      </td>
                      <td className="small">{u.email}</td>
                      <td>
                        <label className="sr-only" htmlFor={`role-${u.id}`}>
                          Rôle de {u.name}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          className="input"
                          style={{ width: 'auto', minHeight: 32, padding: '2px 8px' }}
                          value={u.role}
                          disabled={self}
                          title={self ? 'Vous ne pouvez pas modifier votre propre rôle.' : undefined}
                          onChange={(e) => void update(u, { role: e.target.value as Role })}
                        >
                          {ROLE_IDS.map((r) => (
                            <option key={r} value={r}>
                              {ROLES[r].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="small">
                        {u.must_change_password ? (
                          <Health tone="warning">Mot de passe temporaire</Health>
                        ) : u.totp_enabled ? (
                          <Health tone="success">MFA active</Health>
                        ) : (
                          <Health tone="warning">MFA à configurer</Health>
                        )}
                      </td>
                      <td className="small nowrap">{u.last_login_at ? formatDateTime(u.last_login_at) : '—'}</td>
                      <td className="small">
                        {u.disabled ? <Health tone="neutral">Désactivé</Health> : u.locked ? <Health tone="error">Verrouillé</Health> : <Health tone="success">Actif</Health>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setResetting(u)}>
                          Réinitialiser l’accès
                        </button>
                        {!self && (
                          <button className="btn btn--ghost btn--sm" onClick={() => void update(u, { disabled: !u.disabled })}>
                            {u.disabled ? 'Réactiver' : 'Désactiver'}
                          </button>
                        )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onCreated={(name, password) => {
            setCreating(false)
            setSecret({ name, password })
            void load()
          }}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title={`Réinitialiser l’accès de ${resetting.name}`}
          message="Un nouveau mot de passe temporaire sera généré, la double authentification devra être réenrôlée et toutes les sessions de ce compte seront fermées."
          confirmLabel="Réinitialiser"
          tone="danger"
          onClose={() => setResetting(null)}
          onConfirm={async () => {
            const u = resetting
            setResetting(null)
            const res = await usersApi.reset(u.id).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
            if (!res.ok) return notify(res.error, 'error')
            setSecret({ name: u.name, password: res.temporaryPassword })
            void load()
          }}
        />
      )}
      {secret && <TemporaryPassword name={secret.name} password={secret.password} onClose={() => setSecret(null)} />}
    </div>
  )
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const [form, setForm] = useState({ email: '', name: '', title: '', role: 'contributeur' as Role })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const res = await usersApi.create(form).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onCreated(form.name, res.temporaryPassword)
  }

  return (
    <Modal title="Nouveau compte" onClose={onClose} size="sm">
      <form onSubmit={submit}>
        {error && (
          <div className="banner banner--error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="user-name">Nom complet *</label>
          <input id="user-name" className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="user-email">E-mail *</label>
          <input id="user-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="user-title">Fonction</label>
          <input id="user-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex : Administrateur systèmes" />
        </div>
        <div className="field">
          <label htmlFor="user-role">Rôle *</label>
          <select id="user-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                {ROLES[r].label}
              </option>
            ))}
          </select>
          <span className="hint">{ROLES[form.role].description}</span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Créer le compte
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TemporaryPassword({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal title="Mot de passe temporaire" onClose={onClose} size="sm">
      <p className="small" style={{ marginBottom: 12 }}>
        Transmettez ce mot de passe à <strong>{name}</strong> par un canal sûr. Il ne sera plus affiché. À la première connexion, il devra être changé et la
        double authentification configurée.
      </p>
      <label htmlFor="temp-password" className="sr-only">
        Mot de passe temporaire
      </label>
      <input id="temp-password" className="input mono" readOnly value={password} onFocus={(e) => e.target.select()} />
      <div className="form-actions">
        <button
          className="btn btn--secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password)
              setCopied(true)
            } catch {
              ;(document.getElementById('temp-password') as HTMLInputElement | null)?.select()
            }
          }}
        >
          {copied ? 'Copié' : 'Copier'}
        </button>
        <button className="btn btn--primary" onClick={onClose}>
          J’ai transmis le mot de passe
        </button>
      </div>
    </Modal>
  )
}
