import { useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ROLES } from '../data/constants.js'
import { useCompliance } from '../store/ComplianceContext.jsx'
import { formatDateTime } from '../utils/dates.js'
import { exportBackup } from '../utils/report.js'
import { Avatar, ConfirmDialog, Skeleton, Toasts } from './ui.jsx'

const NAV = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/lacunes', label: 'Lacunes' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/referentiel', label: 'Référentiel' },
]

export default function Layout() {
  const { state, status, loadError, retry, currentUser, switchUser, resetDemo, importData, notify } = useCompliance()
  const [navOpen, setNavOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef(null)

  const onImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      importData(JSON.parse(await file.text()))
      notify('Sauvegarde importée.')
    } catch (err) {
      notify(err.message || 'Fichier invalide.', 'error')
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand" onClick={() => setNavOpen(false)}>
            <span className="brand__logo" aria-hidden="true">
              🔒
            </span>
            <span>
              <span className="brand__title">Conformité ISO 27001</span>
              <br />
              <span className="brand__subtitle">NIS2 · ANSSI</span>
            </span>
          </NavLink>
          <button className="nav-toggle" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            ☰
          </button>
          <nav className={`main-nav ${navOpen ? 'open' : ''}`} aria-label="Navigation principale">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setNavOpen(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          {state && currentUser && (
            <div className="user-switch">
              <Avatar user={currentUser} />
              <label className="sr-only" htmlFor="user-select">
                Utilisateur connecté
              </label>
              <select
                id="user-select"
                value={currentUser.id}
                onChange={(e) => {
                  switchUser(e.target.value)
                  const u = state.users.find((x) => x.id === e.target.value)
                  notify(`Connecté en tant que ${u.name} (${ROLES[u.role].label}).`, 'info')
                }}
                title="Simulation de connexion : changer d'utilisateur"
              >
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLES[u.role].label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>
      {currentUser?.role === 'lecteur' && (
        <div className="readonly-banner">👁 Profil lecteur : consultation et export uniquement.</div>
      )}

      <main>
        {status === 'loading' && <LoadingPage />}
        {status === 'error' && (
          <div className="page">
            <div className="banner banner--error" role="alert">
              <span>✕</span>
              <div>
                <strong>Erreur de chargement des données.</strong> {loadError}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="btn btn--secondary btn--sm" onClick={retry}>
                    Réessayer
                  </button>
                  <button className="btn btn--danger btn--sm" onClick={resetDemo}>
                    Réinitialiser avec les données de démonstration
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {status === 'ready' && <Outlet />}
      </main>

      {state && (
        <footer className="app-footer">
          <div className="app-footer__inner">
            <span>
              {state.organization.name} · Dernière mise à jour : {formatDateTime(state.lastUpdated)} · v0.1 (prototype)
            </span>
            <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button className="link-button" onClick={() => exportBackup(state)}>
                Sauvegarde JSON
              </button>
              <button className="link-button" onClick={() => fileRef.current?.click()} disabled={currentUser?.role !== 'responsable'} title={currentUser?.role !== 'responsable' ? 'Réservé au responsable validant' : undefined}>
                Importer
              </button>
              <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
              <button className="link-button" onClick={() => setConfirmReset(true)}>
                Réinitialiser la démo
              </button>
            </span>
          </div>
        </footer>
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Réinitialiser les données"
          message="Toutes les modifications locales seront remplacées par le jeu de démonstration. Pensez à exporter une sauvegarde JSON si nécessaire."
          confirmLabel="Réinitialiser"
          tone="accent"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            resetDemo()
            setConfirmReset(false)
            notify('Données de démonstration rechargées.', 'info')
          }}
        />
      )}
      <Toasts />
    </>
  )
}

function LoadingPage() {
  return (
    <div className="page" aria-busy="true" aria-label="Chargement">
      <Skeleton height={36} width={360} style={{ marginBottom: 24 }} />
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
      <div className="dash-grid">
        <Skeleton height={260} />
        <Skeleton height={260} />
      </div>
    </div>
  )
}
