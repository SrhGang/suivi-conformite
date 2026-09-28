import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { setupApi, usersApi, type AccessResult, type InvitationResult, type ManagedUser } from '../api/http'
import { ConfirmDialog, EmptyState, Health, Modal } from '../components/ui'
import { OrganizationFields, RolesHelp } from '../components/admin'
import { ADMIN_ROLE, ROLES } from '../data/constants'
import { useCompliance } from '../store/ComplianceContext'
import type { Role } from '../types'
import { formatDateTime } from '../utils/dates'

const ROLE_IDS: Role[] = ['responsable', 'contributeur', 'lecteur']

/** Gestion des comptes et de l'organisme (version production, administrateur uniquement). */
export default function Users() {
  const { can, currentUser, notify, mode, state, refresh } = useCompliance()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<ManagedUser | null>(null)
  const [access, setAccess] = useState<{ name: string; email: string; result: AccessResult } | null>(null)
  const [smtp, setSmtp] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await usersApi.list()
      if (!res.ok) return setError(res.error)
      setUsers(res.users)
      setSmtp(res.smtpConfigured)
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
            La gestion des comptes est réservée à l’administrateur, dans la version connectée au serveur.
          </EmptyState>
        </div>
      </div>
    )

  const update = async (u: ManagedUser, changes: Partial<Pick<ManagedUser, 'role' | 'disabled'> & { isAdmin: boolean }>) => {
    const res = await usersApi.update(u.id, changes).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    if (!res.ok) return notify(res.error, 'error')
    notify(`Compte de ${u.name} mis à jour.`)
    void load()
  }

  const resend = async (u: ManagedUser) => {
    const res = await usersApi.invite(u.id).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    if (!res.ok) return notify(res.error, 'error')
    setAccess({ name: u.name, email: u.email, result: res })
    void load()
  }

  const testSmtp = async () => {
    const res = await usersApi.testSmtp().catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    if (!res.ok) return notify(res.error, 'error')
    notify(`E-mail de test envoyé à ${res.sentTo}.`)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Utilisateurs et rôles</h1>
          <p className="page-head__sub">
            Comptes, rôles et double authentification. Chaque modification est tracée dans le journal d’audit.
          </p>
        </div>
        <div className="page-head__actions">
          {smtp && (
            <button className="btn btn--secondary" onClick={() => void testSmtp()}>
              Tester l’envoi d’e-mail
            </button>
          )}
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

      {users && !smtp && (
        <div className="banner banner--info small">
          L’envoi d’e-mails n’est pas configuré : les nouveaux comptes reçoivent un mot de passe temporaire à transmettre vous-même. Renseignez SMTP_HOST
          sur le serveur pour envoyer des invitations par e-mail.
        </div>
      )}

      <RolesHelp />

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
                  <th>Rôle métier</th>
                  <th>Administrateur</th>
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
                          title={self ? 'Vous ne pouvez pas modifier vos propres droits.' : undefined}
                          onChange={(e) => void update(u, { role: e.target.value as Role })}
                        >
                          {ROLE_IDS.map((r) => (
                            <option key={r} value={r}>
                              {ROLES[r].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className="toggle" title={self ? 'Vous ne pouvez pas modifier vos propres droits.' : undefined}>
                          <input type="checkbox" checked={u.is_admin} disabled={self} onChange={(e) => void update(u, { isAdmin: e.target.checked })} />
                          <span className="sr-only">Administrateur : {u.name}</span>
                          <span aria-hidden="true">{u.is_admin ? 'Oui' : 'Non'}</span>
                        </label>
                      </td>
                      <td className="small">
                        {u.must_change_password && u.invite_expires_at ? (
                          <span title={`Lien valable jusqu’au ${formatDateTime(u.invite_expires_at)}`}>
                            <Health tone="warning">Invitation envoyée</Health>
                          </span>
                        ) : u.must_change_password ? (
                          <Health tone="warning">{smtp ? 'Accès non activé' : 'Mot de passe temporaire'}</Health>
                        ) : u.totp_enabled ? (
                          <Health tone="success">MFA active</Health>
                        ) : (
                          <Health tone="warning">MFA à configurer</Health>
                        )}
                      </td>
                      <td className="small nowrap">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Jamais'}</td>
                      <td className="small">
                        {u.disabled ? <Health tone="neutral">Désactivé</Health> : u.locked ? <Health tone="error">Verrouillé</Health> : <Health tone="success">Actif</Health>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {smtp && u.must_change_password && !u.disabled && (
                          <button className="btn btn--ghost btn--sm" onClick={() => void resend(u)}>
                            Renvoyer l’invitation
                          </button>
                        )}
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

      <OrganizationCard
        organization={state.organization}
        onSaved={async () => {
          await refresh()
          notify('Informations de l’organisme enregistrées.')
        }}
      />

      {creating && (
        <CreateUserDialog
          smtp={smtp}
          onClose={() => setCreating(false)}
          onCreated={(name, email, result) => {
            setCreating(false)
            setAccess({ name, email, result })
            void load()
          }}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title={`Réinitialiser l’accès de ${resetting.name}`}
          message={
            smtp
              ? 'Un lien pour choisir un nouveau mot de passe sera envoyé par e-mail, la double authentification devra être réenrôlée et toutes les sessions de ce compte seront fermées.'
              : 'Un nouveau mot de passe temporaire sera généré, la double authentification devra être réenrôlée et toutes les sessions de ce compte seront fermées.'
          }
          confirmLabel="Réinitialiser"
          tone="danger"
          onClose={() => setResetting(null)}
          onConfirm={async () => {
            const u = resetting
            setResetting(null)
            const res = await usersApi.reset(u.id).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
            if (!res.ok) return notify(res.error, 'error')
            setAccess({ name: u.name, email: u.email, result: res })
            void load()
          }}
        />
      )}
      {access?.result.invitation && (
        <InvitationSent name={access.name} invitation={access.result.invitation} onClose={() => setAccess(null)} />
      )}
      {access?.result.temporaryPassword && (
        <TemporaryPassword name={access.name} email={access.email} password={access.result.temporaryPassword} onClose={() => setAccess(null)} />
      )}
    </div>
  )
}

function CreateUserDialog({
  smtp,
  onClose,
  onCreated,
}: {
  smtp: boolean
  onClose: () => void
  onCreated: (name: string, email: string, result: AccessResult) => void
}) {
  const [form, setForm] = useState({ email: '', name: '', title: '', role: 'contributeur' as Role, isAdmin: false })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const res = await usersApi.create(form).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onCreated(form.name, form.email, res)
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
        <div className="field">
          <label className="toggle">
            <input type="checkbox" checked={form.isAdmin} onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })} />
            {ADMIN_ROLE.label}
          </label>
          <span className="hint">{ADMIN_ROLE.description}</span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {smtp ? 'Créer et envoyer l’invitation' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function OrganizationCard({ organization, onSaved }: { organization: { name: string; sector: string }; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(organization)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = form.name !== organization.name || form.sector !== organization.sector

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const res = await setupApi.saveOrganization(form).catch(() => ({ ok: false as const, error: 'Session expirée.' }))
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setError(null)
    await onSaved()
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 16 }}>
      <h2 className="card__title">Organisme</h2>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <OrganizationFields value={form} onChange={setForm} />
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy || !dirty}>
          Enregistrer
        </button>
      </div>
    </form>
  )
}

