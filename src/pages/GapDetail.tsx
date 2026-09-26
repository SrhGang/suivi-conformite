import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import EvidencePanel from '../components/EvidencePanel'
import Icon from '../components/Icon'
import GapForm from '../components/GapForm'
import RemediationForm from '../components/RemediationForm'
import {
  ConfirmDialog,
  CriticalityBadge,
  EmptyState,
  LateBadge,
  Modal,
  Progress,
  RemStatusBadge,
  RemTypeBadge,
  StatusBadge,
  UserName,
} from '../components/ui'
import { CRITICALITY_BY_ID, GAP_STATUSES, REMEDIATION_STATUSES } from '../data/constants'
import { getControl, getNis2, getTheme } from '../data/isoControls'
import { useCompliance } from '../store/ComplianceContext'
import {
  averageProgress,
  gapProgress,
  isGapOverdue,
  isRemediationOverdue,
  isReviewDue,
  reviewIntervalMonths,
  themeOfGap,
  validationBlockers,
} from '../utils/compliance'
import { formatDate, formatDateTime, relativeDue } from '../utils/dates'
import type { Gap, GapStatusId, HistoryEntry, Remediation, RemediationInput, RemediationStatusId, ReviewOutcome } from '../types'

type TabId = 'details' | 'remediations' | 'preuves' | 'historique'

const TABS: { id: TabId; label: string }[] = [
  { id: 'details', label: 'Détails' },
  { id: 'remediations', label: 'Remédiations' },
  { id: 'preuves', label: 'Preuves & validation' },
  { id: 'historique', label: 'Historique' },
]

