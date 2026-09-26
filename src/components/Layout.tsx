import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ROLES } from '../data/constants'
import { IS_ARTIFACT } from '../platform'
import { useComplianceShell } from '../store/ComplianceContext'
import { activeGaps, isOpen } from '../utils/compliance'
import { formatDateTime } from '../utils/dates'
import { usersApi } from '../api/http'
import { exportBackup, exportCsv, exportReport } from '../utils/report'
import { useColorMode } from '../theme'
import ExportDialog from './ExportDialog'
import Icon, { type IconName } from './Icon'
import { Avatar, ConfirmDialog, Skeleton, Toasts } from './ui'

const DOCK_KEY = 'suivi-conformite:nav-docked'
const readDocked = () => {
  try {
    return localStorage.getItem(DOCK_KEY) !== '0'
  } catch {
    return true
  }
}

interface Crumb {
  label: string
  to?: string
}

type NavItem =
  | { to: string; label: string; icon: IconName; count?: number }
  | { label: string; icon: IconName; onClick: () => void; disabled?: boolean; title?: string }

interface NavGroup {
  title?: string
  icon?: IconName
  items: NavItem[]
}

/** Fil d'Ariane de l'en-tête, comme dans le tableau de bord Wazuh. */
function useBreadcrumbs(): Crumb[] {
  const { pathname, search } = useLocation()
  const { state } = useComplianceShell()
  return useMemo<Crumb[]>(() => {
    if (pathname === '/') return [{ label: 'Vue d’ensemble' }]
    if (pathname === '/lacunes') return [{ label: 'Conformité' }, { label: 'Lacunes' }]
    if (pathname.startsWith('/lacunes/')) {
      const id = decodeURIComponent(pathname.split('/')[2] ?? '')
      const gap = state?.gaps.find((g) => g.id === id)
      return [{ label: 'Conformité' }, { label: 'Lacunes', to: '/lacunes' }, { label: gap ? `${gap.id} · ${gap.title}` : id }]
    }
    if (pathname === '/roadmap')
      return [{ label: 'Plan d’action' }, { label: new URLSearchParams(search).get('vue') === 'kanban' ? 'Tableau Kanban' : 'Roadmap' }]
    if (pathname === '/referentiel') return [{ label: 'Conformité' }, { label: 'Référentiel ISO ↔ NIS2' }]
    if (pathname === '/utilisateurs') return [{ label: 'Administration' }, { label: 'Utilisateurs' }]
    return [{ label: 'Page introuvable' }]
  }, [pathname, search, state?.gaps])
}

