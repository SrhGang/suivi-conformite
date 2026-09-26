import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { REMEDIATION_STATUSES, REMEDIATION_TYPES } from '../data/constants'
import { useCompliance } from '../store/ComplianceContext'
import { addDays, today } from '../utils/dates'
import type { FieldErrors, Remediation, RemediationInput, RemediationStatusId, RemediationTypeId } from '../types'
import { Modal } from './ui'

type RemediationFormState = Required<RemediationInput> & { gapId: string }

interface RemediationFormProps {
  remediation?: Remediation | null
  gapId?: string
  onClose: () => void
  showGapLink?: boolean
}

/**
 * Création / édition d'une remédiation (moyen mis en place pour corriger
 * une lacune). Si `gapId` n'est pas fourni, l'utilisateur choisit la lacune.
 */
export default function RemediationForm({ remediation, gapId, onClose, showGapLink }: RemediationFormProps) {
  const { state, addRemediation, updateRemediation, notify, can } = useCompliance()
  const editing = !!remediation
  const readOnly = !can('edit')
  const [form, setForm] = useState<RemediationFormState>(() => ({
    gapId: remediation?.gapId ?? gapId ?? '',
    title: remediation?.title ?? '',
    type: remediation?.type ?? 'bonne_pratique',
    status: remediation?.status ?? 'a_faire',
    progress: remediation?.progress ?? 0,
    startDate: remediation?.startDate ?? today(),
    targetDate: remediation?.targetDate ?? addDays(today(), 30),
    owner: remediation?.owner ?? state.currentUserId,
    description: remediation?.description ?? '',
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const set = <K extends keyof RemediationFormState>(k: K, v: RemediationFormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const openGaps = state.gaps.filter((g) => !g.archived && g.status !== 'validee')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.gapId) {
      setErrors({ gapId: 'Choisissez la lacune concernée.' })
      return
    }
    const { gapId: targetGap, ...payload } = { ...form, progress: Number(form.progress) }
    const res = remediation ? updateRemediation(remediation.id, payload) : addRemediation(targetGap, payload)
    if (!res.ok) {
      setErrors(res.errors ?? {})
      notify(res.error, 'error')
      return
    }
    notify(remediation ? `${remediation.id} mise à jour.` : `Remédiation ${res.result.id} ajoutée.`)
    onClose()
  }

  const title = remediation ? `${remediation.id} — ${readOnly ? 'Détail' : 'Modifier'}` : 'Nouvelle remédiation'
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
          {!gapId && !editing ? (
            <div className="field">
              <label htmlFor="rem-gap">Lacune concernée *</label>
              <select id="rem-gap" className={`input ${errors.gapId ? 'input--error' : ''}`} value={form.gapId} onChange={(e) => set('gapId', e.target.value)}>
                <option value="">— Sélectionner —</option>
                {openGaps.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.id} — {g.title}
                  </option>
                ))}
              </select>
              {errors.gapId && <span className="error-text">{errors.gapId}</span>}
            </div>
          ) : (
            showGapLink && (
              <p className="small" style={{ marginBottom: 16 }}>
                Lacune : <Link to={`/lacunes/${form.gapId}`}>{form.gapId} — {state.gaps.find((g) => g.id === form.gapId)?.title}</Link>
              </p>
            )
          )}
          <div className="field">
            <label htmlFor="rem-title">Intitulé *</label>
            <input id="rem-title" className={`input ${errors.title ? 'input--error' : ''}`} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex : Déployer une solution MFA pour les administrateurs" />
            {errors.title && <span className="error-text">{errors.title}</span>}
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rem-type">Type de moyen *</label>
              <select id="rem-type" className="input" value={form.type} onChange={(e) => set('type', e.target.value as RemediationTypeId)}>
                {REMEDIATION_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rem-owner">Responsable</label>
              <select id="rem-owner" className="input" value={form.owner} onChange={(e) => set('owner', e.target.value)}>
                {state.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rem-status">Statut</label>
              <select id="rem-status" className="input" value={form.status} onChange={(e) => set('status', e.target.value as RemediationStatusId)}>
                {REMEDIATION_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rem-progress">Avancement : {form.status === 'valide' ? 100 : form.progress} %</label>
              <input id="rem-progress" type="range" min={0} max={100} step={5} value={form.status === 'valide' ? 100 : form.progress} onChange={(e) => set('progress', Number(e.target.value))} style={{ accentColor: 'var(--primary-700)' }} />
              {errors.progress && <span className="error-text">{errors.progress}</span>}
            </div>
            <div className="field">
              <label htmlFor="rem-start">Début</label>
              <input id="rem-start" type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rem-target">Date cible *</label>
              <input id="rem-target" type="date" className={`input ${errors.targetDate ? 'input--error' : ''}`} value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
              {errors.targetDate && <span className="error-text">{errors.targetDate}</span>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="rem-desc">Description / notes</label>
            <textarea id="rem-desc" className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Outil retenu, automatisation, étapes, points de blocage…" />
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {readOnly ? 'Fermer' : 'Annuler'}
          </button>
          {!readOnly && (
            <button type="submit" className="btn btn--primary">
              {editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
