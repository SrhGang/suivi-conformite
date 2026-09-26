import { useMemo, useState } from 'react'
import { CRITICALITIES } from '../data/constants.js'
import { ISO_CONTROLS, NIS2_REQUIREMENTS, THEMES, suggestNis2 } from '../data/isoControls.js'
import { useCompliance } from '../store/ComplianceContext.jsx'
import { addDays, today } from '../utils/dates.js'
import { Modal } from './ui.jsx'

const ANSSI_SUGGESTIONS = [
  "ANSSI — Guide d'hygiène informatique",
  "ANSSI — Recommandations relatives à l'authentification multifacteur et aux mots de passe",
  "ANSSI — Recommandations relatives à l'administration sécurisée des SI",
  'ANSSI — Recommandations de sécurité pour la mise en œuvre d’un système de journalisation',
  'ANSSI — Fondamentaux de la sauvegarde des systèmes d’information',
  'ANSSI — Méthode EBIOS Risk Manager',
  'ANSSI — Cybersécurité des systèmes industriels : mesures détaillées',
  'ANSSI — Recommandations de sécurité relatives à TLS',
  "ANSSI — Maîtriser les risques de l'infogérance",
  'ANSSI — Référentiel des mesures de sécurité NIS2',
]

const DEFAULT_DELAY = { critique: 30, haute: 60, moyenne: 90, basse: 180 }

/** Création ou édition d'une lacune (modale). */
export default function GapForm({ gap, onClose, onSaved }) {
  const { state, createGap, updateGap, notify } = useCompliance()
  const editing = !!gap
  const [form, setForm] = useState(() => ({
    title: gap?.title ?? '',
    description: gap?.description ?? '',
    controlIds: gap?.controlIds ?? [],
    nis2Refs: gap?.nis2Refs ?? [],
    anssiRef: gap?.anssiRef ?? '',
    criticality: gap?.criticality ?? 'haute',
    impact: gap?.impact ?? '',
    dueDate: gap?.dueDate ?? addDays(today(), DEFAULT_DELAY.haute),
    assignee: gap?.assignee ?? state.currentUserId,
  }))
  const [nis2Touched, setNis2Touched] = useState(editing)
  const [dueTouched, setDueTouched] = useState(editing)
  const [errors, setErrors] = useState({})
  const [filter, setFilter] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const toggleControl = (id) => {
    setForm((f) => {
      const controlIds = f.controlIds.includes(id) ? f.controlIds.filter((c) => c !== id) : [...f.controlIds, id]
      return { ...f, controlIds, nis2Refs: nis2Touched ? f.nis2Refs : suggestNis2(controlIds) }
    })
  }
  const toggleNis2 = (id) => {
    setNis2Touched(true)
    setForm((f) => ({ ...f, nis2Refs: f.nis2Refs.includes(id) ? f.nis2Refs.filter((n) => n !== id) : [...f.nis2Refs, id] }))
  }
  const setCriticality = (c) => {
    setForm((f) => ({ ...f, criticality: c, dueDate: dueTouched ? f.dueDate : addDays(today(), DEFAULT_DELAY[c]) }))
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return THEMES.map((t) => ({
      ...t,
      controls: ISO_CONTROLS.filter(
        (c) => c.theme === t.id && (!q || c.id.includes(q) || c.title.toLowerCase().includes(q)),
      ),
    })).filter((t) => t.controls.length)
  }, [filter])

  const submit = (e) => {
    e.preventDefault()
    const res = editing ? updateGap(gap.id, form) : createGap(form)
    if (res.error) {
      setErrors(res.errors ?? {})
      notify(res.error, 'error')
      return
    }
    notify(editing ? 'Lacune mise à jour.' : `Lacune ${res.result.id} créée.`)
    onSaved?.(res.result)
    onClose()
  }

  return (
    <Modal title={editing ? `Modifier ${gap.id}` : 'Nouvelle lacune'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="gap-title">Titre *</label>
          <input
            id="gap-title"
            className={`input ${errors.title ? 'input--error' : ''}`}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex : MFA non configurée sur le portail d'administration"
          />
          {errors.title && <span className="error-text">{errors.title}</span>}
        </div>
        <div className="field">
          <label htmlFor="gap-desc">Description</label>
          <textarea id="gap-desc" className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Constat observé, périmètre concerné…" />
        </div>

        <div className="field">
          <span className="label">Mesures ISO 27001:2022 concernées *</span>
          {form.controlIds.length > 0 && (
            <div className="chips">
              {form.controlIds.map((id) => (
                <span className="chip" key={id}>
                  A.{id}
                  <button type="button" onClick={() => toggleControl(id)} aria-label={`Retirer A.${id}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input className="input" placeholder="Filtrer les 93 mesures (ex : 8.5, sauvegarde, accès…)" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer les mesures ISO" />
          <div className={`checklist ${errors.controlIds ? 'input--error' : ''}`}>
            {filtered.map((t) => (
              <div key={t.id}>
                <div className="checklist__group">
                  {t.code} — {t.label}
                </div>
                {t.controls.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={form.controlIds.includes(c.id)} onChange={() => toggleControl(c.id)} />
                    <span>
                      <strong>A.{c.id}</strong> {c.title}
                    </span>
                  </label>
                ))}
              </div>
            ))}
            {!filtered.length && <p className="small muted" style={{ padding: 8 }}>Aucune mesure ne correspond.</p>}
          </div>
          {errors.controlIds && <span className="error-text">{errors.controlIds}</span>}
          <span className="hint">La première mesure sélectionnée détermine le thème de la lacune.</span>
        </div>

        <div className="field">
          <span className="label">Exigences NIS2 {!nis2Touched && <span className="hint">(suggérées automatiquement)</span>}</span>
          <div className="checklist" style={{ maxHeight: 170 }}>
            {NIS2_REQUIREMENTS.map((n) => (
              <label key={n.id} title={n.description}>
                <input type="checkbox" checked={form.nis2Refs.includes(n.id)} onChange={() => toggleNis2(n.id)} />
                <span>{n.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="gap-anssi">Référence ANSSI</label>
          <input id="gap-anssi" className="input" list="anssi-list" value={form.anssiRef} onChange={(e) => set('anssiRef', e.target.value)} placeholder="Guide ou recommandation ANSSI applicable" />
          <datalist id="anssi-list">
            {ANSSI_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="gap-crit">Criticité *</label>
            <select id="gap-crit" className="input" value={form.criticality} onChange={(e) => setCriticality(e.target.value)}>
              {CRITICALITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} (poids ×{c.weight})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="gap-due">Échéance *</label>
            <input
              id="gap-due"
              type="date"
              className={`input ${errors.dueDate ? 'input--error' : ''}`}
              value={form.dueDate}
              onChange={(e) => {
                setDueTouched(true)
                set('dueDate', e.target.value)
              }}
            />
            {errors.dueDate ? <span className="error-text">{errors.dueDate}</span> : !dueTouched && <span className="hint">Délai par défaut selon la criticité.</span>}
          </div>
          <div className="field span-2">
            <label htmlFor="gap-assignee">Assigné à</label>
            <select id="gap-assignee" className="input" value={form.assignee} onChange={(e) => set('assignee', e.target.value)}>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="gap-impact">Impact potentiel</label>
          <textarea id="gap-impact" className="input" rows={2} value={form.impact} onChange={(e) => set('impact', e.target.value)} placeholder="Conséquences en cas d'exploitation" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary">
            {editing ? 'Enregistrer' : 'Créer la lacune'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