export default function GapDetail() {
  const { id } = useParams()
  const { state, currentUser, can, notify, changeGapStatus, duplicateGap, archiveGap, restoreGap } = useCompliance()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [statusDialog, setStatusDialog] = useState<GapStatusId | null>(null)
  const [archiving, setArchiving] = useState(false)

  const gap = state.gaps.find((g) => g.id === id)
  if (!gap) {
    return (
      <div className="page">
        <div className="card">
          <EmptyState icon="search" title="Lacune non trouvée" action={<Link className="btn btn--primary" to="/lacunes">← Retour à l'inventaire</Link>}>
            La lacune « {id} » n'existe pas ou a été supprimée.
          </EmptyState>
        </div>
      </div>
    )
  }

  const tab: TabId = TABS.find((t) => t.id === params.get('onglet'))?.id ?? 'details'
  const setTab = (t: TabId) => setParams(t === 'details' ? {} : { onglet: t }, { replace: true })
  const remediations = state.remediations.filter((r) => r.gapId === gap.id)
  const evidence = state.evidence.filter((e) => e.gapId === gap.id)
  const history = state.history.filter((h) => h.gapId === gap.id)
  const late = isGapOverdue(gap)
  const editable = can('edit') && !gap.archived
  const blockers = validationBlockers(gap, state.evidence, currentUser)
  const counts: Partial<Record<TabId, number>> = { remediations: remediations.length, preuves: evidence.length, historique: history.length }

  const requestStatus = async (status: GapStatusId) => {
    if (status === gap.status) return
    if (status === 'validee' || gap.status === 'validee') setStatusDialog(status)
    else {
      const r = await changeGapStatus(gap.id, status)
      !r.ok ? notify(r.error, 'error') : notify('Statut mis à jour.')
    }
  }

  return (
    <div className="page">
      <div className="detail-head">
        <Link to="/lacunes">← Inventaire des lacunes</Link>
        <h1>
          <span className="mono" style={{ opacity: 0.8 }}>
            {gap.id}
          </span>{' '}
          · {gap.title}
        </h1>
        <div className="badges">
          <CriticalityBadge value={gap.criticality} />
          <StatusBadge value={gap.status} />
          {late && <LateBadge label={`Échéance ${relativeDue(gap.dueDate)}`} />}
          {isReviewDue(gap) && <span className="badge badge--warning">Revue périodique due</span>}
          {gap.archived && <span className="badge badge--neutral">Archivée</span>}
          <span className="badge badge--outline">
            Avancement {gapProgress(gap, state.remediations)} %
          </span>
        </div>
      </div>

      {gap.archived && (
        <div className="banner banner--info">
          <span>ℹ</span>
          <span>Cette lacune est archivée : elle est exclue des indicateurs et n'est plus modifiable. Son historique est conservé.</span>
        </div>
      )}

      <div className="detail-layout">
        <div className="card">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                {t.label}
                {counts[t.id] != null && <span className="count">{counts[t.id]}</span>}
              </button>
            ))}
          </div>

          {tab === 'details' && <DetailsTab gap={gap} />}
          {tab === 'remediations' && <RemediationsTab gap={gap} remediations={remediations} editable={editable} />}
          {tab === 'preuves' && <ProofTab gap={gap} blockers={blockers} onValidate={() => setStatusDialog('validee')} />}
          {tab === 'historique' && <HistoryTab history={history} />}
        </div>

        <aside className="side-panel">
          <div className="card">
            <h3 className="card__title" style={{ marginBottom: 16 }}>
              Statut
            </h3>
            <label htmlFor="status-select" className="sr-only">
              Statut de la lacune
            </label>
            <select id="status-select" className="input" value={gap.status} disabled={!editable} onChange={(e) => requestStatus(e.target.value as GapStatusId)}>
              {GAP_STATUSES.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === 'validee' && blockers.length > 0}>
                  {s.label}
                  {s.id === 'validee' && blockers.length ? ' (conditions non remplies)' : ''}
                </option>
              ))}
            </select>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Enregistrement automatique à chaque changement.
            </p>
            {gap.status !== 'validee' && blockers.length > 0 && editable && (
              <div className="tiny" style={{ marginTop: 8, color: 'var(--warning-dark)' }}>
                Pour valider : {blockers.join(' ')}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card__title" style={{ marginBottom: 16 }}>
              Métadonnées
            </h3>
            <dl className="meta-list">
              <div>
                <dt>Thème</dt>
                <dd>
                  {getTheme(themeOfGap(gap)).code} {getTheme(themeOfGap(gap)).label}
                </dd>
              </div>
              <div>
                <dt>Assigné à</dt>
                <dd>
                  <UserName id={gap.assignee} withAvatar />
                </dd>
              </div>
              <div>
                <dt>Échéance</dt>
                <dd style={{ color: late ? 'var(--error-dark)' : undefined }}>
                  {formatDate(gap.dueDate)}
                  {gap.status !== 'validee' && <div className="tiny">{relativeDue(gap.dueDate)}</div>}
                </dd>
              </div>
              <div>
                <dt>Créée par</dt>
                <dd>
                  <UserName id={gap.createdBy} />
                  <div className="tiny muted">{formatDateTime(gap.createdAt)}</div>
                </dd>
              </div>
              <div>
                <dt>Modifiée par</dt>
                <dd>
                  <UserName id={gap.updatedBy} />
                  <div className="tiny muted">{formatDateTime(gap.updatedAt)}</div>
                </dd>
              </div>
            </dl>
          </div>

          <div className="card stack">
            <button className="btn btn--primary" onClick={() => setEditing(true)} disabled={!editable}>
              Éditer
            </button>
            <button
              className="btn btn--secondary"
              disabled={!can('edit')}
              onClick={async () => {
                const r = await duplicateGap(gap.id)
                if (!r.ok) notify(r.error, 'error')
                else {
                  notify(`Copie créée : ${r.result.id}`)
                  navigate(`/lacunes/${r.result.id}`)
                }
              }}
            >
              Dupliquer
            </button>
            {gap.archived ? (
              <button className="btn btn--secondary" disabled={!can('archive')} onClick={async () => { const r = await restoreGap(gap.id); !r.ok ? notify(r.error, 'error') : notify('Lacune restaurée.') }}>
                Restaurer
              </button>
            ) : (
              <button className="btn btn--danger" disabled={!can('archive')} title={!can('archive') ? 'Réservé au responsable validant' : undefined} onClick={() => setArchiving(true)}>
                Archiver
              </button>
            )}
          </div>
        </aside>
      </div>

      {editing && <GapForm gap={gap} onClose={() => setEditing(false)} />}
      {archiving && (
        <ConfirmDialog
          title={`Archiver ${gap.id}`}
          message="La lacune sera exclue des indicateurs mais conservée avec son historique. Elle pourra être restaurée."
          confirmLabel="Archiver"
          tone="accent"
          withComment
          commentLabel="Motif de l'archivage"
          onClose={() => setArchiving(false)}
          onConfirm={async (reason) => {
            const r = await archiveGap(gap.id, reason)
            !r.ok ? notify(r.error, 'error') : notify('Lacune archivée.')
            setArchiving(false)
          }}
        />
      )}
      {statusDialog && (
        <ConfirmDialog
          title={statusDialog === 'validee' ? 'Valider la lacune' : 'Rouvrir la lacune validée'}
          message={
            statusDialog === 'validee' ? (
              <>
                En validant, vous attestez en tant que <strong>{currentUser.name}</strong> ({currentUser.title}) que la mesure est désormais appliquée, sur la base de {evidence.length} preuve(s). Une revue périodique sera planifiée dans {reviewIntervalMonths(gap)} mois.
              </>
            ) : (
              'La validation et la prochaine revue seront annulées. Le changement est tracé dans l’historique.'
            )
          }
          confirmLabel={statusDialog === 'validee' ? 'Valider et signer' : 'Rouvrir'}
          tone={statusDialog === 'validee' ? 'success' : 'accent'}
          withComment
          commentLabel={statusDialog === 'validee' ? 'Commentaire de validation' : 'Motif de la réouverture'}
          onClose={() => setStatusDialog(null)}
          onConfirm={async (comment) => {
            const r = await changeGapStatus(gap.id, statusDialog, comment)
            !r.ok ? notify(r.error, 'error') : notify(statusDialog === 'validee' ? 'Lacune validée.' : 'Lacune rouverte.')
            setStatusDialog(null)
          }}
        />
      )}
    </div>
  )
}

