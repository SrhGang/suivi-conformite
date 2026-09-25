import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import GapForm from '../components/GapForm.jsx'
import ExportButton from '../components/ExportButton.jsx'
import { CriticalityDot, Donut, EmptyState, Progress, UserName } from '../components/ui.jsx'
import { CRITICALITIES, CRITICALITY_BY_ID, GAP_STATUSES } from '../data/constants.js'
import { useCompliance } from '../store/ComplianceContext.jsx'
import {
  activeGaps,
  conformControls,
  countByCriticality,
  isGapOverdue,
  isOpen,
  priorityAlerts,
  scoreByTheme,
  weightedScore,
} from '../utils/compliance.js'
import { formatDate, formatDateTime } from '../utils/dates.js'
import { exportCsv, exportReport, printReport } from '../utils/report.js'

const CRIT_COLORS = { critique: 'var(--error)', haute: 'var(--warning)', moyenne: 'var(--medium)', basse: 'var(--info)' }
const ALERT_ICON = { overdue: '⏰', critical: '🔴', review: '🔁', remediation: '🛠️' }

export default function Dashboard() {
  const { state, can, notify } = useCompliance()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [showAllAlerts, setShowAllAlerts] = useState(false)

  const data = useMemo(() => {
    const gaps = activeGaps(state.gaps)
    const open = gaps.filter(isOpen)
    return {
      gaps,
      open,
      score: weightedScore(gaps, state.remediations),
      themes: scoreByTheme(gaps, state.remediations),
      controls: conformControls(gaps),
      alerts: priorityAlerts(gaps, state.remediations),
      remInProgress: state.remediations.filter((r) => r.status === 'en_cours' || r.status === 'bloque'),
      blocked: state.remediations.filter((r) => r.status === 'bloque').length,
      overdue: gaps.filter((g) => isGapOverdue(g)).length,
      byCrit: countByCriticality(open),
      byStatus: Object.fromEntries(GAP_STATUSES.map((s) => [s.id, gaps.filter((g) => g.status === s.id).length])),
      activity: [...state.history].reverse().slice(0, 8),
    }
  }, [state])

  const nextMilestone = state.milestones.find((m) => m.date >= new Date().toISOString().slice(0, 10))
  const exportItems = [
    { icon: '📄', label: 'Rapport HTML', onClick: () => exportReport(state) },
    { icon: '🖨️', label: 'Imprimer / PDF', onClick: () => !printReport(state) && notify('Autorisez les fenêtres pop-up pour imprimer.', 'warning') },
    { icon: '📊', label: 'Export CSV des lacunes', onClick: () => exportCsv(state) },
  ]

  if (!data.gaps.length) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState
            icon="🛡️"
            title="Commencez par créer un audit initial"
            action={
              can('edit') && (
                <button className="btn btn--accent" onClick={() => setCreating(true)}>
                  + Nouvelle lacune
                </button>
              )
            }
          >
            Recensez les mesures ISO 27001:2022 non appliquées dans l'organisme pour démarrer le suivi.
          </EmptyState>
        </div>
        {creating && <GapForm onClose={() => setCreating(false)} onSaved={(g) => navigate(`/lacunes/${g.id}`)} />}
      </div>
    )
  }

  const alerts = showAllAlerts ? data.alerts : data.alerts.slice(0, 5)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tableau de bord — Conformité ISO 27001 / NIS2-ANSSI</h1>
          <p className="page-head__sub">
            {state.organization.name} · Dernière mise à jour : {formatDateTime(state.lastUpdated)}
          </p>
        </div>
        <div className="page-head__actions">
          <ExportButton items={exportItems} />
          {can('edit') && (
            <button className="btn btn--accent" onClick={() => setCreating(true)}>
              + Nouvelle lacune
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid">
        <button className="kpi kpi--accent" onClick={() => navigate('/lacunes')}>
          <div className="kpi__label">Score global</div>
          <div className="kpi__value">
            {data.score}
            <small> %</small>
          </div>
          <div className="kpi__hint">Moyenne pondérée par criticité</div>
        </button>
        <button className="kpi" onClick={() => navigate('/lacunes?statut=ouvertes')}>
          <div className="kpi__label">Lacunes identifiées</div>
          <div className="kpi__value">{data.gaps.length}</div>
          <div className="kpi__hint">
            {data.open.length} ouvertes · <span style={{ color: 'var(--error-dark)' }}>{data.byCrit.critique} critiques</span>
            {data.overdue > 0 && <> · {data.overdue} en retard</>}
          </div>
        </button>
        <button className="kpi kpi--info" onClick={() => navigate('/roadmap?vue=kanban')}>
          <div className="kpi__label">Remédiations en cours</div>
          <div className="kpi__value">{data.remInProgress.length}</div>
          <div className="kpi__hint">
            {data.blocked > 0 ? `dont ${data.blocked} bloquée(s)` : 'aucune bloquée'} · {state.remediations.filter((r) => r.status === 'valide').length} validées
          </div>
        </button>
        <button className="kpi kpi--success" onClick={() => navigate('/referentiel')}>
          <div className="kpi__label">Mesures ISO conformes</div>
          <div className="kpi__value">
            {data.controls.conform}
            <small>/{data.controls.total}</small>
          </div>
          <div className="kpi__hint">{data.themes.filter((t) => t.open === 0).length}/4 thèmes sans lacune ouverte</div>
        </button>
      </div>

      <div className="dash-grid">
        <section className="card" aria-labelledby="progress-title">
          <div className="card__head">
            <h3 className="card__title" id="progress-title">
              Progression de la conformité
            </h3>
            {nextMilestone && (
              <span className="small muted">
                Prochain jalon : <strong>{nextMilestone.target} %</strong> le {formatDate(nextMilestone.date)}
              </span>
            )}
          </div>
          <div className="donut-wrap">
            <Donut value={data.score} />
            <div className="theme-bars">
              {data.themes.map((t) => (
                <Link key={t.id} to={`/lacunes?theme=${t.id}`} className="theme-bar" style={{ color: 'inherit', textDecoration: 'none' }} title={`${t.total} lacune(s), ${t.open} ouverte(s)`}>
                  <div className="theme-bar__head">
                    <strong>
                      {t.code} {t.label}
                    </strong>
                    <span className="muted num">
                      {t.open} ouverte{t.open > 1 ? 's' : ''} / {t.total} · {t.score} %
                    </span>
                  </div>
                  <Progress value={t.score} label={false} />
                </Link>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <div className="small" style={{ fontWeight: 600, color: 'var(--primary-800)' }}>
              Lacunes ouvertes par criticité
            </div>
            <div className="crit-dist" role="img" aria-label="Répartition des lacunes ouvertes par criticité">
              {CRITICALITIES.map((c) =>
                data.byCrit[c.id] ? (
                  <span key={c.id} style={{ flex: data.byCrit[c.id], background: CRIT_COLORS[c.id] }} title={`${c.label} : ${data.byCrit[c.id]}`} />
                ) : null,
              )}
            </div>
            <div className="legend">
              {CRITICALITIES.map((c) => (
                <Link key={c.id} to={`/lacunes?criticite=${c.id}&statut=ouvertes`} style={{ color: 'inherit' }}>
                  <span>
                    <CriticalityDot value={c.id} /> {c.label} <strong className="num">{data.byCrit[c.id]}</strong>
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <details className="help">
            <summary>Comment le score est-il calculé ?</summary>
            <ul>
              <li>Chaque lacune active a un avancement : Non traitée 0 %, En cours 10 à 75 % selon l’avancement moyen de ses remédiations, Corrigée 80 %, Validée 100 %.</li>
              <li>Score = Σ (poids × avancement) / Σ poids, avec Critique ×4, Haute ×3, Moyenne ×2, Basse ×1.</li>
              <li>Une mesure ISO est conforme si aucune lacune ouverte n’y est rattachée.</li>
            </ul>
          </details>
        </section>

        <section className="card" aria-labelledby="alerts-title">
          <div className="card__head">
            <h3 className="card__title" id="alerts-title">
              Alertes prioritaires
            </h3>
            <span className="badge badge--error">{data.alerts.length}</span>
          </div>
          {data.alerts.length === 0 ? (
            <EmptyState icon="✅" title="Aucune alerte">
              Pas de retard ni de revue en attente.
            </EmptyState>
          ) : (
            <>
              <ul className="alert-list">
                {alerts.map((a, i) => (
                  <li key={`${a.kind}-${a.gap.id}-${a.remediation?.id ?? i}`}>
                    <button className={`alert-item alert-item--${CRITICALITY_BY_ID[a.gap.criticality].tone}`} onClick={() => navigate(`/lacunes/${a.gap.id}${a.kind === 'remediation' ? '?onglet=remediations' : a.kind === 'review' ? '?onglet=preuves' : ''}`)}>
                      <span aria-hidden="true">{ALERT_ICON[a.kind]}</span>
                      <span className="alert-item__body">
                        <span className="alert-item__title" style={{ display: 'block' }}>
                          {a.gap.id} · {a.gap.title}
                        </span>
                        <span className="alert-item__meta">{a.message}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {data.alerts.length > 5 && (
                <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => setShowAllAlerts((s) => !s)}>
                  {showAllAlerts ? 'Réduire' : `Voir les ${data.alerts.length} alertes`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <div className="dash-grid dash-grid--3">
        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Actions rapides</h3>
          </div>
          <div className="quick-actions">
            <button className="btn btn--secondary" onClick={() => setCreating(true)} disabled={!can('edit')}>
              ➕ Nouvelle lacune
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/roadmap')}>
              🗓️ Voir la roadmap
            </button>
            <button className="btn btn--secondary" onClick={() => navigate('/lacunes')}>
              📋 Toutes les lacunes
            </button>
            <button className="btn btn--secondary" onClick={() => exportReport(state)}>
              📄 Exporter le rapport
            </button>
          </div>
        </section>
        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Répartition par statut</h3>
          </div>
          <div className="stack">
            {GAP_STATUSES.map((s) => (
              <Link key={s.id} to={`/lacunes?statut=${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="theme-bar__head small">
                  <span>{s.label}</span>
                  <strong className="num">{data.byStatus[s.id]}</strong>
                </div>
                <Progress value={Math.round((data.byStatus[s.id] / data.gaps.length) * 100)} label={false} success={s.id === 'validee'} />
              </Link>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card__head">
            <h3 className="card__title">Activité récente</h3>
          </div>
          <ul className="activity">
            {data.activity.map((h) => (
              <li key={h.id}>
                <span className="muted nowrap tiny" style={{ minWidth: 70 }}>
                  {formatDate(h.date)}
                </span>
                <span>
                  <strong>{h.action}</strong>
                  {h.gapId && (
                    <>
                      {' '}
                      · <Link to={`/lacunes/${h.gapId}?onglet=historique`}>{h.gapId}</Link>
                    </>
                  )}
                  <br />
                  <span className="muted tiny">
                    <UserName id={h.userId} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {creating && <GapForm onClose={() => setCreating(false)} onSaved={(g) => navigate(`/lacunes/${g.id}`)} />}
    </div>
  )
}