export default function Layout() {
  const { mode, state, status, loadError, retry, currentUser, switchUser, resetDemo, importData, notify, can, logout } = useComplianceShell()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const crumbs = useBreadcrumbs()
  const [docked, setDocked] = useState(readDocked)
  const [flyout, setFlyout] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [colorMode, toggleColorMode] = useColorMode()

  useEffect(() => setFlyout(false), [pathname, search])

  // Retour en haut de page à chaque changement de page (sans bloquer le rendu).
  useEffect(() => {
    try {
      document.scrollingElement?.scrollTo({ top: 0 })
    } catch {
      /* défilement non disponible */
    }
  }, [pathname])

  const toggleNav = () => {
    if (window.matchMedia('(max-width: 1099px)').matches) setFlyout((o) => !o)
    else
      setDocked((d) => {
        try {
          localStorage.setItem(DOCK_KEY, d ? '0' : '1')
        } catch {
          /* préférence non conservée */
        }
        return !d
      })
  }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      importData(JSON.parse(await file.text()))
      notify('Sauvegarde importée.')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier invalide.', 'error')
    }
  }

  const openGaps = state ? activeGaps(state.gaps).filter(isOpen).length : 0
  const vue = new URLSearchParams(search).get('vue')
  const isActive = (to: string) => {
    const [path, qs] = to.split('?')
    if (path === '/') return pathname === '/'
    if (path === '/roadmap') return pathname === '/roadmap' && (qs ? vue === 'kanban' : vue !== 'kanban')
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  /** Vérifie le chaînage du journal d'audit côté serveur. */
  const verifyAudit = async () => {
    try {
      const res = await usersApi.verifyAudit()
      if (!res.ok) return notify(res.error, 'error')
      const r = res.report
      if (r.ok) notify(`Journal d’audit intègre : ${r.count} entrées vérifiées.`)
      else notify(`Journal d’audit altéré à l’entrée ${r.brokenAt?.id} : ${r.brokenAt?.reason}`, 'error')
    } catch {
      notify('Session expirée : reconnectez-vous.', 'error')
    }
  }

  const groups: NavGroup[] = [
    { items: [{ to: '/', label: 'Vue d’ensemble', icon: 'home' }] },
    {
      title: 'Conformité',
      icon: 'shield',
      items: [
        { to: '/lacunes', label: 'Lacunes', icon: 'list', count: openGaps },
        { to: '/referentiel', label: 'Référentiel ISO ↔ NIS2', icon: 'book' },
      ],
    },
    {
      title: 'Plan d’action',
      icon: 'gantt',
      items: [
        { to: '/roadmap', label: 'Roadmap', icon: 'gantt' },
        { to: '/roadmap?vue=kanban', label: 'Tableau Kanban', icon: 'columns' },
      ],
    },
    {
      title: 'Rapports',
      icon: 'report',
      items: [
        { label: 'Rapport de conformité', icon: 'report', onClick: () => state && exportReport(state) },
        { label: 'Export CSV des lacunes', icon: 'table', onClick: () => state && exportCsv(state) },
      ],
    },
    mode === 'api'
      ? {
          title: 'Administration',
          icon: 'user',
          items: [
            ...(can('admin') ? [{ to: '/utilisateurs', label: 'Utilisateurs', icon: 'user' as const }] : []),
            ...(currentUser && currentUser.role !== 'contributeur'
              ? [{ label: 'Vérifier le journal d’audit', icon: 'shield' as const, onClick: () => void verifyAudit() }]
              : []),
            { label: 'Export JSON des données', icon: 'download', onClick: () => state && exportBackup(state) },
          ],
        }
      : {
          title: 'Gestion des données',
          icon: 'refresh',
          items: [
            { label: 'Sauvegarde JSON', icon: 'download', onClick: () => state && exportBackup(state) },
            {
              label: 'Importer une sauvegarde',
              icon: 'upload',
              disabled: !can('admin'),
              title: !can('admin') ? 'Réservé au responsable validant' : undefined,
              onClick: () => fileRef.current?.click(),
            },
            { label: 'Réinitialiser la démo', icon: 'refresh', onClick: () => setConfirmReset(true) },
          ],
        },
  ]

  return (
    <div className={`app-shell ${docked ? 'is-docked' : ''} ${flyout ? 'is-flyout' : ''}`}>
      <header className="app-header">
        <button className="icon-btn" onClick={toggleNav} aria-label={docked ? 'Réduire le menu' : 'Afficher le menu'} aria-expanded={docked || flyout} aria-controls="side-nav">
          <Icon name="menu" size={18} />
        </button>
        <Link to="/" className="brand" aria-label="Accueil — Conformité ISO 27001">
          <span className="brand__title">
            Conformité<span className="brand__dot">.</span>
          </span>
        </Link>
        <nav className="breadcrumbs" aria-label="Fil d’Ariane">
          {crumbs.map((c, i) => (
            <span key={i} className={`crumb ${i === crumbs.length - 1 ? 'is-last' : ''}`}>
              {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
            </span>
          ))}
        </nav>
        <button
          className="icon-btn"
          onClick={toggleColorMode}
          aria-label={colorMode === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
          title={colorMode === 'dark' ? 'Thème clair' : 'Thème sombre'}
        >
          <Icon name={colorMode === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        {state && currentUser && mode === 'api' && (
          <div className="user-menu">
            <div className="user-menu__who">
              <strong>{currentUser.name}</strong>
              <span>{ROLES[currentUser.role].label}</span>
            </div>
            <Avatar user={currentUser} />
            <button className="btn btn--ghost btn--sm" onClick={() => void logout()}>
              Se déconnecter
            </button>
          </div>
        )}
        {state && currentUser && mode === 'local' && (
          <div className="user-switch">
            <label className="sr-only" htmlFor="user-select">
              Utilisateur connecté
            </label>
            <select
              id="user-select"
              value={currentUser.id}
              onChange={(e) => {
                switchUser(e.target.value)
                const u = state.users.find((x) => x.id === e.target.value)
                if (u) notify(`Connecté en tant que ${u.name} (${ROLES[u.role].label}).`, 'info')
              }}
              title="Simulation de connexion : changer d'utilisateur"
            >
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLES[u.role].label}
                </option>
              ))}
            </select>
            <Avatar user={currentUser} />
          </div>
        )}
      </header>

      <div className="nav-backdrop" onClick={() => setFlyout(false)} aria-hidden="true" />
      <aside id="side-nav" className="side-nav" aria-label="Navigation principale">
        {groups.map((g, gi) => (
          <div key={gi} className="nav-group">
            {g.title && (
              <div className="nav-group__title">
                {g.icon && <Icon name={g.icon} />}
                {g.title}
              </div>
            )}
            <ul>
              {g.items.map((it) => (
                <li key={it.label}>
                  {'to' in it ? (
                    <Link to={it.to} className={`nav-link ${isActive(it.to) ? 'is-active' : ''} ${g.title ? '' : 'is-top'}`} aria-current={isActive(it.to) ? 'page' : undefined}>
                      <Icon name={it.icon} />
                      <span>{it.label}</span>
                      {!!it.count && <span className="nav-count">{it.count}</span>}
                    </Link>
                  ) : (
                    <button type="button" className="nav-link" onClick={it.onClick} disabled={it.disabled} title={it.title}>
                      <Icon name={it.icon} />
                      <span>{it.label}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
        {state && (
          <div className="side-nav__foot">
            {state.organization.name}
            <br />
            {state.organization.sector}
          </div>
        )}
      </aside>

      <div className="app-main">
        {currentUser?.role === 'lecteur' && <div className="readonly-banner">Profil lecteur : consultation et export uniquement.</div>}
        <main>
          {status === 'loading' && <LoadingPage />}
          {status === 'error' && (
            <div className="page">
              <div className="banner banner--error" role="alert">
                <Icon name="alert" />
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
            Dernière mise à jour : {formatDateTime(state.lastUpdated)} · v1.0
            {mode === 'local' && (IS_ARTIFACT ? ' · Démo en ligne : vos modifications restent dans ce navigateur' : ' · Mode démonstration (données locales)')}
          </footer>
        )}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Réinitialiser les données"
          message="Toutes les modifications locales seront remplacées par le jeu de démonstration. Pensez à exporter une sauvegarde JSON si nécessaire."
          confirmLabel="Réinitialiser"
          tone="danger"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            resetDemo()
            setConfirmReset(false)
            navigate('/')
            notify('Données de démonstration rechargées.', 'info')
          }}
        />
      )}
      <ExportDialog />
      <Toasts />
    </div>
  )
}

function LoadingPage() {
  return (
    <div className="page" aria-busy="true" aria-label="Chargement">
      <Skeleton height={28} width={320} style={{ marginBottom: 24 }} />
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={104} />
        ))}
      </div>
      <div className="dash-grid">
        <Skeleton height={260} />
        <Skeleton height={260} />
      </div>
    </div>
  )
}