function DetailsTab({ gap }: { gap: Gap }) {
  return (
    <dl className="dl">
      <dt>Description</dt>
      <dd style={{ whiteSpace: 'pre-wrap' }}>{gap.description || <span className="muted">—</span>}</dd>
      <dt>Mesures ISO 27001:2022</dt>
      <dd>
        <ul>
          {gap.controlIds.map((c) => (
            <li key={c}>
              <Link to={`/referentiel?mesure=${c}`}>
                <strong>A.{c}</strong>
              </Link>{' '}
              {getControl(c)?.title}
            </li>
          ))}
        </ul>
      </dd>
      <dt>Exigences NIS2</dt>
      <dd>
        {gap.nis2Refs.length ? (
          <ul>
            {gap.nis2Refs.map((n) => (
              <li key={n} title={getNis2(n)?.description}>
                {getNis2(n)?.label ?? n}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">—</span>
        )}
      </dd>
      <dt>Référence ANSSI</dt>
      <dd>{gap.anssiRef || <span className="muted">—</span>}</dd>
      <dt>Criticité</dt>
      <dd>
        <CriticalityBadge value={gap.criticality} /> <span className="small muted">poids ×{CRITICALITY_BY_ID[gap.criticality].weight} dans le score</span>
      </dd>
      <dt>Impact potentiel</dt>
      <dd>{gap.impact || <span className="muted">—</span>}</dd>
      <dt>Délai de résolution</dt>
      <dd>
        {formatDate(gap.dueDate)} <span className="small muted">({relativeDue(gap.dueDate)})</span>
      </dd>
    </dl>
  )
}

function RemediationsTab({ gap, remediations, editable }: { gap: Gap; remediations: Remediation[]; editable: boolean }) {
  const { updateRemediation, deleteRemediation, notify } = useCompliance()
  const [form, setForm] = useState<Remediation | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Remediation | null>(null)
  const avg = averageProgress(remediations)

  const quickUpdate = async (r: Remediation, changes: Partial<RemediationInput>) => {
    const res = await updateRemediation(r.id, changes)
    if (!res.ok) notify(res.error, 'error')
  }

  return (
    <div>
      <div className="card__head">
        <div className="small muted">
          Moyens mis en place pour corriger la lacune : bonnes pratiques, outils, automatisations, procédures, formations.
          {remediations.length > 0 && (
            <>
              {' '}
              Avancement moyen : <strong>{avg} %</strong>.
            </>
          )}
        </div>
        {editable && (
          <button className="btn btn--accent btn--sm" onClick={() => setForm('new')}>
            + Ajouter une remédiation
          </button>
        )}
      </div>

      {remediations.length === 0 ? (
        <EmptyState icon="edit" title="Aucune remédiation planifiée">
          Ajoutez les actions qui permettront de corriger cette lacune ; elles apparaîtront dans la roadmap.
        </EmptyState>
      ) : (
        remediations.map((r) => {
          const late = isRemediationOverdue(r)
          return (
            <div key={r.id} className={`rem-card ${late ? 'is-late' : ''}`}>
              <div className="rem-card__head">
                <div>
                  <div className="tiny muted mono">{r.id}</div>
                  <div className="rem-card__title">{r.title}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => setForm(r)}>
                    {editable ? 'Modifier' : 'Voir'}
                  </button>
                  {editable && (
                    <button className="btn btn--ghost btn--sm" onClick={() => setDeleting(r)} aria-label={`Supprimer ${r.id}`}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
              <div className="rem-card__meta">
                <RemTypeBadge value={r.type} />
                {editable ? (
                  <select className="input" style={{ width: 'auto', padding: '2px 8px' }} value={r.status} onChange={(e) => quickUpdate(r, { status: e.target.value as RemediationStatusId })} aria-label={`Statut de ${r.id}`}>
                    {REMEDIATION_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <RemStatusBadge value={r.status} />
                )}
                <span>
                  <UserName id={r.owner} />
                </span>
                <span>
                  {formatDate(r.startDate)} → <strong style={{ color: late ? 'var(--error-dark)' : undefined }}>{formatDate(r.targetDate)}</strong>
                </span>
                {late && <LateBadge />}
                <Link to={`/roadmap?focus=${r.id}`} className="small">
                  Voir dans la roadmap →
                </Link>
              </div>
              {r.description && <p className="small muted" style={{ marginTop: 8 }}>{r.description}</p>}
              <div className="rem-card__progress">
                {editable ? (
                  <ProgressSlider value={r.progress} label={`Avancement de ${r.id}`} onCommit={(v) => quickUpdate(r, { progress: v, status: v === 100 ? 'valide' : r.status === 'valide' ? 'en_cours' : r.status })} />
                ) : (
                  <div style={{ flex: 1 }}>
                    <Progress value={r.progress} />
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}

      {form && <RemediationForm gapId={gap.id} remediation={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Supprimer ${deleting.id}`}
          message={`Supprimer la remédiation « ${deleting.title} » ? L'opération reste tracée dans l'historique de la lacune.`}
          confirmLabel="Supprimer"
          tone="accent"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const r = await deleteRemediation(deleting.id)
            !r.ok ? notify(r.error, 'error') : notify('Remédiation supprimée.')
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/** Curseur d'avancement : n'enregistre (et n'historise) qu'au relâchement. */
function ProgressSlider({ value, label, onCommit }: { value: number; label: string; onCommit: (value: number) => void }) {
  const [local, setLocal] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setLocal(value)
  }
  const commit = () => local !== value && onCommit(local)
  return (
    <>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={local}
        aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="small num" style={{ minWidth: 40 }}>
        {local} %
      </span>
    </>
  )
}

function ProofTab({ gap, blockers, onValidate }: { gap: Gap; blockers: string[]; onValidate: () => void }) {
  const { can, performReview, notify } = useCompliance()
  const [reviewing, setReviewing] = useState(false)
  const reviewDue = isReviewDue(gap)

  return (
    <div>
      {gap.status === 'validee' && gap.validation ? (
        <div className="validation-box">
          <strong>Validée</strong> par <UserName id={gap.validation.by} /> le {formatDateTime(gap.validation.date)}
          {gap.validation.comment && <div className="small" style={{ marginTop: 4 }}>« {gap.validation.comment} »</div>}
          <div className="small" style={{ marginTop: 8 }}>
            Prochaine revue périodique : <strong>{formatDate(gap.nextReviewDate)}</strong> ({relativeDue(gap.nextReviewDate)}) — tous les {reviewIntervalMonths(gap)} mois pour une criticité {CRITICALITY_BY_ID[gap.criticality].label.toLowerCase()}.
          </div>
          {can('review') && !gap.archived && (
            <button className={`btn ${reviewDue ? 'btn--accent' : 'btn--secondary'} btn--sm`} style={{ marginTop: 12 }} onClick={() => setReviewing(true)}>
              Effectuer la revue périodique
            </button>
          )}
        </div>
      ) : (
        <div className="validation-box validation-box--pending">
          <strong>Conditions de validation</strong>
          <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>{blockers.some((b) => b.includes('preuve')) ? <Icon name="x" /> : <Icon name="check" />} Au moins une preuve de conformité jointe</li>
            <li>{blockers.some((b) => b.includes('responsable')) ? <Icon name="x" /> : <Icon name="check" />} Validation par un responsable validant (signature)</li>
          </ul>
          {!blockers.length && !gap.archived && (
            <button className="btn btn--success btn--sm" style={{ marginTop: 12 }} onClick={onValidate}>
              Valider la lacune
            </button>
          )}
        </div>
      )}

      <h3 style={{ margin: '8px 0 12px', fontSize: '1.05rem' }}>Preuves de conformité</h3>
      <EvidencePanel gap={gap} />

      {gap.reviews.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 12px', fontSize: '1.05rem' }}>Revues périodiques</h3>
          <ul className="timeline">
            {[...gap.reviews].reverse().map((r) => (
              <li key={r.id} className={r.outcome === 'conforme' ? 't-validation' : 't-reopen'}>
                <div className="timeline__head">
                  <span className="timeline__action">{r.outcome === 'conforme' ? 'Toujours conforme' : 'Non conforme'}</span>
                  <span className="muted tiny">
                    {formatDateTime(r.date)} · <UserName id={r.by} />
                  </span>
                </div>
                {r.comment && <div className="timeline__details">{r.comment}</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {reviewing && (
        <ReviewDialog
          gap={gap}
          onClose={() => setReviewing(false)}
          onSubmit={async (outcome, comment) => {
            const r = await performReview(gap.id, outcome, comment)
            !r.ok ? notify(r.error, 'error') : notify(outcome === 'conforme' ? 'Revue enregistrée : toujours conforme.' : 'Lacune rouverte suite à la revue.', outcome === 'conforme' ? 'success' : 'warning')
            setReviewing(false)
          }}
        />
      )}
    </div>
  )
}

interface ReviewDialogProps {
  gap: Gap
  onClose: () => void
  onSubmit: (outcome: ReviewOutcome, comment: string) => void
}

function ReviewDialog({ gap, onClose, onSubmit }: ReviewDialogProps) {
  const [outcome, setOutcome] = useState<ReviewOutcome>('conforme')
  const [comment, setComment] = useState('')
  return (
    <Modal title={`Revue périodique — ${gap.id}`} onClose={onClose} size="sm">
      <p className="small" style={{ marginBottom: 16 }}>
        Vérifiez que la mesure est toujours appliquée et que les preuves sont à jour.
      </p>
      <div className="field">
        <label className="toggle" style={{ color: 'var(--neutral-800)' }}>
          <input type="radio" name="outcome" checked={outcome === 'conforme'} onChange={() => setOutcome('conforme')} /> Toujours conforme — replanifier la prochaine revue
        </label>
        <label className="toggle" style={{ color: 'var(--neutral-800)' }}>
          <input type="radio" name="outcome" checked={outcome === 'non_conforme'} onChange={() => setOutcome('non_conforme')} /> Non conforme — rouvrir la lacune
        </label>
      </div>
      <div className="field">
        <label htmlFor="review-comment">Constats</label>
        <textarea id="review-comment" className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Contrôles effectués, écarts observés…" />
      </div>
      <div className="form-actions">
        <button className="btn btn--secondary" onClick={onClose}>
          Annuler
        </button>
        <button className={`btn ${outcome === 'conforme' ? 'btn--success' : 'btn--accent'}`} onClick={() => onSubmit(outcome, comment)}>
          Enregistrer la revue
        </button>
      </div>
    </Modal>
  )
}

const ACTION_CLASS: Record<string, string> = {
  Validation: 't-validation',
  Réouverture: 't-reopen',
  Archivage: 't-archive',
  'Revue périodique': 't-review',
}
const actionClass = (a: string): string => ACTION_CLASS[a] ?? ''

function HistoryTab({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return <EmptyState icon="clock" title="Aucun historique" />
  return (
    <ul className="timeline">
      {[...history].reverse().map((h) => (
        <li key={h.id} className={actionClass(h.action)}>
          <div className="timeline__head">
            <span className="timeline__action">{h.action}</span>
            <span className="muted tiny">
              {formatDateTime(h.date)} · <UserName id={h.userId} />
            </span>
          </div>
          {h.details && <div className="timeline__details">{h.details}</div>}
        </li>
      ))}
    </ul>
  )
}