function InvitationSent({ name, invitation, onClose }: { name: string; invitation: InvitationResult; onClose: () => void }) {
  return (
    <Modal title={invitation.sent ? 'Invitation envoyée' : 'Invitation non envoyée'} onClose={onClose} size="sm">
      {invitation.sent ? (
        <p className="small" style={{ marginBottom: 12 }}>
          Un e-mail a été envoyé à <strong>{invitation.email}</strong>. {name} y trouvera un lien pour choisir son mot de passe, valable jusqu’au{' '}
          {formatDateTime(invitation.expiresAt)} et utilisable une seule fois. La double authentification sera configurée juste après.
        </p>
      ) : (
        <div className="banner banner--error small" role="alert">
          {invitation.error ?? 'L’e-mail n’a pas pu être envoyé.'} Le compte est créé : utilisez « Renvoyer l’invitation » dans la liste.
        </div>
      )}
      <p className="small muted">Aucun mot de passe ne vous est communiqué : seul l’utilisateur le connaît.</p>
      <div className="form-actions">
        <button className="btn btn--primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  )
}

function TemporaryPassword({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')

  const doCopy = async () => {
    const field = document.getElementById('temp-password') as HTMLInputElement | null
    try {
      await navigator.clipboard.writeText(password)
      return setCopy('done')
    } catch {
      // Presse-papiers refusé par le navigateur : copie par sélection.
    }
    field?.select()
    setCopy(field && document.execCommand('copy') ? 'done' : 'failed')
  }

  return (
    <Modal title="Mot de passe temporaire" onClose={onClose} size="sm">
      <p className="small" style={{ marginBottom: 12 }}>
        Transmettez ces identifiants à <strong>{name}</strong> par un canal sûr. Le mot de passe ne sera plus affiché. À la première connexion, il devra
        être changé et la double authentification configurée.
      </p>
      <dl className="credentials">
        <dt>Identifiant</dt>
        <dd className="mono">{email}</dd>
      </dl>
      <label htmlFor="temp-password" className="small">
        Mot de passe temporaire
      </label>
      <input id="temp-password" className="input mono" readOnly value={password} onFocus={(e) => e.target.select()} />
      {copy === 'failed' && (
        <p className="small" role="alert" style={{ marginTop: 8, color: 'var(--error)' }}>
          Copie impossible dans ce navigateur : le mot de passe est sélectionné, copiez-le avec Ctrl+C (Cmd+C sur Mac).
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn--secondary" onClick={() => void doCopy()}>
          {copy === 'done' ? 'Copié' : 'Copier'}
        </button>
        <button className="btn btn--primary" onClick={onClose}>
          J’ai transmis les identifiants
        </button>
      </div>
    </Modal>
  )
}
