import { useState, type FormEvent } from 'react'
import { ASSET_TYPES, ZONES } from '../data/assets'
import { CRITICALITIES } from '../data/constants'
import { useCompliance } from '../store/ComplianceContext'
import type { Asset, AssetInput, FieldErrors } from '../types'
import { Modal } from './ui'

interface AssetFormProps {
  asset?: Asset
  onClose: () => void
  onSaved?: (asset: Asset) => void
}

/** Création ou modification d'un actif de l'infrastructure (modale). */
export default function AssetForm({ asset, onClose, onSaved }: AssetFormProps) {
  const { state, createAsset, updateAsset, notify } = useCompliance()
  const [form, setForm] = useState<Required<AssetInput>>(() => ({
    name: asset?.name ?? '',
    type: asset?.type ?? 'serveur',
    role: asset?.role ?? '',
    zone: asset?.zone ?? 'serveurs',
    criticality: asset?.criticality ?? 'moyenne',
    owner: asset?.owner ?? state.currentUserId,
    description: asset?.description ?? '',
    links: asset?.links ?? [],
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const set = <K extends keyof AssetInput>(k: K, v: Required<AssetInput>[K]) => setForm((f) => ({ ...f, [k]: v }))
  const others = state.assets.filter((a) => !a.archived && a.id !== asset?.id && (!filter || a.name.toLowerCase().includes(filter.toLowerCase())))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const res = asset ? await updateAsset(asset.id, form) : await createAsset(form)
    setSaving(false)
    if (!res.ok) {
      setErrors(res.errors ?? {})
      return notify(res.error, 'error')
    }
    notify(asset ? 'Actif mis à jour.' : `Actif ${res.result.id} ajouté à la cartographie.`)
    onSaved?.(res.result)
    onClose()
  }

  return (
    <Modal title={asset ? `${asset.id} : modification` : 'Nouvel actif'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="asset-name">Nom *</label>
            <input id="asset-name" className={`input ${errors.name ? 'input--error' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex : Serveur de messagerie" />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="asset-type">Type *</label>
            <select id="asset-type" className="input" value={form.type} onChange={(e) => set('type', e.target.value as AssetInput['type'])}>
              {ASSET_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="asset-zone">Zone *</label>
            <select id="asset-zone" className="input" value={form.zone} onChange={(e) => set('zone', e.target.value as AssetInput['zone'])}>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label} ({z.description})
                </option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="asset-role">Rôle</label>
            <input id="asset-role" className="input" value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Ex : serveur web, messagerie, application métier de facturation" />
          </div>
          <div className="field">
            <label htmlFor="asset-crit">Criticité *</label>
            <select id="asset-crit" className="input" value={form.criticality} onChange={(e) => set('criticality', e.target.value as AssetInput['criticality'])}>
              {CRITICALITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="asset-owner">Responsable</label>
            <select id="asset-owner" className="input" value={form.owner} onChange={(e) => set('owner', e.target.value)}>
              <option value="">Non assigné</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="asset-desc">Description</label>
          <textarea id="asset-desc" className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ce qu’il héberge, ses particularités. Pas de mot de passe ni de détail sensible inutile." />
        </div>
        <fieldset className="field">
          <legend>Relié à ({form.links.length})</legend>
          <input className="input" aria-label="Filtrer les actifs" placeholder="Filtrer les actifs…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 6 }} />
          <div className="checklist">
            {others.map((a) => (
              <label key={a.id}>
                <input
                  type="checkbox"
                  checked={form.links.includes(a.id)}
                  onChange={() => set('links', form.links.includes(a.id) ? form.links.filter((l) => l !== a.id) : [...form.links, a.id])}
                />
                <span>
                  {a.name} <span className="tiny muted">{a.id}</span>
                </span>
              </label>
            ))}
            {!others.length && <span className="small muted">Aucun autre actif.</span>}
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {asset ? 'Enregistrer' : 'Ajouter l’actif'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
